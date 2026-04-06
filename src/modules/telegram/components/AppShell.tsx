'use client';

import { useState, type ReactNode } from 'react';
import { useTenant } from '@/core/lib/tenant-context';
import { useTelegramSession } from '@/modules/telegram/hooks/useTelegramSession';
import { ProfileDropdown } from './ProfileDropdown';
import { ProfileModal } from './ProfileModal';

type TabKey = 'connection' | 'services' | 'orders' | 'analytics';

interface Props {
  activeTab: TabKey;
  children: ReactNode;
}

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: 'connection', label: 'Conexão', href: '/telegram/connection' },
  { key: 'services', label: 'Serviços', href: '/telegram/services' },
  { key: 'orders', label: 'Pedidos', href: '/telegram/orders' },
  { key: 'analytics', label: 'Analytics', href: '/telegram/analytics' },
];

function formatPhone(phone: string): string {
  if (phone.startsWith('+55') && phone.length >= 13) {
    const d = phone.slice(3);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return phone;
}

function StatusDot({ status }: { status: 'active' | 'disconnected' | 'setup' }) {
  const colors = {
    active: { bg: 'var(--green)', shadow: 'rgba(5, 150, 105, 0.3)' },
    disconnected: { bg: 'var(--amber)', shadow: 'rgba(217, 119, 6, 0.3)' },
    setup: { bg: 'var(--text-tertiary)', shadow: 'rgba(156, 163, 175, 0.3)' },
  };
  const c = colors[status];
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: c.bg, boxShadow: `0 0 0 3px ${c.shadow}`, flexShrink: 0,
      animation: status === 'active' ? 'pulse 2s infinite' : 'none',
    }} />
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '12px 20px',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    textDecoration: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? 'var(--accent)' : 'transparent',
    transition: 'color 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
}

export function AppShell({ activeTab, children }: Props) {
  const { tenant } = useTenant();
  const session = useTelegramSession(tenant?.tenantId);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const connectionStatus = session.step === 'active'
    ? 'active' : session.step === 'disconnected'
    ? 'disconnected' : 'setup';

  const statusLabel = {
    active: 'Conectado',
    disconnected: 'Desconectado',
    setup: 'Não configurado',
  }[connectionStatus];

  return (
    <div style={st.shell}>
      <header style={st.topbar}>
        <div style={st.topbarInner}>
          <a href="/telegram/connection" style={st.brand}>
            <div style={st.logoMark}>B</div>
            <span style={st.logoName}>BotFans</span>
          </a>

          <div style={st.topbarRight}>
            <a href="/telegram/connection" style={st.sessionChip} title="Ver detalhes da conexão">
              <StatusDot status={connectionStatus} />
              <div style={st.sessionChipText}>
                <span style={st.sessionChipStatus}>{statusLabel}</span>
                {session.phone && <span style={st.sessionChipPhone}>{formatPhone(session.phone)}</span>}
              </div>
            </a>

            <div style={st.divider} />

            <ProfileDropdown onOpenSettings={() => setProfileModalOpen(true)} />
          </div>
        </div>
      </header>

      <nav style={st.tabBar}>
        <div style={st.tabBarInner}>
          {TABS.map(tab => (
            <a key={tab.key} href={tab.href} style={tabStyle(tab.key === activeTab)}>
              {tab.label}
              {tab.key === 'orders' && connectionStatus === 'active' && <span style={st.tabDot} />}
            </a>
          ))}
        </div>
      </nav>

      <main style={st.content}>
        <div style={st.contentInner}>{children}</div>
      </main>

      <ProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  shell: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },

  topbar: { background: 'var(--bg-card)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', position: 'sticky', top: 0, zIndex: 50 },
  topbarInner: { maxWidth: 1120, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },

  brand: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
  logoMark: { width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 },
  logoName: { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },

  topbarRight: { display: 'flex', alignItems: 'center', gap: 16 },

  sessionChip: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 14px', background: 'var(--bg-muted)', borderRadius: 20,
    textDecoration: 'none', cursor: 'pointer',
  },
  sessionChipText: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  sessionChipStatus: { fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' },
  sessionChipPhone: { fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.01em' },

  divider: { width: 1, height: 24, background: 'var(--border)' },

  tabBar: { background: 'var(--bg-card)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' },
  tabBarInner: { maxWidth: 1120, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 0 },
  tabDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' },

  content: { flex: 1, padding: '28px 0' },
  contentInner: { maxWidth: 1120, margin: '0 auto', padding: '0 32px', animation: 'fadeIn 0.2s ease' },
};
