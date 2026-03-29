import os
import asyncio
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    FloodWaitError,
    AuthKeyUnregisteredError,
)
from telethon.tl.types import User
from logger import get_logger
from database import (
    get_session_credentials,
    get_active_sessions,
    update_session_status,
    save_session_string,
    save_contact,
    save_message,
    get_ai_profile,
)

log = get_logger("session_manager")

# Clientes ativos: session_id → TelegramClient
active_clients: dict[str, TelegramClient] = {}


def create_client(api_id: int, api_hash: str, session_string: str = None) -> TelegramClient:
    """Cria TelegramClient usando StringSession (em memória, persistida no banco)."""
    session = StringSession(session_string) if session_string else StringSession()
    return TelegramClient(session, api_id, api_hash)


async def save_client_session(session_id: str, client: TelegramClient):
    """Salva a session string do client no banco para restaurar depois."""
    try:
        ss = client.session.save()
        save_session_string(session_id, ss)
    except Exception as e:
        log.error(f"Erro ao salvar session string: {e}")


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    log.info(f"Iniciando sessão {session_id[:8]}... | phone={phone[:6]}*** | api_id={api_id}")

    # Verificar se já tem session_string no banco
    creds = get_session_credentials(session_id)
    session_string = creds.get("session_string") if creds else None

    client = create_client(api_id, api_hash, session_string)

    try:
        await client.connect()

        if await client.is_user_authorized():
            log.info(f"Sessão {session_id[:8]}... já autorizada!")
            active_clients[session_id] = client
            update_session_status(session_id, "active")
            await save_client_session(session_id, client)
            await register_message_handler(client, session_id, tenant_id)
            return {"status": "active"}

        log.info(f"Sessão não autorizada. Enviando código para {phone[:6]}***")
        await client.send_code_request(phone)
        update_session_status(session_id, "awaiting_session_code")
        active_clients[session_id] = client

        return {"status": "awaiting_session_code"}

    except FloodWaitError as e:
        log.error(f"FloodWait: aguardar {e.seconds}s")
        update_session_status(session_id, "error")
        return {"status": "error", "error": f"Telegram pede para aguardar {e.seconds} segundos"}
    except Exception as e:
        log.error(f"Erro ao iniciar sessão: {e}")
        update_session_status(session_id, "error")
        return {"status": "error", "error": str(e)}


async def verify_code(session_id: str, tenant_id: str, phone: str, code: str, api_id: int, api_hash: str):
    client = active_clients.get(session_id)

    if not client:
        creds = get_session_credentials(session_id)
        session_string = creds.get("session_string") if creds else None
        client = create_client(api_id, api_hash, session_string)
        await client.connect()
        active_clients[session_id] = client

    try:
        await client.sign_in(phone, code)
        log.info(f"Sessão {session_id[:8]}... autenticada!")
        update_session_status(session_id, "active")
        await save_client_session(session_id, client)
        await register_message_handler(client, session_id, tenant_id)
        return {"status": "active"}

    except SessionPasswordNeededError:
        log.info(f"Sessão {session_id[:8]}... precisa de 2FA")
        update_session_status(session_id, "awaiting_2fa")
        return {"status": "awaiting_2fa"}

    except PhoneCodeInvalidError:
        log.warning(f"Código inválido para {session_id[:8]}...")
        return {"status": "error", "error": "Código inválido"}

    except PhoneCodeExpiredError:
        log.warning(f"Código expirado para {session_id[:8]}...")
        update_session_status(session_id, "error")
        return {"status": "error", "error": "Código expirado. Inicie novamente."}

    except Exception as e:
        log.error(f"Erro ao verificar código: {e}")
        return {"status": "error", "error": str(e)}


async def verify_2fa(session_id: str, tenant_id: str, password: str):
    client = active_clients.get(session_id)
    if not client:
        log.error(f"Client não encontrado para 2FA: {session_id[:8]}...")
        return {"status": "error", "error": "Sessão perdida. Inicie novamente."}

    try:
        await client.sign_in(password=password)
        log.info(f"Sessão {session_id[:8]}... autenticada com 2FA!")
        update_session_status(session_id, "active")
        await save_client_session(session_id, client)
        await register_message_handler(client, session_id, tenant_id)
        return {"status": "active"}

    except Exception as e:
        log.error(f"Erro na verificação 2FA: {e}")
        return {"status": "error", "error": str(e)}


