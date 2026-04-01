-- Migration: initial_schema
-- Schema completo do BotFans CRM (source of truth: db/schema.py)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS telegram_sessions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL UNIQUE,
    phone                   VARCHAR(20),
    api_id                  INTEGER,
    api_hash_encrypted      VARCHAR(255),
    status                  VARCHAR(50) NOT NULL DEFAULT 'idle',
    session_string          TEXT,
    session_string_encrypted TEXT,
    error_message           TEXT,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE telegram_sessions IS 'Sessões Telegram (uma por tenant)';
COMMENT ON COLUMN telegram_sessions.session_string IS 'String da sessão Telethon (StringSession)';
COMMENT ON COLUMN telegram_sessions.session_string_encrypted IS 'Session string criptografada (backup seguro)';
COMMENT ON COLUMN telegram_sessions.error_message IS 'Última mensagem de erro';

CREATE TABLE IF NOT EXISTS ai_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL UNIQUE,
    business_name   VARCHAR(255) NOT NULL,
    tone            VARCHAR(50) DEFAULT 'informal',
    welcome_message TEXT,
    system_prompt   TEXT,
    capture_fields  TEXT[] DEFAULT '{}',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ai_profiles IS 'Perfis de IA (como o bot responde)';
COMMENT ON COLUMN ai_profiles.capture_fields IS 'Campos que a IA deve capturar do contato';

CREATE TABLE IF NOT EXISTS contacts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    telegram_user_id    BIGINT NOT NULL,
    telegram_username   VARCHAR(100),
    first_name          VARCHAR(100),
    last_name           VARCHAR(100),
    phone               VARCHAR(20),
    capture_data        JSONB DEFAULT '{}'::jsonb,
    tags                TEXT[] DEFAULT '{}',
    is_new              BOOLEAN DEFAULT true,
    first_contact_at    TIMESTAMP DEFAULT NOW(),
    last_contact_at     TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_contacts_tenant_user UNIQUE(tenant_id, telegram_user_id)
);

COMMENT ON TABLE contacts IS 'Contatos capturados via Telegram';

CREATE TABLE IF NOT EXISTS messages (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL,
    contact_id              UUID NOT NULL REFERENCES contacts(id),
    direction               VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content                 TEXT NOT NULL,
    responded_by            VARCHAR(10) DEFAULT 'ai' CHECK (responded_by IN ('ai', 'human')),
    telegram_message_id     BIGINT,
    media_type              VARCHAR(20),
    reply_to_message_id     UUID,
    created_at              TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE messages IS 'Histórico de mensagens (conversa)';
COMMENT ON COLUMN messages.telegram_message_id IS 'ID original da mensagem no Telegram';
COMMENT ON COLUMN messages.media_type IS 'Tipo de mídia: text, photo, video, document, voice, sticker';
COMMENT ON COLUMN messages.reply_to_message_id IS 'ID da mensagem que esta responde (threading)';

CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON telegram_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON telegram_sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(tenant_id, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_contact_recent ON messages(tenant_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
