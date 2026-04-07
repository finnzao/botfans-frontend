-- Migration: tags_and_broadcast
-- Adds: auto_tag_rules, broadcast_jobs, broadcast_messages tables
-- Adds: GIN index on contacts.tags for fast tag-based filtering

-- ═══════════════════════════════════════════════════════════
-- 1. GIN index on contacts.tags for fast array queries
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_contacts_tags
  ON contacts USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_tags
  ON contacts (tenant_id)
  WHERE array_length(tags, 1) > 0;

-- ═══════════════════════════════════════════════════════════
-- 2. Auto-tag rules (regex/keyword → tag)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auto_tag_rules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    tag         VARCHAR(50) NOT NULL,
    match_type  VARCHAR(20) NOT NULL DEFAULT 'keyword'
                CHECK (match_type IN ('keyword', 'regex', 'ai')),
    patterns    TEXT[] NOT NULL DEFAULT '{}',
    match_field VARCHAR(20) NOT NULL DEFAULT 'message'
                CHECK (match_field IN ('message', 'username', 'first_name')),
    apply_once  BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    priority    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auto_tag_rules IS 'Regras automáticas de tagging baseadas em padrões de mensagem';
COMMENT ON COLUMN auto_tag_rules.match_type IS 'keyword=contém palavra, regex=expressão regular, ai=análise por IA';
COMMENT ON COLUMN auto_tag_rules.patterns IS 'Lista de palavras-chave ou regex patterns';
COMMENT ON COLUMN auto_tag_rules.apply_once IS 'Se true, aplica a tag apenas uma vez (não re-aplica)';

CREATE INDEX IF NOT EXISTS idx_auto_tag_rules_tenant
  ON auto_tag_rules (tenant_id) WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════
-- 3. Broadcast jobs (envio em massa)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS broadcast_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    message_text    TEXT NOT NULL,
    filter_tags     TEXT[] DEFAULT '{}',
    filter_no_tags  TEXT[] DEFAULT '{}',
    filter_is_new   BOOLEAN DEFAULT NULL,
    filter_last_contact_days INTEGER DEFAULT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
    scheduled_at    TIMESTAMP DEFAULT NULL,
    started_at      TIMESTAMP DEFAULT NULL,
    completed_at    TIMESTAMP DEFAULT NULL,
    total_contacts  INTEGER NOT NULL DEFAULT 0,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 20,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE broadcast_jobs IS 'Jobs de envio de mensagem em massa segmentada';
COMMENT ON COLUMN broadcast_jobs.filter_tags IS 'Contatos que TÊM todas estas tags';
COMMENT ON COLUMN broadcast_jobs.filter_no_tags IS 'Contatos que NÃO TÊM nenhuma destas tags';
COMMENT ON COLUMN broadcast_jobs.filter_last_contact_days IS 'Contatos com último contato em N dias';
COMMENT ON COLUMN broadcast_jobs.rate_limit_per_minute IS 'Mensagens por minuto (anti-flood Telegram)';

CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_tenant
  ON broadcast_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_pending
  ON broadcast_jobs (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

-- ═══════════════════════════════════════════════════════════
-- 4. Broadcast messages (status por contato)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broadcast_id    UUID NOT NULL REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    error_message   TEXT DEFAULT NULL,
    sent_at         TIMESTAMP DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_job
  ON broadcast_messages (broadcast_id, status);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_contact
  ON broadcast_messages (contact_id);
