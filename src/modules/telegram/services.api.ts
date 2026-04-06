import type { ApiResponse } from '@/core/interfaces';

const API = '/api/telegram';

async function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

export interface Service {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  price_cents: number;
  currency: string;
  is_active: boolean;
  requires_approval: boolean;
  trigger_keywords: string[];
  followup_questions: FollowupQuestion[];
  delivery_method: string;
  max_per_day: number | null;
  schedule_required: boolean;
  expiration_hours: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FollowupQuestion {
  field: string;
  question: string;
  required: boolean;
}

export interface Order {
  id: string;
  tenant_id: string;
  contact_id: string;
  service_id: string;
  status: OrderStatus;
  custom_details: string | null;
  collected_data: Record<string, string>;
  scheduled_at: string | null;
  price_cents: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  payment_reference: string | null;
  delivery_method: string | null;
  delivered_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  service_name: string;
  service_category: string;
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
}

export type OrderStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected'
  | 'awaiting_payment' | 'paid' | 'in_production'
  | 'delivered' | 'cancelled' | 'expired';

export function getServices(tenantId: string, activeOnly = false) {
  const qs = activeOnly ? `&activeOnly=true` : '';
  return request<{ services: Service[]; total: number }>(
    `/services?tenantId=${tenantId}${qs}`
  );
}

export function createService(data: Partial<Service> & { tenantId: string; name: string; slug: string }) {
  return request<Service>('/services', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateService(data: Partial<Service> & { id: string; tenantId: string }) {
  return request<Service>('/services', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteService(id: string, tenantId: string) {
  return request<void>(`/services?id=${id}&tenantId=${tenantId}`, { method: 'DELETE' });
}

export function getOrders(tenantId: string, status?: string) {
  const qs = status ? `&status=${status}` : '';
  return request<{ orders: Order[]; total: number }>(
    `/orders?tenantId=${tenantId}${qs}`
  );
}

export function updateOrderStatus(id: string, tenantId: string, status: string, notes?: string) {
  return request<{ id: string; status: string }>('/orders', {
    method: 'PUT',
    body: JSON.stringify({ id, tenantId, status, notes }),
  });
}
