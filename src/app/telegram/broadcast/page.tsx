'use client';

import { useTenant } from '@/core/lib/tenant-context';
import { AuthScreen } from '@/modules/telegram/components/AuthScreen';
import { AppShell } from '@/modules/telegram/components/AppShell';
import { BroadcastManager } from '@/modules/telegram/components/broadcast/BroadcastManager';

export default function BroadcastPage() {
  const { tenant, loading } = useTenant();

  if (loading) {
    return <div style={s.loading}><p style={s.text}>Carregando...</p></div>;
  }

  if (!tenant) return <AuthScreen />;

  return (
    <AppShell activeTab="broadcast">
      <BroadcastManager tenantId={tenant.tenantId} />
    </AppShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  text: { fontSize: 13, color: 'var(--text-secondary)' },
};
