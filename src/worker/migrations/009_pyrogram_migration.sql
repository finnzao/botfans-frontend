-- Migration: pyrogram_migration
-- Telethon session strings are incompatible with Pyrogram.
-- All existing sessions must be invalidated so users reconnect with Pyrogram.

UPDATE telegram_sessions
SET status = 'disconnected',
    session_string = NULL,
    error_message = 'Sistema atualizado — reconecte sua sessão para continuar'
WHERE session_string IS NOT NULL AND length(session_string) > 10;
