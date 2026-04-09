/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTenant } from '@/core/lib/tenant-context';
import { AuthScreen } from '@/modules/telegram/components/AuthScreen';
import { AppShell } from '@/modules/telegram/components/AppShell';
import { TelegramSetup } from '@/modules/telegram/components/TelegramSetup';
import { ContactsList } from '@/modules/telegram/components/ContactsList';
import { useTelegramSession } from '@/modules/telegram/hooks/useTelegramSession';
import { disconnectSession, reconnectSession, resetSession } from '@/modules/telegram/api';
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
  const [localStep, setLocalStep] = useState<OnboardingStep | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);

  const step = localStep ?? 'phone';
  const isCapturing = ['capturing', 'reconnecting'].includes(step);

  const session = useTelegramSession(tenant?.tenantId, isCapturing);

  const effectiveStep = localStep ?? session.step;

  const autoReconnectAttempted = useRef(false);
  const actionLock = useRef(false);

  useEffect(() => {
    if (
      !autoReconnectAttempted.current &&
      !session.loading &&
      session.step === 'disconnected' &&
      (session.hasSession || session.hasCredentials) &&
      tenant?.tenantId &&
      !localStep
    ) {
      autoReconnectAttempted.current = true;
      doReconnect(true);
    }
  }, [session.loading, session.step, session.hasSession, session.hasCredentials, tenant?.tenantId, localStep]);

  useEffect(() => {
    if (!localStep && session.step) {
      // sync
    }
  }, [session.step, localStep]);

  const doReconnect = useCallback(async (isAuto = false) => {
    if (!tenant || actionLock.current) return;
    actionLock.current = true;
    setActionInProgress('reconnecting');
    setReconnectError(null);
    try {
      const res = await reconnectSession(tenant.tenantId);
      if (res.success) {
        if (res.data?.status === 'active') {
          setLocalStep('active');
          session.refresh();
        } else if (res.data?.flowId) {
          setFlowId(res.data.flowId);
          const nextStep = res.data.status === 'reconnecting' ? 'reconnecting' : 'capturing';
          setLocalStep(nextStep as OnboardingStep);
        }
      } else if (!isAuto) {
        setReconnectError(res.error || 'Erro ao reconectar.');
      }
    } catch {
      if (!isAuto) setReconnectError('Erro de conexão.');
    } finally {
      setActionInProgress(null);
      actionLock.current = false;
    }
  }, [tenant, session]);

  function handleStepChange(newStep: OnboardingStep) {
    setReconnectError(null);
    setLocalStep(newStep);
    if (newStep === 'active' || newStep === 'disconnected') {
      setFlowId(null);
      session.refresh();
    }
  }

  async function handleDisconnect() {
    if (!tenant || actionLock.current) return;
    actionLock.current = true;
    setActionInProgress('disconnecting');
    try {
      const res = await disconnectSession(tenant.tenantId);
      if (res.success) {
        setLocalStep('disconnected');
        setFlowId(null);
        session.refresh();
      }
    } finally {
      setActionInProgress(null);
      actionLock.current = false;
    }
  }

  async function handleReset() {
    if (!tenant || actionLock.current) return;
    actionLock.current = true;
    setActionInProgress('resetting');
    setReconnectError(null);
    try {
      const res = await resetSession(tenant.tenantId);
      if (res.success) {
        setLocalStep('phone');
        setFlowId(null);
        autoReconnectAttempted.current = true;
        session.refresh();
      }
    } finally {
      setActionInProgress(null);
      actionLock.current = false;
    }
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
  const showSetupInline = !['active', 'disconnected'].includes(effectiveStep);
  const showDisconnectedWithData = effectiveStep === 'disconnected' && (session.hasSession || session.hasCredentials);
  const showDisconnectedEmpty = effectiveStep === 'disconnected' && !session.hasSession && !session.hasCredentials;
  const isAnyAction = !!actionInProgress;

  return (
    <AppShell activeTab="connection">
      <div style={s.pageHeader}>
        <h1 style={s.pageTitle}>Conexões</h1>
        <p style={s.pageSubtitle}>Gerencie suas integrações com plataformas de mensagens</p>
      </div>

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
          <StatusBadge step={effectiveStep} actionInProgress={actionInProgress} workerBusy={session.workerBusy} />
        </div>

        {session.workerBusy && !showSetupInline && effectiveStep !== 'active' && (
          <div style={s.workerBanner}>
            <div style={s.workerDot} />
            <span style={s.workerText}>{session.workerAction || 'Processando...'}</span>
          </div>
        )}

        {effectiveStep === 'active' && (
          <div style={s.sessionDetails}>
            <div style={s.detailGrid}>
              <DetailItem label="Telefone" value={session.phone ? formatPhone(session.phone) : '—'} />
              <DetailItem label="Status" value="Conectado e respondendo" color="var(--green)" />
              <DetailItem label="API" value="Configurada" />
            </div>
            <div style={s.actionRow}>
              <button onClick={handleDisconnect} disabled={isAnyAction} style={{ ...s.dangerBtn, opacity: isAnyAction ? 0.5 : 1 }}>
                {actionInProgress === 'disconnecting' ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>
        )}

        {showDisconnectedWithData && (
          <div style={s.sessionDetails}>
            <div style={s.detailGrid}>
              <DetailItem label="Telefone" value={session.phone ? formatPhone(session.phone) : '—'} />
              <DetailItem
                label="Status"
                value={actionInProgress === 'reconnecting' ? 'Reconectando...' : 'Desconectado'}
                color={actionInProgress === 'reconnecting' ? 'var(--accent)' : 'var(--amber)'}
              />
              <DetailItem label="Sessão" value={session.hasSession ? 'Salva' : 'Credenciais salvas'} />
            </div>

            {session.errorMessage && !actionInProgress && (
              <div style={s.errorBanner}><span style={s.errorText}>{session.errorMessage}</span></div>
            )}
            {reconnectError && (
              <div style={s.errorBanner}><span style={s.errorText}>{reconnectError}</span></div>
            )}

            <div style={s.actionRow}>
              <button onClick={() => doReconnect()} disabled={isAnyAction}
                style={{ ...s.primaryBtn, opacity: isAnyAction ? 0.5 : 1, cursor: isAnyAction ? 'not-allowed' : 'pointer' }}>
                {actionInProgress === 'reconnecting' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={s.btnSpinner} /> Reconectando...
                  </span>
                ) : 'Reconectar'}
              </button>
              <button onClick={handleReset} disabled={isAnyAction}
                style={{ ...s.ghostBtn, opacity: isAnyAction ? 0.5 : 1, color: isAnyAction ? 'var(--text-tertiary)' : 'var(--red)' }}>
                {actionInProgress === 'resetting' ? 'Limpando...' : 'Configurar do zero'}
              </button>
            </div>
          </div>
        )}

        {showSetupInline && (
          <div style={s.setupArea}>
            <TelegramSetup
              tenantId={tenant.tenantId}
              currentStep={effectiveStep}
              flowId={effectiveFlowId}
              onStepChange={handleStepChange}
              onFlowCreated={setFlowId}
            />
          </div>
        )}

        {showDisconnectedEmpty && (
          <div style={s.setupArea}>
            <TelegramSetup
              tenantId={tenant.tenantId}
              currentStep="phone"
              flowId={null}
              onStepChange={handleStepChange}
              onFlowCreated={setFlowId}
            />
          </div>
        )}
      </div>

      <ChannelPlaceholder name="WhatsApp" desc="Integração com WhatsApp Business" color="#25D366" />
      <ChannelPlaceholder name="Instagram" desc="Respostas automáticas no Direct" color="linear-gradient(135deg, #833AB4, #E1306C, #F77737)" />

      {effectiveStep === 'active' && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Contatos recentes</h2>
          <ContactsList tenantId={tenant.tenantId} />
        </div>
      )}
    </AppShell>
  );
}

