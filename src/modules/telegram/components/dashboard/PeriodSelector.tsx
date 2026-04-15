'use client';
import type { AnalyticsPeriod } from '../../analytics.types';
interface Props { value: AnalyticsPeriod; onChange: (period: AnalyticsPeriod) => void; }
const OPTIONS: { value: AnalyticsPeriod; label: string }[] = [{ value: '24h', label: '24h' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }];
export function PeriodSelector({ value, onChange }: Props) {
  return (<div style={{ display: 'flex', gap: 2, background: '#f0f2f5', borderRadius: 8, padding: 2 }}>
    {OPTIONS.map(opt => (<button key={opt.value} onClick={() => onChange(opt.value)} style={{ padding: '6px 12px', fontSize: 12, fontWeight: opt.value === value ? 600 : 500, border: 'none', borderRadius: 6, background: opt.value === value ? '#fff' : 'transparent', color: opt.value === value ? '#185FA5' : '#6b7280', cursor: 'pointer', boxShadow: opt.value === value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>{opt.label}</button>))}
  </div>);
}
