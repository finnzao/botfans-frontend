import os
import asyncio
import time
import random

import telethon.network.mtprotostate as _mtstate
_ORIGINAL_MSG_TOO_NEW_DELTA = _mtstate.MSG_TOO_NEW_DELTA
_mtstate.MSG_TOO_NEW_DELTA = 300

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
log.info(f"MSG_TOO_NEW_DELTA patched: {_ORIGINAL_MSG_TOO_NEW_DELTA}s -> {_mtstate.MSG_TOO_NEW_DELTA}s")

active_clients: dict[str, TelegramClient] = {}
client_metadata: dict[str, dict] = {}
_session_locks: dict[str, asyncio.Lock] = {}
_restoring_sessions: set[str] = set()
_background_tasks: dict[str, list[asyncio.Task]] = {}

CONNECT_TIMEOUT = 30
RECONNECT_MAX_RETRIES = 5
RECONNECT_BASE_DELAY = 3
SESSION_SAVE_INTERVAL = 300
HEALTH_CHECK_INTERVAL = 120


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


def _backoff_delay(attempt: int) -> float:
    delay = min(RECONNECT_BASE_DELAY * (2 ** attempt), 30)
    return delay + random.uniform(0, delay * 0.2)


def _create_client(
    api_id: int, api_hash: str, session_string: str = None,
    for_reconnect: bool = False
) -> TelegramClient:
    session = StringSession(session_string) if session_string else StringSession()

    if for_reconnect:
        return TelegramClient(
            session, api_id, api_hash,
            connection_retries=1,
            retry_delay=1,
            auto_reconnect=False,
            request_retries=2,
            timeout=15,
        )
    else:
        return TelegramClient(
            session, api_id, api_hash,
            connection_retries=3,
            retry_delay=1,
            auto_reconnect=True,
            request_retries=3,
            timeout=15,
            flood_sleep_threshold=60,
        )


def _create_client_durable(
    api_id: int, api_hash: str, session_string: str
) -> TelegramClient:
    session = StringSession(session_string)
    return TelegramClient(
        session, api_id, api_hash,
        connection_retries=10,
        retry_delay=2,
        auto_reconnect=True,
        request_retries=5,
        timeout=15,
        flood_sleep_threshold=60,
    )


async def _safe_disconnect(client: TelegramClient, session_id: str = "?"):
    try:
        if client and client.is_connected():
            await asyncio.wait_for(client.disconnect(), timeout=5)
    except Exception as e:
        log.debug(f"safe_disconnect | {session_id[:8]}... | {type(e).__name__}")


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
            me = await asyncio.wait_for(client.get_me(), timeout=10)
            if me:
                failures = 0
        except AuthKeyUnregisteredError:
            log.error(f"Auth key revogada | {session_id[:8]}...")
            update_session_status(session_id, "disconnected", "Sessão revogada")
            save_session_string(session_id, "")
            await cleanup_existing_session(session_id)
            break
        except Exception:
            failures += 1
            log.warning(f"Health check falhou ({failures}x) | {session_id[:8]}...")
        if failures >= 3:
            update_session_status(session_id, "disconnected", "Conexão perdida")
            await cleanup_existing_session(session_id)
            break


async def _activate_session(
    session_id: str, tenant_id: str, phone: str,
    api_id: int, api_hash: str, client: TelegramClient, user_info: dict
):
    new_ss = client.session.save()

    old_client = active_clients.get(session_id)
    if old_client and old_client is not client:
        await _safe_disconnect(old_client, session_id)

    durable_client = _create_client_durable(api_id, api_hash, new_ss)
    await _safe_disconnect(client, session_id)
    try:
        await asyncio.wait_for(durable_client.connect(), timeout=CONNECT_TIMEOUT)
    except Exception as e:
        log.warning(f"Falha client durável, usando original | {type(e).__name__}")
        durable_client = client

    active_clients[session_id] = durable_client
    client_metadata[session_id] = {
        "tenant_id": tenant_id, "phone": phone,
        "api_id": api_id, "api_hash": api_hash,
        "user_id": user_info["user_id"], "username": user_info["username"],
        "connected_at": time.time(), "restored": True,
    }
    update_session_status(session_id, "active")
    save_session_string(session_id, durable_client.session.save())
    register_message_handler(durable_client, session_id, tenant_id)
    _start_bg_tasks(session_id, durable_client)
    log.info(
        f"Sessão ATIVA | {session_id[:8]}... | "
        f"user=@{user_info.get('username', '?')} | id={user_info.get('user_id')}"
    )


