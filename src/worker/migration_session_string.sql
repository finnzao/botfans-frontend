-- Migration: adicionar coluna session_string para persistir sessão Telethon
-- Execute: psql -U botfans -d botfans -f migration_session_string.sql

ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS session_string TEXT;

COMMENT ON COLUMN telegram_sessions.session_string IS 'String da sessão Telethon (StringSession) para restaurar sem re-autenticar';
