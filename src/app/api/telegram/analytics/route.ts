import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

interface AnalyticsQuery {
  tenantId: string;
  period: string;
  startDate?: string;
  endDate?: string;
}

function getPeriodInterval(period: string): string {
  const intervals: Record<string, string> = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '24h': '24 hours',
  };
  return intervals[period] || '30 days';
}

function parseQuery(req: NextRequest): AnalyticsQuery {
  const tenantId = req.nextUrl.searchParams.get('tenantId') || '';
  const period = req.nextUrl.searchParams.get('period') || '30d';
  const startDate = req.nextUrl.searchParams.get('startDate') || undefined;
  const endDate = req.nextUrl.searchParams.get('endDate') || undefined;
  return { tenantId, period, startDate, endDate };
}

async function getOverviewMetrics(tenantId: string, interval: string) {
  const result = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval) as total_messages,
      (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND direction = 'incoming' AND created_at >= NOW() - $2::interval) as incoming_messages,
      (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND direction = 'outgoing' AND created_at >= NOW() - $2::interval) as outgoing_messages,
      (SELECT COUNT(*) FROM contacts WHERE tenant_id = $1 AND first_contact_at >= NOW() - $2::interval) as new_contacts,
      (SELECT COUNT(*) FROM contacts WHERE tenant_id = $1) as total_contacts,
      (SELECT COUNT(DISTINCT contact_id) FROM messages WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval) as active_contacts,
      (SELECT ROUND(AVG(response_time_ms)) FROM messages WHERE tenant_id = $1 AND direction = 'outgoing' AND response_time_ms IS NOT NULL AND created_at >= NOW() - $2::interval) as avg_response_time_ms,
      (SELECT ROUND(AVG(word_count)) FROM messages WHERE tenant_id = $1 AND direction = 'incoming' AND created_at >= NOW() - $2::interval) as avg_message_length`,
    [tenantId, interval]
  );
  return result.rows[0];
}

async function getPreviousOverviewMetrics(tenantId: string, interval: string) {
  const result = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at >= NOW() - ($2::interval * 2) AND created_at < NOW() - $2::interval) as total_messages,
      (SELECT COUNT(*) FROM contacts WHERE tenant_id = $1 AND first_contact_at >= NOW() - ($2::interval * 2) AND first_contact_at < NOW() - $2::interval) as new_contacts,
      (SELECT COUNT(DISTINCT contact_id) FROM messages WHERE tenant_id = $1 AND created_at >= NOW() - ($2::interval * 2) AND created_at < NOW() - $2::interval) as active_contacts`,
    [tenantId, interval]
  );
  return result.rows[0];
}

async function getMessagesOverTime(tenantId: string, interval: string, period: string) {
  const groupBy = ['24h'].includes(period) ? 'hour' : 'day';
  const truncExpr = groupBy === 'hour' ? "date_trunc('hour', created_at)" : "date_trunc('day', created_at)";

  const result = await db.query(
    `SELECT
      ${truncExpr} as date,
      COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
      COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing
    FROM messages
    WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval
    GROUP BY date
    ORDER BY date`,
    [tenantId, interval]
  );
  return result.rows;
}

async function getHourlyDistribution(tenantId: string, interval: string) {
  const result = await db.query(
    `SELECT
      EXTRACT(HOUR FROM created_at)::int as hour,
      COUNT(*) as count
    FROM messages
    WHERE tenant_id = $1 AND direction = 'incoming' AND created_at >= NOW() - $2::interval
    GROUP BY hour
    ORDER BY hour`,
    [tenantId, interval]
  );

  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: 0,
  }));

  for (const row of result.rows) {
    hours[row.hour].count = parseInt(row.count);
  }

  return hours;
}

async function getTopContacts(tenantId: string, interval: string, limit = 10) {
  const result = await db.query(
    `SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.telegram_username,
      c.is_new,
      c.first_contact_at,
      c.last_contact_at,
      c.tags,
      COUNT(m.id) as message_count,
      COUNT(m.id) FILTER (WHERE m.direction = 'incoming') as sent_count,
      COUNT(m.id) FILTER (WHERE m.direction = 'outgoing') as received_count,
      MAX(m.created_at) as last_message_at
    FROM contacts c
    LEFT JOIN messages m ON m.contact_id = c.id AND m.created_at >= NOW() - $2::interval
    WHERE c.tenant_id = $1
    GROUP BY c.id
    HAVING COUNT(m.id) > 0
    ORDER BY message_count DESC
    LIMIT $3`,
    [tenantId, interval, limit]
  );
  return result.rows;
}

async function getContactGrowth(tenantId: string, interval: string, period: string) {
  const truncExpr = ['24h'].includes(period) ? "date_trunc('hour', first_contact_at)" : "date_trunc('day', first_contact_at)";

  const result = await db.query(
    `SELECT
      ${truncExpr} as date,
      COUNT(*) as new_contacts,
      SUM(COUNT(*)) OVER (ORDER BY ${truncExpr}) as cumulative
    FROM contacts
    WHERE tenant_id = $1 AND first_contact_at >= NOW() - $2::interval
    GROUP BY date
    ORDER BY date`,
    [tenantId, interval]
  );
  return result.rows;
}