async def _try_connect_and_validate(
    session_id: str, api_id: int, api_hash: str, session_string: str
) -> dict | None:
    client = _create_client(api_id, api_hash, session_string, for_reconnect=True)
    try:
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)

        if not client.is_connected():
            return None

        authorized = await asyncio.wait_for(
            client.is_user_authorized(), timeout=10
        )
        if not authorized:
            log.warning(f"Sessão não autorizada | {session_id[:8]}...")
            await _safe_disconnect(client, session_id)
            return None

        me = await asyncio.wait_for(client.get_me(), timeout=10)
        if not me:
            await _safe_disconnect(client, session_id)
            return None

        log.info(f"Sessão validada | {session_id[:8]}... | user=@{me.username}")
        return {
            "client": client,
            "user_id": me.id,
            "username": me.username,
            "first_name": me.first_name,
        }

    except AuthKeyUnregisteredError:
        log.warning(f"Auth key inválida | {session_id[:8]}...")
        await _safe_disconnect(client, session_id)
        return None
    except (asyncio.TimeoutError, ConnectionError, OSError) as e:
        log.warning(f"Validação falhou | {session_id[:8]}... | {type(e).__name__}: {e}")
        await _safe_disconnect(client, session_id)
        return None
    except Exception as e:
        log.warning(f"Validação erro | {session_id[:8]}... | {type(e).__name__}: {e}")
        await _safe_disconnect(client, session_id)
        return None


def has_valid_credentials(creds: dict | None) -> bool:
    if not creds:
        return False
    api_id = creds.get("api_id")
    api_hash = creds.get("api_hash_encrypted")
    if not api_id or not api_hash:
        return False
    if not isinstance(api_id, int) or api_id < 1:
        return False
    if not isinstance(api_hash, str) or len(api_hash) < 20:
        return False
    return True


def has_session_string(creds: dict | None) -> bool:
    if not creds:
        return False
    ss = creds.get("session_string")
    return bool(ss and isinstance(ss, str) and len(ss) > 10)


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"START SESSION | {session_id[:8]}...")

        creds = get_session_credentials(session_id)

        if has_session_string(creds):
            log.info(f"Session string encontrada — restaurando | {session_id[:8]}...")
            await cleanup_existing_session(session_id)

            validated = await _try_connect_and_validate(
                session_id, api_id, api_hash, creds["session_string"]
            )

            if validated:
                await _activate_session(
                    session_id, tenant_id, phone, api_id, api_hash,
                    validated["client"],
                    {
                        "user_id": validated["user_id"],
                        "username": validated["username"],
                        "first_name": validated["first_name"],
                    }
                )
                return {"status": "active"}
            else:
                log.info(f"Session string inválida — novo login | {session_id[:8]}...")

        await cleanup_existing_session(session_id)
        client = _create_client(api_id, api_hash)

        try:
            log.info(f"Conectando ao Telegram... | {session_id[:8]}...")
            await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)

            log.info(f"Conectado! Enviando código para {phone[:6]}*** | {session_id[:8]}...")
            sent = await client.send_code_request(phone)

            update_session_status(session_id, "awaiting_session_code")
            active_clients[session_id] = client
            client_metadata[session_id] = {
                "tenant_id": tenant_id, "phone": phone,
                "api_id": api_id, "api_hash": api_hash,
                "phone_code_hash": sent.phone_code_hash,
                "connected_at": time.time(),
            }

            ss = client.session.save()
            if ss and len(ss) > 10:
                save_session_string(session_id, ss)

            return {"status": "awaiting_session_code"}

        except FloodWaitError as e:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", f"Aguarde {e.seconds}s")
            return {"status": "error", "error": f"Telegram pede para aguardar {e.seconds} segundos"}
        except RPCError as e:
            await _safe_disconnect(client, session_id)
            msg = str(e)
            update_session_status(session_id, "error", msg)
            return {"status": "error", "error": msg}
        except asyncio.TimeoutError:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", "Timeout")
            return {"status": "error", "error": "Timeout ao conectar. Tente novamente."}
        except Exception as e:
            log.error(f"Exceção | {type(e).__name__}: {e}", exc_info=True)
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", str(e))
            return {"status": "error", "error": str(e)}


