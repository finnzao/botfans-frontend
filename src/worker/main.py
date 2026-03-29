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

QUEUE_NAME = "queue:telegram:tasks"
PUBSUB_CHANNELS = [
    "telegram:start_session",
    "telegram:init",
    "telegram:verify",
]


async def get_redis():
    return aioredis.from_url(REDIS_URL, decode_responses=True)


async def update_flow_status(flow_id: str, status: str, extra: dict = None):
    try:
        r = await get_redis()
        key = f"flow:{flow_id}"
        data = await r.get(key)
        if data:
            flow = json.loads(data)
            old_step = flow.get("step", "?")
            flow["step"] = status
            if extra:
                flow.update(extra)
            ttl = await r.ttl(key)
            if ttl > 0:
                await r.setex(key, ttl, json.dumps(flow))
                log.info(f"Flow {flow_id[:8]}... transição: {old_step} → {status}")
        else:
            log.warning(f"Flow {flow_id[:8]}... não encontrado (expirado?)")
        await r.aclose()
    except Exception as e:
        log.error(f"Erro ao atualizar flow: {e}")


async def dispatch_task(data: dict):
    channel = data.pop("_channel", "telegram:start_session")
    data.pop("_publishedAt", None)

    if channel == "telegram:start_session":
        await handle_start_session(data)
    elif channel == "telegram:init":
        await handle_init(data)
    elif channel == "telegram:verify":
        await handle_verify(data)
    else:
        log.warning(f"Canal desconhecido: {channel}")


async def handle_start_session(data: dict):
    action = data.get("action")
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data["phone"]
    api_id = data["apiId"]
    api_hash = data["apiHash"]
    flow_id = data.get("flowId")

    log.info(
        f"Processando start_session | action={action or 'start'} | "
        f"session={session_id[:8]}... | flowId={flow_id[:8] + '...' if flow_id else 'N/A'}"
    )

    if action == "verify_code":
        code = data.get("code")
        if not code:
            log.error("verify_code sem código")
            return
        result = await verify_code(session_id, tenant_id, phone, code, api_id, api_hash)
        log.info(f"verify_code resultado: {result}")
        if flow_id:
            await update_flow_status(flow_id, result.get("status", "error"))

    elif action == "verify_2fa":
        password = data.get("password2fa")
        if not password:
            log.error("verify_2fa sem senha")
            return
        result = await verify_2fa(session_id, tenant_id, password)
        log.info(f"verify_2fa resultado: {result}")
        if flow_id:
            await update_flow_status(flow_id, result.get("status", "error"))

    else:
        result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
        log.info(f"start_session resultado: {result}")

        if flow_id:
            new_status = result.get("status", "error")
            if new_status == "error":
                await update_flow_status(flow_id, "error", {
                    "errorMessage": result.get("error", "Erro ao iniciar sessão")
                })
            else:
                await update_flow_status(flow_id, new_status)


async def handle_init(data: dict):
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data["phone"]
    api_id = data["apiId"]
    api_hash = data["apiHash"]

    log.info(f"Processando init | session={session_id[:8]}...")
    result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
    log.info(f"init resultado: {result}")


async def handle_verify(data: dict):
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    code = data["code"]
    password_2fa = data.get("password2fa")

    log.info(f"Processando verify | session={session_id[:8]}...")

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


async def process_pending_tasks():
    """Processa tasks que ficaram na fila enquanto o worker estava offline."""
    try:
        r = await get_redis()
        count = await r.llen(QUEUE_NAME)
        if count == 0:
            log.info("Nenhuma task pendente na fila")
            await r.aclose()
            return

        log.info(f"Processando {count} tasks pendentes da fila...")

        for i in range(count):
            raw = await r.rpop(QUEUE_NAME)
            if not raw:
                break
            try:
                data = json.loads(raw)
                log.info(f"Task pendente [{i+1}/{count}]: {data.get('_channel', '?')}")
                await dispatch_task(data)
            except json.JSONDecodeError:
                log.error(f"JSON inválido na fila: {raw[:100]}")
            except Exception as e:
                log.error(f"Erro ao processar task pendente: {e}")

        await r.aclose()
        log.info(f"✓ {count} tasks pendentes processadas")
    except Exception as e:
        log.error(f"Erro ao processar fila pendente: {e}")


async def queue_consumer():
    """Consome tasks da fila Redis (BRPOP) — garante entrega mesmo se PubSub falhar."""
    log.info("Iniciando consumer de fila (BRPOP)...")
    r = await get_redis()

    while True:
        try:
            result = await r.brpop(QUEUE_NAME, timeout=5)
            if result is None:
                continue

            _, raw = result
            try:
                data = json.loads(raw)
                await dispatch_task(data)
            except json.JSONDecodeError:
                log.error(f"JSON inválido na fila: {raw[:100]}")
        except aioredis.ConnectionError as e:
            log.error(f"Redis desconectou no consumer: {e}")
            await asyncio.sleep(3)
            try:
                r = await get_redis()
            except Exception:
                pass
        except Exception as e:
            log.error(f"Erro no consumer: {e}")
            await asyncio.sleep(1)


async def main():
    log.info("=" * 60)
    log.info("  BotFans Telegram Worker iniciando...")
    log.info("=" * 60)

    # 1. Restaurar sessões ativas do banco
    await restore_active_sessions()

    # 2. Processar tasks que ficaram na fila enquanto offline
    await process_pending_tasks()

    # 3. Consumir fila continuamente
    log.info("Aguardando tasks...")
    await queue_consumer()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Worker encerrado pelo usuário")
        sys.exit(0)
