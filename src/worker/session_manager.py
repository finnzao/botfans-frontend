import os
import asyncio
import time
import random
from pyrogram import Client, filters
from pyrogram.types import Message
from pyrogram.errors import (
    SessionPasswordNeeded,
    PhoneCodeInvalid,
    PhoneCodeExpired,
    FloodWait,
    AuthKeyUnregistered,
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

active_clients: dict[str, Client] = {}
client_metadata: dict[str, dict] = {}
_session_locks: dict[str, asyncio.Lock] = {}
_restoring_sessions: set[str] = set()
_background_tasks: dict[str, list[asyncio.Task]] = {}

CONNECT_TIMEOUT = 30
RECONNECT_MAX_RETRIES = 3
RECONNECT_BASE_DELAY = 5
SESSION_SAVE_INTERVAL = 300
HEALTH_CHECK_INTERVAL = 120


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


def _backoff_delay(attempt: int) -> float:
    delay = min(RECONNECT_BASE_DELAY * (2 ** attempt), 60)
    return delay + random.uniform(0, delay * 0.3)


def _create_client(
    session_id: str, api_id: int, api_hash: str, session_string: str = None
) -> Client:
    kwargs = {
        "name": f"session_{session_id[:8]}",
        "api_id": api_id,
        "api_hash": api_hash,
        "in_memory": True,
        "ipv6": False,
        "no_updates": False,
    }
    if session_string:
        kwargs["session_string"] = session_string
    return Client(**kwargs)


async def _safe_disconnect(client: Client, session_id: str = "?"):
    try:
        if client and client.is_connected:
            await asyncio.wait_for(client.stop(), timeout=10)
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


async def _save_session(session_id: str, client: Client):
    try:
        ss = await client.export_session_string()
        if ss and len(ss) > 10:
            save_session_string(session_id, ss)
    except Exception as e:
        log.error(f"Erro ao salvar session | {session_id[:8]}... | {e}")


def _start_bg_tasks(session_id: str, client: Client):
    tasks = [
        asyncio.create_task(_periodic_saver(session_id, client)),
        asyncio.create_task(_health_check(session_id, client)),
    ]
    _background_tasks[session_id] = tasks


async def _periodic_saver(session_id: str, client: Client):
    while session_id in active_clients:
        await asyncio.sleep(SESSION_SAVE_INTERVAL)
        if session_id in active_clients and client.is_connected:
            try:
                await _save_session(session_id, client)
            except Exception as e:
                log.warning(f"Periodic save falhou | {session_id[:8]}... | {e}")
        else:
            break


async def _health_check(session_id: str, client: Client):
    failures = 0
    while session_id in active_clients:
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        if session_id not in active_clients:
            break
        try:
            me = await asyncio.wait_for(client.get_me(), timeout=15)
            if me:
                failures = 0
        except AuthKeyUnregistered:
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


async def _activate_session(
    session_id: str, tenant_id: str, phone: str,
    api_id: int, api_hash: str, client: Client, user_info: dict
):
    active_clients[session_id] = client
    client_metadata[session_id] = {
        "tenant_id": tenant_id, "phone": phone,
        "api_id": api_id, "api_hash": api_hash,
        "user_id": user_info["user_id"], "username": user_info["username"],
        "connected_at": time.time(), "restored": True,
    }
    update_session_status(session_id, "active")
    await _save_session(session_id, client)
    register_message_handler(client, session_id, tenant_id)
    _start_bg_tasks(session_id, client)


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"START SESSION | {session_id[:8]}...")
        await cleanup_existing_session(session_id)

        creds = get_session_credentials(session_id)
        session_string = creds.get("session_string") if creds else None

        if session_string and len(session_string) > 10:
            try:
                client = _create_client(session_id, api_id, api_hash, session_string)
                await asyncio.wait_for(client.start(), timeout=CONNECT_TIMEOUT)
                me = await client.get_me()
                if me:
                    new_ss = await client.export_session_string()
                    save_session_string(session_id, new_ss)
                    await _activate_session(
                        session_id, tenant_id, phone, api_id, api_hash, client,
                        {"user_id": me.id, "username": me.username, "first_name": me.first_name}
                    )
                    return {"status": "active"}
            except Exception as e:
                log.warning(f"Restauração falhou: {type(e).__name__}: {e}")

        client = _create_client(session_id, api_id, api_hash)
        try:
            log.info(f"Conectando ao Telegram (IPv4, timeout={CONNECT_TIMEOUT}s)... | {session_id[:8]}...")
            await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
            log.info(f"Conectado! Enviando código para {phone[:6]}*** | {session_id[:8]}...")
            sent = await client.send_code(phone)

            update_session_status(session_id, "awaiting_session_code")
            active_clients[session_id] = client
            client_metadata[session_id] = {
                "tenant_id": tenant_id, "phone": phone,
                "api_id": api_id, "api_hash": api_hash,
                "phone_code_hash": sent.phone_code_hash,
                "connected_at": time.time(),
            }
            return {"status": "awaiting_session_code"}

        except FloodWait as e:
            await _safe_disconnect(client, session_id)
            update_session_status(session_id, "error", f"Aguarde {e.value}s")
            return {"status": "error", "error": f"Telegram pede para aguardar {e.value} segundos"}
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


