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
  session_code: 'Conectar assistente',
  session_2fa: 'Verificação em duas etapas',
  configure_ai: 'Configurar assistente IA',
  active: 'Assistente ativo',
};

export function TelegramSetup({ tenantId, currentStep, flowId, onStepChange, onFlowCreated }: Props) {
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);

  async function handlePortalCode(code: string) {
    if (!flowId) return;
    setPortalError('');
    setPortalLoading(true);
    try {
      const res = await verifyPortalCode(flowId, code);
      if (res.success) {
        onStepChange('capturing');
      } else {
        setPortalError(res.error || 'Código inválido. Verifique e tente novamente.');
      }
    } catch {
      setPortalError('Erro de conexão.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleSessionCode(code: string) {
    if (!flowId) return;
    setSessionError('');
    setSessionLoading(true);
    try {
      const res = await verifySessionCode(flowId, code);
      if (res.success) {
        if (res.data?.status === 'awaiting_2fa') {
          onStepChange('session_2fa');
        } else {
          onStepChange('configure_ai');
        }
      } else {
        setSessionError(res.error || 'Código inválido.');
      }
    } catch {
      setSessionError('Erro de conexão.');
    } finally {
      setSessionLoading(false);
    }
  }

  async function handle2fa(password: string) {
    if (!flowId) return;
    setSessionError('');
    setSessionLoading(true);
    try {
      const res = await verifySessionCode(flowId, '', password);
      if (res.success) {
        onStepChange('configure_ai');
      } else {
        setSessionError(res.error || 'Senha incorreta.');
      }
    } catch {
      setSessionError('Erro de conexão.');
    } finally {
      setSessionLoading(false);
    }
  }

  return (
    <div>
      <StepIndicator current={currentStep} />

      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 20px', color: '#222' }}>
        {STEP_TITLES[currentStep]}
      </h2>

      {currentStep === 'phone' && (
        <PhoneForm
          tenantId={tenantId}
          onSuccess={(id) => { onFlowCreated(id); onStepChange('portal_code'); }}
        />
      )}

      {currentStep === 'portal_code' && (
        <CodeInput
          title="Código de verificação"
          description="Enviamos um código para o seu Telegram. Verifique o app, SMS ou chamada recebida e digite abaixo."
          buttonText="Verificar código"
          loading={portalLoading}
          error={portalError}
          onSubmit={handlePortalCode}
        />
      )}

      {currentStep === 'capturing' && flowId && (
        <CapturingScreen
          flowId={flowId}
          onComplete={() => onStepChange('session_code')}
          onError={(msg) => { setPortalError(msg); onStepChange('phone'); }}
        />
      )}

      {currentStep === 'session_code' && (
        <CodeInput
          title="Código de conexão"
          description="Enviamos um novo código para conectar o assistente. Verifique seu Telegram novamente."
          descriptionBg="#E1F5EE"
          descriptionBorder="#9FE1CB"
          descriptionColor="#085041"
          buttonText="Conectar assistente"
          loading={sessionLoading}
          error={sessionError}
          onSubmit={handleSessionCode}
        />
      )}

      {currentStep === 'session_2fa' && (
        <CodeInput
          title="Verificação em duas etapas"
          description="Sua conta tem verificação em duas etapas habilitada. Digite a senha cloud do Telegram para completar a conexão."
          descriptionBg="#FAEEDA"
          descriptionBorder="#FAC775"
          descriptionColor="#633806"
          buttonText="Confirmar senha"
          loading={sessionLoading}
          error={sessionError}
          onSubmit={handle2fa}
          passwordMode
          passwordLabel="Senha cloud do Telegram (2FA)"
        />
      )}

      {currentStep === 'configure_ai' && (
        <AiProfileForm
          tenantId={tenantId}
          onSuccess={() => onStepChange('active')}
        />
      )}
    </div>
  );
}
