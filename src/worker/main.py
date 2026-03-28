"""
BotFans Telegram Worker

Escuta mensagens do Redis publicadas pelo frontend (Next.js)
e gerencia sessões Telethon para cada tenant.

Canais Redis:
  - telegram:start_session → Inicia sessão ou verifica código
  - telegram:init          → Fluxo antigo (com credenciais manuais)
  - telegram:verify        → Fluxo antigo (verificar código)

Uso:
  python main.py
"""

import os
import sys
import json
import asyncio
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

from logger import get_logger
from session_manager import (
    start_session,
    verify_code,
    verify_2fa,
    restore_active_sessions,
)

log = get_logger("worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Canais que o worker escuta
CHANNELS = [
    "telegram:start_session",
    "telegram:init",
    "telegram:verify",
]


async def handle_start_session(data: dict):
    """
    Trata mensagens do canal telegram:start_session.
    
    Pode conter 'action' para diferenciar:
      - sem action     → iniciar sessão (enviar código Telethon)
      - verify_code    → verificar código da sessão
      - verify_2fa     → verificar senha 2FA
    """
    action = data.get("action")
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data["phone"]
    api_id = data["apiId"]
    api_hash = data["apiHash"]

    log.info(
        f"Recebido start_session | action={action or 'start'} | "
        f"session={session_id[:8]}... | phone={phone[:6]}***"
    )

    if action == "verify_code":
        code = data.get("code")
        if not code:
            log.error("verify_code sem código")
            return
        result = await verify_code(session_id, tenant_id, phone, code, api_id, api_hash)
        log.info(f"verify_code resultado: {result}")

        # Atualizar flow no Redis se necessário
        flow_id = data.get("flowId")
        if flow_id and result.get("status") == "awaiting_2fa":
            await update_flow_status(flow_id, "awaiting_2fa")

    elif action == "verify_2fa":
        password = data.get("password2fa")
        if not password:
            log.error("verify_2fa sem senha")
            return
        result = await verify_2fa(session_id, tenant_id, password)
        log.info(f"verify_2fa resultado: {result}")

    else:
        # Iniciar sessão (enviar código)
        result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
        log.info(f"start_session resultado: {result}")


async def handle_init(data: dict):
    """Trata mensagens do canal telegram:init (fluxo antigo)."""
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data["phone"]
    api_id = data["apiId"]
    api_hash = data["apiHash"]

    log.info(f"Recebido init | session={session_id[:8]}...")
    result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
    log.info(f"init resultado: {result}")


async def handle_verify(data: dict):
    """Trata mensagens do canal telegram:verify (fluxo antigo)."""
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    code = data["code"]
    password_2fa = data.get("password2fa")

    log.info(f"Recebido verify | session={session_id[:8]}...")

    # Precisamos das credenciais do banco
    from database import get_session_credentials
    creds = get_session_credentials(session_id)
    if not creds:
        log.error(f"Credenciais não encontradas para {session_id}")
        return

    if password_2fa:
        result = await verify_2fa(session_id, tenant_id, password_2fa)
    else:
        result = await verify_code(
            session_id, tenant_id, creds["phone"], code,
            creds["api_id"], creds["api_hash_encrypted"]
        )
    log.info(f"verify resultado: {result}")


async def update_flow_status(flow_id: str, status: str):
    """Atualiza o status no flow do Redis."""
    try:
        r = aioredis.from_url(REDIS_URL)
        key = f"flow:{flow_id}"
        data = await r.get(key)
        if data:
            flow = json.loads(data)
            flow["step"] = status
            ttl = await r.ttl(key)
            if ttl > 0:
                await r.setex(key, ttl, json.dumps(flow))
                log.info(f"Flow {flow_id[:8]}... atualizado para {status}")
        await r.aclose()
    except Exception as e:
        log.error(f"Erro ao atualizar flow: {e}")


async def subscriber():
    """Loop principal: escuta os canais Redis e despacha para handlers."""
    log.info(f"Conectando ao Redis: {REDIS_URL}")

    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()

    await pubsub.subscribe(*CHANNELS)
    log.info(f"✓ Inscrito nos canais: {', '.join(CHANNELS)}")

    handler_map = {
        "telegram:start_session": handle_start_session,
        "telegram:init": handle_init,
        "telegram:verify": handle_verify,
    }

    async for message in pubsub.listen():
        if message["type"] != "message":
            continue

        channel = message["channel"]
        try:
            data = json.loads(message["data"])
        except json.JSONDecodeError:
            log.error(f"JSON inválido no canal {channel}: {message['data'][:100]}")
            continue

        handler = handler_map.get(channel)
        if handler:
            # Executa em background para não bloquear o subscriber
            asyncio.create_task(safe_handle(handler, data, channel))
        else:
            log.warning(f"Canal sem handler: {channel}")


async def safe_handle(handler, data: dict, channel: str):
    """Wrapper que captura exceções de handlers."""
    try:
        await handler(data)
    except Exception as e:
        log.error(f"Exceção no handler de {channel}: {e}", exc_info=True)


async def main():
    log.info("=" * 60)
    log.info("  BotFans Telegram Worker iniciando...")
    log.info("=" * 60)

    # 1. Restaurar sessões que estavam ativas
    await restore_active_sessions()

    # 2. Escutar Redis
    log.info("Iniciando subscriber Redis...")
    await subscriber()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Worker encerrado pelo usuário")
        sys.exit(0)
