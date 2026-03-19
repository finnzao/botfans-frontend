import type { IChannelSession, SessionStatus } from '@/core/interfaces';

export interface TelegramSession extends IChannelSession {
  channel: 'telegram';
  phone: string;
}

/**
 * Etapas do onboarding simplificado.
 * A cliente só vê: número → código portal → aguarde → código sessão → (2FA?) → perfil IA → ativo
 */
export type OnboardingStep =
  | 'phone'                 // Digita apenas o número
  | 'portal_code'           // Código que chegou no Telegram (para my.telegram.org)
  | 'capturing'             // Aguarde... capturando api_id/api_hash automaticamente
  | 'session_code'          // Segundo código (para autenticar Telethon)
  | 'session_2fa'           // Senha 2FA (se a conta tiver)
  | 'configure_ai'          // Configura perfil da IA
  | 'active';               // Selfbot rodando

/** Mapa de status do backend → step do frontend */
export function statusToStep(status: SessionStatus | string): OnboardingStep {
  const map: Record<string, OnboardingStep> = {
    idle: 'phone',
    awaiting_portal_code: 'portal_code',
    portal_authenticated: 'capturing',
    capturing_api: 'capturing',
    api_captured: 'capturing',
    awaiting_session_code: 'session_code',
    awaiting_2fa: 'session_2fa',
    active: 'active',
    disconnected: 'phone',
    error: 'phone',
    not_configured: 'phone',
  };
  return map[status] || 'phone';
}
