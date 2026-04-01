import type { IChannelSession, SessionStatus } from '@/core/interfaces';

export interface TelegramSession extends IChannelSession {
  channel: 'telegram';
  phone: string;
  hasSession?: boolean;
}

export type OnboardingStep =
  | 'phone'
  | 'portal_code'
  | 'capturing'
  | 'session_code'
  | 'session_2fa'
  | 'configure_ai'
  | 'active'
  | 'reconnecting'
  | 'disconnected';

export function statusToStep(status: SessionStatus | string): OnboardingStep {
  const map: Record<string, OnboardingStep> = {
    idle: 'phone',
    awaiting_portal_code: 'portal_code',
    portal_authenticated: 'capturing',
    capturing_api: 'capturing',
    api_captured: 'capturing',
    verifying_code: 'capturing',
    verifying_2fa: 'capturing',
    awaiting_session_code: 'session_code',
    awaiting_2fa: 'session_2fa',
    active: 'active',
    reconnecting: 'reconnecting',
    disconnected: 'disconnected',
    error: 'phone',
    not_configured: 'phone',
  };
  return map[status] || 'phone';
}
