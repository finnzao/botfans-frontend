-- =============================================
-- BotFans CRM - Schema de banco de dados
-- Execute uma vez para criar todas as tabelas
-- =============================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessões Telegram (uma por tenant)
CREATE TABLE IF NOT EXISTS telegram_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL UNIQUE,
    phone           VARCHAR(20),
    api_id          INTEGER,
    api_hash_encrypted VARCHAR(255),
    status          VARCHAR(50) NOT NULL DEFAULT 'idle',
    session_string  TEXT,
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Perfis de IA (como o bot responde)
CREATE TABLE IF NOT EXISTS ai_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL UNIQUE,
    business_name   VARCHAR(255) NOT NULL,
    tone            VARCHAR(50) DEFAULT 'informal',
    welcome_message TEXT,
    system_prompt   TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Contatos capturados
CREATE TABLE IF NOT EXISTS contacts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    telegram_user_id    BIGINT NOT NULL,
    telegram_username   VARCHAR(100),
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    phone               VARCHAR(20),
    capture_data        JSONB DEFAULT '{}',
    tags                TEXT[] DEFAULT '{}',
    is_new              BOOLEAN DEFAULT true,
    first_contact_at    TIMESTAMP DEFAULT NOW(),
    last_contact_at     TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, telegram_user_id)
);

-- Mensagens (histórico de conversa)
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    direction       VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content         TEXT NOT NULL,
    responded_by    VARCHAR(10) DEFAULT 'ai' CHECK (responded_by IN ('ai', 'human')),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(tenant_id, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON telegram_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON telegram_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_messages_contact_recent ON messages(tenant_id, contact_id, created_at DESC);
