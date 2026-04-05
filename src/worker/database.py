import os
import time
import psycopg2
import psycopg2.extras
import psycopg2.pool
from contextlib import contextmanager
from logger import get_logger

log = get_logger("database")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://botfans:botfans_dev@localhost:5432/botfans")

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        log.info("Criando pool de conexões PostgreSQL...")
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1, maxconn=5, dsn=DATABASE_URL,
            )
            log.info("Pool criado com sucesso")
        except Exception as e:
            log.error(f"Falha ao criar pool: {e}")
            raise
    return _pool


def get_raw_connection():
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_connection():
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def run_migrations_on_startup():
    from db.migrate import run_migrations

    log.info("Verificando migrations pendentes...")
    conn = get_raw_connection()
    try:
        result = run_migrations(conn)
        executed = result.get("executed", [])
        errors = result.get("errors", [])

        if executed:
            log.info(f"{len(executed)} migration(s) executada(s)")
            for m in executed:
                log.info(f"  -> {m['name']} ({m['duration_ms']}ms)")

        if errors:
            log.error(f"{len(errors)} migration(s) falharam!")
            for m in errors:
                log.error(f"  -> {m['name']}: {m['error']}")
            raise RuntimeError(f"Migration falhou: {errors[0]['name']}")

        return result
    finally:
        conn.close()


def _timed_query(description: str):
    def decorator(func):
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                log.debug(f"{description} concluído em {elapsed:.1f}ms")
                return result
            except Exception as e:
                elapsed = (time.perf_counter() - start) * 1000
                log.error(f"{description} falhou após {elapsed:.1f}ms: {e}")
                raise
        return wrapper
    return decorator


@_timed_query("get_session_credentials")
def get_session_credentials(session_id: str) -> dict | None:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, tenant_id, phone, api_id, api_hash_encrypted, status, session_string "
            "FROM telegram_sessions WHERE id = %s", (session_id,),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        result = dict(row)
        has_ss = bool(result.get("session_string"))
        ss_len = len(result["session_string"]) if has_ss else 0
        log.info(f"Credenciais carregadas | session={session_id[:8]}... | status={result['status']} | has_session_string={has_ss} ({ss_len} chars)")
        return result
    log.warning(f"Sessão {session_id[:8]}... não encontrada no banco")
    return None


@_timed_query("update_session_status")
def update_session_status(session_id: str, status: str, error_message: str = None):
    with get_connection() as conn:
        cur = conn.cursor()
        if error_message:
            cur.execute(
                "UPDATE telegram_sessions SET status=%s, error_message=%s, updated_at=NOW() WHERE id=%s",
                (status, error_message, session_id),
            )
        else:
            cur.execute(
                "UPDATE telegram_sessions SET status=%s, updated_at=NOW() WHERE id=%s",
                (status, session_id),
            )
        affected = cur.rowcount
        cur.close()
    if affected > 0:
        log.info(f"Sessão {session_id[:8]}... -> {status}" + (f" (erro: {error_message})" if error_message else ""))
    else:
        log.warning(f"update_session_status: nenhuma row afetada para {session_id[:8]}...")


@_timed_query("save_session_string")
def save_session_string(session_id: str, session_string: str):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE telegram_sessions SET session_string=%s, updated_at=NOW() WHERE id=%s",
            (session_string, session_id),
        )
        cur.close()
    log.info(f"Session string salva | session={session_id[:8]}... | len={len(session_string)} chars")


@_timed_query("get_active_sessions")
def get_active_sessions() -> list[dict]:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, tenant_id, phone, api_id, api_hash_encrypted, session_string "
            "FROM telegram_sessions WHERE status IN ('active', 'reconnecting') "
            "AND session_string IS NOT NULL AND length(session_string) > 10"
        )
        sessions = cur.fetchall()
        cur.close()
    result = [dict(s) for s in sessions]
    log.info(f"Sessões ativas encontradas: {len(result)}")
    return result


@_timed_query("save_contact")
def save_contact(tenant_id: str, user) -> str | None:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO contacts (tenant_id, telegram_user_id, telegram_username, first_name, last_name, is_new, last_contact_at)
            VALUES (%s, %s, %s, %s, %s, true, NOW())
            ON CONFLICT (tenant_id, telegram_user_id)
            DO UPDATE SET
                telegram_username = EXCLUDED.telegram_username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                last_contact_at = NOW(),
                is_new = CASE WHEN contacts.first_contact_at > NOW() - INTERVAL '5 minutes' THEN true ELSE false END
            RETURNING id, is_new
            """,
            (tenant_id, user.id, user.username, user.first_name, user.last_name),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        contact_id, is_new = row
        log.info(f"Contato {'NOVO' if is_new else 'atualizado'} | {user.first_name or '?'} (@{user.username or '?'}) | tg_id={user.id}")
        return contact_id
    return None


@_timed_query("save_message")
def save_message(tenant_id: str, contact_id: str, direction: str, content: str, responded_by: str = "ai", response_time_ms: int = None):
    preview = content[:100] + ("..." if len(content) > 100 else "")
    word_count = len(content.split()) if content else 0

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (tenant_id, contact_id, direction, content, responded_by, word_count, response_time_ms) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (tenant_id, contact_id, direction, content, responded_by, word_count, response_time_ms),
        )
        msg_id = cur.fetchone()[0]
        cur.close()
    log.debug(f"{'incoming' if direction == 'incoming' else 'outgoing'} Mensagem salva | msg_id={msg_id} | dir={direction} | words={word_count} | \"{preview}\"")
    return msg_id


@_timed_query("get_conversation_history")
def get_conversation_history(tenant_id: str, contact_id: str, limit: int = 10) -> list[dict]:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT direction, content, responded_by, created_at FROM messages "
            "WHERE tenant_id=%s AND contact_id=%s ORDER BY created_at DESC LIMIT %s",
            (tenant_id, contact_id, limit),
        )
        rows = cur.fetchall()
        cur.close()
    messages = [dict(r) for r in reversed(rows)]
    log.debug(f"Histórico carregado | contact={contact_id} | msgs={len(messages)}")
    return messages


@_timed_query("get_last_incoming_timestamp")
def get_last_incoming_timestamp(tenant_id: str, contact_id: str) -> float | None:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT EXTRACT(EPOCH FROM created_at) FROM messages "
            "WHERE tenant_id=%s AND contact_id=%s AND direction='incoming' "
            "ORDER BY created_at DESC LIMIT 1",
            (tenant_id, contact_id),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        return float(row[0])
    return None


@_timed_query("get_ai_profile")
def get_ai_profile(tenant_id: str) -> dict | None:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT business_name, tone, welcome_message, system_prompt FROM ai_profiles WHERE tenant_id=%s",
            (tenant_id,),
        )
        row = cur.fetchone()
        cur.close()
    if row:
        result = dict(row)
        log.info(f"Perfil IA carregado | business={result['business_name']} | tone={result['tone']}")
        return result
    log.warning(f"Nenhum perfil IA para tenant {tenant_id[:8]}...")
    return None


@_timed_query("update_contact_capture_data")
def update_contact_capture_data(contact_id: str, data: dict):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE contacts SET capture_data = COALESCE(capture_data, '{}'::jsonb) || %s::jsonb, updated_at=NOW() WHERE id=%s",
            (psycopg2.extras.Json(data), contact_id),
        )
        cur.close()
    log.info(f"Capture data atualizado | contact={contact_id} | keys={list(data.keys())}")
