'use client';

import { AnalyticsDashboard } from '@/modules/telegram/components/dashboard';

const TEST_TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

export default function AnalyticsPage() {
  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>B</div>
          <span style={styles.logoText}>BotFans</span>
        </div>

        <nav style={styles.nav}>
          <a href="/" style={styles.navItem}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            Telegram
          </a>
          <a href="/telegram/analytics" style={{ ...styles.navItem, ...styles.navActive }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
            </svg>
            Analytics
          </a>
          <span style={styles.navDisabled}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
            WhatsApp
            <span style={styles.badge}>Em breve</span>
          </span>
          <span style={styles.navDisabled}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            Instagram
            <span style={styles.badge}>Em breve</span>
          </span>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.tenantInfo}>
            <div style={styles.tenantAvatar}>T</div>
            <div>
              <p style={styles.tenantName}>Teste Local</p>
              <p style={styles.tenantPlan}>Plano teste</p>
            </div>
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        <AnalyticsDashboard tenantId={TEST_TENANT_ID} />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh' },
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
  tenantPlan: { fontSize: 11, color: '#999', margin: 0 },
  main: { flex: 1, padding: '28px 36px', maxWidth: 960, overflow: 'auto' },
};
