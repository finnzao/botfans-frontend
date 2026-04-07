-- Migration: extend_ai_profiles_for_assistant_page
-- Adds fields for comprehensive AI assistant configuration

-- Greeting variants for different times of day
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS greeting_morning TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS greeting_afternoon TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS greeting_evening TEXT DEFAULT NULL;

-- Personality and behavior
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS personality_traits TEXT[] DEFAULT '{}';
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS forbidden_topics TEXT[] DEFAULT '{}';
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS fallback_message TEXT DEFAULT NULL;

-- Content delivery
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS content_categories TEXT[] DEFAULT '{}';
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS upsell_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS upsell_message TEXT DEFAULT NULL;

-- Response behavior
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS response_style VARCHAR(30) DEFAULT 'balanced'
    CHECK (response_style IN ('minimal', 'balanced', 'detailed', 'seductive'));
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS use_emojis BOOLEAN DEFAULT true;
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS use_audio_responses BOOLEAN DEFAULT false;
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS max_message_length INTEGER DEFAULT 500;

-- Availability
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS away_message TEXT DEFAULT NULL;
ALTER TABLE ai_profiles
  ADD COLUMN IF NOT EXISTS is_configured BOOLEAN DEFAULT false;

COMMENT ON COLUMN ai_profiles.personality_traits IS 'Traços de personalidade da IA: sensual, carinhosa, direta, misteriosa, etc';
COMMENT ON COLUMN ai_profiles.forbidden_topics IS 'Tópicos que a IA deve recusar: encontros presenciais, dados pessoais, etc';
COMMENT ON COLUMN ai_profiles.content_categories IS 'Categorias de conteúdo oferecido: fotos, vídeos, lives, etc';
COMMENT ON COLUMN ai_profiles.response_style IS 'Estilo de resposta: minimal, balanced, detailed, seductive';
COMMENT ON COLUMN ai_profiles.is_configured IS 'Se o perfil foi configurado pelo menos uma vez (gate para funcionalidades)';
