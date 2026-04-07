"""
Database functions for tags, auto-tag rules, and broadcast.
"""

import json
import psycopg2
import psycopg2.extras
from database import get_connection, _timed_query
from logger import get_logger

log = get_logger("database_tags")


# ═══════════════════════════════════════════════════════════
# CONTACT TAGS
# ═══════════════════════════════════════════════════════════

@_timed_query("add_tags_to_contact")
def add_tags_to_contact(contact_id: str, tags: list[str]) -> list[str]:
    """Adiciona tags ao contato (sem duplicatas). Retorna tags atualizadas."""
    if not tags:
        return []
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """UPDATE contacts
               SET tags = (
                   SELECT ARRAY(SELECT DISTINCT unnest(tags || %s::text[]))
               ),
               updated_at = NOW()
               WHERE id = %s
               RETURNING tags""",
            (tags, contact_id),
        )
        row = cur.fetchone()
        cur.close()
    result = row[0] if row else []
    log.info(f"Tags adicionadas | contact={contact_id[:8]}... | added={tags} | total={result}")
    return result


@_timed_query("remove_tags_from_contact")
def remove_tags_from_contact(contact_id: str, tags: list[str]) -> list[str]:
    """Remove tags do contato. Retorna tags atualizadas."""
    if not tags:
        return []
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """UPDATE contacts
               SET tags = (
                   SELECT ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest(%s::text[]))
               ),
               updated_at = NOW()
               WHERE id = %s
               RETURNING tags""",
            (tags, contact_id),
        )
        row = cur.fetchone()
        cur.close()
    result = row[0] if row else []
    log.info(f"Tags removidas | contact={contact_id[:8]}... | removed={tags} | remaining={result}")
    return result


@_timed_query("set_contact_tags")
def set_contact_tags(contact_id: str, tags: list[str]) -> list[str]:
    """Substitui todas as tags de um contato."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE contacts SET tags = %s, updated_at = NOW() WHERE id = %s RETURNING tags",
            (tags, contact_id),
        )
        row = cur.fetchone()
        cur.close()
    return row[0] if row else []


@_timed_query("get_contact_tags")
def get_contact_tags(contact_id: str) -> list[str]:
    """Retorna as tags de um contato."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT tags FROM contacts WHERE id = %s", (contact_id,))
        row = cur.fetchone()
        cur.close()
    return row[0] if row else []


