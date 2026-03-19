'use client';

import { useEffect, useRef } from 'react';

interface Props {
  onComplete: () => void;
  onError: (msg: string) => void;
  flowId: string;
}

/**
 * Tela de "aguarde" enquanto o backend:
 * 1. Faz login no my.telegram.org com o código
 * 2. Acessa /apps
 * 3. Cria App se necessário
 * 4. Captura api_id e api_hash
 * 5. Inicia sessão Telethon e envia novo código
 * 
 * Faz polling no /api/telegram/status a cada 2s
 */
export function CapturingScreen({ onComplete, onError, flowId }: Props) {
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    polling.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/telegram/status?flowId=${flowId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const st = data.data.status;
          if (st === 'awaiting_session_code' || st === 'awaiting_2fa') {
            stop();
            onComplete();
          } else if (st === 'error') {
            stop();
            onError(data.data.errorMessage || 'Erro ao capturar credenciais. Tente novamente.');
          }
        }
      } catch { /* retry */ }
    }, 2000);

    return stop;
  }, [flowId]);

  function stop() {
    if (polling.current) { clearInterval(polling.current); polling.current = null; }
  }

  return (
    <div style={styles.container}>
      <div style={styles.spinner} />
      <p style={styles.title}>Configurando sua integração...</p>
      <p style={styles.desc}>
        Estamos conectando ao Telegram e preparando tudo automaticamente.
        Isso leva alguns segundos.
      </p>
      <div style={styles.steps}>
        <StepLine label="Autenticando no portal Telegram" done />
        <StepLine label="Configurando credenciais da API" active />
        <StepLine label="Preparando conexão do assistente" />
      </div>
    </div>
  );
}

function StepLine({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
        background: done ? '#EAF3DE' : active ? '#E6F1FB' : '#f5f5f5',
        color: done ? '#3B6D11' : active ? '#185FA5' : '#ccc',
        border: `1px solid ${done ? '#97C459' : active ? '#85B7EB' : '#e5e5e5'}`,
      }}>
        {done ? '✓' : active ? '⋯' : ''}
      </div>
      <span style={{
        fontSize: 13,
        color: done ? '#3B6D11' : active ? '#185FA5' : '#bbb',
        fontWeight: active ? 500 : 400,
      }}>
        {label}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { textAlign: 'center', padding: '2rem 0' },
  spinner: {
    width: 36, height: 36,
    border: '3px solid #e5e7eb', borderTop: '3px solid #185FA5',
    borderRadius: '50%', margin: '0 auto 16px',
    animation: 'spin 0.8s linear infinite',
  },
  title: { fontSize: 16, fontWeight: 600, color: '#222', margin: '0 0 6px' },
  desc: { fontSize: 13, color: '#888', margin: '0 0 24px', lineHeight: 1.5 },
  steps: { textAlign: 'left', maxWidth: 320, margin: '0 auto' },
};
