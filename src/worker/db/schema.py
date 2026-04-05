"""
Schema do banco de dados definido como código (Source of Truth).
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SessionStatus(str, Enum):
    IDLE = "idle"
    AWAITING_PORTAL_CODE = "awaiting_portal_code"
    PORTAL_AUTHENTICATED = "portal_authenticated"
    CAPTURING_API = "capturing_api"
    API_CAPTURED = "api_captured"
    AWAITING_SESSION_CODE = "awaiting_session_code"
    AWAITING_2FA = "awaiting_2fa"
    VERIFYING_CODE = "verifying_code"
    VERIFYING_2FA = "verifying_2fa"
    ACTIVE = "active"
    DISCONNECTED = "disconnected"
    RECONNECTING = "reconnecting"
    ERROR = "error"


class MessageDirection(str, Enum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


class RespondedBy(str, Enum):
    AI = "ai"
    HUMAN = "human"


class ToneType(str, Enum):
    INFORMAL = "informal"
    FORMAL = "formal"
    TECNICO = "tecnico"
    DESCONTRAIDO = "descontraido"


@dataclass
class Column:
    name: str
    type: str
    primary_key: bool = False
    nullable: bool = True
    default: Optional[str] = None
    unique: bool = False
    check: Optional[str] = None
    references: Optional[str] = None
    comment: Optional[str] = None


@dataclass
class Index:
    name: str
    columns: list[str]
    unique: bool = False
    where: Optional[str] = None


@dataclass
class UniqueConstraint:
    name: str
    columns: list[str]


@dataclass
class Table:
    name: str
    columns: list[Column]
    indexes: list[Index] = field(default_factory=list)
    unique_constraints: list[UniqueConstraint] = field(default_factory=list)
    comment: Optional[str] = None


EXTENSIONS = ["uuid-ossp"]

TABLES: list[Table] = [
    Table(
        name="telegram_sessions",
        comment="Sessões Telegram (uma por tenant)",
        columns=[
            Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
            Column("tenant_id", "UUID", nullable=False, unique=True),
            Column("phone", "VARCHAR(20)"),
            Column("api_id", "INTEGER"),
            Column("api_hash_encrypted", "VARCHAR(255)"),
            Column("status", "VARCHAR(50)", nullable=False, default="'idle'",
                   check="status IN ('idle','awaiting_portal_code','portal_authenticated','capturing_api','api_captured','awaiting_session_code','awaiting_2fa','verifying_code','verifying_2fa','active','disconnected','reconnecting','error')"),
            Column("session_string", "TEXT", comment="String da sessão Telethon (StringSession)"),
            Column("session_string_encrypted", "TEXT", comment="Session string criptografada (backup seguro)"),
            Column("error_message", "TEXT", comment="Última mensagem de erro"),
            Column("created_at", "TIMESTAMP", default="NOW()"),
            Column("updated_at", "TIMESTAMP", default="NOW()"),
        ],
        indexes=[
            Index("idx_sessions_tenant", ["tenant_id"]),
            Index("idx_sessions_active", ["status"], where="status = 'active'"),
        ],
    ),
    Table(
        name="ai_profiles",
        comment="Perfis de IA (como o bot responde)",
        columns=[
            Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
            Column("tenant_id", "UUID", nullable=False, unique=True),
            Column("business_name", "VARCHAR(255)", nullable=False),
            Column("tone", "VARCHAR(50)", default="'informal'"),
            Column("welcome_message", "TEXT"),
            Column("system_prompt", "TEXT"),
            Column("capture_fields", "TEXT[]", default="'{}'", comment="Campos que a IA deve capturar do contato"),
            Column("created_at", "TIMESTAMP", default="NOW()"),
            Column("updated_at", "TIMESTAMP", default="NOW()"),
        ],
    ),
    Table(
        name="contacts",
        comment="Contatos capturados via Telegram",
        columns=[
            Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
            Column("tenant_id", "UUID", nullable=False),
            Column("telegram_user_id", "BIGINT", nullable=False),
            Column("telegram_username", "VARCHAR(100)"),
            Column("first_name", "VARCHAR(100)"),
            Column("last_name", "VARCHAR(100)"),
            Column("phone", "VARCHAR(20)"),
            Column("capture_data", "JSONB", default="'{}'::jsonb"),
            Column("tags", "TEXT[]", default="'{}'"),
            Column("is_new", "BOOLEAN", default="true"),
            Column("first_contact_at", "TIMESTAMP", default="NOW()"),
            Column("last_contact_at", "TIMESTAMP", default="NOW()"),
            Column("updated_at", "TIMESTAMP", default="NOW()"),
        ],
        indexes=[
            Index("idx_contacts_tenant", ["tenant_id"]),
            Index("idx_contacts_last_contact", ["tenant_id", "last_contact_at DESC"]),
            Index("idx_contacts_is_new", ["tenant_id", "is_new", "first_contact_at"]),
        ],
        unique_constraints=[
            UniqueConstraint("uq_contacts_tenant_user", ["tenant_id", "telegram_user_id"]),
        ],
    ),
    Table(
        name="messages",
        comment="Histórico de mensagens (conversa)",
        columns=[
            Column("id", "UUID", primary_key=True, default="uuid_generate_v4()"),
            Column("tenant_id", "UUID", nullable=False),
            Column("contact_id", "UUID", nullable=False, references="contacts(id)"),
            Column("direction", "VARCHAR(10)", nullable=False, check="direction IN ('incoming', 'outgoing')"),
            Column("content", "TEXT", nullable=False),
            Column("responded_by", "VARCHAR(10)", default="'ai'", check="responded_by IN ('ai', 'human')"),
            Column("telegram_message_id", "BIGINT", comment="ID original da mensagem no Telegram"),
            Column("media_type", "VARCHAR(20)", comment="Tipo de mídia: text, photo, video, document, voice, sticker"),
            Column("reply_to_message_id", "UUID", comment="ID da mensagem que esta responde (threading)"),
            Column("sentiment", "VARCHAR(20)", comment="Sentimento da mensagem: positive, neutral, negative"),
            Column("category", "VARCHAR(30)", comment="Categoria: greeting, question, complaint, order, feedback"),
            Column("word_count", "INTEGER", default="0", comment="Contagem de palavras da mensagem"),
            Column("response_time_ms", "INTEGER", comment="Tempo de resposta em milissegundos (para outgoing)"),
            Column("created_at", "TIMESTAMP", default="NOW()"),
        ],
        indexes=[
            Index("idx_messages_contact", ["contact_id", "created_at DESC"]),
            Index("idx_messages_tenant", ["tenant_id", "created_at DESC"]),
            Index("idx_messages_contact_recent", ["tenant_id", "contact_id", "created_at DESC"]),
            Index("idx_messages_reply", ["reply_to_message_id"], where="reply_to_message_id IS NOT NULL"),
            Index("idx_messages_created_at", ["created_at"]),
            Index("idx_messages_direction", ["tenant_id", "direction", "created_at"]),
            Index("idx_messages_sentiment", ["tenant_id", "sentiment"], where="sentiment IS NOT NULL"),
            Index("idx_messages_category", ["tenant_id", "category"], where="category IS NOT NULL"),
        ],
    ),
]


def generate_create_table(table: Table) -> str:
    lines = []
    for col in table.columns:
        parts = [f"    {col.name}", col.type]
        if col.primary_key:
            parts.append("PRIMARY KEY")
        if col.default:
            parts.append(f"DEFAULT {col.default}")
        if not col.nullable and not col.primary_key:
            parts.append("NOT NULL")
        if col.unique:
            parts.append("UNIQUE")
        if col.check:
            parts.append(f"CHECK ({col.check})")
        if col.references:
            parts.append(f"REFERENCES {col.references}")
        lines.append(" ".join(parts))

    for uc in table.unique_constraints:
        lines.append(f"    CONSTRAINT {uc.name} UNIQUE({', '.join(uc.columns)})")

    cols_sql = ",\n".join(lines)
    sql = f"CREATE TABLE IF NOT EXISTS {table.name} (\n{cols_sql}\n);"

    if table.comment:
        sql += f"\nCOMMENT ON TABLE {table.name} IS '{table.comment}';"

    for col in table.columns:
        if col.comment:
            sql += f"\nCOMMENT ON COLUMN {table.name}.{col.name} IS '{col.comment}';"

    return sql


def generate_indexes(table: Table) -> str:
    sqls = []
    for idx in table.indexes:
        unique = "UNIQUE " if idx.unique else ""
        cols = ", ".join(idx.columns)
        where = f" WHERE {idx.where}" if idx.where else ""
        sqls.append(f"CREATE {unique}INDEX IF NOT EXISTS {idx.name} ON {table.name}({cols}){where};")
    return "\n".join(sqls)


def generate_full_schema() -> str:
    parts = [
        "-- =============================================",
        "-- BotFans CRM - Schema gerado automaticamente",
        "-- Gerado a partir de db/schema.py",
        "-- =============================================",
        "",
    ]

    for ext in EXTENSIONS:
        parts.append(f'CREATE EXTENSION IF NOT EXISTS "{ext}";')
    parts.append("")

    for table in TABLES:
        parts.append(f"-- ── {table.name} ──")
        parts.append(generate_create_table(table))
        idx_sql = generate_indexes(table)
        if idx_sql:
            parts.append(idx_sql)
        parts.append("")

    return "\n".join(parts)
