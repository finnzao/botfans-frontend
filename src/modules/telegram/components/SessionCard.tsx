'use client';

import { formatPhone } from '@/core/lib/utils';

interface Props {
  step: string;
  phone: string | null;
  hasSession: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
  reconnecting: boolean;
}

export function SessionCard({ step, phone, hasSession, onDisconnect, onReconnect, reconnecting }: Props) {
  if (step === 'active') {
    return (
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.iconBox}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
          <div style={styles.info}>
            <div style={styles.statusRow}><span style={styles.dot} /><span style={styles.statusLabel}>Telegram conectado</span></div>
            {phone && <span style={styles.phone}>{formatPhone(phone)}</span>}
            <span style={styles.detail}>Assistente ativo e respondendo mensagens</span>
          </div>
          <button onClick={onDisconnect} style={styles.disconnectBtn}>Desconectar</button>
        </div>
      </div>
    );
  }
  if (step === 'disconnected' && hasSession) {
    return (
      <div style={{ ...styles.card, borderColor: 'var(--amber-border)' }}>
        <div style={styles.row}>
          <div style={{ ...styles.iconBox, background: 'var(--amber-light)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
          <div style={styles.info}>
            <div style={styles.statusRow}><span style={{ ...styles.dot, background: 'var(--amber)' }} /><span style={{ ...styles.statusLabel, color: 'var(--amber)' }}>Desconectado</span></div>
            {phone && <span style={styles.phone}>{formatPhone(phone)}</span>}
            <span style={styles.detail}>Sessão salva — reconecte sem precisar de códigos</span>
          </div>
          <button onClick={onReconnect} disabled={reconnecting} style={{ ...styles.reconnectBtn, opacity: reconnecting ? 0.6 : 1 }}>
            {reconnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--bg-card)', border: '1px solid var(--green-border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 24, boxShadow: 'var(--shadow-sm)' },
  row: { display: 'flex', alignItems: 'center', gap: 16 },
  iconBox: { width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  statusRow: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' },
  statusLabel: { fontSize: 13, fontWeight: 600, color: 'var(--green)' },
  phone: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' },
  detail: { fontSize: 12, color: 'var(--text-secondary)' },
  disconnectBtn: { fontSize: 12, fontWeight: 500, padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', cursor: 'pointer', flexShrink: 0 },
  reconnectBtn: { fontSize: 13, fontWeight: 600, padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', cursor: 'pointer', flexShrink: 0 },
};
