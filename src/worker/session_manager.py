"""
Session Manager v5 — Correção definitiva baseada em como projetos
de produção (Userge, TelethonUserBot, etc) lidam com sessões.

O PROBLEMA REAL:
O Telethon salva um "update state" (pts/qts/date/seq) na StringSession.
Quando reconecta, ele tenta sincronizar TODOS os updates entre o state
salvo e o atual. Se houver muitas mensagens pendentes, isso trava.

A SOLUÇÃO:
1. Conectar SEM registrar handlers (sem @client.on)
2. Chamar GetStateRequest() para resetar o state para "agora"
3. SÓ DEPOIS registrar handlers e começar a processar
4. Nunca chamar catch_up() na reconexão — ele é o que causa o flood

Referências:
- Telethon docs: "Signing In" → StringSession
- Telethon issues #1500, #3229, #4017 — reconexão com updates pendentes
- Userge-Plugins: usa GetStateRequest() antes de registrar handlers
"""

import os
import asyncio
import time
import random
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    FloodWaitError,
    AuthKeyUnregisteredError,
    RPCError,
)
from telethon.tl.types import User
from telethon.tl.functions.updates import GetStateRequest
from logger import get_logger, log_separator
from database import (
    get_session_credentials,
    get_active_sessions,
    update_session_status,
    save_session_string,
    save_contact,
    save_message,
    get_ai_profile,
    get_conversation_history,
    get_last_incoming_timestamp,
    update_contact_capture_data,
)

log = get_logger("session_manager")

# ═══════════════════════════════════════════════════════════
# ESTADO GLOBAL
# ═══════════════════════════════════════════════════════════

active_clients: dict[str, TelegramClient] = {}
client_metadata: dict[str, dict] = {}
_session_locks: dict[str, asyncio.Lock] = {}
_restoring_sessions: set[str] = set()
_background_tasks: dict[str, list[asyncio.Task]] = {}

CONNECT_TIMEOUT = 30
AUTH_CHECK_TIMEOUT = 15
RESTORE_TIMEOUT = 120
RECONNECT_MAX_RETRIES = 3
RECONNECT_BASE_DELAY = 5
SESSION_SAVE_INTERVAL = 300
HEALTH_CHECK_INTERVAL = 120


# ═══════════════════════════════════════════════════════════
# UTILIDADES
# ═══════════════════════════════════════════════════════════

def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


def _backoff_delay(attempt: int) -> float:
    delay = min(RECONNECT_BASE_DELAY * (2 ** attempt), 60)
    return delay + random.uniform(0, delay * 0.3)


def _create_client(api_id: int, api_hash: str, session_string: str = None) -> TelegramClient:
    session = StringSession(session_string) if session_string else StringSession()
    return TelegramClient(
        session, api_id, api_hash,
        connection_retries=3,
        retry_delay=2,
        timeout=CONNECT_TIMEOUT,
        request_retries=3,
        flood_sleep_threshold=0,
    )


async def _safe_disconnect(client: TelegramClient, session_id: str = "?"):
    try:
        if client and client.is_connected():
            await asyncio.wait_for(client.disconnect(), timeout=10)
    except Exception as e:
        log.debug(f"safe_disconnect | {session_id[:8]}... | {type(e).__name__}: {e}")


async def _cancel_bg_tasks(session_id: str):
    tasks = _background_tasks.pop(session_id, [])
    for t in tasks:
        if not t.done():
            t.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def cleanup_existing_session(session_id: str):
    await _cancel_bg_tasks(session_id)
    old = active_clients.pop(session_id, None)
    client_metadata.pop(session_id, None)
    if old:
        log.info(f"Limpando sessão anterior | {session_id[:8]}...")
        await _safe_disconnect(old, session_id)


async def _save_session(session_id: str, client: TelegramClient):
    try:
        ss = client.session.save()
        if ss and len(ss) > 10:
            save_session_string(session_id, ss)
    except Exception as e:
        log.error(f"Erro ao salvar session | {session_id[:8]}... | {e}")


def _start_bg_tasks(session_id: str, client: TelegramClient):
    tasks = [
        asyncio.create_task(_periodic_saver(session_id, client)),
        asyncio.create_task(_health_check(session_id, client)),
    ]
    _background_tasks[session_id] = tasks


# ═══════════════════════════════════════════════════════════
# BACKGROUND TASKS
# ═══════════════════════════════════════════════════════════

async def _periodic_saver(session_id: str, client: TelegramClient):
    while session_id in active_clients:
        await asyncio.sleep(SESSION_SAVE_INTERVAL)
        if session_id in active_clients and client.is_connected():
            try:
                await _save_session(session_id, client)
            except Exception as e:
                log.warning(f"Periodic save falhou | {session_id[:8]}... | {e}")
        else:
            break


