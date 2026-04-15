'use client';
import { useEffect, useRef, useState } from 'react';
import { getFlowStatus } from '../api';
import type { StatusData } from '../api';
interface Props { onComplete: (status: string) => void; onError: (msg: string) => void; flowId: string; }
const POLL_INTERVAL = 2000; const WORKER_TIMEOUT = 300000;
export function CapturingScreen({ onComplete, onError, flowId }: Props) {
  const polling = useRef<ReturnType<typeof setInterval> | null>(null); const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0); const [currentStatus, setCurrentStatus] = useState('api_captured'); const [workerAction, setWorkerAction] = useState<string | null>('Iniciando...');
  useEffect(() => { startedAt.current = Date.now(); const tick = setInterval(() => { setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)); }, 1000);
    polling.current = setInterval(async () => { if (Date.now() - startedAt.current > WORKER_TIMEOUT) { stop(); onError('O worker não respondeu a tempo.'); return; }
      try { const res = await getFlowStatus(flowId); if (res.success && res.data) { const d = res.data as StatusData; const st = d.status; setCurrentStatus(st); if (d.workerAction) setWorkerAction(d.workerAction);
        if (st === 'awaiting_session_code' || st === 'awaiting_2fa') { stop(); onComplete(st); } else if (st === 'active') { stop(); onComplete('active'); } else if (st === 'error') { stop(); onError(d.errorMessage || 'Erro ao configurar.'); } else if (st === 'expired') { stop(); onError('Sessão expirada.'); } else if (st === 'disconnected') { stop(); onError(d.errorMessage || 'Reconexão falhou.'); } } } catch {} }, POLL_INTERVAL);
    return () => { stop(); clearInterval(tick); }; }, [flowId]);
  function stop() { if (polling.current) { clearInterval(polling.current); polling.current = null; } }
  const isReconnecting = currentStatus === 'reconnecting';
  function formatTime(seconds: number): string { const m = Math.floor(seconds / 60); const s = seconds % 60; if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`; return `${s}s`; }
  return (<div style={{ textAlign: 'center', padding: '2rem 0' }}>
    <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 20px' }}><div style={{ width: 48, height: 48, border: '3px solid #e5e7eb', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', position: 'absolute', inset: 0 }} /></div>
    <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>{isReconnecting ? 'Reconectando sessão...' : 'Configurando integração...'}</p>
    {workerAction && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#f0f7ff', borderRadius: 20, marginBottom: 16 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', animation: 'pulse 1.5s infinite' }} /><span style={{ fontSize: 13, color: '#1e40af', fontWeight: 500 }}>{workerAction}</span></div>}
    <div style={{ marginBottom: 20 }}><span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{formatTime(elapsed)}</span></div>
    {elapsed > 60 && <div style={{ marginTop: 8, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, textAlign: 'left' }}><p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>Está demorando mais que o esperado. Verifique se o worker Python está rodando.</p></div>}
  </div>);
}
