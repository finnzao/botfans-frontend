import os
import sys
import json
import asyncio
import signal
import time
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

from logger import get_logger, log_separator
from session_manager import (
    start_session,
    start_session_with_existing_credentials,
    verify_code,
    verify_2fa,
    restore_active_sessions,
    disconnect_session,
    reconnect_session,
    auto_reconnect_loop,
    active_clients,
    get_active_sessions_info,
    is_session_restoring,
)

log = get_logger("worker")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = "queue:telegram:tasks"

_shutdown_event = asyncio.Event()
_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            max_connections=10,
            retry_on_timeout=True,
        )
    return _redis_pool


async def close_redis():
    global _redis_pool
    if _redis_pool:
        await _redis_pool.aclose()
        _redis_pool = None


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
            flow["_updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            ttl = await r.ttl(key)
            if ttl > 0:
                await r.setex(key, ttl, json.dumps(flow))
                log.info(f"Flow atualizado | {flow_id[:8]}... | {old_step} -> {status} | TTL={ttl}s")
            else:
                await r.setex(key, 1800, json.dumps(flow))
        else:
            log.warning(f"Flow {flow_id[:8]}... não encontrado no Redis")
    except Exception as e:
        log.error(f"Erro ao atualizar flow | {flow_id[:8]}... | {e}")


async def dispatch_task(data: dict):
    channel = data.pop("_channel", "telegram:start_session")
    data.pop("_publishedAt", None)

    session_id = data.get("sessionId", "?")

    if is_session_restoring(session_id):
        log.info(f"Sessão {session_id[:8]}... restaurando — aguardando...")
        for _ in range(60):
            await asyncio.sleep(1)
            if not is_session_restoring(session_id):
                break

    log.info(f"Dispatch | channel={channel} | session={session_id[:8]}...")

    try:
        if channel == "telegram:start_session":
            await handle_start_session(data)
        elif channel == "telegram:init":
            await handle_init(data)
        elif channel == "telegram:verify":
            await handle_verify(data)
        elif channel == "telegram:broadcast":
            await handle_broadcast(data)
        else:
            log.warning(f"Canal desconhecido: {channel}")
    except Exception as e:
        log.error(f"Erro no dispatch | channel={channel} | {type(e).__name__}: {e}", exc_info=True)
        flow_id = data.get("flowId")
        if flow_id:
            await update_flow_status(flow_id, "error", {
                "errorMessage": f"Erro interno: {type(e).__name__}"
            })


async def handle_broadcast(data: dict):
    from broadcast_sender import start_broadcast, pause_broadcast, cancel_broadcast

    action = data.get("action")
    job_id = data.get("jobId")
    tenant_id = data.get("tenantId")
    session_id = data.get("sessionId")

    if action == "start" and job_id and tenant_id and session_id:
        asyncio.create_task(_safe_broadcast(job_id, tenant_id, session_id))
    elif action == "pause" and job_id:
        pause_broadcast(job_id)
    elif action == "cancel" and job_id and tenant_id:
        cancel_broadcast(job_id, tenant_id)


async def _safe_broadcast(job_id: str, tenant_id: str, session_id: str):
    from broadcast_sender import start_broadcast
    try:
        await start_broadcast(job_id, tenant_id, session_id)
    except Exception as e:
        log.error(f"Broadcast falhou | job={job_id[:8]}... | {type(e).__name__}: {e}", exc_info=True)
        from database_tags import update_broadcast_status
        update_broadcast_status(job_id, "failed")


async def handle_start_session(data: dict):
    action = data.get("action")
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data.get("phone", "")
    api_id = data.get("apiId")
    api_hash = data.get("apiHash")
    flow_id = data.get("flowId")

    log_separator(log, f"HANDLE START_SESSION | action={action or 'start'}")
    log.info(
        f"session={session_id[:8]}... | tenant={tenant_id[:8]}... | "
        f"phone={'***' if phone else 'N/A'} | flowId={flow_id[:8] + '...' if flow_id else 'N/A'}"
    )

    start_time = time.perf_counter()

    try:
        if action == "verify_code":
            code = data.get("code")
            if not code:
                if flow_id:
                    await update_flow_status(flow_id, "error", {"errorMessage": "Código não informado"})
                return
            result = await verify_code(session_id, tenant_id, phone, code, api_id, api_hash)

        elif action == "verify_2fa":
            password = data.get("password2fa")
            if not password:
                if flow_id:
                    await update_flow_status(flow_id, "error", {"errorMessage": "Senha não informada"})
                return
            result = await verify_2fa(session_id, tenant_id, password)

        elif action == "reconnect":
            from database import update_session_status
            update_session_status(session_id, "reconnecting")
            success = await reconnect_session(session_id)
            if success:
                result = {"status": "active"}
            else:
                result = {"status": "error", "error": "Falha na reconexão após múltiplas tentativas."}

        elif action == "start_with_credentials":
            result = await start_session_with_existing_credentials(session_id, tenant_id, phone)

        else:
            if not api_id or not api_hash:
                if flow_id:
                    await update_flow_status(flow_id, "error", {"errorMessage": "Credenciais ausentes"})
                return
            result = await start_session(session_id, tenant_id, phone, api_id, api_hash)

        elapsed = (time.perf_counter() - start_time) * 1000
        log.info(f"Resultado: {result} | elapsed={elapsed:.0f}ms")

        if flow_id:
            new_status = result.get("status", "error")
            if new_status == "error":
                await update_flow_status(flow_id, "error", {
                    "errorMessage": result.get("error", "Erro ao processar sessão")
                })
            else:
                await update_flow_status(flow_id, new_status)

    except Exception as e:
        elapsed = (time.perf_counter() - start_time) * 1000
        log.error(f"Exceção | {type(e).__name__}: {e} | elapsed={elapsed:.0f}ms")
        if flow_id:
            await update_flow_status(flow_id, "error", {
                "errorMessage": f"Erro interno: {str(e)}"
            })


async def handle_init(data: dict):
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    phone = data["phone"]
    api_id = data["apiId"]
    api_hash = data["apiHash"]

    result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
    log.info(f"init resultado: {result}")


async def handle_verify(data: dict):
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    code = data.get("code")
    password_2fa = data.get("password2fa")

    from database import get_session_credentials
    creds = get_session_credentials(session_id)
    if not creds:
        log.error(f"Credenciais não encontradas | {session_id[:8]}...")
        return

    if password_2fa:
        result = await verify_2fa(session_id, tenant_id, password_2fa)
    elif code:
        result = await verify_code(
            session_id, tenant_id, creds["phone"], code,
            creds["api_id"], creds["api_hash_encrypted"]
        )
    else:
        return

    log.info(f"verify resultado: {result}")


async def process_pending_tasks():
    try:
        r = await get_redis()
        count = await r.llen(QUEUE_NAME)
        if count == 0:
            return

        log.info(f"Tasks pendentes: {count}")
        for i in range(count):
            raw = await r.rpop(QUEUE_NAME)
            if not raw:
                break
            try:
                data = json.loads(raw)
                await dispatch_task(data)
            except Exception as e:
                log.error(f"Erro task pendente: {type(e).__name__}: {e}")
    except Exception as e:
        log.error(f"Erro fila: {e}")


async def queue_consumer():
    log.info("Consumer iniciado (BRPOP)...")
    r = await get_redis()
    consecutive_errors = 0

    while not _shutdown_event.is_set():
        try:
            result = await r.brpop(QUEUE_NAME, timeout=5)
            if result is None:
                consecutive_errors = 0
                continue

            _, raw = result
            consecutive_errors = 0

            try:
                data = json.loads(raw)
                asyncio.create_task(_safe_dispatch(data))
            except json.JSONDecodeError:
                log.error(f"JSON inválido: {raw[:100]}")

        except aioredis.ConnectionError as e:
            consecutive_errors += 1
            wait = min(3 * consecutive_errors, 30)
            log.error(f"Redis desconectou | retry em {wait}s")
            await asyncio.sleep(wait)
            try:
                r = await get_redis()
            except Exception:
                pass

        except asyncio.CancelledError:
            break

        except Exception as e:
            consecutive_errors += 1
            log.error(f"Erro consumer | {type(e).__name__}: {e}")
            await asyncio.sleep(1)


async def _safe_dispatch(data: dict):
    try:
        await dispatch_task(data)
    except Exception as e:
        log.error(f"Dispatch error | {type(e).__name__}: {e}", exc_info=True)


async def diagnostics_logger():
    while not _shutdown_event.is_set():
        await asyncio.sleep(300)
        sessions = get_active_sessions_info()
        log.info(f"DIAGNOSTICO | sessões ativas: {len(sessions)}")
        for s in sessions:
            log.info(
                f"  -> {s['session_id']} | @{s.get('username', '?')} | "
                f"uptime={s['uptime_seconds']}s | connected={s['is_connected']}"
            )


async def graceful_shutdown():
    log_separator(log, "SHUTDOWN")
    for session_id in list(active_clients.keys()):
        try:
            await disconnect_session(session_id)
        except Exception as e:
            log.error(f"Erro disconnect {session_id[:8]}...: {e}")
    await close_redis()


async def main():
    log_separator(log, "BotFans Telegram Worker")
    log.info(f"PID: {os.getpid()} | Platform: {sys.platform}")

    if sys.platform != "win32":
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: _shutdown_event.set())

    from database import run_migrations_on_startup
    try:
        run_migrations_on_startup()
    except RuntimeError as e:
        log.error(f"Abortando: {e}")
        sys.exit(1)

    consumer_task = asyncio.create_task(queue_consumer())
    await process_pending_tasks()
    restore_task = asyncio.create_task(_safe_restore())

    tasks = [
        consumer_task,
        restore_task,
        asyncio.create_task(diagnostics_logger()),
        asyncio.create_task(auto_reconnect_loop()),
    ]

    try:
        await _shutdown_event.wait()
    except asyncio.CancelledError:
        pass

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await graceful_shutdown()


async def _safe_restore():
    try:
        await restore_active_sessions()
    except Exception as e:
        log.error(f"Restore error | {type(e).__name__}: {e}", exc_info=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