@_timed_query("contact_has_tag")
def contact_has_tag(contact_id: str, tag: str) -> bool:
    """Verifica se um contato tem uma tag específica."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT %s = ANY(tags) FROM contacts WHERE id = %s", (tag, contact_id))
        row = cur.fetchone()
        cur.close()
    return row[0] if row else False


@_timed_query("get_all_tags_for_tenant")
def get_all_tags_for_tenant(tenant_id: str) -> list[dict]:
    """Retorna todas as tags usadas por um tenant com contagem."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT tag, COUNT(*) as count
               FROM contacts, unnest(tags) AS tag
               WHERE tenant_id = %s
               GROUP BY tag
               ORDER BY count DESC, tag ASC""",
            (tenant_id,),
        )
        rows = cur.fetchall()
        cur.close()
    return [{"tag": row[0], "count": row[1]} for row in rows]


@_timed_query("search_contacts_by_tags")
def search_contacts_by_tags(
    tenant_id: str,
    include_tags: list[str] = None,
    exclude_tags: list[str] = None,
    is_new: bool = None,
    last_contact_days: int = None,
    search_text: str = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    Busca contatos com filtros avançados.
    Retorna (contacts, total_count).
    """
    conditions = ["c.tenant_id = %s"]
    params: list = [tenant_id]
    idx = 2

    if include_tags:
        conditions.append(f"c.tags @> %s::text[]")
        params.append(include_tags)
        idx += 1

    if exclude_tags:
        conditions.append(f"NOT (c.tags && %s::text[])")
        params.append(exclude_tags)
        idx += 1

    if is_new is not None:
        conditions.append(f"c.is_new = %s")
        params.append(is_new)
        idx += 1

    if last_contact_days is not None:
        conditions.append(f"c.last_contact_at >= NOW() - INTERVAL '{int(last_contact_days)} days'")

    if search_text:
        conditions.append(
            f"(c.first_name ILIKE %s OR c.last_name ILIKE %s OR c.telegram_username ILIKE %s)"
        )
        like = f"%{search_text}%"
        params.extend([like, like, like])
        idx += 3

    where = " AND ".join(conditions)

    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Count
        cur.execute(f"SELECT COUNT(*) as total FROM contacts c WHERE {where}", params)
        total = cur.fetchone()["total"]

        # Data
        cur.execute(
            f"""SELECT c.id, c.tenant_id, c.telegram_user_id, c.telegram_username,
                       c.first_name, c.last_name, c.phone, c.capture_data,
                       c.tags, c.is_new, c.first_contact_at, c.last_contact_at
                FROM contacts c
                WHERE {where}
                ORDER BY c.last_contact_at DESC
                LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        rows = cur.fetchall()
        cur.close()

    return [dict(r) for r in rows], total


# ═══════════════════════════════════════════════════════════
# AUTO-TAG RULES
# ═══════════════════════════════════════════════════════════

@_timed_query("get_auto_tag_rules")
def get_auto_tag_rules(tenant_id: str, active_only: bool = True) -> list[dict]:
    """Retorna regras de auto-tag para um tenant."""
    condition = "AND is_active = true" if active_only else ""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"""SELECT * FROM auto_tag_rules
                WHERE tenant_id = %s {condition}
                ORDER BY priority DESC, created_at ASC""",
            (tenant_id,),
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]


@_timed_query("create_auto_tag_rule")
def create_auto_tag_rule(
    tenant_id: str, name: str, tag: str, patterns: list[str],
    match_type: str = "keyword", match_field: str = "message",
    apply_once: bool = False, description: str = None, priority: int = 0,
) -> dict:
    """Cria uma nova regra de auto-tag."""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO auto_tag_rules
               (tenant_id, name, tag, patterns, match_type, match_field,
                apply_once, description, priority)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (tenant_id, name, tag, patterns, match_type, match_field,
             apply_once, description, priority),
        )
        row = cur.fetchone()
        cur.close()
    log.info(f"Auto-tag rule criada | tenant={tenant_id[:8]}... | tag={tag} | patterns={patterns}")
    return dict(row)


@_timed_query("update_auto_tag_rule")
def update_auto_tag_rule(rule_id: str, tenant_id: str, **fields) -> dict | None:
    """Atualiza uma regra de auto-tag."""
    allowed = {"name", "tag", "patterns", "match_type", "match_field",
               "apply_once", "description", "priority", "is_active"}
    sets = []
    vals = []
    idx = 1
    for key, val in fields.items():
        if key in allowed:
            sets.append(f"{key} = ${idx}")
            vals.append(val)
            idx += 1
    if not sets:
        return None

    sets.append("updated_at = NOW()")
    vals.extend([rule_id, tenant_id])

    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # psycopg2 uses %s not $N
        placeholders = []
        for i, key in enumerate(fields.keys()):
            if key in allowed:
                placeholders.append(f"{key} = %s")
        placeholders.append("updated_at = NOW()")
        set_clause = ", ".join(placeholders)
        vals_clean = [v for k, v in fields.items() if k in allowed]
        vals_clean.extend([rule_id, tenant_id])

        cur.execute(
            f"""UPDATE auto_tag_rules SET {set_clause}
                WHERE id = %s AND tenant_id = %s
                RETURNING *""",
            vals_clean,
        )
        row = cur.fetchone()
        cur.close()
    return dict(row) if row else None


@_timed_query("delete_auto_tag_rule")
def delete_auto_tag_rule(rule_id: str, tenant_id: str) -> bool:
    """Deleta uma regra de auto-tag."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM auto_tag_rules WHERE id = %s AND tenant_id = %s",
            (rule_id, tenant_id),
        )
        affected = cur.rowcount
        cur.close()
    return affected > 0


# ═══════════════════════════════════════════════════════════
# BROADCAST
# ═══════════════════════════════════════════════════════════

@_timed_query("create_broadcast_job")
def create_broadcast_job(
    tenant_id: str, name: str, message_text: str,
    filter_tags: list[str] = None, filter_no_tags: list[str] = None,
    filter_is_new: bool = None, filter_last_contact_days: int = None,
    rate_limit_per_minute: int = 20, scheduled_at: str = None,
) -> dict:
    """Cria um job de broadcast. Retorna o job criado."""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """INSERT INTO broadcast_jobs
               (tenant_id, name, message_text, filter_tags, filter_no_tags,
                filter_is_new, filter_last_contact_days, rate_limit_per_minute,
                scheduled_at, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                tenant_id, name, message_text,
                filter_tags or [], filter_no_tags or [],
                filter_is_new, filter_last_contact_days,
                rate_limit_per_minute, scheduled_at,
                "scheduled" if scheduled_at else "draft",
            ),
        )
        row = cur.fetchone()
        cur.close()
    log.info(f"Broadcast criado | id={row['id']} | tenant={tenant_id[:8]}...")
    return dict(row)


@_timed_query("get_broadcast_jobs")
def get_broadcast_jobs(tenant_id: str, limit: int = 50) -> list[dict]:
    """Lista broadcast jobs de um tenant."""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT * FROM broadcast_jobs
               WHERE tenant_id = %s
               ORDER BY created_at DESC
               LIMIT %s""",
            (tenant_id, limit),
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]


