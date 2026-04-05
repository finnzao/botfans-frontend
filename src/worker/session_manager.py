import os
import asyncio
import time
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

active_clients: dict[str, TelegramClient] = {}
client_metadata: dict[str, dict] = {}
_session_locks: dict[str, asyncio.Lock] = {}
_restoring_sessions: set[str] = set()

CONNECT_TIMEOUT = 30
AUTH_CHECK_TIMEOUT = 20
RESTORE_TIMEOUT = 40


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


def create_client(api_id: int, api_hash: str, session_string: str = None) -> TelegramClient:
    session = StringSession(session_string) if session_string else StringSession()
    client = TelegramClient(
        session, api_id, api_hash,
        connection_retries=3,
        retry_delay=2,
        timeout=CONNECT_TIMEOUT,
        request_retries=3,
    )
    return client


async def safe_disconnect(client: TelegramClient, session_id: str = "?"):
    try:
        if client and client.is_connected():
            await asyncio.wait_for(client.disconnect(), timeout=10)
    except Exception as e:
        log.debug(f"safe_disconnect | session={session_id[:8]}... | {type(e).__name__}: {e}")


async def cleanup_existing_session(session_id: str):
    old_client = active_clients.pop(session_id, None)
    client_metadata.pop(session_id, None)
    if old_client:
        log.info(f"Limpando sessão anterior | session={session_id[:8]}...")
        await safe_disconnect(old_client, session_id)


async def save_client_session(session_id: str, client: TelegramClient):
    try:
        ss = client.session.save()
        if ss and len(ss) > 10:
            save_session_string(session_id, ss)
        else:
            log.warning(f"Session string vazia | session={session_id[:8]}...")
    except Exception as e:
        log.error(f"Erro ao salvar session string | session={session_id[:8]}... | {e}")


async def periodic_session_saver(session_id: str, client: TelegramClient, interval: int = 300):
    while session_id in active_clients:
        await asyncio.sleep(interval)
        if session_id in active_clients and client.is_connected():
            try:
                await save_client_session(session_id, client)
            except Exception as e:
                log.warning(f"Periodic save falhou | session={session_id[:8]}... | {e}")
        else:
            break


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"START SESSION | {session_id[:8]}...")

        await cleanup_existing_session(session_id)

        creds = get_session_credentials(session_id)
        session_string = creds.get("session_string") if creds else None

        if session_string and len(session_string) > 10:
            restore_result = await _try_restore_session(
                session_id, tenant_id, phone, api_id, api_hash, session_string
            )
            if restore_result:
                return restore_result

        client = create_client(api_id, api_hash)

        try:
            await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
            sent = await client.send_code_request(phone)

            update_session_status(session_id, "awaiting_session_code")
            active_clients[session_id] = client
            client_metadata[session_id] = {
                "tenant_id": tenant_id,
                "phone": phone,
                "api_id": api_id,
                "api_hash": api_hash,
                "phone_code_hash": sent.phone_code_hash,
                "connected_at": time.time(),
            }

            await save_client_session(session_id, client)
            return {"status": "awaiting_session_code"}

        except FloodWaitError as e:
            await safe_disconnect(client, session_id)
            update_session_status(session_id, "error", f"Telegram pede para aguardar {e.seconds}s")
            return {"status": "error", "error": f"Telegram pede para aguardar {e.seconds} segundos"}

        except RPCError as e:
            await safe_disconnect(client, session_id)
            update_session_status(session_id, "error", str(e.message))
            return {"status": "error", "error": str(e.message)}

        except asyncio.TimeoutError:
            await safe_disconnect(client, session_id)
            update_session_status(session_id, "error", "Timeout ao conectar ao Telegram")
            return {"status": "error", "error": "Timeout ao conectar. Tente novamente."}

        except Exception as e:
            log.error(f"Exceção ao iniciar sessão | {type(e).__name__}: {e}", exc_info=True)
            await safe_disconnect(client, session_id)
            update_session_status(session_id, "error", str(e))
            return {"status": "error", "error": str(e)}


async def _try_restore_session(
    session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str, session_string: str
) -> dict | None:
    client = create_client(api_id, api_hash, session_string)

    try:
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
        is_authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=AUTH_CHECK_TIMEOUT)

        if not is_authorized:
            await safe_disconnect(client, session_id)
            save_session_string(session_id, "")
            return None

        me = await asyncio.wait_for(client.get_me(), timeout=AUTH_CHECK_TIMEOUT)
        log.info(f"Sessão RESTAURADA | user={me.first_name} (@{me.username}) | id={me.id}")

        active_clients[session_id] = client
        client_metadata[session_id] = {
            "tenant_id": tenant_id, "phone": phone, "api_id": api_id, "api_hash": api_hash,
            "user_id": me.id, "username": me.username, "connected_at": time.time(), "restored": True,
        }

        update_session_status(session_id, "active")
        await save_client_session(session_id, client)
        await register_message_handler(client, session_id, tenant_id)
        asyncio.create_task(periodic_session_saver(session_id, client))
        return {"status": "active"}

    except AuthKeyUnregisteredError:
        await safe_disconnect(client, session_id)
        save_session_string(session_id, "")
        return None
    except (asyncio.TimeoutError, ConnectionError, OSError) as e:
        log.warning(f"Erro ao restaurar | session={session_id[:8]}... | {type(e).__name__}: {e}")
        await safe_disconnect(client, session_id)
        return None
    except Exception as e:
        log.error(f"Erro ao restaurar | session={session_id[:8]}... | {type(e).__name__}: {e}")
        await safe_disconnect(client, session_id)
        return None