async def _health_check(session_id: str, client: TelegramClient):
    failures = 0
    while session_id in active_clients:
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        if session_id not in active_clients:
            break
        try:
            me = await asyncio.wait_for(client.get_me(), timeout=15)
            if me:
                failures = 0
        except AuthKeyUnregisteredError:
            log.error(f"Auth key revogada | {session_id[:8]}...")
            update_session_status(session_id, "disconnected", "Sessão encerrada pelo usuário")
            save_session_string(session_id, "")
            await cleanup_existing_session(session_id)
            break
        except Exception:
            failures += 1
            log.warning(f"Health check falhou ({failures}x) | {session_id[:8]}...")
        if failures >= 3:
            log.warning(f"Reconectando após {failures} falhas | {session_id[:8]}...")
            try:
                await reconnect_session(session_id)
            except Exception:
                pass
            break


# ═══════════════════════════════════════════════════════════
# CORE: CONNECT + RESTORE
# ═══════════════════════════════════════════════════════════

async def _connect_and_restore(
    session_id: str, api_id: int, api_hash: str, session_string: str
) -> tuple[TelegramClient | None, dict | None]:
    """
    Conecta usando session_string e verifica auth.
    
    FLUXO (baseado em projetos de produção):
    1. Criar client
    2. connect() — conecta ao DC do Telegram
    3. is_user_authorized() — verifica se a auth key é válida
    4. get_me() — confirma identidade
    5. GetStateRequest() — RESETA o update state para "agora"
       ^^^ ISSO é o que evita o flood de mensagens pendentes
    6. Retorna client pronto para registrar handlers
    
    NÃO chama catch_up() — ele é o responsável pelo flood.
    NÃO registra handlers antes do GetStateRequest().
    """
    client = _create_client(api_id, api_hash, session_string)

    try:
        log.info(f"[restore] connect... | {session_id[:8]}...")
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)

        log.info(f"[restore] is_user_authorized... | {session_id[:8]}...")
        is_auth = await asyncio.wait_for(
            client.is_user_authorized(), timeout=AUTH_CHECK_TIMEOUT
        )

        if not is_auth:
            log.warning(f"[restore] não autorizado | {session_id[:8]}...")
            await _safe_disconnect(client, session_id)
            return None, None

        log.info(f"[restore] get_me... | {session_id[:8]}...")
        me = await asyncio.wait_for(client.get_me(), timeout=AUTH_CHECK_TIMEOUT)
        if not me:
            await _safe_disconnect(client, session_id)
            return None, None

        # ═══════════════════════════════════════════
        # CORREÇÃO PRINCIPAL: GetStateRequest()
        # 
        # Isso diz ao Telegram: "meu update state é o
        # mais recente agora". O servidor para de tentar
        # enviar as mensagens acumuladas.
        #
        # Sem isso, o Telegram envia TODOS os updates
        # entre o último state salvo e o atual, causando
        # as mensagens "Server sent a very new message"
        # e o timeout.
        # ═══════════════════════════════════════════
        log.info(f"[restore] GetStateRequest (reset updates)... | {session_id[:8]}...")
        try:
            await asyncio.wait_for(
                client(GetStateRequest()), timeout=10
            )
            log.info(f"[restore] Update state resetado | {session_id[:8]}...")
        except Exception as e:
            # Não-crítico: se falhar, pode receber alguns updates antigos
            # mas não deve travar
            log.warning(f"[restore] GetStateRequest falhou (não crítico): {type(e).__name__}: {e}")

        user_info = {
            "user_id": me.id,
            "username": me.username,
            "first_name": me.first_name,
        }

        log.info(f"[restore] OK | user={me.first_name} (@{me.username}) | {session_id[:8]}...")
        return client, user_info

    except AuthKeyUnregisteredError:
        log.warning(f"[restore] auth key revogada | {session_id[:8]}...")
        await _safe_disconnect(client, session_id)
        return None, None

    except asyncio.TimeoutError:
        log.warning(f"[restore] TIMEOUT | {session_id[:8]}...")
        await _safe_disconnect(client, session_id)
        raise

    except (ConnectionError, OSError) as e:
        log.warning(f"[restore] erro de conexão | {session_id[:8]}... | {type(e).__name__}: {e}")
        await _safe_disconnect(client, session_id)
        raise

    except Exception as e:
        log.error(f"[restore] erro inesperado | {session_id[:8]}... | {type(e).__name__}: {e}")
        await _safe_disconnect(client, session_id)
        raise


