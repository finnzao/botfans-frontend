import os
import asyncio
from telethon import TelegramClient, events
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
    update_session_status,
    save_contact,
    save_message,
    get_ai_profile,
)

log = get_logger("session_manager")

SESSIONS_DIR = os.getenv("SESSIONS_DIR", "./sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)

# Clientes ativos: session_id → TelegramClient
active_clients: dict[str, TelegramClient] = {}


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    """
    Inicia uma sessão Telethon.
    Se a sessão .session já existe e está válida, conecta direto.
    Se não, envia código para autenticação.
    """
    session_path = os.path.join(SESSIONS_DIR, f"{session_id}")
    log.info(f"Iniciando sessão {session_id[:8]}... | phone={phone[:6]}*** | api_id={api_id}")

    client = TelegramClient(session_path, api_id, api_hash)

    try:
        await client.connect()

        if await client.is_user_authorized():
            log.info(f"Sessão {session_id[:8]}... já está autorizada!")
            active_clients[session_id] = client
            update_session_status(session_id, "active")
            await register_message_handler(client, session_id, tenant_id)
            return {"status": "active"}

        # Enviar código
        log.info(f"Sessão não autorizada. Enviando código para {phone[:6]}***")
        await client.send_code_request(phone)
        update_session_status(session_id, "awaiting_session_code")

        # Guardar client para usar no verify
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
    """
    Verifica o código de autenticação do Telethon.
    Se 2FA, retorna status awaiting_2fa.
    """
    client = active_clients.get(session_id)

    if not client:
        # Reconectar se o client não está em memória
        session_path = os.path.join(SESSIONS_DIR, f"{session_id}")
        client = TelegramClient(session_path, api_id, api_hash)
        await client.connect()
        active_clients[session_id] = client

    try:
        await client.sign_in(phone, code)
        log.info(f"Sessão {session_id[:8]}... autenticada com sucesso!")
        update_session_status(session_id, "active")
        await register_message_handler(client, session_id, tenant_id)
        return {"status": "active"}

    except SessionPasswordNeededError:
        log.info(f"Sessão {session_id[:8]}... precisa de senha 2FA")
        update_session_status(session_id, "awaiting_2fa")
        return {"status": "awaiting_2fa"}

    except PhoneCodeInvalidError:
        log.warning(f"Código inválido para sessão {session_id[:8]}...")
        return {"status": "error", "error": "Código inválido"}

    except PhoneCodeExpiredError:
        log.warning(f"Código expirado para sessão {session_id[:8]}...")
        update_session_status(session_id, "error")
        return {"status": "error", "error": "Código expirado. Inicie novamente."}

    except Exception as e:
        log.error(f"Erro ao verificar código: {e}")
        return {"status": "error", "error": str(e)}


async def verify_2fa(session_id: str, tenant_id: str, password: str):
    """Verifica a senha 2FA."""
    client = active_clients.get(session_id)
    if not client:
        log.error(f"Client não encontrado para 2FA: {session_id[:8]}...")
        return {"status": "error", "error": "Sessão perdida. Inicie novamente."}

    try:
        await client.sign_in(password=password)
        log.info(f"Sessão {session_id[:8]}... autenticada com 2FA!")
        update_session_status(session_id, "active")
        await register_message_handler(client, session_id, tenant_id)
        return {"status": "active"}

    except Exception as e:
        log.error(f"Erro na verificação 2FA: {e}")
        return {"status": "error", "error": str(e)}


async def register_message_handler(client: TelegramClient, session_id: str, tenant_id: str):
    """
    Registra o handler de mensagens recebidas.
    Este é o 'watch mode' — escuta todas as mensagens privadas recebidas.
    """
    log.info(f"Registrando handler de mensagens para sessão {session_id[:8]}...")

    # Carregar perfil da IA
    ai_profile = get_ai_profile(tenant_id)
    if ai_profile:
        log.info(f"Perfil IA carregado: {ai_profile['business_name']} (tom: {ai_profile['tone']})")
    else:
        log.warning(f"Nenhum perfil IA encontrado para tenant {tenant_id[:8]}...")

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_new_message(event):
        """Handler chamado para cada mensagem privada recebida."""
        try:
            sender = await event.get_sender()
            if not isinstance(sender, User) or sender.bot:
                return  # Ignora bots e não-usuários

            message_text = event.message.text or ""
            if not message_text.strip():
                return  # Ignora mensagens vazias (stickers, mídia, etc)

            log.info(
                f"📩 Mensagem recebida | "
                f"de: {sender.first_name} (@{sender.username}) | "
                f"texto: {message_text[:80]}{'...' if len(message_text) > 80 else ''}"
            )

            # 1. Salvar contato
            contact_id = save_contact(tenant_id, sender)

            # 2. Salvar mensagem recebida
            if contact_id:
                save_message(tenant_id, contact_id, "incoming", message_text)

            # 3. Gerar resposta (por enquanto resposta simples)
            response = generate_response(message_text, sender, ai_profile)

            if response:
                # 4. Enviar resposta
                await event.respond(response)
                log.info(f"📤 Resposta enviada para {sender.first_name}: {response[:80]}...")

                # 5. Salvar mensagem enviada
                if contact_id:
                    save_message(tenant_id, contact_id, "outgoing", response, "ai")

        except Exception as e:
            log.error(f"Erro ao processar mensagem: {e}")

    me = await client.get_me()
    log.info(f"✓ Watch mode ativo! Logado como: {me.first_name} (@{me.username}) | ID: {me.id}")


def generate_response(message: str, sender, ai_profile: dict | None) -> str | None:
    """
    Gera uma resposta para a mensagem recebida.
    
    TODO: Integrar com API da OpenAI/Anthropic para respostas inteligentes.
    Por enquanto usa respostas baseadas no perfil configurado.
    """
    if not ai_profile:
        return None  # Sem perfil, não responde

    # Resposta simples baseada no perfil
    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    tone = ai_profile.get("tone", "informal")

    # Mensagens de saudação
    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi"]
    msg_lower = message.lower().strip()

    if any(g in msg_lower for g in greetings):
        if welcome:
            return welcome
        return f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    # Resposta genérica
    return (
        f"Obrigado pela mensagem, {sender.first_name}! "
        f"Recebi sua mensagem e vou analisar. "
        f"Em breve retorno com uma resposta. 😊"
    )


async def send_message(session_id: str, user_id: int, text: str) -> bool:
    """
    Envia uma mensagem para um usuário específico.
    Pode ser chamado pela API para envio manual.
    """
    client = active_clients.get(session_id)
    if not client:
        log.error(f"Client não ativo para sessão {session_id[:8]}...")
        return False

    try:
        await client.send_message(user_id, text)
        log.info(f"📤 Mensagem manual enviada para user_id={user_id}: {text[:50]}...")
        return True
    except Exception as e:
        log.error(f"Erro ao enviar mensagem: {e}")
        return False


async def restore_active_sessions():
    """
    Ao iniciar o worker, restaura sessões que estavam ativas.
    Busca todas as sessões com status 'active' no banco e reconecta.
    """
    import psycopg2
    import psycopg2.extras

    log.info("Restaurando sessões ativas...")

    try:
        from database import get_connection
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, tenant_id, phone, api_id, api_hash_encrypted FROM telegram_sessions WHERE status = 'active'"
        )
        sessions = cur.fetchall()
        cur.close()
        conn.close()

        log.info(f"Encontradas {len(sessions)} sessões para restaurar")

        for sess in sessions:
            try:
                session_path = os.path.join(SESSIONS_DIR, f"{sess['id']}")
                if not os.path.exists(f"{session_path}.session"):
                    log.warning(f"Arquivo .session não encontrado para {sess['id'][:8]}..., pulando")
                    update_session_status(sess["id"], "disconnected")
                    continue

                client = TelegramClient(session_path, sess["api_id"], sess["api_hash_encrypted"])
                await client.connect()

                if await client.is_user_authorized():
                    active_clients[sess["id"]] = client
                    await register_message_handler(client, sess["id"], sess["tenant_id"])
                    log.info(f"✓ Sessão {sess['id'][:8]}... restaurada")
                else:
                    log.warning(f"Sessão {sess['id'][:8]}... não está mais autorizada")
                    update_session_status(sess["id"], "disconnected")

            except AuthKeyUnregisteredError:
                log.warning(f"Sessão {sess['id'][:8]}... revogada pelo Telegram")
                update_session_status(sess["id"], "disconnected")
            except Exception as e:
                log.error(f"Erro ao restaurar {sess['id'][:8]}...: {e}")
                update_session_status(sess["id"], "error")

    except Exception as e:
        log.error(f"Erro ao restaurar sessões: {e}")


async def disconnect_session(session_id: str):
    """Desconecta uma sessão ativa."""
    client = active_clients.pop(session_id, None)
    if client:
        try:
            await client.disconnect()
            log.info(f"Sessão {session_id[:8]}... desconectada")
        except Exception as e:
            log.warning(f"Erro ao desconectar: {e}")
    update_session_status(session_id, "disconnected")