async def register_message_handler(client: TelegramClient, session_id: str, tenant_id: str):
    log.info(f"Registrando handler para sessão {session_id[:8]}...")

    ai_profile = get_ai_profile(tenant_id)
    if ai_profile:
        log.info(f"Perfil IA: {ai_profile['business_name']} (tom: {ai_profile['tone']})")
    else:
        log.warning(f"Nenhum perfil IA para tenant {tenant_id[:8]}...")

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_new_message(event):
        try:
            sender = await event.get_sender()
            if not isinstance(sender, User) or sender.bot:
                return

            message_text = event.message.text or ""
            if not message_text.strip():
                return

            log.info(f"📩 de: {sender.first_name} (@{sender.username}) | {message_text[:80]}")

            contact_id = save_contact(tenant_id, sender)

            if contact_id:
                save_message(tenant_id, contact_id, "incoming", message_text)

            response = generate_response(message_text, sender, ai_profile)

            if response:
                await event.respond(response)
                log.info(f"📤 para {sender.first_name}: {response[:80]}")
                if contact_id:
                    save_message(tenant_id, contact_id, "outgoing", response, "ai")

        except Exception as e:
            log.error(f"Erro ao processar mensagem: {e}")

    me = await client.get_me()
    log.info(f"✓ Watch mode ativo! Logado como: {me.first_name} (@{me.username}) | ID: {me.id}")


def generate_response(message: str, sender, ai_profile: dict | None) -> str | None:
    if not ai_profile:
        return None

    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")

    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi"]
    msg_lower = message.lower().strip()

    if any(g in msg_lower for g in greetings):
        if welcome:
            return welcome
        return f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    return (
        f"Obrigado pela mensagem, {sender.first_name}! "
        f"Recebi sua mensagem e vou analisar. "
        f"Em breve retorno com uma resposta. 😊"
    )


async def send_message(session_id: str, user_id: int, text: str) -> bool:
    client = active_clients.get(session_id)
    if not client:
        log.error(f"Client não ativo para {session_id[:8]}...")
        return False

    try:
        await client.send_message(user_id, text)
        log.info(f"📤 Manual para user_id={user_id}: {text[:50]}...")
        return True
    except Exception as e:
        log.error(f"Erro ao enviar mensagem: {e}")
        return False


async def restore_active_sessions():
    """Restaura sessões ativas usando session_string do banco (sem arquivos .session)."""
    log.info("Restaurando sessões ativas...")

    sessions = get_active_sessions()
    log.info(f"Encontradas {len(sessions)} sessões para restaurar")

    for sess in sessions:
        session_id = sess["id"]
        try:
            session_string = sess.get("session_string")
            if not session_string:
                log.warning(f"Sessão {session_id[:8]}... sem session_string, pulando")
                update_session_status(session_id, "disconnected")
                continue

            client = create_client(sess["api_id"], sess["api_hash_encrypted"], session_string)
            await client.connect()

            if await client.is_user_authorized():
                active_clients[session_id] = client
                await register_message_handler(client, session_id, sess["tenant_id"])
                log.info(f"✓ Sessão {session_id[:8]}... restaurada")
            else:
                log.warning(f"Sessão {session_id[:8]}... não autorizada")
                update_session_status(session_id, "disconnected")

        except AuthKeyUnregisteredError:
            log.warning(f"Sessão {session_id[:8]}... revogada")
            update_session_status(session_id, "disconnected")
        except Exception as e:
            log.error(f"Erro ao restaurar {session_id[:8]}...: {e}")
            update_session_status(session_id, "error")


async def disconnect_session(session_id: str):
    client = active_clients.pop(session_id, None)
    if client:
        try:
            await client.disconnect()
            log.info(f"Sessão {session_id[:8]}... desconectada")
        except Exception as e:
            log.warning(f"Erro ao desconectar: {e}")
    update_session_status(session_id, "disconnected")
