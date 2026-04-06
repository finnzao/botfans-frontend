'use client';

import { useState } from 'react';
import { useTenant } from '@/core/lib/tenant-context';
import { AuthScreen } from '@/modules/telegram/components/AuthScreen';
import { AppShell } from '@/modules/telegram/components/AppShell';
import { TelegramSetup } from '@/modules/telegram/components/TelegramSetup';
import { ContactsList } from '@/modules/telegram/components/ContactsList';
import { useTelegramSession } from '@/modules/telegram/hooks/useTelegramSession';
import { disconnectSession, reconnectSession } from '@/modules/telegram/api';
import type { OnboardingStep } from '@/modules/telegram/types';

function formatPhone(phone: string): string {
  if (phone.startsWith('+55') && phone.length >= 13) {
    const d = phone.slice(3);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return phone;
}

export default function ConnectionPage() {
  const { tenant, loading: authLoading } = useTenant();
  const session = useTelegramSession(tenant?.tenantId);
  const [localStep, setLocalStep] = useState<OnboardingStep | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const step = localStep ?? session.step;

  async function handleDisconnect() {
    if (!tenant) return;
    const res = await disconnectSession(tenant.tenantId);
    if (res.success) { setLocalStep('disconnected'); setFlowId(null); session.refresh(); }
  }

  async function handleReconnect() {
    if (!tenant) return;
    setReconnecting(true);
    try {
      const res = await reconnectSession(tenant.tenantId);
      if (res.success) {
        if (res.data?.status === 'active') { setLocalStep('active'); session.refresh(); }
        else if (res.data?.flowId) { setFlowId(res.data.flowId); setLocalStep('capturing'); }
      } else { alert(res.error || 'Erro ao reconectar'); }
    } finally { setReconnecting(false); }
  }

  if (authLoading || session.loading) {
    return (
      <div style={s.loadingPage}>
        <div style={s.spinner} />
        <p style={s.loadingText}>Carregando...</p>
      </div>
    );
  }

  if (!tenant) return <AuthScreen />;

  const effectiveFlowId = flowId ?? session.flowId;

  return (
    <AppShell activeTab="connection">
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Conexões</h1>
        <p style={s.pageSubtitle}>Gerencie suas integrações com plataformas de mensagens</p>
      </div>

      {/* Telegram connection card */}
      <div style={s.channelCard}>
        <div style={s.channelHeader}>
          <div style={s.channelLeft}>
            <div style={s.channelIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </div>
            <div>
              <h3 style={s.channelName}>Telegram</h3>
              <p style={s.channelDesc}>Assistente IA para mensagens privadas</p>
            </div>
          </div>
          <div style={s.statusPill(step === 'active')}>
            <span style={s.statusPillDot(step === 'active')} />
            {step === 'active' ? 'Online' : step === 'disconnected' ? 'Offline' : 'Não configurado'}
          </div>
        </div>

        {/* Detalhes da sessão quando conectado ou desconectado com sessão */}
        {(step === 'active' || (step === 'disconnected' && session.hasSession)) && (
          <div style={s.sessionDetails}>
            <div style={s.detailGrid}>
              <div style={s.detailItem}>
                <span style={s.detailLabel}>Telefone</span>
                <span style={s.detailValue}>{session.phone ? formatPhone(session.phone) : '—'}</span>
              </div>
              <div style={s.detailItem}>
                <span style={s.detailLabel}>Status</span>
                <span style={{ ...s.detailValue, color: step === 'active' ? 'var(--green)' : 'var(--amber)' }}>
                  {step === 'active' ? 'Conectado e respondendo' : 'Sessão salva, não respondendo'}
                </span>
              </div>
              <div style={s.detailItem}>
                <span style={s.detailLabel}>Sessão</span>
                <span style={s.detailValue}>{session.hasSession ? 'Salva no servidor' : 'Não salva'}</span>
              </div>
            </div>

            <div style={s.actionRow}>
              {step === 'active' ? (
                <button onClick={handleDisconnect} style={s.dangerBtn}>Desconectar</button>
              ) : (
                <>
                  <button onClick={handleReconnect} disabled={reconnecting} style={{ ...s.primaryBtn, opacity: reconnecting ? 0.6 : 1 }}>
                    {reconnecting ? 'Reconectando...' : 'Reconectar'}
                  </button>
                  <button onClick={() => { setLocalStep('phone'); setFlowId(null); }} style={s.ghostBtn}>
                    Configurar do zero
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Setup quando não configurado */}
        {!['active', 'disconnected'].includes(step) && (
          <div style={s.setupArea}>
            <TelegramSetup
              tenantId={tenant.tenantId}
              currentStep={step}
              flowId={effectiveFlowId}
              onStepChange={s2 => { setLocalStep(s2); if (s2 === 'active') session.refresh(); }}
              onFlowCreated={setFlowId}
            />
          </div>
        )}

        {/* Setup quando desconectado sem sessão */}
        {step === 'disconnected' && !session.hasSession && (
          <div style={s.setupArea}>
            <TelegramSetup
              tenantId={tenant.tenantId}
              currentStep="phone"
              flowId={null}
              onStepChange={s2 => setLocalStep(s2)}
              onFlowCreated={setFlowId}
            />
          </div>
        )}
      </div>

      {/* Outros canais (futuros) */}
      <div style={s.channelCardDisabled}>
        <div style={s.channelHeader}>
          <div style={s.channelLeft}>
            <div style={{ ...s.channelIcon, background: '#25D366', opacity: 0.4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
            </div>
            <div style={{ opacity: 0.5 }}>
              <h3 style={s.channelName}>WhatsApp</h3>
              <p style={s.channelDesc}>Integração com WhatsApp Business</p>
            </div>
          </div>
          <span style={s.comingSoon}>Em breve</span>
        </div>
      </div>

      <div style={s.channelCardDisabled}>
        <div style={s.channelHeader}>
          <div style={s.channelLeft}>
            <div style={{ ...s.channelIcon, background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)', opacity: 0.4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </div>
            <div style={{ opacity: 0.5 }}>
              <h3 style={s.channelName}>Instagram</h3>
              <p style={s.channelDesc}>Respostas automáticas no Direct</p>
            </div>
          </div>
          <span style={s.comingSoon}>Em breve</span>
        </div>
      </div>

      {/* Contatos recentes quando ativo */}
      {step === 'active' && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Contatos recentes</h2>
          <ContactsList tenantId={tenant.tenantId} />
        </div>
      )}
    </AppShell>
  );
}

const s = {
  loadingPage: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 8 },
  spinner: { width: 28, height: 28, borderWidth: 3, borderStyle: 'solid' as const, borderColor: 'var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: 13, color: 'var(--text-secondary)' },

  pageHeader: { marginBottom: 28 } as React.CSSProperties,
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' } as React.CSSProperties,
  pageSubtitle: { fontSize: 14, color: 'var(--text-secondary)', margin: 0 } as React.CSSProperties,

  channelCard: {
    background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'var(--border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden' as const, marginBottom: 12,
    boxShadow: 'var(--shadow-sm)',
  } as React.CSSProperties,
  channelCardDisabled: {
    background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'var(--border)',
    borderRadius: 'var(--radius-lg)', marginBottom: 12, opacity: 0.7,
  } as React.CSSProperties,
  channelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', gap: 16,
  } as React.CSSProperties,
  channelLeft: { display: 'flex', alignItems: 'center', gap: 14 } as React.CSSProperties,
  channelIcon: {
    width: 44, height: 44, borderRadius: 12, background: '#2AABEE',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  } as React.CSSProperties,
  channelName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' } as React.CSSProperties,
  channelDesc: { fontSize: 12, color: 'var(--text-secondary)', margin: 0 } as React.CSSProperties,

  statusPill: (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', borderRadius: 20,
    fontSize: 12, fontWeight: 600,
    background: active ? 'var(--green-light)' : 'var(--bg-muted)',
    color: active ? 'var(--green)' : 'var(--text-secondary)',
  }),
  statusPillDot: (active: boolean): React.CSSProperties => ({
    width: 7, height: 7, borderRadius: '50%',
    background: active ? 'var(--green)' : 'var(--text-tertiary)',
    animation: active ? 'pulse 2s infinite' : 'none',
  }),

  sessionDetails: {
    padding: '0 24px 20px',
    borderTopWidth: 1, borderTopStyle: 'solid' as const, borderTopColor: 'var(--border-light)',
    marginTop: -4,
  } as React.CSSProperties,
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
    padding: '16px 0',
  } as React.CSSProperties,
  detailItem: { display: 'flex', flexDirection: 'column' as const, gap: 3 } as React.CSSProperties,
  detailLabel: { fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } as React.CSSProperties,
  detailValue: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' } as React.CSSProperties,

  actionRow: { display: 'flex', gap: 10, paddingTop: 4 } as React.CSSProperties,
  primaryBtn: {
    padding: '9px 20px', fontSize: 13, fontWeight: 600,
    background: 'var(--accent)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  } as React.CSSProperties,
  dangerBtn: {
    padding: '9px 20px', fontSize: 13, fontWeight: 500,
    background: 'var(--bg-card)', borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'var(--red)',
    borderRadius: 'var(--radius-sm)', color: 'var(--red)', cursor: 'pointer',
  } as React.CSSProperties,
  ghostBtn: {
    padding: '9px 20px', fontSize: 13, fontWeight: 500,
    background: 'none', borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
  } as React.CSSProperties,

  comingSoon: {
    fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)',
    background: 'var(--bg-muted)', padding: '4px 10px', borderRadius: 10,
  } as React.CSSProperties,

  setupArea: {
    padding: '0 24px 24px',
    borderTopWidth: 1, borderTopStyle: 'solid' as const, borderTopColor: 'var(--border-light)',
  } as React.CSSProperties,

  section: { marginTop: 28 } as React.CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' } as React.CSSProperties,
};
