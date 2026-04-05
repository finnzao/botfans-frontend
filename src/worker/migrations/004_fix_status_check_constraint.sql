-- Migration: fix_status_check_constraint

ALTER TABLE telegram_sessions
  DROP CONSTRAINT IF EXISTS telegram_sessions_status_check;

ALTER TABLE telegram_sessions
  ADD CONSTRAINT telegram_sessions_status_check
  CHECK (status IN (
    'idle',
    'awaiting_portal_code',
    'portal_authenticated',
    'capturing_api',
    'api_captured',
    'awaiting_session_code',
    'awaiting_2fa',
    'verifying_code',
    'verifying_2fa',
    'active',
    'disconnected',
    'reconnecting',
    'error'
  ));
