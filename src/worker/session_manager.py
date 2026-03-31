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
    update_contact_capture_data,
)

log = get_logger("session_manager")

# ─── Estado em memória ───

# Clientes ativos: session_id → TelegramClient
active_clients: dict[str, TelegramClient] = {}

# Metadata dos clientes: session_id → {tenant_id, phone, api_id, connected_at, ...}
client_metadata: dict[str, dict] = {}

# Lock para operações concorrentes no mesmo session_id
_session_locks: dict[str, asyncio.Lock] = {}


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


# ─── Helpers ───


def create_client(api_id: int, api_hash: str, session_string: str = None) -> TelegramClient:
    """Cria TelegramClient usando StringSession (em memória, persistida no banco)."""
    session = StringSession(session_string) if session_string else StringSession()
    client = TelegramClient(session, api_id, api_hash)
    log.debug(
        f"Client criado | api_id={api_id} | "
        f"has_session_string={bool(session_string)} | "
        f"ss_len={len(session_string) if session_string else 0}"
    )
    return client


async def save_client_session(session_id: str, client: TelegramClient):
    """Salva a session string do client no banco para restaurar depois."""
    try:
        ss = client.session.save()
        save_session_string(session_id, ss)
        log.debug(f"Session string persistida | session={session_id[:8]}... | len={len(ss)}")
    except Exception as e:
        log.error(f"Erro ao salvar session string | session={session_id[:8]}... | {e}")


async def periodic_session_saver(session_id: str, client: TelegramClient, interval: int = 300):
    """Salva session string periodicamente (a cada 5 min por padrão).
    Captura rotações de auth key e garante que o banco está atualizado."""
    log.debug(f"Periodic saver iniciado | session={session_id[:8]}... | interval={interval}s")
    while session_id in active_clients:
        await asyncio.sleep(interval)
        if session_id in active_clients and client.is_connected():
            try:
                await save_client_session(session_id, client)
                log.debug(f"Periodic save OK | session={session_id[:8]}...")
            except Exception as e:
                log.warning(f"Periodic save falhou | session={session_id[:8]}... | {e}")
        else:
            log.debug(f"Periodic saver encerrado | session={session_id[:8]}... (desconectado)")
            break


# ─── Operações principais ───


async def start_session(session_id: str, tenant_id: str, phone: str, api_id: int, api_hash: str):
    """Inicia uma sessão Telethon. Se já tem session_string, tenta restaurar."""
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"START SESSION | {session_id[:8]}...")
        log.info(
            f"Parâmetros: phone={phone[:6]}*** | api_id={api_id} | "
            f"tenant={tenant_id[:8]}..."
        )

        # Verificar se já tem session_string no banco
        creds = get_session_credentials(session_id)
        session_string = creds.get("session_string") if creds else None

        if session_string:
            log.info(f"Session string encontrada no banco ({len(session_string)} chars)")
        else:
            log.info("Sem session string — iniciando do zero")

        client = create_client(api_id, api_hash, session_string)

        try:
            log.debug("Conectando ao Telegram...")
            await client.connect()
            log.debug("Conectado. Verificando autorização...")

            if await client.is_user_authorized():
                me = await client.get_me()
                log.info(
                    f"✓ Sessão já autorizada! | "
                    f"user={me.first_name} (@{me.username}) | id={me.id}"
                )

                active_clients[session_id] = client
                client_metadata[session_id] = {
                    "tenant_id": tenant_id,
                    "phone": phone,
                    "api_id": api_id,
                    "user_id": me.id,
                    "username": me.username,
                    "connected_at": time.time(),
                }

                update_session_status(session_id, "active")
                await save_client_session(session_id, client)
                await register_message_handler(client, session_id, tenant_id)

                # Iniciar saver periódico
                asyncio.create_task(periodic_session_saver(session_id, client))

                return {"status": "active"}

            log.info(f"Sessão não autorizada. Enviando código para {phone[:6]}***")
            sent = await client.send_code_request(phone)
            log.info(
                f"Código enviado | phone_code_hash={sent.phone_code_hash[:8]}... | "
                f"type={type(sent.type).__name__}"
            )

            update_session_status(session_id, "awaiting_session_code")
            active_clients[session_id] = client
            client_metadata[session_id] = {
                "tenant_id": tenant_id,
                "phone": phone,
                "api_id": api_id,
                "phone_code_hash": sent.phone_code_hash,
                "connected_at": time.time(),
            }

            # Salvar session string AQUI (pré-auth) — facilita reconexão
            await save_client_session(session_id, client)

            return {"status": "awaiting_session_code"}

        except FloodWaitError as e:
            log.error(f"FloodWait! Aguardar {e.seconds}s | session={session_id[:8]}...")
            update_session_status(session_id, "error", f"Telegram pede para aguardar {e.seconds}s")
            return {"status": "error", "error": f"Telegram pede para aguardar {e.seconds} segundos"}

        except RPCError as e:
            log.error(f"RPCError | code={e.code} | message={e.message} | session={session_id[:8]}...")
            update_session_status(session_id, "error", str(e.message))
            return {"status": "error", "error": str(e.message)}

        except Exception as e:
            log.error(f"Exceção inesperada ao iniciar sessão | {type(e).__name__}: {e}", exc_info=True)
            update_session_status(session_id, "error", str(e))
            return {"status": "error", "error": str(e)}


