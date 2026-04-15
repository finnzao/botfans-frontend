import type { ApiResponse } from '@/core/interfaces';
const API = '/api/telegram';
async function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API}${endpoint}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  return res.json();
}
export interface AiProfile {
  id: string; tenantId: string; businessName: string; tone: string; welcomeMessage: string | null; systemPrompt: string | null;
  autoApproveOrders: boolean; businessHours: Record<string, string[]> | null; maxOrdersPerDay: number | null;
  paymentInstructions: string | null; serviceMenuMessage: string | null; greetingMorning: string | null;
  greetingAfternoon: string | null; greetingEvening: string | null; personalityTraits: string[]; forbiddenTopics: string[];
  fallbackMessage: string | null; contentCategories: string[]; upsellEnabled: boolean; upsellMessage: string | null;
  responseStyle: string; useEmojis: boolean; useAudioResponses: boolean; maxMessageLength: number;
  awayMessage: string | null; isConfigured: boolean; createdAt: string; updatedAt: string;
}
export function getAiProfile(tenantId: string) { return request<{ profile: AiProfile | null; isConfigured: boolean }>(`/ai-profile?tenantId=${tenantId}`); }
export function saveAiProfile(data: Partial<AiProfile> & { tenantId: string; businessName: string }) { return request<void>('/ai-profile', { method: 'POST', body: JSON.stringify(data) }); }
