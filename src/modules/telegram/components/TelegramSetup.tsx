'use client';

import { useState } from 'react';
import { StepIndicator } from './StepIndicator';
import { CodeInput } from './CodeInput';
import { CapturingScreen } from './CapturingScreen';
import { verifyPortalCode, verifySessionCode, startFlow } from '../api';
import type { OnboardingStep } from '../types';

interface Props {
  tenantId: string;
  currentStep: OnboardingStep;
  flowId: string | null;
  onStepChange: (step: OnboardingStep) => void;
  onFlowCreated: (id: string) => void;
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  phone: 'Conectar Telegram',
  portal_code: 'Código de verificação',
  capturing: 'Configurando...',
  session_code: 'Código de conexão do assistente',
  session_2fa: 'Verificação em duas etapas',
  active: 'Conexão ativa',
  reconnecting: 'Reconectando...',
  disconnected: 'Sessão desconectada',
};

export function TelegramSetup({ tenantId, currentStep, flowId, onStepChange, onFlowCreated }: Props) {
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [capturingError, setCapturingError] = useState('');

  async function handlePortalCode(code: string) {
    if (!flowId) { setPortalError('Sessão expirada. Volte e insira seu número.'); return; }
    setPortalError('');
    setPortalLoading(true);
    try {
      const res = await verifyPortalCode(flowId, code);
      if (res.success) onStepChange('capturing');
      else setPortalError(res.error || 'Código inválido.');
    } catch { setPortalError('Erro de conexão.'); }
    finally { setPortalLoading(false); }
  }

  async function handleSessionCode(code: string) {
    if (!flowId) { setSessionError('Sessão expirada. Volte ao início.'); return; }
    setSessionError('');
    setSessionLoading(true);
    try {
      const res = await verifySessionCode(flowId, code);
      if (res.success) {
        onStepChange('capturing');
      } else {
        setSessionError(res.error || 'Código inválido.');
      }
    } catch { setSessionError('Erro de conexão.'); }
    finally { setSessionLoading(false); }
  }

  async function handle2fa(password: string) {
    if (!flowId) { setSessionError('Sessão expirada.'); return; }
    setSessionError('');
    setSessionLoading(true);
    try {
      const res = await verifySessionCode(flowId, undefined, password);
      if (res.success) {
        onStepChange('capturing');
      } else {
        setSessionError(res.error || 'Senha incorreta.');
      }
    } catch { setSessionError('Erro de conexão.'); }
    finally { setSessionLoading(false); }
  }

  function handleCapturingComplete(status: string) {
    if (status === 'active') {
      onStepChange('active');
    } else if (status === 'awaiting_2fa') {
      onStepChange('session_2fa');
    } else {
      onStepChange('session_code');
    }
  }

  function handleCapturingError(msg: string) {
    setCapturingError(msg);
    onStepChange('disconnected');
  }

  return (
    <div>
      <StepIndicator current={currentStep} />
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 20px', color: 'var(--text-primary)' }}>
        {STEP_TITLES[currentStep]}
      </h2>

      {capturingError && !['capturing', 'reconnecting'].includes(currentStep) && (
        <div style={st.errorBox}>
          <p style={st.errorText}>{capturingError}</p>
          <button onClick={() => setCapturingError('')} style={st.errorDismiss}>×</button>
        </div>
      )}

      {currentStep === 'phone' && (
        <PhoneInput
          tenantId={tenantId}
          onSuccess={(fId, skip) => {
            onFlowCreated(fId);
            setCapturingError('');
            onStepChange(skip ? 'capturing' : 'portal_code');
          }}
        />
      )}

      {currentStep === 'portal_code' && (
        <>
          <CodeInput
            title="Código de verificação"
            description="Enviamos um código para o seu Telegram (app ou SMS). Este código é do portal my.telegram.org."
            buttonText="Verificar código"
            loading={portalLoading}
            error={portalError}
            onSubmit={handlePortalCode}
          />
          <button onClick={() => onStepChange('phone')} style={st.backBtn}>← Voltar</button>
        </>
      )}

      {(currentStep === 'capturing' || currentStep === 'reconnecting') && flowId && (
        <CapturingScreen
          flowId={flowId}
          onComplete={handleCapturingComplete}
          onError={handleCapturingError}
        />
      )}

      {currentStep === 'session_code' && (
        <>
          <CodeInput
            title="Código de conexão do assistente"
            description="Verifique seu app Telegram — você recebeu uma mensagem com um código numérico de 5 dígitos. Este é um código DIFERENTE do anterior."
            descriptionBg="#E1F5EE" descriptionBorder="#9FE1CB" descriptionColor="#085041"
            buttonText="Conectar assistente"
            loading={sessionLoading}
            error={sessionError}
            onSubmit={handleSessionCode}
          />
          <button onClick={() => onStepChange('phone')} style={st.backBtn}>← Voltar ao início</button>
        </>
      )}

      {currentStep === 'session_2fa' && (
        <CodeInput
          title="Verificação em duas etapas"
          description="Sua conta tem 2FA. Digite a senha cloud do Telegram."
          descriptionBg="#FAEEDA" descriptionBorder="#FAC775" descriptionColor="#633806"
          buttonText="Confirmar senha"
          loading={sessionLoading} error={sessionError}
          onSubmit={handle2fa} passwordMode passwordLabel="Senha cloud do Telegram (2FA)"
        />
      )}
    </div>
  );
}

function PhoneInput({ tenantId, onSuccess }: { tenantId: string; onSuccess: (flowId: string, skipPortal: boolean) => void }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function format(value: string): string {
    const digits = value.replace(/[^\d+]/g, '');
    if (!digits.startsWith('+')) return '+' + digits;
    return digits;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Número inválido. Use formato internacional: +5511999999999');
      return;
    }
    setLoading(true);
    try {
      const res = await startFlow(tenantId, cleaned);
      if (res.success && res.data?.flowId) {
        onSuccess(res.data.flowId, !!res.data.skipPortal);
      } else {
        setError(res.error || 'Erro ao iniciar. Tente novamente.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#0C447C', margin: 0, lineHeight: 1.6 }}>
          Informe o número do Telegram que será usado como assistente.
        </p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>Número do Telegram</label>
          <input
            type="tel" placeholder="+55 11 99999-9999" value={phone}
            onChange={e => setPhone(format(e.target.value))} required autoFocus
            style={{ padding: '12px 14px', fontSize: 16, border: '1px solid #ddd', borderRadius: 8, outline: 'none', fontFamily: 'monospace', letterSpacing: 1 }}
          />
          <span style={{ fontSize: 11, color: '#999' }}>Formato internacional com código do país</span>
        </div>
        {error && <p style={{ fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{
          padding: '12px 24px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff',
          border: 'none', borderRadius: 8, marginTop: 8, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Processando...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  backBtn: {
    display: 'block', margin: '20px auto 0', padding: '8px 16px',
    fontSize: 13, color: 'var(--text-tertiary)', background: 'none', border: 'none',
    cursor: 'pointer', textDecoration: 'underline',
  },
  errorBox: {
    background: 'var(--red-light)', border: '1px solid #fca5a5', borderRadius: 10,
    padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  errorText: { fontSize: 13, color: 'var(--red)', margin: 0, lineHeight: 1.5, flex: 1 },
  errorDismiss: {
    background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer',
    fontSize: 18, padding: '0 4px', flexShrink: 0, marginLeft: 8,
  },
};
