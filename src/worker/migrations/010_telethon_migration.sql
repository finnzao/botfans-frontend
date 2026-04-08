-- Migration: telethon_migration
-- Pyrofork session strings are incompatible with Telethon.
-- All existing sessions must be invalidated so users reconnect with Telethon.

UPDATE telegram_sessions
SET status = 'disconnected',
    session_string = NULL,
    error_message = 'Migração para Telethon — reconecte sua sessão'
WHERE session_string IS NOT NULL AND length(session_string) > 10;
