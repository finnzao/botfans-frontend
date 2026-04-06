"""
Funções adicionais de banco para services e orders.
Importar e integrar no database.py existente.
"""
import json
import psycopg2.extras
from database import get_connection, _timed_query
from logger import get_logger

log = get_logger("database_services")


# ═══════════════════════════════════════════════
# SERVICES
# ═══════════════════════════════════════════════

@_timed_query("get_active_services")
def get_active_services(tenant_id: str) -> list[dict]:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM services WHERE tenant_id = %s AND is_active = true "
            "ORDER BY sort_order, created_at",
            (tenant_id,),
        )
        rows = cur.fetchall()
        cur.close()
    result = [dict(r) for r in rows]
    log.debug(f"Serviços ativos para tenant {tenant_id[:8]}...: {len(result)}")
    return result


@_timed_query("get_service_by_id")
def get_service_by_id(service_id: str) -> dict | None:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM services WHERE id = %s", (service_id,))
        row = cur.fetchone()
        cur.close()
    return dict(row) if row else None


# ═══════════════════════════════════════════════
# ORDERS
# ═══════════════════════════════════════════════

@_timed_query("create_order_draft")
def create_order_draft(
    tenant_id: str, contact_id: str, service_id: str,
    price_cents: int, currency: str = "BRL", delivery_method: str = "telegram",
) -> str:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO orders
            (tenant_id, contact_id, service_id, status, price_cents, currency, delivery_method)
            VALUES (%s,%s,%s,'draft',%s,%s,%s)
            RETURNING id""",
            (tenant_id, contact_id, service_id, price_cents, currency, delivery_method),
        )
        order_id = cur.fetchone()[0]
        cur.close()
    log.info(f"Order draft | id={str(order_id)[:8]}... | service={service_id[:8]}...")
    return str(order_id)


@_timed_query("finalize_order")
def finalize_order(order_id: str, status: str, collected_data: dict, custom_details: str = None):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """UPDATE orders SET status=%s, collected_data=%s, custom_details=%s, updated_at=NOW()
            WHERE id=%s""",
            (status, json.dumps(collected_data), custom_details, order_id),
        )
        cur.close()
    log.info(f"Order finalizado | id={order_id[:8]}... | status={status}")


@_timed_query("update_order_status")
def update_order_status(order_id: str, status: str, notes: str = None):
    with get_connection() as conn:
        cur = conn.cursor()
        extra = ", delivered_at = NOW()" if status == "delivered" else ""
        payment = ", payment_status = 'paid'" if status == "paid" else ""
        if notes:
            cur.execute(
                f"UPDATE orders SET status=%s, notes=%s, updated_at=NOW(){extra}{payment} WHERE id=%s",
                (status, notes, order_id),
            )
        else:
            cur.execute(
                f"UPDATE orders SET status=%s, updated_at=NOW(){extra}{payment} WHERE id=%s",
                (status, order_id),
            )
        cur.close()


@_timed_query("get_orders_by_tenant")
def get_orders_by_tenant(tenant_id: str, status: str = None) -> list[dict]:
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if status:
            cur.execute(
                """SELECT o.*, s.name as service_name, s.category as service_category,
                    c.first_name, c.last_name, c.telegram_username
                FROM orders o
                JOIN services s ON s.id = o.service_id
                JOIN contacts c ON c.id = o.contact_id
                WHERE o.tenant_id = %s AND o.status = %s
                ORDER BY o.created_at DESC""",
                (tenant_id, status),
            )
        else:
            cur.execute(
                """SELECT o.*, s.name as service_name, s.category as service_category,
                    c.first_name, c.last_name, c.telegram_username
                FROM orders o
                JOIN services s ON s.id = o.service_id
                JOIN contacts c ON c.id = o.contact_id
                WHERE o.tenant_id = %s
                ORDER BY o.created_at DESC""",
                (tenant_id,),
            )
        rows = cur.fetchall()
        cur.close()
    return [dict(r) for r in rows]