async def _activate_session(
    session_id: str, tenant_id: str, phone: str,
    api_id: int, api_hash: str, client: TelegramClient, user_info: dict
):
    """Registra sessão como ativa."""
    active_clients[session_id] = client
    client_metadata[session_id] = {
        "tenant_id": tenant_id, "phone": phone,
        "api_id": api_id, "api_hash": api_hash,
        "user_id": user_info["user_id"], "username": user_info["username"],
        "connected_at": time.time(), "restored": True,
    }
    update_session_status(session_id, "active")
    await _save_session(session_id, client)
    # Handlers SÓ são registrados DEPOIS do GetStateRequest
    await register_message_handler(client, session_id, tenant_id)
    _start_bg_tasks(session_id, client)


# ═══════════════════════════════════════════════════════════
# OPERAÇÕES PÚBLICAS
# ═══════════════════════════════════════════════════════════

async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"START SESSION | {session_id[:8]}...")
        await cleanup_existing_session(session_id)

        # Tentar restaurar sessão existente
        creds = get_session_credentials(session_id)
        session_string = creds.get("session_string") if creds else None

        if session_string and len(session_string) > 10:
            try:
                client, user_info = await asyncio.wait_for(
                    _connect_and_restore(session_id, api_id, api_hash, session_string),
                    timeout=CONNECT_TIMEOUT + AUTH_CHECK_TIMEOUT + 20,
                )
                if client and user_info:
                    await _activate_session(session_id, tenant_id, phone, api_id, api_hash, client, user_info)
                    return {"status": "active"}
            except Exception as e:
                log.warning(f"Restauração falhou: {type(e).__name__}: {e}")

        # Sessão nova: enviar código
        client = _create_client(api_id, api_hash)
        try:
            await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
            sent = await client.send_code_request(phone)

            update_session_status(session_id, "awaiting_session_code")
            active_clients[session_id] = client
            client_metadata[session_id] = {
                "tenant_id": tenant_id, "phone": phone,
                "api_id": api_id, "api_hash": api_hash,
                "phone_code_hash": sent.phone_code_hash,
                "connected_at": time.time(),
            }
            await _save_session(session_id, client)
            return {"status": "awaiting_session_code"}

        except FloodWaitError as e:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", f"Aguarde {e.seconds}s")
            return {"status": "error", "error": f"Telegram pede para aguardar {e.seconds} segundos"}
        except RPCError as e:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", str(e.message))
            return {"status": "error", "error": str(e.message)}
        except asyncio.TimeoutError:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", "Timeout")
            return {"status": "error", "error": "Timeout ao conectar. Tente novamente."}
        except Exception as e:
            log.error(f"Exceção | {type(e).__name__}: {e}", exc_info=True)
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", str(e))
            return {"status": "error", "error": str(e)}


