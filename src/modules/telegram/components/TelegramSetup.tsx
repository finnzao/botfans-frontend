'use client';

import { useState } from 'react';
import { StepIndicator } from './StepIndicator';
import { PhoneForm } from './PhoneForm';
import { CodeInput } from './CodeInput';
import { CapturingScreen } from './CapturingScreen';
import { AiProfileForm } from './AiProfileForm';
import { verifyPortalCode, verifySessionCode } from '../api';
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
  configure_ai: 'Configurar assistente IA',
  active: 'Assistente ativo',
  reconnecting: 'Reconectando...',
  disconnected: 'Sessão desconectada',
};

export function TelegramSetup({ tenantId, currentStep, flowId, onStepChange, onFlowCreated }: Props) {
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);

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
        // O worker vai processar — voltar para capturing para fazer polling
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
      const res = await verifySessionCode(flowId, '', password);
      if (res.success) {
        // O worker vai processar — voltar para capturing para fazer polling
        onStepChange('capturing');
      } else {
        setSessionError(res.error || 'Senha incorreta.');
      }
    } catch { setSessionError('Erro de conexão.'); }
    finally { setSessionLoading(false); }
  }

  function handleCapturingComplete(status: string) {
    if (status === 'active') {
      // Sessão restaurada automaticamente sem código
      onStepChange('configure_ai');
    } else if (status === 'awaiting_2fa') {
      onStepChange('session_2fa');
    } else {
      onStepChange('session_code');
    }
  }

  return (
    <div>
      <StepIndicator current={currentStep} />
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 20px', color: '#222' }}>
        {STEP_TITLES[currentStep]}
      </h2>

      {currentStep === 'phone' && (
        <PhoneForm tenantId={tenantId} onSuccess={(id) => { onFlowCreated(id); onStepChange('portal_code'); }} />
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
          <button onClick={() => onStepChange('phone')} style={styles.backBtn}>← Voltar e usar outro número</button>
        </>
      )}

      {(currentStep === 'capturing' || currentStep === 'reconnecting') && flowId && (
        <CapturingScreen
          flowId={flowId}
          onComplete={handleCapturingComplete}
          onError={(msg) => { setPortalError(msg); onStepChange('phone'); }}
        />
      )}

      {currentStep === 'session_code' && (
        <>
          <CodeInput
            title="Código de conexão do assistente"
            description={'⚠️ Este é um NOVO código, diferente do anterior! Verifique seu app Telegram — você recebeu uma mensagem com um código numérico de 5 dígitos. NÃO use o código anterior do portal.'}
            descriptionBg="#E1F5EE" descriptionBorder="#9FE1CB" descriptionColor="#085041"
            buttonText="Conectar assistente"
            loading={sessionLoading}
            error={sessionError}
            onSubmit={handleSessionCode}
          />
          <button onClick={() => onStepChange('phone')} style={styles.backBtn}>← Voltar ao início</button>
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

      {currentStep === 'configure_ai' && (
        <AiProfileForm tenantId={tenantId} onSuccess={() => onStepChange('active')} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backBtn: {
    display: 'block', margin: '20px auto 0', padding: '8px 16px',
    fontSize: 13, color: '#888', background: 'none', border: 'none',
    cursor: 'pointer', textDecoration: 'underline',
  },
};