@_timed_query("get_broadcast_job")
def get_broadcast_job(job_id: str, tenant_id: str) -> dict | None:
    """Retorna um broadcast job específico."""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM broadcast_jobs WHERE id = %s AND tenant_id = %s",
            (job_id, tenant_id),
        )
        row = cur.fetchone()
        cur.close()
    return dict(row) if row else None


@_timed_query("update_broadcast_status")
def update_broadcast_status(job_id: str, status: str, **extra):
    """Atualiza status de um broadcast job."""
    extra_sets = []
    extra_vals = []
    if status == "sending":
        extra_sets.append("started_at = NOW()")
    elif status in ("completed", "failed"):
        extra_sets.append("completed_at = NOW()")
    if "sent_count" in extra:
        extra_sets.append("sent_count = %s")
        extra_vals.append(extra["sent_count"])
    if "failed_count" in extra:
        extra_sets.append("failed_count = %s")
        extra_vals.append(extra["failed_count"])
    if "total_contacts" in extra:
        extra_sets.append("total_contacts = %s")
        extra_vals.append(extra["total_contacts"])

    extra_sql = (", " + ", ".join(extra_sets)) if extra_sets else ""

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""UPDATE broadcast_jobs
                SET status = %s, updated_at = NOW(){extra_sql}
                WHERE id = %s""",
            [status] + extra_vals + [job_id],
        )
        cur.close()


@_timed_query("populate_broadcast_recipients")
def populate_broadcast_recipients(job_id: str, tenant_id: str, job: dict) -> int:
    """
    Popula broadcast_messages com os contatos filtrados.
    Retorna a quantidade de contatos selecionados.
    """
    conditions = ["c.tenant_id = %s"]
    params: list = [tenant_id]

    filter_tags = job.get("filter_tags") or []
    filter_no_tags = job.get("filter_no_tags") or []
    filter_is_new = job.get("filter_is_new")
    filter_days = job.get("filter_last_contact_days")

    if filter_tags:
        conditions.append("c.tags @> %s::text[]")
        params.append(filter_tags)

    if filter_no_tags:
        conditions.append("NOT (c.tags && %s::text[])")
        params.append(filter_no_tags)

    if filter_is_new is not None:
        conditions.append("c.is_new = %s")
        params.append(filter_is_new)

    if filter_days is not None:
        conditions.append(f"c.last_contact_at >= NOW() - INTERVAL '{int(filter_days)} days'")

    where = " AND ".join(conditions)

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO broadcast_messages (broadcast_id, contact_id)
                SELECT %s, c.id FROM contacts c WHERE {where}""",
            [job_id] + params,
        )
        count = cur.rowcount
        cur.close()

    log.info(f"Broadcast recipients populados | job={job_id[:8]}... | count={count}")
    return count


@_timed_query("get_pending_broadcast_messages")
def get_pending_broadcast_messages(job_id: str, limit: int = 20) -> list[dict]:
    """Retorna próximas mensagens pendentes de envio."""
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT bm.id, bm.contact_id, c.telegram_user_id, c.first_name,
                      c.telegram_username
               FROM broadcast_messages bm
               JOIN contacts c ON c.id = bm.contact_id
               WHERE bm.broadcast_id = %s AND bm.status = 'pending'
               ORDER BY bm.created_at ASC
               LIMIT %s""",
            (job_id, limit),
        )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]


@_timed_query("update_broadcast_message_status")
def update_broadcast_message_status(msg_id: str, status: str, error_message: str = None):
    """Atualiza status de uma mensagem individual do broadcast."""
    with get_connection() as conn:
        cur = conn.cursor()
        if status == "sent":
            cur.execute(
                "UPDATE broadcast_messages SET status = %s, sent_at = NOW() WHERE id = %s",
                (status, msg_id),
            )
        else:
            cur.execute(
                "UPDATE broadcast_messages SET status = %s, error_message = %s WHERE id = %s",
                (status, error_message, msg_id),
            )
        cur.close()


@_timed_query("get_broadcast_stats")
def get_broadcast_stats(job_id: str) -> dict:
    """Retorna estatísticas de um broadcast job."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT
                 COUNT(*) as total,
                 COUNT(*) FILTER (WHERE status = 'sent') as sent,
                 COUNT(*) FILTER (WHERE status = 'failed') as failed,
                 COUNT(*) FILTER (WHERE status = 'pending') as pending,
                 COUNT(*) FILTER (WHERE status = 'skipped') as skipped
               FROM broadcast_messages
               WHERE broadcast_id = %s""",
            (job_id,),
        )
        row = cur.fetchone()
        cur.close()
    return {
        "total": row[0], "sent": row[1], "failed": row[2],
        "pending": row[3], "skipped": row[4],
    }
