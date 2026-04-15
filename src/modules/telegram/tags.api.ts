import type { ApiResponse } from '@/core/interfaces';
const API = '/api/telegram';
async function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${endpoint}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  return res.json();
}
export interface TagCount { tag: string; count: number; }
export function getAllTags(tenantId: string) { return request<{ tags: TagCount[]; total: number }>(`/tags?tenantId=${tenantId}`); }
export function getContactTags(tenantId: string, contactId: string) { return request<{ tags: string[] }>(`/tags?tenantId=${tenantId}&contactId=${contactId}`); }
export function modifyContactTags(tenantId: string, contactId: string, action: 'add' | 'remove' | 'set', tags: string[]) { return request<{ tags: string[] }>('/tags', { method: 'POST', body: JSON.stringify({ tenantId, contactId, action, tags }) }); }
export interface AutoTagRule { id: string; tenant_id: string; name: string; description: string | null; tag: string; match_type: 'keyword' | 'regex' | 'ai'; patterns: string[]; match_field: 'message' | 'username' | 'first_name'; apply_once: boolean; is_active: boolean; priority: number; created_at: string; updated_at: string; }
export function getAutoTagRules(tenantId: string) { return request<{ rules: AutoTagRule[]; total: number }>(`/auto-tag-rules?tenantId=${tenantId}`); }
export function createAutoTagRule(data: { tenantId: string; name: string; tag: string; patterns: string[]; matchType?: string; matchField?: string; applyOnce?: boolean; description?: string; priority?: number; }) { return request<AutoTagRule>('/auto-tag-rules', { method: 'POST', body: JSON.stringify(data) }); }
export function updateAutoTagRule(data: { id: string; tenantId: string } & Partial<AutoTagRule>) { return request<AutoTagRule>('/auto-tag-rules', { method: 'PUT', body: JSON.stringify(data) }); }
export function deleteAutoTagRule(id: string, tenantId: string) { return request<void>(`/auto-tag-rules?id=${id}&tenantId=${tenantId}`, { method: 'DELETE' }); }
export interface BroadcastJob { id: string; tenant_id: string; name: string; message_text: string; filter_tags: string[]; filter_no_tags: string[]; filter_is_new: boolean | null; filter_last_contact_days: number | null; status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled' | 'failed'; total_contacts: number; sent_count: number; failed_count: number; rate_limit_per_minute: number; started_at: string | null; completed_at: string | null; created_at: string; }
export interface BroadcastStats { total: number; sent: number; failed: number; pending: number; skipped: number; }
export function getBroadcastJobs(tenantId: string) { return request<{ jobs: BroadcastJob[]; total: number }>(`/broadcast?tenantId=${tenantId}`); }
export function getBroadcastDetail(tenantId: string, jobId: string) { return request<{ job: BroadcastJob; stats: BroadcastStats }>(`/broadcast?tenantId=${tenantId}&jobId=${jobId}`); }
export function createBroadcast(data: { tenantId: string; name: string; messageText: string; filterTags?: string[]; filterNoTags?: string[]; filterIsNew?: boolean | null; filterLastContactDays?: number | null; rateLimitPerMinute?: number; }) { return request<{ job: BroadcastJob; previewCount: number }>('/broadcast', { method: 'POST', body: JSON.stringify(data) }); }
export function startBroadcast(tenantId: string, jobId: string) { return request<{ jobId: string; status: string }>('/broadcast', { method: 'POST', body: JSON.stringify({ tenantId, jobId, action: 'start' }) }); }
export function pauseBroadcast(tenantId: string, jobId: string) { return request<{ jobId: string; status: string }>('/broadcast', { method: 'POST', body: JSON.stringify({ tenantId, jobId, action: 'pause' }) }); }
export function cancelBroadcast(tenantId: string, jobId: string) { return request<{ jobId: string; status: string }>('/broadcast', { method: 'POST', body: JSON.stringify({ tenantId, jobId, action: 'cancel' }) }); }
