'use client';

import type { ReactNode } from 'react';

interface Props {
  activePage: 'telegram' | 'analytics' | 'services' | 'orders';
  tenantName?: string;
  onLogout?: () => void;
}

const NAV_ITEMS = [
  { key: 'telegram', href: '/telegram', label: 'Telegram', icon: 'send' },
  { key: 'services', href: '/telegram/services', label: 'Serviços', icon: 'tag' },
  { key: 'orders', href: '/telegram/orders', label: 'Pedidos', icon: 'file' },
  { key: 'analytics', href: '/telegram/analytics', label: 'Analytics', icon: 'chart' },
] as const;

const ICONS: Record<string, ReactNode> = {
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  ),
  tag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  file: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
    </svg>
  ),
};

export function Sidebar({ activePage, tenantName, onLogout }: Props) {
  const initial = tenantName?.[0]?.toUpperCase() || 'U';

  return (
    <aside style={s.sidebar}>
      <div style={s.logo}>
        <div style={s.logoIcon}>B</div>
        <span style={s.logoText}>BotFans</span>
      </div>

      <nav style={s.nav}>
        {NAV_ITEMS.map(item => (
          <a
            key={item.key}
            href={item.href}
            style={{
              ...s.navItem,
              ...(activePage === item.key ? s.navActive : {}),
            }}
          >
            {ICONS[item.icon]}
            {item.label}
          </a>
        ))}

        <span style={s.navDisabled}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          WhatsApp
          <span style={s.badge}>Em breve</span>
        </span>
      </nav>

      <div style={s.sidebarFooter}>
        <div style={s.tenantInfo}>
          <div style={s.tenantAvatar}>{initial}</div>
          <div style={{ flex: 1 }}>
            <p style={s.tenantName}>{tenantName || 'Minha Conta'}</p>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={s.logoutBtn} title="Sair">✕</button>
          )}
        </div>
      </div>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 230, background: '#fff', borderRight: '1px solid #e5e7eb',
    padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 20px 24px', borderBottom: '1px solid #f0f0f0', marginBottom: 16,
  },
  logoIcon: {
    width: 32, height: 32, borderRadius: 8, background: '#185FA5', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700,
  },
  logoText: { fontSize: 17, fontWeight: 700, color: '#1a1a1a' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#333', textDecoration: 'none',
  },
  navActive: { background: '#E6F1FB', color: '#185FA5' },
  navDisabled: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    borderRadius: 8, fontSize: 14, color: '#bbb', cursor: 'default',
  },
  badge: {
    marginLeft: 'auto', fontSize: 10, background: '#f5f5f5', color: '#aaa',
    padding: '2px 6px', borderRadius: 6,
  },
  sidebarFooter: { marginTop: 'auto', padding: '16px 16px 0', borderTop: '1px solid #f0f0f0' },
  tenantInfo: { display: 'flex', alignItems: 'center', gap: 10 },
  tenantAvatar: {
    width: 32, height: 32, borderRadius: '50%', background: '#EEEDFE', color: '#534AB7',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 600,
  },
  tenantName: { fontSize: 13, fontWeight: 500, margin: 0, color: '#333' },
  logoutBtn: {
    background: 'none', border: 'none', color: '#999', cursor: 'pointer',
    fontSize: 14, padding: '4px 8px', borderRadius: 4,
  },
};
