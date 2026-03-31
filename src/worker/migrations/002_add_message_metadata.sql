-- Migration: add_message_metadata
-- Adiciona campos extras para mensagens (tipo de mídia, reply_to)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;

COMMENT ON COLUMN messages.media_type IS 'Tipo de mídia: text, photo, video, document, voice, sticker';
COMMENT ON COLUMN messages.reply_to_message_id IS 'ID da mensagem que esta responde (para threading)';

-- Índice para buscar replies
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
