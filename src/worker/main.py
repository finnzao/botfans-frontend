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
PUBSUB_CHANNELS = [
    "telegram:start_session",
    "telegram:init",
    "telegram:verify",
    "telegram:broadcast",
]

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
                log.warning(f"Flow {flow_id[:8]}... sem TTL — recriado com 30min")
        else:
            log.warning(f"Flow {flow_id[:8]}... não encontrado no Redis (expirado?)")
    except Exception as e:
        log.error(f"Erro ao atualizar flow | {flow_id[:8]}... | {e}")


async def dispatch_task(data: dict):
    channel = data.pop("_channel", "telegram:start_session")
    published_at = data.pop("_publishedAt", None)

    latency_ms = 0
    if published_at:
        try:
            from datetime import datetime
            pub_time = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
            latency_ms = int((datetime.now(pub_time.tzinfo) - pub_time).total_seconds() * 1000)
        except Exception:
            pass

    session_id = data.get("sessionId", "?")

    if is_session_restoring(session_id):
        log.info(f"Sessão {session_id[:8]}... está sendo restaurada — aguardando...")
        for _ in range(60):
            await asyncio.sleep(1)
            if not is_session_restoring(session_id):
                break
        if is_session_restoring(session_id):
            log.warning(f"Sessão {session_id[:8]}... ainda restaurando após 60s — processando mesmo assim")

    log.info(
        f"Dispatch task | channel={channel} | "
        f"session={session_id[:8]}... | "
        f"latency={latency_ms}ms"
    )

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


# ═══════════════════════════════════════════════════════════
# BROADCAST HANDLER
# ═══════════════════════════════════════════════════════════

async def handle_broadcast(data: dict):
    """Processa comandos de broadcast (start, pause, cancel)."""
    from broadcast_sender import start_broadcast, pause_broadcast, cancel_broadcast

    action = data.get("action")
    job_id = data.get("jobId")
    tenant_id = data.get("tenantId")
    session_id = data.get("sessionId")

    log_separator(log, f"HANDLE BROADCAST | action={action}")
    log.info(f"job={job_id[:8] if job_id else '?'}... | tenant={tenant_id[:8] if tenant_id else '?'}...")

    if action == "start" and job_id and tenant_id and session_id:
        asyncio.create_task(_safe_broadcast(job_id, tenant_id, session_id))

    elif action == "pause" and job_id:
        pause_broadcast(job_id)

    elif action == "cancel" and job_id and tenant_id:
        cancel_broadcast(job_id, tenant_id)

    else:
        log.warning(f"Broadcast action inválida: {action}")


async def _safe_broadcast(job_id: str, tenant_id: str, session_id: str):
    """Wrapper seguro para broadcast — roda como task independente."""
    from broadcast_sender import start_broadcast
    try:
        await start_broadcast(job_id, tenant_id, session_id)
    except Exception as e:
        log.error(f"Broadcast falhou | job={job_id[:8]}... | {type(e).__name__}: {e}", exc_info=True)
        from database_tags import update_broadcast_status
        update_broadcast_status(job_id, "failed")


# ═══════════════════════════════════════════════════════════
# SESSION HANDLERS (unchanged)
# ═══════════════════════════════════════════════════════════

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
        f"phone={phone[:6] + '***' if phone else 'N/A'} | flowId={flow_id[:8] + '...' if flow_id else 'N/A'}"
    )

    start_time = time.perf_counter()

    try:
        if action == "verify_code":
            code = data.get("code")
            if not code:
                log.error("verify_code chamado sem código!")
                if flow_id:
                    await update_flow_status(flow_id, "error", {"errorMessage": "Código não informado"})
                return
            result = await verify_code(session_id, tenant_id, phone, code, api_id, api_hash)

        elif action == "verify_2fa":
            password = data.get("password2fa")
            if not password:
                log.error("verify_2fa chamado sem senha!")
                if flow_id:
                    await update_flow_status(flow_id, "error", {"errorMessage": "Senha não informada"})
                return
            result = await verify_2fa(session_id, tenant_id, password)

        elif action == "reconnect":
            success = await reconnect_session(session_id)
            if success:
                result = {"status": "active"}
            else:
                result = {"status": "error", "error": "Falha na reconexão após múltiplas tentativas."}

        else:
            if not api_id or not api_hash:
                log.error("start_session chamado sem api_id/api_hash!")
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
        log.error(f"Exceção no handle_start_session | {type(e).__name__}: {e} | elapsed={elapsed:.0f}ms")
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

    log_separator(log, f"HANDLE INIT | {session_id[:8]}...")
    result = await start_session(session_id, tenant_id, phone, api_id, api_hash)
    log.info(f"init resultado: {result}")


