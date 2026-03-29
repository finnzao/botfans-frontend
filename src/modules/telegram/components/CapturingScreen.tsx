'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onComplete: () => void;
  onError: (msg: string) => void;
  flowId: string;
}

const POLL_INTERVAL = 2000;
const WORKER_TIMEOUT = 60000;

export function CapturingScreen({ onComplete, onError, flowId }: Props) {
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('api_captured');

  useEffect(() => {
    startedAt.current = Date.now();

    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);

    polling.current = setInterval(async () => {
      if (Date.now() - startedAt.current > WORKER_TIMEOUT) {
        stop();
        onError(
          'O worker não respondeu a tempo. ' +
          'Verifique se o worker Python está rodando (python main.py) e tente novamente.'
        );
        return;
      }

      try {
        const res = await fetch(`/api/telegram/status?flowId=${flowId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const st = data.data.status;
          setCurrentStatus(st);

          if (st === 'awaiting_session_code' || st === 'awaiting_2fa') {
            stop();
            onComplete();
          } else if (st === 'error') {
            stop();
            onError(data.data.errorMessage || 'Erro ao configurar. Tente novamente.');
          } else if (st === 'expired') {
            stop();
            onError('Sessão expirada. Inicie novamente.');
          }
        }
      } catch { /* retry */ }
    }, POLL_INTERVAL);

    return () => { stop(); clearInterval(tick); };
  }, [flowId]);

  function stop() {
    if (polling.current) { clearInterval(polling.current); polling.current = null; }
  }

  const waiting = currentStatus === 'api_captured' || currentStatus === 'capturing_api';

  return (
    <div style={styles.container}>
      <div style={styles.spinner} />
      <p style={styles.title}>Configurando sua integração...</p>
      <p style={styles.desc}>
        {waiting
          ? 'Credenciais capturadas! Aguardando o assistente iniciar a conexão...'
          : 'Conectando ao Telegram automaticamente.'
        }
      </p>

      <div style={styles.steps}>
        <StepLine label="Autenticando no portal Telegram" done />
        <StepLine label="Capturando credenciais da API" done={currentStatus !== 'capturing_api'} active={currentStatus === 'capturing_api'} />
        <StepLine
          label="Conectando assistente ao Telegram"
          active={waiting && currentStatus !== 'capturing_api'}
          detail={waiting ? `Aguardando worker... (${elapsed}s)` : undefined}
        />
      </div>

      {elapsed > 15 && waiting && (
        <div style={styles.warningBox}>
          <p style={styles.warningText}>⚠ O worker está demorando. Verifique se está rodando:</p>
          <code style={styles.codeBlock}>cd src/worker && python main.py</code>
        </div>
      )}
    </div>
  );
}

function StepLine({ label, done, active, detail }: { label: string; done?: boolean; active?: boolean; detail?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
        background: done ? '#EAF3DE' : active ? '#E6F1FB' : '#f5f5f5',
        color: done ? '#3B6D11' : active ? '#185FA5' : '#ccc',
        border: `1px solid ${done ? '#97C459' : active ? '#85B7EB' : '#e5e5e5'}`,
      }}>
        {done ? '✓' : active ? '⋯' : ''}
      </div>
      <div>
        <span style={{ fontSize: 13, display: 'block', color: done ? '#3B6D11' : active ? '#185FA5' : '#bbb', fontWeight: active ? 500 : 400 }}>{label}</span>
        {detail && <span style={{ fontSize: 11, color: '#999', display: 'block', marginTop: 2 }}>{detail}</span>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { textAlign: 'center', padding: '2rem 0' },
  spinner: {
    width: 36, height: 36, border: '3px solid #e5e7eb', borderTop: '3px solid #185FA5',
    borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite',
  },
  title: { fontSize: 16, fontWeight: 600, color: '#222', margin: '0 0 6px' },
  desc: { fontSize: 13, color: '#888', margin: '0 0 24px', lineHeight: 1.5 },
  steps: { textAlign: 'left', maxWidth: 340, margin: '0 auto' },
  warningBox: {
    marginTop: 24, padding: '14px 18px', background: '#FAEEDA',
    border: '1px solid #FAC775', borderRadius: 10, textAlign: 'left',
  },
  warningText: { fontSize: 12, color: '#633806', margin: '0 0 8px', lineHeight: 1.5 },
  codeBlock: {
    display: 'block', fontSize: 12, background: '#f5f0e5', padding: '8px 12px',
    borderRadius: 6, fontFamily: 'monospace', color: '#444',
  },
};