async def verify_code(session_id: str, tenant_id: str, phone: str, code: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY CODE | {session_id[:8]}...")

        client = active_clients.get(session_id)
        if not client or not client.is_connected():
            if client:
                await _safe_disconnect(client, session_id)
            creds = get_session_credentials(session_id)
            ss = creds.get("session_string") if creds else None
            client = _create_client(api_id, api_hash, ss)
            try:
                await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
            except Exception:
                return {"status": "error", "error": "Falha ao reconectar. Tente novamente."}
            active_clients[session_id] = client

        try:
            await client.sign_in(phone, code)
            me = await client.get_me()
            log.info(f"Autenticado | user={me.first_name} (@{me.username})")

            await _activate_session(
                session_id, tenant_id, phone, api_id, api_hash, client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            return {"status": "active"}

        except SessionPasswordNeededError:
            update_session_status(session_id, "awaiting_2fa")
            await _save_session(session_id, client)
            return {"status": "awaiting_2fa"}
        except PhoneCodeInvalidError:
            return {"status": "error", "error": "Código inválido"}
        except PhoneCodeExpiredError:
            update_session_status(session_id, "error", "Código expirado")
            return {"status": "error", "error": "Código expirado. Inicie novamente."}
        except RPCError as e:
            return {"status": "error", "error": str(e.message)}
        except Exception as e:
            log.error(f"Exceção no verify_code | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


async def verify_2fa(session_id: str, tenant_id: str, password: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY 2FA | {session_id[:8]}...")
        client = active_clients.get(session_id)
        if not client or not client.is_connected():
            return {"status": "error", "error": "Sessão perdida. Inicie novamente."}

        try:
            await client.sign_in(password=password)
            me = await client.get_me()
            log.info(f"Autenticado com 2FA | {me.first_name} (@{me.username})")

            meta = client_metadata.get(session_id, {})
            await _activate_session(
                session_id, tenant_id, meta.get("phone", ""),
                meta.get("api_id"), meta.get("api_hash"), client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            return {"status": "active"}

        except RPCError as e:
            if "PASSWORD_HASH_INVALID" in str(e.message).upper():
                return {"status": "error", "error": "Senha 2FA incorreta."}
            return {"status": "error", "error": str(e.message)}
        except Exception as e:
            log.error(f"Exceção no verify_2fa | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


async def reconnect_session(session_id: str) -> bool:
    creds = get_session_credentials(session_id)
    if not creds:
        return False

    ss = creds.get("session_string")
    if not ss or len(ss) < 10:
        return False

    await cleanup_existing_session(session_id)

    for attempt in range(RECONNECT_MAX_RETRIES):
        if attempt > 0:
            delay = _backoff_delay(attempt)
            log.info(f"Retry {attempt + 1}/{RECONNECT_MAX_RETRIES} em {delay:.1f}s | {session_id[:8]}...")
            await asyncio.sleep(delay)

        try:
            client, user_info = await asyncio.wait_for(
                _connect_and_restore(
                    session_id, creds["api_id"], creds["api_hash_encrypted"], ss
                ),
                timeout=CONNECT_TIMEOUT + AUTH_CHECK_TIMEOUT + 20,
            )

            if client is None:
                log.warning(f"Auth inválida | {session_id[:8]}...")
                update_session_status(session_id, "disconnected", "Sessão revogada")
                save_session_string(session_id, "")
                return False

            if client and user_info:
                await _activate_session(
                    session_id, creds["tenant_id"], creds.get("phone", ""),
                    creds["api_id"], creds["api_hash_encrypted"], client, user_info
                )
                log.info(f"Reconectado (tentativa {attempt + 1}) | {session_id[:8]}...")
                return True

        except (asyncio.TimeoutError, ConnectionError, OSError) as e:
            log.warning(f"Tentativa {attempt + 1} falhou | {session_id[:8]}... | {type(e).__name__}")
            continue
        except Exception as e:
            log.error(f"Erro tentativa {attempt + 1} | {type(e).__name__}: {e}")
            continue

    log.error(f"Reconexão falhou após {RECONNECT_MAX_RETRIES} tentativas | {session_id[:8]}...")
    update_session_status(session_id, "disconnected", "Falha na reconexão")
    return False


# ═══════════════════════════════════════════════════════════
# RESTAURAÇÃO (startup)
# ═══════════════════════════════════════════════════════════

async def restore_active_sessions():
    log_separator(log, "RESTAURANDO SESSÕES ATIVAS")
    sessions = get_active_sessions()
    log.info(f"Total de sessões para restaurar: {len(sessions)}")
    if not sessions:
        return

    restored = 0
    failed = 0

    for sess in sessions:
        sid = sess["id"]
        _restoring_sessions.add(sid)
        try:
            ok = await asyncio.wait_for(_restore_single(sess), timeout=RESTORE_TIMEOUT)
            if ok:
                restored += 1
            else:
                failed += 1
        except asyncio.TimeoutError:
            log.warning(f"Timeout restaurando {sid[:8]}...")
            update_session_status(sid, "disconnected", "Timeout")
            failed += 1
        except Exception as e:
            log.error(f"Erro restaurando {sid[:8]}... | {type(e).__name__}: {e}")
            update_session_status(sid, "disconnected", str(e))
            failed += 1
        finally:
            _restoring_sessions.discard(sid)

    log.info(f"Restauração concluída | sucesso={restored} | falhas={failed}")


async def _restore_single(sess: dict) -> bool:
    sid = sess["id"]
    ss = sess.get("session_string")
    if not ss or len(ss) < 10:
        update_session_status(sid, "disconnected")
        return False

    try:
        client, user_info = await _connect_and_restore(
            sid, sess["api_id"], sess["api_hash_encrypted"], ss
        )
        if not client or not user_info:
            update_session_status(sid, "disconnected")
            return False

        await _activate_session(
            sid, sess["tenant_id"], sess.get("phone", ""),
            sess["api_id"], sess["api_hash_encrypted"], client, user_info
        )
        return True

    except AuthKeyUnregisteredError:
        update_session_status(sid, "disconnected")
        save_session_string(sid, "")
        return False
    except Exception as e:
        log.error(f"Restauração falhou {sid[:8]}... | {type(e).__name__}: {e}")
        update_session_status(sid, "disconnected", f"{type(e).__name__}")
        return False


# ═══════════════════════════════════════════════════════════
# AUTO-RECONNECT
# ═══════════════════════════════════════════════════════════

async def auto_reconnect_loop():
    while True:
        await asyncio.sleep(60)
        for sid, client in list(active_clients.items()):
            if not client.is_connected():
                log.warning(f"Sessão {sid[:8]}... desconectou")
                try:
                    await reconnect_session(sid)
                except Exception as e:
                    log.error(f"Auto-reconexão falhou | {type(e).__name__}: {e}")


# ═══════════════════════════════════════════════════════════
# MESSAGE HANDLER
# ═══════════════════════════════════════════════════════════

async def register_message_handler(client: TelegramClient, session_id: str, tenant_id: str):
    log_separator(log, f"REGISTRANDO WATCH MODE | {session_id[:8]}...")
    ai_profile = get_ai_profile(tenant_id)

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_new_message(event):
        msg_received_at = time.time()
        try:
            sender = await event.get_sender()
            if not isinstance(sender, User) or sender.bot:
                return

            message_text = event.message.text or ""
            if not message_text.strip():
                return

            log.info(f"MSG IN | {sender.first_name} (@{sender.username}) | len={len(message_text)}")

            contact_id = save_contact(tenant_id, sender)
            if not contact_id:
                return

            save_message(tenant_id, contact_id, "incoming", message_text)

            # Auto-tagging
            try:
                from database_tags import get_contact_tags
                from auto_tagger import process_auto_tags
                current_tags = get_contact_tags(contact_id)
                process_auto_tags(
                    tenant_id=tenant_id, contact_id=contact_id,
                    message=message_text,
                    sender_name=sender.first_name or "",
                    sender_username=sender.username or "",
                    current_tags=current_tags,
                )
            except Exception as e:
                log.warning(f"Auto-tagger falhou | {type(e).__name__}: {e}")

            history = get_conversation_history(tenant_id, contact_id, limit=10)
            response = generate_response(message_text, sender, ai_profile, history)

            if response:
                await asyncio.sleep(random.uniform(1.0, 3.0))
                await event.respond(response)
                elapsed = int((time.time() - msg_received_at) * 1000)
                log.info(f"MSG OUT | {sender.first_name} | len={len(response)} | {elapsed}ms")
                save_message(tenant_id, contact_id, "outgoing", response, "ai", elapsed)

        except Exception as e:
            log.error(f"Erro msg handler | {type(e).__name__}: {e}", exc_info=True)

    me = await client.get_me()
    log.info(f"Watch mode ATIVO | {me.first_name} (@{me.username}) | {session_id[:8]}...")


def generate_response(message: str, sender, ai_profile: dict | None, history: list[dict] = None) -> str | None:
    if not ai_profile:
        return None
    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    msg_lower = message.lower().strip()

    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi", "eae", "e aí"]
    if any(g in msg_lower for g in greetings):
        return welcome or f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    goodbyes = ["tchau", "bye", "até", "valeu", "obrigado", "obrigada", "flw", "falou"]
    if any(g in msg_lower for g in goodbyes):
        return f"Obrigado pelo contato, {sender.first_name}! Qualquer coisa é só chamar."

    return f"Obrigado pela mensagem, {sender.first_name}! Recebi e vou analisar. Em breve retorno."


# ═══════════════════════════════════════════════════════════
# CONTROLE
# ═══════════════════════════════════════════════════════════

async def disconnect_session(session_id: str):
    client = active_clients.get(session_id)
    if client:
        try:
            await _save_session(session_id, client)
        except Exception:
            pass
    await cleanup_existing_session(session_id)
    update_session_status(session_id, "disconnected")


async def send_message(session_id: str, user_id: int, text: str) -> bool:
    client = active_clients.get(session_id)
    if not client:
        return False
    try:
        await client.send_message(user_id, text)
        return True
    except Exception as e:
        log.error(f"Erro no envio | {type(e).__name__}: {e}")
        return False


def get_active_sessions_info() -> list[dict]:
    return [
        {
            "session_id": sid[:8] + "...",
            "tenant_id": meta.get("tenant_id", "?")[:8] + "...",
            "username": meta.get("username"),
            "connected_at": meta.get("connected_at"),
            "uptime_seconds": int(time.time() - meta.get("connected_at", time.time())),
            "is_connected": active_clients[sid].is_connected() if sid in active_clients else False,
            "restored": meta.get("restored", False),
        }
        for sid, meta in client_metadata.items()
    ]


def is_session_restoring(session_id: str) -> bool:
    return session_id in _restoring_sessions
