'use client';

import type { OnboardingStep } from '../types';

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'phone', label: 'Número' },
  { key: 'portal_code', label: 'Código' },
  { key: 'session_code', label: 'Conexão' },
  { key: 'configure_ai', label: 'Perfil IA' },
  { key: 'active', label: 'Ativo' },
];

const STEP_POSITION: Record<OnboardingStep, number> = {
  phone: 0,
  portal_code: 1,
  capturing: 1,
  session_code: 2,
  session_2fa: 2,
  configure_ai: 3,
  active: 4,
};

interface Props {
  current: OnboardingStep;
}

export function StepIndicator({ current }: Props) {
  const activeIdx = STEP_POSITION[current] ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {STEPS.map((step, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 56 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                background: isDone ? '#639922' : isActive ? '#185FA5' : '#e5e5e5',
                color: isDone || isActive ? '#fff' : '#999',
                transition: 'all 0.3s',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 11,
                color: isActive ? '#185FA5' : isDone ? '#639922' : '#999',
                fontWeight: isActive ? 600 : 400,
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 8px', marginBottom: 18, borderRadius: 1,
                background: isDone ? '#639922' : '#e5e5e5',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
