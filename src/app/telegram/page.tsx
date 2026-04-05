'use client';

import { useState, useEffect } from 'react';
import { TelegramSetup } from '@/modules/telegram/components/TelegramSetup';
import { ContactsList } from '@/modules/telegram/components/ContactsList';
import { getStatus, disconnectSession, reconnectSession } from '@/modules/telegram/api';
import { statusToStep } from '@/modules/telegram/types';
import type { OnboardingStep } from '@/modules/telegram/types';

const TEST_TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

export default function TelegramPage() {
  const [step, setStep] = useState<OnboardingStep>('phone');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    checkExisting();
  }, []);

  async function checkExisting() {
    try {
      const res = await getStatus(TEST_TENANT_ID);
      if (res.success && res.data) {
        const mapped = statusToStep(res.data.status);
        setHasSession(!!res.data.hasSession);

        const needsFlow: OnboardingStep[] = ['portal_code', 'capturing', 'session_code', 'session_2fa', 'reconnecting'];
        if (needsFlow.includes(mapped) && !res.data.flowId) {
          if (res.data.hasSession) {
            setStep('disconnected');
          } else {
            setStep('phone');
          }
        } else if (mapped === 'disconnected' && res.data.hasSession) {
          setStep('disconnected');
        } else {
          setStep(mapped);
          if (res.data.flowId) setFlowId(res.data.flowId);
        }
      }
    } catch {
      // no session
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      const res = await disconnectSession(TEST_TENANT_ID);
      if (res.success) {
        setStep('disconnected');
        setFlowId(null);
        setHasSession(true);
      }
    } catch (e) {
      console.error('Erro ao desconectar:', e);
    }
  }

  async function handleReconnect() {
    setReconnecting(true);
    try {
      const res = await reconnectSession(TEST_TENANT_ID);
      if (res.success) {
        if (res.data?.status === 'active') {
          setStep('active');
        } else if (res.data?.flowId) {
          setFlowId(res.data.flowId);
          setStep('capturing');
        }
      } else {
        alert(res.error || 'Erro ao reconectar');
        setStep('phone');
        setHasSession(false);
      }
    } catch (e) {
      console.error('Erro ao reconectar:', e);
    } finally {
      setReconnecting(false);
    }
  }

  function handleNewSetup() {
    setStep('phone');
    setFlowId(null);
  }

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>B</div>
          <span style={styles.logoText}>BotFans</span>
        </div>

        <nav style={styles.nav}>
          <a href="/telegram" style={{ ...styles.navItem, ...styles.navActive }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
            Telegram
          </a>
          <a href="/telegram/analytics" style={styles.navItem}>
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
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Integração Telegram</h1>
            <p style={styles.subtitle}>
              {step === 'active'
                ? 'Seu assistente está ativo e respondendo mensagens'
                : step === 'disconnected'
                  ? 'Sua sessão está desconectada — reconecte para voltar a responder'
                  : 'Conecte seu Telegram para ativar o assistente com IA'
              }
            </p>
          </div>
          {step === 'active' && (
            <button onClick={handleDisconnect} style={styles.disconnectBtn}>
              Desconectar
            </button>
          )}
        </header>

        <div style={styles.content}>
          {step === 'active' ? (
            <div>
              <div style={styles.statusCard}>
                <div style={styles.statusDot} />
                <div>
                  <p style={styles.statusTitle}>Assistente ativo</p>
                  <p style={styles.statusDesc}>Recebendo e respondendo mensagens automaticamente</p>
                </div>
              </div>
              <ContactsList tenantId={TEST_TENANT_ID} />
            </div>
          ) : step === 'disconnected' ? (
            <div style={styles.setupCard}>
              <div style={styles.disconnectedCard}>
                <div style={styles.disconnectedDot} />
                <div style={{ flex: 1 }}>
                  <p style={styles.disconnectedTitle}>Sessão desconectada</p>
                  <p style={styles.disconnectedDesc}>
                    Sua sessão foi salva. Você pode reconectar sem precisar digitar códigos novamente.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  onClick={handleReconnect}
                  disabled={reconnecting}
                  style={{
                    ...styles.reconnectBtn,
                    opacity: reconnecting ? 0.6 : 1,
                    cursor: reconnecting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {reconnecting ? 'Reconectando...' : 'Reconectar sessão'}
                </button>
                <button onClick={handleNewSetup} style={styles.newSetupBtn}>
                  Configurar do zero
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.setupCard}>
              <TelegramSetup
                tenantId={TEST_TENANT_ID}
                currentStep={step}
                flowId={flowId}
                onStepChange={setStep}
                onFlowCreated={setFlowId}
              />
            </div>
          )}
        </div>
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
  main: { flex: 1, padding: '28px 36px', maxWidth: 820 },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28,
  },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#888', margin: 0 },
  disconnectBtn: {
    fontSize: 12, padding: '8px 14px', background: '#fff',
    border: '1px solid #e24b4a', borderRadius: 8, color: '#A32D2D', fontWeight: 500,
  },
  content: {},
  setupCard: {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '28px 32px',
  },
  statusCard: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
    background: '#E1F5EE', borderRadius: 12, marginBottom: 24, border: '1px solid #9FE1CB',
  },
  statusDot: {
    width: 10, height: 10, borderRadius: '50%', background: '#0F6E56', flexShrink: 0,
    boxShadow: '0 0 0 3px rgba(15, 110, 86, 0.2)',
  },
  statusTitle: { fontSize: 14, fontWeight: 600, color: '#085041', margin: '0 0 2px' },
  statusDesc: { fontSize: 12, color: '#0F6E56', margin: 0 },
  disconnectedCard: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
    background: '#FAEEDA', borderRadius: 12, border: '1px solid #FAC775',
  },
  disconnectedDot: {
    width: 10, height: 10, borderRadius: '50%', background: '#B87A00', flexShrink: 0,
    boxShadow: '0 0 0 3px rgba(184, 122, 0, 0.2)',
  },
  disconnectedTitle: { fontSize: 14, fontWeight: 600, color: '#633806', margin: '0 0 2px' },
  disconnectedDesc: { fontSize: 12, color: '#8B6914', margin: 0, lineHeight: 1.5 },
  reconnectBtn: {
    padding: '12px 24px', fontSize: 14, fontWeight: 600, background: '#185FA5',
    color: '#fff', border: 'none', borderRadius: 8, flex: 1,
  },
  newSetupBtn: {
    padding: '12px 24px', fontSize: 14, fontWeight: 500, background: '#fff',
    color: '#666', border: '1px solid #ddd', borderRadius: 8,
  },
  loadingPage: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh',
  },
  spinner: {
    width: 32, height: 32, border: '3px solid #e5e7eb', borderTop: '3px solid #185FA5',
    borderRadius: '50%', marginBottom: 12, animation: 'spin 0.8s linear infinite',
  },
  loadingText: { fontSize: 14, color: '#888' },
};