async def verify_code(session_id: str, tenant_id: str, phone: str, code: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY CODE | {session_id[:8]}...")

        client = active_clients.get(session_id)
        if not client or not client.is_connected:
            if client:
                await _safe_disconnect(client, session_id)
            creds = get_session_credentials(session_id)
            ss = creds.get("session_string") if creds else None
            client = _create_client(session_id, api_id, api_hash, ss)
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
            await client.sign_in(phone, phone_code_hash, code)
            me = await client.get_me()
            log.info(f"Autenticado | user={me.first_name} (@{me.username})")

            await _activate_session(
                session_id, tenant_id, phone, api_id, api_hash, client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            return {"status": "active"}

        except SessionPasswordNeeded:
            update_session_status(session_id, "awaiting_2fa")
            return {"status": "awaiting_2fa"}
        except PhoneCodeInvalid:
            return {"status": "error", "error": "Código inválido"}
        except PhoneCodeExpired:
            update_session_status(session_id, "error", "Código expirado")
            return {"status": "error", "error": "Código expirado. Inicie novamente."}
        except RPCError as e:
            return {"status": "error", "error": str(e)}
        except Exception as e:
            log.error(f"Exceção no verify_code | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


async def verify_2fa(session_id: str, tenant_id: str, password: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY 2FA | {session_id[:8]}...")
        client = active_clients.get(session_id)
        if not client or not client.is_connected:
            return {"status": "error", "error": "Sessão perdida. Inicie novamente."}

        try:
            await client.check_password(password)
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
            err_str = str(e).upper()
            if "PASSWORD_HASH_INVALID" in err_str:
                return {"status": "error", "error": "Senha 2FA incorreta."}
            return {"status": "error", "error": str(e)}
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
            client = _create_client(
                session_id, creds["api_id"], creds["api_hash_encrypted"], ss
            )
            await asyncio.wait_for(client.start(), timeout=CONNECT_TIMEOUT)
            me = await client.get_me()

            if not me:
                await _safe_disconnect(client, session_id)
                continue

            new_ss = await client.export_session_string()
            save_session_string(session_id, new_ss)

            await _activate_session(
                session_id, creds["tenant_id"], creds.get("phone", ""),
                creds["api_id"], creds["api_hash_encrypted"], client,
                {"user_id": me.id, "username": me.username, "first_name": me.first_name}
            )
            log.info(f"Reconectado (tentativa {attempt + 1}) | {session_id[:8]}...")
            return True

        except AuthKeyUnregistered:
            log.warning(f"Auth inválida | {session_id[:8]}...")
            update_session_status(session_id, "disconnected", "Sessão revogada")
            save_session_string(session_id, "")
            return False
        except (asyncio.TimeoutError, ConnectionError, OSError) as e:
            log.warning(f"Tentativa {attempt + 1} falhou | {session_id[:8]}... | {type(e).__name__}")
            continue
        except Exception as e:
            log.error(f"Erro tentativa {attempt + 1} | {type(e).__name__}: {e}")
            continue

    log.error(f"Reconexão falhou após {RECONNECT_MAX_RETRIES} tentativas | {session_id[:8]}...")
    update_session_status(session_id, "disconnected", "Falha na reconexão")
    return False


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
            ok = await asyncio.wait_for(_restore_single(sess), timeout=120)
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
        client = _create_client(sid, sess["api_id"], sess["api_hash_encrypted"], ss)
        await asyncio.wait_for(client.start(), timeout=CONNECT_TIMEOUT)
        me = await client.get_me()

        if not me:
            await _safe_disconnect(client, sid)
            update_session_status(sid, "disconnected")
            return False

        new_ss = await client.export_session_string()
        save_session_string(sid, new_ss)

        await _activate_session(
            sid, sess["tenant_id"], sess.get("phone", ""),
            sess["api_id"], sess["api_hash_encrypted"], client,
            {"user_id": me.id, "username": me.username, "first_name": me.first_name}
        )
        return True

    except AuthKeyUnregistered:
        update_session_status(sid, "disconnected")
        save_session_string(sid, "")
        return False
    except Exception as e:
        log.error(f"Restauração falhou {sid[:8]}... | {type(e).__name__}: {e}")
        update_session_status(sid, "disconnected", f"{type(e).__name__}")
        return False


async def auto_reconnect_loop():
    while True:
        await asyncio.sleep(60)
        for sid, client in list(active_clients.items()):
            if not client.is_connected:
                log.warning(f"Sessão {sid[:8]}... desconectou")
                try:
                    await reconnect_session(sid)
                except Exception as e:
                    log.error(f"Auto-reconexão falhou | {type(e).__name__}: {e}")


def register_message_handler(client: Client, session_id: str, tenant_id: str):
    log_separator(log, f"REGISTRANDO HANDLER | {session_id[:8]}...")
    ai_profile = get_ai_profile(tenant_id)

    @client.on_message(filters.private & filters.incoming & ~filters.bot)
    async def on_message(_, message: Message):
        msg_received_at = time.time()
        try:
            if not message.text or not message.text.strip():
                return

            user = message.from_user
            message_text = message.text

            log.info(f"MSG IN | {user.first_name} (@{user.username}) | len={len(message_text)}")

            contact_id = save_contact(tenant_id, user)
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
                    sender_name=user.first_name or "",
                    sender_username=user.username or "",
                    current_tags=current_tags,
                )
            except Exception as e:
                log.warning(f"Auto-tagger falhou | {type(e).__name__}: {e}")

            history = get_conversation_history(tenant_id, contact_id, limit=10)
            response = generate_response(message_text, user, ai_profile, history)

            if response:
                await asyncio.sleep(random.uniform(1.0, 3.0))
                await message.reply(response)
                elapsed = int((time.time() - msg_received_at) * 1000)
                log.info(f"MSG OUT | {user.first_name} | len={len(response)} | {elapsed}ms")
                save_message(tenant_id, contact_id, "outgoing", response, "ai", elapsed)

        except Exception as e:
            log.error(f"Erro msg handler | {type(e).__name__}: {e}", exc_info=True)


def generate_response(message: str, sender, ai_profile: dict | None, history: list[dict] = None) -> str | None:
    if not ai_profile:
        return None
    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    msg_lower = message.lower().strip()
    name = sender.first_name or "você"

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
            "is_connected": active_clients[sid].is_connected if sid in active_clients else False,
            "restored": meta.get("restored", False),
        }
        for sid, meta in client_metadata.items()
    ]


def is_session_restoring(session_id: str) -> bool:
    return session_id in _restoring_sessions