async def verify_code(session_id: str, tenant_id: str, phone: str, code: str, api_id: int, api_hash: str):
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY CODE | {session_id[:8]}...")

        client = active_clients.get(session_id)
        if not client or not client.is_connected():
            if client:
                await safe_disconnect(client, session_id)
            creds = get_session_credentials(session_id)
            session_string = creds.get("session_string") if creds else None
            client = create_client(api_id, api_hash, session_string)
            try:
                await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
            except Exception as e:
                return {"status": "error", "error": "Falha ao reconectar. Tente novamente."}
            active_clients[session_id] = client

        try:
            await client.sign_in(phone, code)
            me = await client.get_me()
            log.info(f"Autenticado | user={me.first_name} (@{me.username}) | id={me.id}")

            update_session_status(session_id, "active")
            await save_client_session(session_id, client)
            client_metadata[session_id] = {
                "tenant_id": tenant_id, "phone": phone, "api_id": api_id, "api_hash": api_hash,
                "user_id": me.id, "username": me.username, "connected_at": time.time(),
            }
            await register_message_handler(client, session_id, tenant_id)
            asyncio.create_task(periodic_session_saver(session_id, client))
            return {"status": "active"}

        except SessionPasswordNeededError:
            update_session_status(session_id, "awaiting_2fa")
            await save_client_session(session_id, client)
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
            log.info(f"Autenticado com 2FA | user={me.first_name} (@{me.username})")

            update_session_status(session_id, "active")
            await save_client_session(session_id, client)
            meta = client_metadata.get(session_id, {})
            client_metadata[session_id] = {
                **meta, "tenant_id": tenant_id, "user_id": me.id,
                "username": me.username, "connected_at": time.time(),
            }
            await register_message_handler(client, session_id, tenant_id)
            asyncio.create_task(periodic_session_saver(session_id, client))
            return {"status": "active"}

        except RPCError as e:
            if "PASSWORD_HASH_INVALID" in str(e.message).upper():
                return {"status": "error", "error": "Senha 2FA incorreta."}
            return {"status": "error", "error": str(e.message)}
        except Exception as e:
            log.error(f"Exceção no verify_2fa | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


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

            log.info(
                f"MENSAGEM RECEBIDA | from={sender.first_name} (@{sender.username}) | "
                f"tg_id={sender.id} | len={len(message_text)}"
            )

            contact_id = save_contact(tenant_id, sender)
            if not contact_id:
                return

            save_message(tenant_id, contact_id, "incoming", message_text)

            history = get_conversation_history(tenant_id, contact_id, limit=10)
            response = generate_response(message_text, sender, ai_profile, history)

            if response:
                import random
                delay = random.uniform(1.0, 3.0)
                await asyncio.sleep(delay)
                await event.respond(response)

                response_time_ms = int((time.time() - msg_received_at) * 1000)

                log.info(
                    f"RESPOSTA ENVIADA | to={sender.first_name} (@{sender.username}) | "
                    f"len={len(response)} | response_time={response_time_ms}ms"
                )

                save_message(tenant_id, contact_id, "outgoing", response, "ai", response_time_ms)

        except Exception as e:
            log.error(f"Erro ao processar mensagem | {type(e).__name__}: {e}", exc_info=True)

    me = await client.get_me()
    log.info(f"Watch mode ATIVO | logado_como={me.first_name} (@{me.username}) | session={session_id[:8]}...")


def generate_response(message: str, sender, ai_profile: dict | None, history: list[dict] = None) -> str | None:
    if not ai_profile:
        return None

    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    msg_lower = message.lower().strip()

    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi", "eae", "e aí"]
    if any(g in msg_lower for g in greetings):
        if welcome:
            return welcome
        return f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    goodbyes = ["tchau", "bye", "até", "valeu", "obrigado", "obrigada", "flw", "falou"]
    if any(g in msg_lower for g in goodbyes):
        return f"Obrigado pelo contato, {sender.first_name}! Qualquer coisa é só chamar."

    return (
        f"Obrigado pela mensagem, {sender.first_name}! "
        f"Recebi sua mensagem e vou analisar. "
        f"Em breve retorno com uma resposta."
    )


async def send_message(session_id: str, user_id: int, text: str) -> bool:
    client = active_clients.get(session_id)
    if not client:
        return False
    try:
        await client.send_message(user_id, text)
        return True
    except Exception as e:
        log.error(f"Erro no envio manual | {type(e).__name__}: {e}")
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
        session_id = sess["id"]
        _restoring_sessions.add(session_id)
        try:
            result = await asyncio.wait_for(_restore_single_session(sess), timeout=RESTORE_TIMEOUT)
            if result:
                restored += 1
            else:
                failed += 1
        except asyncio.TimeoutError:
            update_session_status(session_id, "disconnected", "Timeout na restauração")
            failed += 1
        except Exception as e:
            update_session_status(session_id, "error", str(e))
            failed += 1
        finally:
            _restoring_sessions.discard(session_id)

    log.info(f"Restauração concluída | sucesso={restored} | falhas={failed}")


async def _restore_single_session(sess: dict) -> bool:
    session_id = sess["id"]
    tenant_id = sess["tenant_id"]
    session_string = sess.get("session_string")

    if not session_string or len(session_string) < 10:
        update_session_status(session_id, "disconnected")
        return False

    client = create_client(sess["api_id"], sess["api_hash_encrypted"], session_string)

    try:
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)
        is_authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=AUTH_CHECK_TIMEOUT)

        if not is_authorized:
            await safe_disconnect(client, session_id)
            update_session_status(session_id, "disconnected")
            return False

        me = await asyncio.wait_for(client.get_me(), timeout=AUTH_CHECK_TIMEOUT)
        active_clients[session_id] = client
        client_metadata[session_id] = {
            "tenant_id": tenant_id, "phone": sess.get("phone"),
            "api_id": sess["api_id"], "api_hash": sess["api_hash_encrypted"],
            "user_id": me.id, "username": me.username,
            "connected_at": time.time(), "restored": True,
        }

        await register_message_handler(client, session_id, tenant_id)
        asyncio.create_task(periodic_session_saver(session_id, client))
        await save_client_session(session_id, client)
        update_session_status(session_id, "active")
        log.info(f"Restaurada | session={session_id[:8]}... | user={me.first_name} (@{me.username})")
        return True

    except AuthKeyUnregisteredError:
        await safe_disconnect(client, session_id)
        update_session_status(session_id, "disconnected")
        save_session_string(session_id, "")
        return False
    except (ConnectionError, OSError, asyncio.TimeoutError) as e:
        await safe_disconnect(client, session_id)
        update_session_status(session_id, "disconnected", f"Erro na restauração: {type(e).__name__}")
        return False
    except Exception as e:
        log.error(f"Erro ao restaurar {session_id[:8]}... | {type(e).__name__}: {e}", exc_info=True)
        await safe_disconnect(client, session_id)
        update_session_status(session_id, "error", str(e))
        return False