async function getResponseTimeDistribution(tenantId: string, interval: string) {
  const result = await db.query(
    `SELECT
      CASE
        WHEN response_time_ms < 5000 THEN 'under_5s'
        WHEN response_time_ms < 15000 THEN '5s_to_15s'
        WHEN response_time_ms < 60000 THEN '15s_to_1m'
        WHEN response_time_ms < 300000 THEN '1m_to_5m'
        ELSE 'over_5m'
      END as bucket,
      COUNT(*) as count
    FROM messages
    WHERE tenant_id = $1 AND direction = 'outgoing' AND response_time_ms IS NOT NULL AND created_at >= NOW() - $2::interval
    GROUP BY bucket`,
    [tenantId, interval]
  );

  const buckets: Record<string, number> = {
    under_5s: 0,
    '5s_to_15s': 0,
    '15s_to_1m': 0,
    '1m_to_5m': 0,
    over_5m: 0,
  };

  for (const row of result.rows) {
    buckets[row.bucket] = parseInt(row.count);
  }

  return buckets;
}

async function getDayOfWeekDistribution(tenantId: string, interval: string) {
  const result = await db.query(
    `SELECT
      EXTRACT(DOW FROM created_at)::int as day_of_week,
      COUNT(*) as count
    FROM messages
    WHERE tenant_id = $1 AND direction = 'incoming' AND created_at >= NOW() - $2::interval
    GROUP BY day_of_week
    ORDER BY day_of_week`,
    [tenantId, interval]
  );

  const days = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    count: 0,
  }));

  for (const row of result.rows) {
    days[row.day_of_week].count = parseInt(row.count);
  }

  return days;
}

async function getRecentMessages(tenantId: string, limit = 20) {
  const result = await db.query(
    `SELECT
      m.id,
      m.direction,
      m.content,
      m.responded_by,
      m.created_at,
      m.sentiment,
      m.category,
      m.word_count,
      c.first_name,
      c.last_name,
      c.telegram_username
    FROM messages m
    JOIN contacts c ON c.id = m.contact_id
    WHERE m.tenant_id = $1
    ORDER BY m.created_at DESC
    LIMIT $2`,
    [tenantId, limit]
  );
  return result.rows;
}

export async function GET(req: NextRequest) {
  const { tenantId, period } = parseQuery(req);
  const section = req.nextUrl.searchParams.get('section') || 'overview';

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  const interval = getPeriodInterval(period);

  try {
    switch (section) {
      case 'overview': {
        const [current, previous] = await Promise.all([
          getOverviewMetrics(tenantId, interval),
          getPreviousOverviewMetrics(tenantId, interval),
        ]);
        return NextResponse.json({
          success: true,
          data: { current, previous },
        });
      }

      case 'messages-over-time': {
        const data = await getMessagesOverTime(tenantId, interval, period);
        return NextResponse.json({ success: true, data });
      }

      case 'hourly-distribution': {
        const data = await getHourlyDistribution(tenantId, interval);
        return NextResponse.json({ success: true, data });
      }

      case 'day-of-week': {
        const data = await getDayOfWeekDistribution(tenantId, interval);
        return NextResponse.json({ success: true, data });
      }

      case 'top-contacts': {
        const data = await getTopContacts(tenantId, interval);
        return NextResponse.json({ success: true, data });
      }

      case 'contact-growth': {
        const data = await getContactGrowth(tenantId, interval, period);
        return NextResponse.json({ success: true, data });
      }

      case 'response-time': {
        const data = await getResponseTimeDistribution(tenantId, interval);
        return NextResponse.json({ success: true, data });
      }

      case 'recent-messages': {
        const data = await getRecentMessages(tenantId);
        return NextResponse.json({ success: true, data });
      }

      case 'full': {
        const [
          overviewData,
          previousData,
          messagesOverTime,
          hourly,
          dayOfWeek,
          topContacts,
          contactGrowth,
          responseTime,
          recentMessages,
        ] = await Promise.all([
          getOverviewMetrics(tenantId, interval),
          getPreviousOverviewMetrics(tenantId, interval),
          getMessagesOverTime(tenantId, interval, period),
          getHourlyDistribution(tenantId, interval),
          getDayOfWeekDistribution(tenantId, interval),
          getTopContacts(tenantId, interval),
          getContactGrowth(tenantId, interval, period),
          getResponseTimeDistribution(tenantId, interval),
          getRecentMessages(tenantId),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            overview: { current: overviewData, previous: previousData },
            messagesOverTime,
            hourlyDistribution: hourly,
            dayOfWeekDistribution: dayOfWeek,
            topContacts,
            contactGrowth,
            responseTimeDistribution: responseTime,
            recentMessages,
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Seção inválida: ${section}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro ao buscar analytics:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
