'use client';
interface Props { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode; }
export function ChartCard({ title, subtitle, children, action }: Props) {
  return (<div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px 0' }}><div><h3 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px' }}>{title}</h3>{subtitle && <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{subtitle}</p>}</div>{action && <div>{action}</div>}</div>
    <div style={{ padding: '16px 20px 20px' }}>{children}</div>
  </div>);
}
