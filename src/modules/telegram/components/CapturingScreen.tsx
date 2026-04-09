'use client';

import { useEffect, useRef, useState } from 'react';
import { getFlowStatus } from '../api';
import type { StatusData } from '../api';

interface Props {
  onComplete: (status: string) => void;
  onError: (msg: string) => void;
  flowId: string;
}

const POLL_INTERVAL = 2000;
const WORKER_TIMEOUT = 300000;

export function CapturingScreen({ onComplete, onError, flowId }: Props) {
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('api_captured');
  const [workerAction, setWorkerAction] = useState<string | null>('Iniciando...');

  useEffect(() => {
    startedAt.current = Date.now();

    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);

    polling.current = setInterval(async () => {
      if (Date.now() - startedAt.current > WORKER_TIMEOUT) {
        stop();
        onError('O worker não respondeu a tempo. Verifique se está rodando.');
        return;
      }

      try {
        const res = await getFlowStatus(flowId);
        if (res.success && res.data) {
          const d = res.data as StatusData;
          const st = d.status;
          setCurrentStatus(st);

          if (d.workerAction) {
            setWorkerAction(d.workerAction);
          }

          if (st === 'awaiting_session_code' || st === 'awaiting_2fa') {
            stop();
            onComplete(st);
          } else if (st === 'active') {
            stop();
            onComplete('active');
          } else if (st === 'error') {
            stop();
            onError(d.errorMessage || 'Erro ao configurar. Tente novamente.');
          } else if (st === 'expired') {
            stop();
            onError('Sessão expirada. Inicie novamente.');
          } else if (st === 'disconnected') {
            stop();
            onError(d.errorMessage || 'Reconexão falhou.');
          }
        }
      } catch {}
    }, POLL_INTERVAL);

    return () => { stop(); clearInterval(tick); };
  }, [flowId]);

  function stop() {
    if (polling.current) { clearInterval(polling.current); polling.current = null; }
  }

  const isReconnecting = currentStatus === 'reconnecting';

  return (
    <div style={s.container}>
      <div style={s.spinnerWrap}>
        <div style={s.spinner} />
        <div style={s.spinnerPulse} />
      </div>

      <p style={s.title}>
        {isReconnecting ? 'Reconectando sessão...' : 'Configurando integração...'}
      </p>

      {workerAction && (
        <div style={s.actionBox}>
          <div style={s.actionDot} />
          <span style={s.actionText}>{workerAction}</span>
        </div>
      )}

      <div style={s.timerBox}>
        <span style={s.timerText}>{formatTime(elapsed)}</span>
      </div>

      <div style={s.steps}>
        <StepLine
          label="Credenciais API"
          done
        />
        <StepLine
          label={isReconnecting ? 'Conectando ao Telegram' : 'Iniciando sessão'}
          active={['api_captured', 'capturing_api', 'reconnecting'].includes(currentStatus)}
          done={['awaiting_session_code', 'awaiting_2fa', 'active', 'verifying_code', 'verifying_2fa'].includes(currentStatus)}
        />
        <StepLine
          label="Verificação"
          active={['verifying_code', 'verifying_2fa'].includes(currentStatus)}
          done={currentStatus === 'active'}
        />
      </div>

      {elapsed > 60 && (
        <div style={s.warningBox}>
          <p style={s.warningText}>
            Está demorando mais que o esperado. Verifique se o worker Python está rodando.
          </p>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function StepLine({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
        background: done ? '#dcfce7' : active ? '#dbeafe' : '#f5f5f5',
        color: done ? '#16a34a' : active ? '#2563eb' : '#ccc',
        border: `2px solid ${done ? '#86efac' : active ? '#93c5fd' : '#e5e5e5'}`,
        transition: 'all 0.3s ease',
      }}>
        {done ? '✓' : active ? <span style={{ animation: 'pulse 1s infinite' }}>●</span> : ''}
      </div>
      <span style={{
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: done ? '#16a34a' : active ? '#2563eb' : '#bbb',
        transition: 'all 0.3s ease',
      }}>
        {label}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { textAlign: 'center', padding: '2rem 0' },
  spinnerWrap: { position: 'relative', width: 48, height: 48, margin: '0 auto 20px' },
  spinner: {
    width: 48, height: 48, border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', position: 'absolute', inset: 0,
  },
  spinnerPulse: {
    width: 48, height: 48, borderRadius: '50%', background: 'rgba(37, 99, 235, 0.08)',
    animation: 'pulse 2s ease-in-out infinite', position: 'absolute', inset: 0,
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' },
  actionBox: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', background: '#f0f7ff', borderRadius: 20,
    marginBottom: 16,
  },
  actionDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#2563eb',
    animation: 'pulse 1.5s infinite',
  },
  actionText: { fontSize: 13, color: '#1e40af', fontWeight: 500 },
  timerBox: { marginBottom: 20 },
  timerText: { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' },
  steps: { textAlign: 'left', maxWidth: 280, margin: '0 auto', marginBottom: 16 },
  warningBox: {
    marginTop: 8, padding: '12px 16px', background: '#fffbeb',
    border: '1px solid #fde68a', borderRadius: 10, textAlign: 'left',
  },
  warningText: { fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 },
};
