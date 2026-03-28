import os
import psycopg2
import psycopg2.extras
from logger import get_logger

log = get_logger("db")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://botfans:botfans_dev@localhost:5432/botfans")


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def get_session_credentials(session_id: str) -> dict | None:
    """Busca api_id, api_hash, phone de uma sessão."""
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, tenant_id, phone, api_id, api_hash_encrypted, status FROM telegram_sessions WHERE id = %s",
            (session_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            log.info(f"Credenciais carregadas para sessão {session_id[:8]}...")
            return dict(row)
        log.warning(f"Sessão {session_id} não encontrada no banco")
        return None
    except Exception as e:
        log.error(f"Erro ao buscar sessão: {e}")
        return None


def update_session_status(session_id: str, status: str):
    """Atualiza o status da sessão no banco."""
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE telegram_sessions SET status = %s, updated_at = NOW() WHERE id = %s",
            (status, session_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        log.info(f"Sessão {session_id[:8]}... → {status}")
    except Exception as e:
        log.error(f"Erro ao atualizar status: {e}")


def save_contact(tenant_id: str, user):
    """Salva ou atualiza um contato capturado."""
    try:
        conn = get_connection()
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
                is_new = false
            RETURNING id
            """,
            (tenant_id, user.id, user.username, user.first_name, user.last_name),
        )
        contact_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        log.info(f"Contato salvo: {user.first_name} (@{user.username}) → {contact_id}")
        return contact_id
    except Exception as e:
        log.error(f"Erro ao salvar contato: {e}")
        return None


def save_message(tenant_id: str, contact_id: str, direction: str, content: str, responded_by: str = "ai"):
    """Salva uma mensagem no banco."""
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO messages (tenant_id, contact_id, direction, content, responded_by)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, contact_id, direction, content, responded_by),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        log.error(f"Erro ao salvar mensagem: {e}")


def get_ai_profile(tenant_id: str) -> dict | None:
    """Busca o perfil da IA configurado para o tenant."""
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT business_name, tone, welcome_message, system_prompt FROM ai_profiles WHERE tenant_id = %s",
            (tenant_id,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        log.error(f"Erro ao buscar perfil IA: {e}")
        return None
