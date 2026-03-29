import type { IChannelSession, SessionStatus } from '@/core/interfaces';

export interface TelegramSession extends IChannelSession {
  channel: 'telegram';
  phone: string;
}

export type OnboardingStep =
  | 'phone'
  | 'portal_code'
  | 'capturing'
  | 'session_code'
  | 'session_2fa'
  | 'configure_ai'
  | 'active';

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
