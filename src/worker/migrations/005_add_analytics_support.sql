-- Migration: add_analytics_support

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20),
  ADD COLUMN IF NOT EXISTS category VARCHAR(30),
  ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(tenant_id, direction, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sentiment ON messages(tenant_id, sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(tenant_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_is_new ON contacts(tenant_id, is_new, first_contact_at);
