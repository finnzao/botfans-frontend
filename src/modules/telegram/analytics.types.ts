export interface OverviewMetrics {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  newContacts: number;
  totalContacts: number;
  activeContacts: number;
  avgResponseTimeMs: number | null;
  avgMessageLength: number | null;
}

export interface OverviewComparison {
  current: OverviewMetrics;
  previous: {
    totalMessages: number;
    newContacts: number;
    activeContacts: number;
  };
}

export interface TimeSeriesPoint {
  date: string;
  incoming: number;
  outgoing: number;
}

export interface HourlyPoint {
  hour: number;
  count: number;
}

export interface DayOfWeekPoint {
  dayOfWeek: number;
  count: number;
}

export interface TopContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
  is_new: boolean;
  first_contact_at: string;
  last_contact_at: string;
  tags: string[];
  message_count: number;
  sent_count: number;
  received_count: number;
  last_message_at: string;
}

export interface ContactGrowthPoint {
  date: string;
  new_contacts: number;
  cumulative: number;
}

export interface ResponseTimeDistribution {
  under_5s: number;
  '5s_to_15s': number;
  '15s_to_1m': number;
  '1m_to_5m': number;
  over_5m: number;
}

export interface RecentMessage {
  id: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  responded_by: 'ai' | 'human';
  created_at: string;
  sentiment: string | null;
  category: string | null;
  word_count: number;
  first_name: string | null;
  last_name: string | null;
  telegram_username: string | null;
}

export interface FullAnalytics {
  overview: OverviewComparison;
  messagesOverTime: TimeSeriesPoint[];
  hourlyDistribution: HourlyPoint[];
  dayOfWeekDistribution: DayOfWeekPoint[];
  topContacts: TopContact[];
  contactGrowth: ContactGrowthPoint[];
  responseTimeDistribution: ResponseTimeDistribution;
  recentMessages: RecentMessage[];
}

export type AnalyticsPeriod = '24h' | '7d' | '30d' | '90d';
