export type ChannelType = 'telegram' | 'whatsapp' | 'instagram';

export type SessionStatus =
  | 'idle'
  | 'awaiting_portal_code'
  | 'portal_authenticated'
  | 'capturing_api'
  | 'api_captured'
  | 'awaiting_session_code'
  | 'awaiting_2fa'
  | 'active'
  | 'disconnected'
  | 'error';

export interface IChannelSession {
  id: string;
  tenantId: string;
  channel: ChannelType;
  status: SessionStatus;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IChannelProvider {
  readonly channel: ChannelType;
  initSession(tenantId: string, phone: string): Promise<IChannelSession>;
  verifyCode(sessionId: string, code: string, password2fa?: string): Promise<IChannelSession>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  disconnect(sessionId: string): Promise<void>;
}

export interface IContact {
  id: string;
  tenantId: string;
  channel: ChannelType;
  externalUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  captureData: Record<string, string>;
  tags: string[];
  isNew: boolean;
  firstContactAt: string;
  lastContactAt: string;
}

export type MessageDirection = 'incoming' | 'outgoing';
export type RespondedBy = 'ai' | 'human';

export interface IMessage {
  id: string;
  tenantId: string;
  contactId: string;
  direction: MessageDirection;
  content: string;
  respondedBy: RespondedBy;
  createdAt: string;
}

export interface IAiProfile {
  id: string;
  tenantId: string;
  businessName: string;
  tone: string;
  welcomeMessage: string;
  systemPrompt: string;
  captureFields: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
