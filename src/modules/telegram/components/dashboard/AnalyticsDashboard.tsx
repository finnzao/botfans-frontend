'use client';

import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { AreaChart } from './AreaChart';
import { MiniBarChart } from './MiniBarChart';
import { HeatmapGrid } from './HeatmapGrid';
import { TopContactsTable } from './TopContactsTable';
import { RecentMessagesFeed } from './RecentMessagesFeed';
import { PeriodSelector } from './PeriodSelector';
import { ResponseTimeChart } from './ResponseTimeChart';
import type { TimeSeriesPoint, HourlyPoint, DayOfWeekPoint } from '../../analytics.types';

interface Props {
  tenantId: string;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatHour(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getHours()}h`;
}

function buildTimeSeriesData(raw: TimeSeriesPoint[], period: string) {
  return raw.map(p => ({
    label: period === '24h' ? formatHour(p.date) : formatDate(p.date),
    values: [
      { key: 'incoming', value: parseInt(String(p.incoming)), color: '#185FA5' },
      { key: 'outgoing', value: parseInt(String(p.outgoing)), color: '#0F6E56' },
    ],
  }));
}

function buildHourlyData(raw: HourlyPoint[]) {
  return raw.map(p => ({
    label: `${p.hour}h`,
    value: p.count,
  }));
}

function buildDayOfWeekData(raw: DayOfWeekPoint[]) {
  return raw.map(p => ({
    label: DAY_NAMES[p.dayOfWeek],
    value: p.count,
  }));
}

function MessageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function AnalyticsDashboard({ tenantId }: Props) {
  const { data, loading, error, period, setPeriod, refresh } = useAnalytics(tenantId);

  if (loading && !data) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Carregando analytics...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={styles.errorBox}>
        <p style={styles.errorText}>{error}</p>
        <button onClick={refresh} style={styles.retryBtn}>Tentar novamente</button>
      </div>
    );
  }

  if (!data) return null;

  const { overview, messagesOverTime, hourlyDistribution, dayOfWeekDistribution, topContacts, contactGrowth, responseTimeDistribution, recentMessages } = data;
  const cur = overview.current;
  const prev = overview.previous;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div>
          <h2 style={styles.pageTitle}>Analytics</h2>
          <p style={styles.pageSubtitle}>Visão geral das conversas e contatos</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div style={styles.metricsGrid}>
        <MetricCard
          label="Total de mensagens"
          value={parseInt(String(cur.total_messages)).toLocaleString('pt-BR')}
          currentValue={parseInt(String(cur.total_messages))}
          previousValue={parseInt(String(prev.total_messages))}
          icon={<MessageIcon />}
          color="#185FA5"
          bgColor="#E6F1FB"
        />
        <MetricCard
          label="Contatos ativos"
          value={parseInt(String(cur.active_contacts)).toLocaleString('pt-BR')}
          currentValue={parseInt(String(cur.active_contacts))}
          previousValue={parseInt(String(prev.active_contacts))}
          icon={<ActivityIcon />}
          color="#0F6E56"
          bgColor="#E1F5EE"
        />
        <MetricCard
          label="Novos contatos"
          value={parseInt(String(cur.new_contacts)).toLocaleString('pt-BR')}
          currentValue={parseInt(String(cur.new_contacts))}
          previousValue={parseInt(String(prev.new_contacts))}
          icon={<UsersIcon />}
          color="#534AB7"
          bgColor="#EEEDFE"
        />
        <MetricCard
          label="Tempo médio de resposta"
          value={formatMs(cur.avg_response_time_ms ? parseInt(String(cur.avg_response_time_ms)) : null)}
          icon={<ClockIcon />}
          color="#B87A00"
          bgColor="#FAEEDA"
        />
      </div>

      <div style={styles.chartsRow}>
        <div style={styles.chartMain}>
          <ChartCard title="Volume de mensagens" subtitle="Recebidas vs enviadas ao longo do tempo">
            <AreaChart
              data={buildTimeSeriesData(messagesOverTime, period)}
              height={220}
            />
          </ChartCard>
        </div>
        <div style={styles.chartSide}>
          <ChartCard title="Horários de pico" subtitle="Mensagens recebidas por hora">
            <MiniBarChart
              data={buildHourlyData(hourlyDistribution)}
              height={180}
              barColor="#185FA5"
              showValues={false}
            />
          </ChartCard>
        </div>
      </div>

      <div style={styles.chartsRow}>
        <div style={styles.chartHalf}>
          <ChartCard title="Dia da semana" subtitle="Distribuição de mensagens">
            <HeatmapGrid
              data={buildDayOfWeekData(dayOfWeekDistribution)}
              cellSize={60}
            />
          </ChartCard>
        </div>
        <div style={styles.chartHalf}>
          <ChartCard title="Tempo de resposta" subtitle="Distribuição das respostas da IA">
            <ResponseTimeChart data={responseTimeDistribution} />
          </ChartCard>
        </div>
      </div>

      <div style={styles.chartsRow}>
        <div style={styles.chartMain}>
          <ChartCard title="Contatos mais ativos" subtitle={`Top ${topContacts.length} no período`}>
            <TopContactsTable contacts={topContacts} />
          </ChartCard>
        </div>
        <div style={styles.chartSide}>
          <ChartCard title="Crescimento de contatos" subtitle="Novos contatos ao longo do tempo">
            <MiniBarChart
              data={contactGrowth.map(p => ({
                label: formatDate(p.date),
                value: parseInt(String(p.new_contacts)),
              }))}
              height={180}
              barColor="#534AB7"
              showValues
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Mensagens recentes" subtitle="Últimas conversas">
        <RecentMessagesFeed messages={recentMessages} />
      </ChartCard>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 20 },
  topBar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  pageTitle: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 2px' },
  pageSubtitle: { fontSize: 13, color: '#9ca3af', margin: 0 },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
  },
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: 12,
  },
  chartMain: { minWidth: 0 },
  chartSide: { minWidth: 0 },
  chartHalf: { minWidth: 0 },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #185FA5',
    borderRadius: '50%',
    marginBottom: 12,
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { fontSize: 14, color: '#888' },
  errorBox: {
    padding: '2rem',
    textAlign: 'center',
    background: '#FCEBEB',
    borderRadius: 12,
    border: '1px solid #F5C6C6',
  },
  errorText: { fontSize: 14, color: '#A32D2D', margin: '0 0 12px' },
  retryBtn: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 500,
    background: '#A32D2D',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
};
