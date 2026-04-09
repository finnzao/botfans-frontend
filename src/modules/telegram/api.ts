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

export interface StatusData {
  id?: string;
  tenantId?: string;
  channel?: string;
  status: string;
  phone?: string;
  hasSession?: boolean;
  hasCredentials?: boolean;
  errorMessage?: string;
  workerBusy?: boolean;
  workerAction?: string;
  flowId?: string;
  sessionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function startFlow(tenantId: string, phone: string) {
  return request<{ flowId: string; skipPortal?: boolean }>('/start', {
    method: 'POST',
    body: JSON.stringify({ tenantId, phone }),
  });
}

export function verifyPortalCode(flowId: string, code: string) {
  return request<{ status: string }>('/verify-portal', {
    method: 'POST',
    body: JSON.stringify({ flowId, code }),
  });
}

export function verifySessionCode(flowId: string, code?: string, password2fa?: string) {
  return request<{ status: string }>('/verify-session', {
    method: 'POST',
    body: JSON.stringify({
      flowId,
      code: code || undefined,
      password2fa: password2fa || undefined,
    }),
  });
}

export function getStatus(tenantId: string) {
  return request<StatusData>(`/status?tenantId=${tenantId}`);
}

export function getFlowStatus(flowId: string) {
  return request<StatusData>(`/status?flowId=${flowId}`);
}

export function getSessionStatus(tenantId: string) {
  return request<StatusData>(`/status?tenantId=${tenantId}`);
}

export function getContacts(tenantId: string) {
  return request<{ contacts: IContact[]; total: number }>(`/contacts?tenantId=${tenantId}`);
}

export function reconnectSession(tenantId: string) {
  return request<{ flowId?: string; status: string; message?: string }>('/reconnect', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

export function disconnectSession(tenantId: string) {
  return request<{ status: string }>('/disconnect', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

export function resetSession(tenantId: string) {
  return request<{ status: string }>('/reset', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

export function initSession(data: { phone: string; apiId: string; apiHash: string; tenantId: string }) {
  return request<{ id: string }>('/init', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function verifyCode(data: { sessionId: string; code: string; password2fa?: string }) {
  return request<{ sessionId: string; status: string }>('/verify', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
