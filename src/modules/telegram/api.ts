import type { ApiResponse, IContact } from '@/core/interfaces';
import type { TelegramSession } from './types';

const API = '/api/telegram';

async function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

/** Passo 1: Envia número, backend faz request ao my.telegram.org/auth/send_password */
export function startFlow(tenantId: string, phone: string) {
  return request<{ flowId: string }>('/start', {
    method: 'POST',
    body: JSON.stringify({ tenantId, phone }),
  });
}

/** Passo 2: Envia código do portal (my.telegram.org), backend faz login e captura api_id/api_hash */
export function verifyPortalCode(flowId: string, code: string) {
  return request<{ status: string }>('/verify-portal', {
    method: 'POST',
    body: JSON.stringify({ flowId, code }),
  });
}

/** Passo 3: Envia código da sessão Telethon (+ senha 2FA opcional) */
export function verifySessionCode(flowId: string, code: string, password2fa?: string) {
  return request<{ status: string }>('/verify-session', {
    method: 'POST',
    body: JSON.stringify({ flowId, code, password2fa }),
  });
}

/** Consulta status atual */
export function getStatus(tenantId: string) {
  return request<TelegramSession & { status: string; flowId?: string; hasSession?: boolean }>(`/status?tenantId=${tenantId}`);
}

/** Consulta status por flowId (polling durante onboarding) */
export function getFlowStatus(flowId: string) {
  return request<{ status: string; flowId: string; sessionId: string; errorMessage?: string }>(`/status?flowId=${flowId}`);
}

/** Consulta status por sessão (usado pelo hook de polling) */
export function getSessionStatus(tenantId: string) {
  return request<TelegramSession & { status: string; id?: string }>(`/status?tenantId=${tenantId}`);
}

/** Lista contatos capturados */
export function getContacts(tenantId: string) {
  return request<{ contacts: IContact[]; total: number }>(`/contacts?tenantId=${tenantId}`);
}

/** Reconectar sessão existente (sem pedir código) */
export function reconnectSession(tenantId: string) {
  return request<{ flowId?: string; status: string; message?: string }>('/reconnect', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

/** Desconectar sessão (preserva session_string para reconexão futura) */
export function disconnectSession(tenantId: string) {
  return request<{ status: string }>('/disconnect', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

/** Inicia sessão com credenciais manuais (fluxo antigo) */
export function initSession(data: { phone: string; apiId: string; apiHash: string; tenantId: string }) {
  return request<{ id: string }>('/init', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Verifica código (fluxo antigo) */
export function verifyCode(data: { sessionId: string; code: string; password2fa?: string }) {
  return request<{ sessionId: string; status: string }>('/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