async def reconnect_session(session_id: str) -> bool:
    creds = get_session_credentials(session_id)
    if not creds:
        return False

    session_string = creds.get("session_string")
    if not session_string or len(session_string) < 10:
        return False

    await cleanup_existing_session(session_id)

    result = await _try_restore_session(
        session_id, creds["tenant_id"], creds.get("phone", ""),
        creds["api_id"], creds["api_hash_encrypted"], session_string,
    )

    if result and result.get("status") == "active":
        return True

    update_session_status(session_id, "disconnected", "Falha na reconexão")
    return False


async def auto_reconnect_loop():
    while True:
        await asyncio.sleep(60)
        for session_id, client in list(active_clients.items()):
            if not client.is_connected():
                log.warning(f"Sessão {session_id[:8]}... perdeu conexão")
                try:
                    await reconnect_session(session_id)
                except Exception as e:
                    log.error(f"Erro na auto-reconexão | {type(e).__name__}: {e}")


async def disconnect_session(session_id: str):
    client = active_clients.pop(session_id, None)
    client_metadata.pop(session_id, None)

    if client:
        try:
            await save_client_session(session_id, client)
            await safe_disconnect(client, session_id)
        except Exception as e:
            log.warning(f"Erro ao desconectar {session_id[:8]}...: {e}")

    update_session_status(session_id, "disconnected")


def get_active_sessions_info() -> list[dict]:
    info = []
    for sid, meta in client_metadata.items():
        client = active_clients.get(sid)
        info.append({
            "session_id": sid[:8] + "...",
            "tenant_id": meta.get("tenant_id", "?")[:8] + "...",
            "username": meta.get("username"),
            "connected_at": meta.get("connected_at"),
            "uptime_seconds": int(time.time() - meta.get("connected_at", time.time())),
            "is_connected": client.is_connected() if client else False,
            "restored": meta.get("restored", False),
        })
    return info


def is_session_restoring(session_id: str) -> bool:
    return session_id in _restoring_sessions
