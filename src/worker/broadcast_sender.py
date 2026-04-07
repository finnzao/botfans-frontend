"""
Broadcast sender — envia mensagens em massa com rate limiting.

Rate limiting:
- Respeita rate_limit_per_minute configurado no job (default: 20/min)
- Delay mínimo entre mensagens: 2 segundos
- Se receber FloodWaitError do Telegram, pausa pelo tempo solicitado
- Máximo recomendado pelo Telegram: ~30 msgs/min para evitar ban

Anti-flood:
- Telegram bane contas que enviam muitas mensagens rapidamente
- O rate limit padrão de 20/min é conservador e seguro
- Jobs podem ser pausados e retomados

Lifecycle do job:
  draft → sending → completed
  draft → sending → paused → sending → completed
  draft → sending → failed
  draft → cancelled
"""

import asyncio
import time
from telethon.errors import FloodWaitError, UserIsBlockedError, InputUserDeactivatedError
from logger import get_logger
from database_tags import (
    get_broadcast_job,
    update_broadcast_status,
    populate_broadcast_recipients,
    get_pending_broadcast_messages,
    update_broadcast_message_status,
    get_broadcast_stats,
)
from database import save_message

log = get_logger("broadcast_sender")

# Jobs ativos (para poder pausar/cancelar)
_active_jobs: dict[str, bool] = {}  # job_id -> running


async def start_broadcast(job_id: str, tenant_id: str, session_id: str):
    """
    Inicia ou retoma um broadcast job.
    Deve ser chamado como task assíncrona.
    """
    from session_manager import active_clients

    client = active_clients.get(session_id)
    if not client or not client.is_connected():
        log.error(f"Broadcast abortado: sessão não conectada | job={job_id[:8]}...")
        update_broadcast_status(job_id, "failed")
        return

    job = get_broadcast_job(job_id, tenant_id)
    if not job:
        log.error(f"Broadcast job não encontrado: {job_id}")
        return

    if job["status"] == "draft":
        # Primeira execução: popular recipients
        count = populate_broadcast_recipients(job_id, tenant_id, job)
        if count == 0:
            log.warning(f"Broadcast sem recipients | job={job_id[:8]}...")
            update_broadcast_status(job_id, "completed", total_contacts=0, sent_count=0)
            return
        update_broadcast_status(job_id, "sending", total_contacts=count)
    elif job["status"] == "paused":
        update_broadcast_status(job_id, "sending")
    elif job["status"] == "sending":
        pass  # Retomando
    else:
        log.warning(f"Broadcast em status inesperado: {job['status']} | job={job_id[:8]}...")
        return

    _active_jobs[job_id] = True

    rate_limit = min(job.get("rate_limit_per_minute", 20), 30)  # cap em 30
    delay_between = max(60.0 / rate_limit, 2.0)  # mínimo 2s entre mensagens
    message_text = job["message_text"]

    log.info(
        f"Broadcast iniciado | job={job_id[:8]}... | "
        f"rate={rate_limit}/min | delay={delay_between:.1f}s"
    )

    sent = 0
    failed = 0

    try:
        while _active_jobs.get(job_id, False):
            batch = get_pending_broadcast_messages(job_id, limit=10)
            if not batch:
                break  # Tudo enviado

            for msg in batch:
                if not _active_jobs.get(job_id, False):
                    log.info(f"Broadcast pausado/cancelado | job={job_id[:8]}...")
                    break

                tg_user_id = msg["telegram_user_id"]
                contact_name = msg.get("first_name") or msg.get("telegram_username") or "?"

                try:
                    await client.send_message(tg_user_id, message_text)
                    update_broadcast_message_status(msg["id"], "sent")
                    sent += 1

                    # Salvar como mensagem outgoing no histórico
                    save_message(
                        tenant_id, msg["contact_id"], "outgoing",
                        message_text, "ai", None,
                    )

                    log.debug(f"Broadcast sent | to={contact_name} | tg_id={tg_user_id}")

                except FloodWaitError as e:
                    wait = e.seconds + 5  # margem extra
                    log.warning(
                        f"FloodWait! Pausando {wait}s | job={job_id[:8]}... | "
                        f"sent={sent} | failed={failed}"
                    )
                    await asyncio.sleep(wait)
                    # Retry esta mensagem
                    try:
                        await client.send_message(tg_user_id, message_text)
                        update_broadcast_message_status(msg["id"], "sent")
                        sent += 1
                    except Exception as retry_err:
                        update_broadcast_message_status(
                            msg["id"], "failed", str(retry_err)
                        )
                        failed += 1

                except UserIsBlockedError:
                    update_broadcast_message_status(msg["id"], "skipped", "Usuário bloqueou o bot")
                    log.debug(f"Skipped (blocked) | {contact_name}")

                except InputUserDeactivatedError:
                    update_broadcast_message_status(msg["id"], "skipped", "Conta desativada")
                    log.debug(f"Skipped (deactivated) | {contact_name}")

                except Exception as e:
                    update_broadcast_message_status(msg["id"], "failed", str(e))
                    failed += 1
                    log.warning(f"Broadcast send failed | {contact_name} | {type(e).__name__}: {e}")

                # Rate limiting delay
                await asyncio.sleep(delay_between)

            # Atualizar progresso periodicamente
            update_broadcast_status(job_id, "sending", sent_count=sent, failed_count=failed)

    except Exception as e:
        log.error(f"Broadcast erro fatal | job={job_id[:8]}... | {type(e).__name__}: {e}")
        update_broadcast_status(job_id, "failed", sent_count=sent, failed_count=failed)
        return
    finally:
        _active_jobs.pop(job_id, None)

    # Verificar se foi pausado ou completou
    if not _active_jobs.get(job_id, False):
        stats = get_broadcast_stats(job_id)
        if stats["pending"] > 0:
            update_broadcast_status(job_id, "paused", sent_count=sent, failed_count=failed)
            log.info(f"Broadcast pausado | job={job_id[:8]}... | sent={sent} | remaining={stats['pending']}")
        else:
            update_broadcast_status(job_id, "completed", sent_count=sent, failed_count=failed)
            log.info(f"Broadcast concluído | job={job_id[:8]}... | sent={sent} | failed={failed}")
    else:
        update_broadcast_status(job_id, "completed", sent_count=sent, failed_count=failed)
        log.info(f"Broadcast concluído | job={job_id[:8]}... | sent={sent} | failed={failed}")


def pause_broadcast(job_id: str):
    """Pausa um broadcast em andamento."""
    if job_id in _active_jobs:
        _active_jobs[job_id] = False
        log.info(f"Broadcast marcado para pausa | job={job_id[:8]}...")


def cancel_broadcast(job_id: str, tenant_id: str):
    """Cancela um broadcast."""
    _active_jobs.pop(job_id, None)
    update_broadcast_status(job_id, "cancelled")
    log.info(f"Broadcast cancelado | job={job_id[:8]}...")


def is_broadcast_running(job_id: str) -> bool:
    """Verifica se um broadcast está rodando."""
    return _active_jobs.get(job_id, False)
