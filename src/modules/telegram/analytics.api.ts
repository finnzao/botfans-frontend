import type { ApiResponse } from '@/core/interfaces';
import type { FullAnalytics, AnalyticsPeriod } from './analytics.types';
const API = '/api/telegram';
async function request<T>(endpoint: string): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${endpoint}`, { headers: { 'Content-Type': 'application/json' } });
  return res.json();
}
export function getFullAnalytics(tenantId: string, period: AnalyticsPeriod) {
  return request<FullAnalytics>(`/analytics?tenantId=${tenantId}&period=${period}&section=full`);
}
