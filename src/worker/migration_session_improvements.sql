-- =============================================
-- Migration: melhorias para persistência de sessão
-- Execute: psql -U botfans -d botfans -f migration_session_improvements.sql
-- =============================================

-- 1. Coluna session_string (se ainda não existir)
ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS session_string TEXT;

COMMENT ON COLUMN telegram_sessions.session_string
  IS 'String da sessão Telethon (StringSession) para restaurar sem re-autenticar';

-- 2. Coluna error_message para persistir erros
ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN telegram_sessions.error_message
  IS 'Última mensagem de erro (para exibir no frontend)';

-- 3. Coluna updated_at em contacts (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE contacts ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;

-- 4. Índice para buscar sessões ativas rapidamente
CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON telegram_sessions(status) WHERE status = 'active';

-- 5. Índice para buscar mensagens recentes por contato (usado no histórico)
CREATE INDEX IF NOT EXISTS idx_messages_contact_recent
  ON messages(tenant_id, contact_id, created_at DESC);