async def start_session_with_existing_credentials(session_id: str, tenant_id: str, phone: str):
    creds = get_session_credentials(session_id)
    if not has_valid_credentials(creds):
        return {"status": "error", "error": "Credenciais API não encontradas."}

    return await start_session(
        session_id, tenant_id, phone,
        creds["api_id"], creds["api_hash_encrypted"]
    )


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

        meta = client_metadata.get(session_id, {})
        phone_code_hash = meta.get("phone_code_hash")

        if not phone_code_hash:
            return {"status": "error", "error": "Hash do código não encontrado. Inicie novamente."}

        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
            me = await client.get_me()
            log.info(f"Autenticado | user={me.first_name} (@{me.username})")

            await _activate_session(
                session_id, tenant_id, phone, api_id, api_hash, client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            return {"status": "active"}

        except SessionPasswordNeededError:
            update_session_status(session_id, "awaiting_2fa")
            return {"status": "awaiting_2fa"}
        except PhoneCodeInvalidError:
            return {"status": "error", "error": "Código inválido"}
        except PhoneCodeExpiredError:
            update_session_status(session_id, "error", "Código expirado")
            return {"status": "error", "error": "Código expirado. Inicie novamente."}
        except RPCError as e:
            return {"status": "error", "error": str(e)}
        except Exception as e:
            log.error(f"Exceção verify_code | {type(e).__name__}: {e}", exc_info=True)
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
            log.info(f"Autenticado 2FA | {me.first_name} (@{me.username})")

            meta = client_metadata.get(session_id, {})
            await _activate_session(
                session_id, tenant_id, meta.get("phone", ""),
                meta.get("api_id"), meta.get("api_hash"), client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            return {"status": "active"}

        except RPCError as e:
            if "PASSWORD_HASH_INVALID" in str(e).upper():
                return {"status": "error", "error": "Senha 2FA incorreta."}
            return {"status": "error", "error": str(e)}
        except Exception as e:
            log.error(f"Exceção verify_2fa | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


async def reconnect_session(session_id: str) -> bool:
    creds = get_session_credentials(session_id)
    if not creds:
        return False

    if not has_valid_credentials(creds):
        update_session_status(session_id, "disconnected", "Credenciais inválidas")
        return False

    ss = creds.get("session_string")
    if not ss or len(ss) < 10:
        update_session_status(session_id, "disconnected", "Sem sessão salva")
        return False

    await cleanup_existing_session(session_id)

    api_id = creds["api_id"]
    api_hash = creds["api_hash_encrypted"]
    tenant_id = creds["tenant_id"]

    for attempt in range(RECONNECT_MAX_RETRIES):
        if attempt > 0:
            delay = _backoff_delay(attempt)
            log.info(f"Retry {attempt + 1}/{RECONNECT_MAX_RETRIES} em {delay:.1f}s | {session_id[:8]}...")
            await asyncio.sleep(delay)

        log.info(f"Tentativa {attempt + 1}/{RECONNECT_MAX_RETRIES} | {session_id[:8]}...")

        validated = await _try_connect_and_validate(session_id, api_id, api_hash, ss)

        if validated:
            await _activate_session(
                session_id, tenant_id, creds.get("phone", ""),
                api_id, api_hash, validated["client"],
                {
                    "user_id": validated["user_id"],
                    "username": validated["username"],
                    "first_name": validated["first_name"],
                }
            )
            log.info(f"Reconectado na tentativa {attempt + 1} | {session_id[:8]}...")
            return True

    log.error(f"Reconexão falhou após {RECONNECT_MAX_RETRIES} tentativas | {session_id[:8]}...")
    update_session_status(session_id, "disconnected", "Falha na reconexão")
    return False


async def restore_active_sessions():
    log_separator(log, "RESTAURANDO SESSÕES ATIVAS")
    sessions = get_active_sessions()
    log.info(f"Sessões para restaurar: {len(sessions)}")
    if not sessions:
        return

    restored = 0
    failed = 0

    for sess in sessions:
        sid = sess["id"]
        _restoring_sessions.add(sid)
        try:
            ok = await asyncio.wait_for(_restore_single(sess), timeout=60)
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

    if not has_valid_credentials(sess):
        update_session_status(sid, "disconnected", "Credenciais inválidas")
        return False

    ss = sess.get("session_string")
    if not ss or len(ss) < 10:
        update_session_status(sid, "disconnected")
        return False

    validated = await _try_connect_and_validate(
        sid, sess["api_id"], sess["api_hash_encrypted"], ss
    )

    if not validated:
        update_session_status(sid, "disconnected", "Sessão expirada")
        return False

    await _activate_session(
        sid, sess["tenant_id"], sess.get("phone", ""),
        sess["api_id"], sess["api_hash_encrypted"],
        validated["client"],
        {
            "user_id": validated["user_id"],
            "username": validated["username"],
            "first_name": validated["first_name"],
        }
    )
    return True


async def auto_reconnect_loop():
    while True:
        await asyncio.sleep(60)
        for sid, client in list(active_clients.items()):
            if not client.is_connected():
                log.warning(f"Sessão desconectou | {sid[:8]}...")
                update_session_status(sid, "disconnected", "Conexão perdida")
                await cleanup_existing_session(sid)


def register_message_handler(client: TelegramClient, session_id: str, tenant_id: str):
    ai_profile = get_ai_profile(tenant_id)

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_message(event):
        msg_received_at = time.time()
        try:
            if not event.text or not event.text.strip():
                return

            sender = await event.get_sender()
            if not sender or getattr(sender, 'bot', False):
                return

            message_text = event.text
            log.info(f"MSG IN | {sender.first_name} (@{sender.username}) | len={len(message_text)}")

            contact_id = save_contact(tenant_id, sender)
            if not contact_id:
                return

            save_message(tenant_id, contact_id, "incoming", message_text)

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


def generate_response(message: str, sender, ai_profile: dict | None, history: list[dict] = None) -> str | None:
    if not ai_profile:
        return None
    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    msg_lower = message.lower().strip()
    name = getattr(sender, 'first_name', None) or "você"

    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi", "eae", "e aí"]
    if any(g in msg_lower for g in greetings):
        return welcome or f"Olá {name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    goodbyes = ["tchau", "bye", "até", "valeu", "obrigado", "obrigada", "flw", "falou"]
    if any(g in msg_lower for g in goodbyes):
        return f"Obrigado pelo contato, {name}! Qualquer coisa é só chamar."

    return f"Obrigado pela mensagem, {name}! Recebi e vou analisar. Em breve retorno."


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
        log.error(f"Erro envio | {type(e).__name__}: {e}")
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