async def handle_verify(data: dict):
    session_id = data["sessionId"]
    tenant_id = data["tenantId"]
    code = data.get("code")
    password_2fa = data.get("password2fa")

    log_separator(log, f"HANDLE VERIFY | {session_id[:8]}...")

    from database import get_session_credentials
    creds = get_session_credentials(session_id)
    if not creds:
        log.error(f"Credenciais não encontradas para {session_id[:8]}...")
        return

    if password_2fa:
        result = await verify_2fa(session_id, tenant_id, password_2fa)
    elif code:
        result = await verify_code(
            session_id, tenant_id, creds["phone"], code,
            creds["api_id"], creds["api_hash_encrypted"]
        )
    else:
        log.error(f"handle_verify chamado sem code nem password2fa | session={session_id[:8]}...")
        return

    log.info(f"verify resultado: {result}")


# ═══════════════════════════════════════════════════════════
# QUEUE CONSUMER & LIFECYCLE
# ═══════════════════════════════════════════════════════════

async def process_pending_tasks():
    log_separator(log, "PROCESSANDO FILA PENDENTE")

    try:
        r = await get_redis()
        count = await r.llen(QUEUE_NAME)

        if count == 0:
            log.info("Fila vazia")
            return

        log.info(f"Tasks pendentes na fila: {count}")
        processed = 0
        errors = 0

        for i in range(count):
            raw = await r.rpop(QUEUE_NAME)
            if not raw:
                break

            try:
                data = json.loads(raw)
                channel = data.get("_channel", "?")
                log.info(f"Task pendente [{i + 1}/{count}] | channel={channel}")
                await dispatch_task(data)
                processed += 1
            except json.JSONDecodeError:
                log.error(f"JSON inválido na fila: {raw[:100]}")
                errors += 1
            except Exception as e:
                log.error(f"Erro ao processar task pendente: {type(e).__name__}: {e}")
                errors += 1

        log.info(f"Fila processada | sucesso={processed} | erros={errors}")

    except Exception as e:
        log.error(f"Erro ao processar fila pendente: {e}")


async def queue_consumer():
    log.info("Iniciando consumer de fila (BRPOP)...")
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
            log.error(f"Redis desconectou | tentativa={consecutive_errors} | retry em {wait}s | {e}")
            await asyncio.sleep(wait)
            try:
                r = await get_redis()
                log.info("Reconectado ao Redis")
            except Exception:
                pass

        except asyncio.CancelledError:
            log.info("Consumer cancelado (shutdown)")
            break

        except Exception as e:
            consecutive_errors += 1
            log.error(f"Erro no consumer | {type(e).__name__}: {e}")
            await asyncio.sleep(1)


async def _safe_dispatch(data: dict):
    try:
        await dispatch_task(data)
    except Exception as e:
        log.error(f"Erro não tratado no dispatch | {type(e).__name__}: {e}", exc_info=True)


async def diagnostics_logger():
    if os.getenv("NODE_ENV") == "production":
        return

    log.debug("Diagnostics logger ativo (intervalo: 5min)")
    while not _shutdown_event.is_set():
        await asyncio.sleep(300)

        sessions = get_active_sessions_info()
        log.info(f"DIAGNOSTICO | sessões ativas: {len(sessions)}")
        for s in sessions:
            log.info(
                f"  -> {s['session_id']} | @{s.get('username', '?')} | "
                f"uptime={s['uptime_seconds']}s | connected={s['is_connected']} | "
                f"restored={s['restored']}"
            )


async def graceful_shutdown():
    log_separator(log, "SHUTDOWN GRACEFUL")
    log.info(f"Desconectando {len(active_clients)} sessões...")

    for session_id in list(active_clients.keys()):
        try:
            await disconnect_session(session_id)
        except Exception as e:
            log.error(f"Erro ao desconectar {session_id[:8]}...: {e}")

    await close_redis()
    log.info("Todas as sessões desconectadas. Bye!")


async def main():
    log_separator(log, "BotFans Telegram Worker")
    log.info(f"PID: {os.getpid()}")
    log.info(f"Redis: {REDIS_URL}")
    log.info(f"Env: {os.getenv('NODE_ENV', 'development')}")
    log.info(f"Platform: {sys.platform}")

    if sys.platform != "win32":
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: _shutdown_event.set())
        log.info("Signal handlers registrados (SIGINT, SIGTERM)")

    from database import run_migrations_on_startup
    try:
        run_migrations_on_startup()
    except RuntimeError as e:
        log.error(f"Abortando: {e}")
        sys.exit(1)

    consumer_task = asyncio.create_task(queue_consumer())
    log.info("Consumer de fila iniciado (background)")

    await process_pending_tasks()

    restore_task = asyncio.create_task(_safe_restore())

    log_separator(log, "AGUARDANDO TASKS")
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
    log.info("Shutdown signal recebido...")

    for t in tasks:
        t.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    await graceful_shutdown()


async def _safe_restore():
    try:
        await restore_active_sessions()
    except Exception as e:
        log.error(f"Erro na restauração de sessões | {type(e).__name__}: {e}", exc_info=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Worker encerrado (Ctrl+C)")
        sys.exit(0)