function StatusBadge({ step, actionInProgress, workerBusy }: { step: string; actionInProgress: string | null; workerBusy: boolean }) {
  let label = 'Não configurado';
  let active = false;

  if (actionInProgress === 'reconnecting') label = 'Reconectando...';
  else if (actionInProgress === 'resetting') label = 'Limpando...';
  else if (step === 'active') { label = 'Online'; active = true; }
  else if (step === 'disconnected') label = 'Offline';
  else if (['capturing', 'reconnecting'].includes(step) || workerBusy) label = 'Conectando...';
  else if (['phone', 'portal_code', 'session_code', 'session_2fa'].includes(step)) label = 'Configurando';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: active ? 'var(--green-light)' : 'var(--bg-muted)', color: active ? 'var(--green)' : 'var(--text-secondary)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--text-tertiary)', animation: active ? 'pulse 2s infinite' : 'none' }} />
      {label}
    </div>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function ChannelPlaceholder({ name, desc, color }: { name: string; desc: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 12, opacity: 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.5 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: color, opacity: 0.4 }} />
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{name}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{desc}</p>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', background: 'var(--bg-muted)', padding: '4px 10px', borderRadius: 10 }}>Em breve</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loadingPage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 8 },
  spinner: { width: 28, height: 28, borderWidth: 3, borderStyle: 'solid', borderColor: 'var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { fontSize: 13, color: 'var(--text-secondary)' },
  pageHeader: { marginBottom: 28 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' },
  pageSubtitle: { fontSize: 14, color: 'var(--text-secondary)', margin: 0 },
  channelCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 12, boxShadow: 'var(--shadow-sm)' },
  channelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', gap: 16 },
  channelLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  channelIcon: { width: 44, height: 44, borderRadius: 12, background: '#2AABEE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  channelName: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' },
  channelDesc: { fontSize: 12, color: 'var(--text-secondary)', margin: 0 },
  workerBanner: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#f0f7ff', borderTop: '1px solid #dbeafe' },
  workerDot: { width: 6, height: 6, borderRadius: '50%', background: '#2563eb', animation: 'pulse 1.5s infinite', flexShrink: 0 },
  workerText: { fontSize: 12, color: '#1e40af', fontWeight: 500 },
  sessionDetails: { padding: '0 24px 20px', borderTop: '1px solid var(--border-light)', marginTop: -4 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '16px 0' },
  errorBanner: { padding: '10px 14px', background: 'var(--red-light)', borderRadius: 'var(--radius-sm)', marginBottom: 12 },
  errorText: { fontSize: 12, color: 'var(--red)', lineHeight: 1.4 },
  actionRow: { display: 'flex', gap: 10, paddingTop: 4 },
  primaryBtn: { padding: '9px 20px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)' },
  dangerBtn: { padding: '9px 20px', fontSize: 13, fontWeight: 500, background: 'var(--bg-card)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', cursor: 'pointer' },
  ghostBtn: { padding: '9px 20px', fontSize: 13, fontWeight: 500, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  setupArea: { padding: '0 24px 24px', borderTop: '1px solid var(--border-light)' },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' },
  btnSpinner: { display: 'inline-block', width: 14, height: 14, borderWidth: 2, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' },
};
