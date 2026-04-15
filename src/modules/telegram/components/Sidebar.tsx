'use client';
interface Props { activePage: 'telegram' | 'analytics' | 'services' | 'orders'; tenantName?: string; onLogout?: () => void; }
export function Sidebar({ tenantName, onLogout }: Props) {
  const initial = tenantName?.[0]?.toUpperCase() || 'U';
  return (<aside style={{ width: 230, background: '#fff', borderRight: '1px solid #e5e7eb', padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 24px' }}><div style={{ width: 32, height: 32, borderRadius: 8, background: '#185FA5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>B</div><span style={{ fontSize: 17, fontWeight: 700 }}>BotFans</span></div>
    <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEEDFE', color: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{initial}</div>
      <p style={{ fontSize: 13, fontWeight: 500, margin: 0, flex: 1 }}>{tenantName || 'Minha Conta'}</p>
      {onLogout && <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 14 }}>✕</button>}
    </div>
  </aside>);
}
