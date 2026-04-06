"""
Schema atualizado com tabelas de tenants, services e orders.
"""

from db.schema import Table, Column, Index, UniqueConstraint

TENANTS_TABLE = Table(
    name="tenants",
    comment="Criadoras de conteúdo (multi-tenancy base)",
    columns=[
        Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
        Column("owner_name", "VARCHAR(255)", nullable=False),
        Column("email", "VARCHAR(255)", nullable=False, unique=True),
        Column("password_hash", "VARCHAR(255)", nullable=False),
        Column("display_name", "VARCHAR(255)"),
        Column("avatar_url", "TEXT"),
        Column("is_active", "BOOLEAN", default="true"),
        Column("created_at", "TIMESTAMP", default="NOW()"),
        Column("updated_at", "TIMESTAMP", default="NOW()"),
    ],
    indexes=[
        Index("idx_tenants_email", ["email"]),
        Index("idx_tenants_active", ["is_active"], where="is_active = true"),
    ],
)

SERVICES_TABLE = Table(
    name="services",
    comment="Catálogo de serviços por criadora",
    columns=[
        Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
        Column("tenant_id", "UUID", nullable=False, references="tenants(id) ON DELETE CASCADE"),
        Column("name", "VARCHAR(255)", nullable=False),
        Column("slug", "VARCHAR(100)", nullable=False),
        Column("category", "VARCHAR(30)", nullable=False, default="'content'",
               check="category IN ('content','call','subscription','custom','pack')"),
        Column("description", "TEXT"),
        Column("price_cents", "INTEGER", nullable=False, default="0"),
        Column("currency", "VARCHAR(3)", default="'BRL'"),
        Column("is_active", "BOOLEAN", default="true"),
        Column("requires_approval", "BOOLEAN", default="true"),
        Column("trigger_keywords", "TEXT[]", default="'{}'",
               comment="Palavras-chave para detecção de intenção"),
        Column("followup_questions", "JSONB", default="'[]'",
               comment="Perguntas que a IA faz antes de criar o pedido"),
        Column("delivery_method", "VARCHAR(30)", default="'telegram'",
               check="delivery_method IN ('telegram','link','platform','manual')"),
        Column("max_per_day", "INTEGER"),
        Column("schedule_required", "BOOLEAN", default="false"),
        Column("expiration_hours", "INTEGER"),
        Column("sort_order", "INTEGER", default="0"),
        Column("created_at", "TIMESTAMP", default="NOW()"),
        Column("updated_at", "TIMESTAMP", default="NOW()"),
    ],
    indexes=[
        Index("idx_services_tenant", ["tenant_id"]),
        Index("idx_services_active", ["tenant_id", "is_active"], where="is_active = true"),
    ],
    unique_constraints=[
        UniqueConstraint("uq_services_tenant_slug", ["tenant_id", "slug"]),
    ],
)

ORDERS_TABLE = Table(
    name="orders",
    comment="Pedidos de serviços",
    columns=[
        Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
        Column("tenant_id", "UUID", nullable=False, references="tenants(id) ON DELETE CASCADE"),
        Column("contact_id", "UUID", nullable=False, references="contacts(id)"),
        Column("service_id", "UUID", nullable=False, references="services(id)"),
        Column("status", "VARCHAR(30)", nullable=False, default="'draft'",
               check="status IN ('draft','pending_approval','approved','rejected','awaiting_payment','paid','in_production','delivered','cancelled','expired')"),
        Column("custom_details", "TEXT"),
        Column("collected_data", "JSONB", default="'{}'",
               comment="Respostas do cliente às followup_questions"),
        Column("scheduled_at", "TIMESTAMP"),
        Column("price_cents", "INTEGER", nullable=False, default="0"),
        Column("currency", "VARCHAR(3)", default="'BRL'"),
        Column("payment_method", "VARCHAR(30)"),
        Column("payment_status", "VARCHAR(20)", default="'pending'",
               check="payment_status IN ('pending','paid','refunded','failed')"),
        Column("payment_reference", "VARCHAR(255)"),
        Column("delivery_method", "VARCHAR(30)"),
        Column("delivered_at", "TIMESTAMP"),
        Column("expires_at", "TIMESTAMP"),
        Column("notes", "TEXT"),
        Column("created_at", "TIMESTAMP", default="NOW()"),
        Column("updated_at", "TIMESTAMP", default="NOW()"),
    ],
    indexes=[
        Index("idx_orders_tenant", ["tenant_id", "created_at DESC"]),
        Index("idx_orders_contact", ["contact_id", "created_at DESC"]),
        Index("idx_orders_status", ["tenant_id", "status"]),
        Index("idx_orders_pending", ["tenant_id", "status"],
              where="status IN ('draft','pending_approval','awaiting_payment')"),
    ],
)

NEW_TABLES = [TENANTS_TABLE, SERVICES_TABLE, ORDERS_TABLE]
