'use client';
import type { ResponseTimeDistribution } from '../../analytics.types';
interface Props { data: ResponseTimeDistribution; }
const BUCKET_LABELS: Record<string, string> = { under_5s: '< 5s', '5s_to_15s': '5-15s', '15s_to_1m': '15s-1m', '1m_to_5m': '1-5m', over_5m: '> 5m' };
const BUCKET_COLORS: Record<string, string> = { under_5s: '#0F6E56', '5s_to_15s': '#3B9B74', '15s_to_1m': '#F5A623', '1m_to_5m': '#E88B3A', over_5m: '#A32D2D' };
export function ResponseTimeChart({ data }: Props) {
  const entries = Object.entries(data) as [string, number][]; const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sem dados de tempo de resposta</div>;
  return (<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', background: '#f0f2f5' }}>
      {entries.map(([key, val]) => { const pct = (val / total) * 100; if (pct === 0) return null; return <div key={key} title={`${BUCKET_LABELS[key]}: ${val} (${pct.toFixed(0)}%)`} style={{ width: `${pct}%`, background: BUCKET_COLORS[key], minWidth: pct > 0 ? 4 : 0 }} />; })}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {entries.map(([key, val]) => (<div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_COLORS[key] }} /><span style={{ fontSize: 11, color: '#6b7280' }}>{BUCKET_LABELS[key]}: <strong style={{ color: '#333' }}>{val}</strong></span></div>))}
    </div>
  </div>);
}