async def verify_code(session_id: str, tenant_id: str, phone: str, code: str, api_id: int, api_hash: str):
    """Verifica o código de sessão (5 dígitos do Telegram app)."""
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY CODE | {session_id[:8]}...")
        log.info(f"code_length={len(code)} | phone={phone[:6]}***")

        client = active_clients.get(session_id)

        if not client:
            log.warning("Client não encontrado em memória. Recriando...")
            creds = get_session_credentials(session_id)
            session_string = creds.get("session_string") if creds else None
            client = create_client(api_id, api_hash, session_string)
            await client.connect()
            active_clients[session_id] = client
            log.info("Client recriado e conectado")

        try:
            await client.sign_in(phone, code)
            me = await client.get_me()
            log.info(
                f"✓ Autenticado com sucesso! | "
                f"user={me.first_name} (@{me.username}) | id={me.id}"
            )

            update_session_status(session_id, "active")
            await save_client_session(session_id, client)

            client_metadata[session_id] = {
                "tenant_id": tenant_id,
                "phone": phone,
                "api_id": api_id,
                "user_id": me.id,
                "username": me.username,
                "connected_at": time.time(),
            }

            await register_message_handler(client, session_id, tenant_id)
            asyncio.create_task(periodic_session_saver(session_id, client))

            return {"status": "active"}

        except SessionPasswordNeededError:
            log.info(f"Conta requer 2FA | session={session_id[:8]}...")
            update_session_status(session_id, "awaiting_2fa")
            # Salvar session string antes do 2FA (preserva progresso)
            await save_client_session(session_id, client)
            return {"status": "awaiting_2fa"}

        except PhoneCodeInvalidError:
            log.warning(f"Código inválido | session={session_id[:8]}...")
            return {"status": "error", "error": "Código inválido"}

        except PhoneCodeExpiredError:
            log.warning(f"Código expirado | session={session_id[:8]}...")
            update_session_status(session_id, "error", "Código expirado")
            return {"status": "error", "error": "Código expirado. Inicie novamente."}

        except RPCError as e:
            log.error(f"RPCError no verify | code={e.code} | {e.message}")
            return {"status": "error", "error": str(e.message)}

        except Exception as e:
            log.error(f"Exceção no verify_code | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


async def verify_2fa(session_id: str, tenant_id: str, password: str):
    """Verifica a senha 2FA (Cloud Password)."""
    lock = _get_lock(session_id)
    async with lock:
        log_separator(log, f"VERIFY 2FA | {session_id[:8]}...")

        client = active_clients.get(session_id)
        if not client:
            log.error(f"Client não encontrado para 2FA | session={session_id[:8]}...")
            return {"status": "error", "error": "Sessão perdida. Inicie novamente."}

        try:
            await client.sign_in(password=password)
            me = await client.get_me()
            log.info(
                f"✓ Autenticado com 2FA! | "
                f"user={me.first_name} (@{me.username}) | id={me.id}"
            )

            update_session_status(session_id, "active")
            await save_client_session(session_id, client)

            client_metadata[session_id] = {
                **client_metadata.get(session_id, {}),
                "user_id": me.id,
                "username": me.username,
                "connected_at": time.time(),
            }

            await register_message_handler(client, session_id, tenant_id)
            asyncio.create_task(periodic_session_saver(session_id, client))

            return {"status": "active"}

        except RPCError as e:
            log.error(f"RPCError no 2FA | code={e.code} | {e.message}")
            return {"status": "error", "error": str(e.message)}

        except Exception as e:
            log.error(f"Exceção no verify_2fa | {type(e).__name__}: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}


# ─── Watch Mode (Message Handler) ───


async def register_message_handler(client: TelegramClient, session_id: str, tenant_id: str):
    """Registra handler para mensagens privadas recebidas (watch mode)."""
    log_separator(log, f"REGISTRANDO WATCH MODE | {session_id[:8]}...")

    ai_profile = get_ai_profile(tenant_id)
    if ai_profile:
        log.info(
            f"Perfil IA ativo | business={ai_profile['business_name']} | "
            f"tone={ai_profile['tone']} | "
            f"has_welcome={bool(ai_profile.get('welcome_message'))} | "
            f"has_system_prompt={bool(ai_profile.get('system_prompt'))}"
        )
    else:
        log.warning("Sem perfil IA — respostas serão genéricas")

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_new_message(event):
        msg_start = time.perf_counter()
        try:
            sender = await event.get_sender()
            if not isinstance(sender, User) or sender.bot:
                log.debug(f"Mensagem ignorada (bot ou não-user) | sender_type={type(sender).__name__}")
                return

            message_text = event.message.text or ""
            if not message_text.strip():
                log.debug(f"Mensagem vazia ignorada | from={sender.id}")
                return

            log.info(
                f"📩 MENSAGEM RECEBIDA | "
                f"from={sender.first_name} (@{sender.username}) | "
                f"tg_id={sender.id} | "
                f"len={len(message_text)} | "
                f"preview=\"{message_text[:80]}{'...' if len(message_text) > 80 else ''}\""
            )

            # 1. Salvar contato
            contact_id = save_contact(tenant_id, sender)
            if not contact_id:
                log.error(f"Falha ao salvar contato para tg_id={sender.id}")
                return

            # 2. Salvar mensagem recebida
            save_message(tenant_id, contact_id, "incoming", message_text)

            # 3. Buscar histórico da conversa para contexto
            history = get_conversation_history(tenant_id, contact_id, limit=10)
            log.debug(f"Histórico carregado | msgs={len(history)} | contact={contact_id}")

            # 4. Gerar resposta
            response = generate_response(message_text, sender, ai_profile, history)

            if response:
                # 5. Delay natural (anti-detecção)
                import random
                delay = random.uniform(1.0, 3.0)
                log.debug(f"Delay antes de responder: {delay:.1f}s")
                await asyncio.sleep(delay)

                # 6. Enviar resposta
                await event.respond(response)

                elapsed = (time.perf_counter() - msg_start) * 1000
                log.info(
                    f"📤 RESPOSTA ENVIADA | "
                    f"to={sender.first_name} (@{sender.username}) | "
                    f"len={len(response)} | "
                    f"elapsed={elapsed:.0f}ms | "
                    f"preview=\"{response[:80]}{'...' if len(response) > 80 else ''}\""
                )

                # 7. Salvar resposta
                save_message(tenant_id, contact_id, "outgoing", response, "ai")
            else:
                log.debug(f"Sem resposta gerada para mensagem de {sender.first_name}")

        except Exception as e:
            log.error(f"Erro ao processar mensagem | {type(e).__name__}: {e}", exc_info=True)

    me = await client.get_me()
    log.info(
        f"✓ Watch mode ATIVO! | "
        f"logado_como={me.first_name} (@{me.username}) | "
        f"user_id={me.id} | "
        f"session={session_id[:8]}..."
    )


def generate_response(message: str, sender, ai_profile: dict | None, history: list[dict] = None) -> str | None:
    """Gera resposta para uma mensagem recebida.

    TODO: Integrar com API de LLM (Anthropic/OpenAI) usando o system_prompt do ai_profile.
    Por enquanto, respostas baseadas em regras simples.
    """
    if not ai_profile:
        log.debug("Sem perfil IA — retornando None")
        return None

    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    tone = ai_profile.get("tone", "informal")

    msg_lower = message.lower().strip()

    # Saudações
    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi", "eae", "e aí"]
    if any(g in msg_lower for g in greetings):
        if welcome:
            log.debug(f"Resposta: welcome_message | trigger=greeting")
            return welcome
        log.debug(f"Resposta: greeting padrão")
        return f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    # Despedidas
    goodbyes = ["tchau", "bye", "até", "valeu", "obrigado", "obrigada", "flw", "falou"]
    if any(g in msg_lower for g in goodbyes):
        log.debug(f"Resposta: despedida")
        return f"Obrigado pelo contato, {sender.first_name}! Qualquer coisa é só chamar. 😊"

    # Resposta genérica
    log.debug(f"Resposta: genérica")
    return (
        f"Obrigado pela mensagem, {sender.first_name}! "
        f"Recebi sua mensagem e vou analisar. "
        f"Em breve retorno com uma resposta. 😊"
    )


# ─── Envio manual ───


async def send_message(session_id: str, user_id: int, text: str) -> bool:
    """Envia mensagem manualmente para um usuário."""
    client = active_clients.get(session_id)
    if not client:
        log.error(f"Client não ativo para envio manual | session={session_id[:8]}...")
        return False

    try:
        await client.send_message(user_id, text)
        log.info(f"📤 Envio manual OK | session={session_id[:8]}... | to={user_id} | len={len(text)}")
        return True
    except Exception as e:
        log.error(f"Erro no envio manual | {type(e).__name__}: {e}")
        return False


# ─── Restauração de sessões ───


async def restore_active_sessions():
    """Restaura sessões ativas usando session_string do banco."""
    log_separator(log, "RESTAURANDO SESSÕES ATIVAS")

    sessions = get_active_sessions()
    log.info(f"Total de sessões para restaurar: {len(sessions)}")

    restored = 0
    failed = 0

    for sess in sessions:
        session_id = sess["id"]
        tenant_id = sess["tenant_id"]

        try:
            session_string = sess.get("session_string")
            if not session_string:
                log.warning(f"Sessão {session_id[:8]}... sem session_string — marcando como desconectada")
                update_session_status(session_id, "disconnected")
                failed += 1
                continue

            log.info(f"Restaurando {session_id[:8]}... | ss_len={len(session_string)}")

            client = create_client(sess["api_id"], sess["api_hash_encrypted"], session_string)
            await client.connect()

            if await client.is_user_authorized():
                me = await client.get_me()
                active_clients[session_id] = client
                client_metadata[session_id] = {
                    "tenant_id": tenant_id,
                    "phone": sess.get("phone"),
                    "api_id": sess["api_id"],
                    "user_id": me.id,
                    "username": me.username,
                    "connected_at": time.time(),
                    "restored": True,
                }

                await register_message_handler(client, session_id, tenant_id)
                asyncio.create_task(periodic_session_saver(session_id, client))

                # Re-salvar session string (pode ter rotacionado)
                await save_client_session(session_id, client)

                log.info(
                    f"✓ Restaurada | session={session_id[:8]}... | "
                    f"user={me.first_name} (@{me.username})"
                )
                restored += 1
            else:
                log.warning(f"Sessão {session_id[:8]}... não autorizada — marcando como desconectada")
                update_session_status(session_id, "disconnected")
                failed += 1

        except AuthKeyUnregisteredError:
            log.warning(f"Auth key revogada | session={session_id[:8]}... — limpando session_string")
            update_session_status(session_id, "disconnected")
            save_session_string(session_id, "")  # Limpar string inválida
            failed += 1

        except Exception as e:
            log.error(f"Erro ao restaurar {session_id[:8]}... | {type(e).__name__}: {e}", exc_info=True)
            update_session_status(session_id, "error", str(e))
            failed += 1

    log.info(f"Restauração concluída | sucesso={restored} | falhas={failed} | total={len(sessions)}")


# ─── Desconexão ───


async def disconnect_session(session_id: str):
    """Desconecta uma sessão ativa."""
    log.info(f"Desconectando sessão {session_id[:8]}...")

    client = active_clients.pop(session_id, None)
    client_metadata.pop(session_id, None)

    if client:
        try:
            # Salvar session string antes de desconectar
            await save_client_session(session_id, client)
            await client.disconnect()
            log.info(f"✓ Sessão {session_id[:8]}... desconectada (session_string preservada)")
        except Exception as e:
            log.warning(f"Erro ao desconectar {session_id[:8]}...: {e}")
    else:
        log.debug(f"Sessão {session_id[:8]}... não estava em memória")

    update_session_status(session_id, "disconnected")


# ─── Diagnóstico ───


def get_active_sessions_info() -> list[dict]:
    """Retorna info das sessões ativas em memória (para debug/API)."""
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
