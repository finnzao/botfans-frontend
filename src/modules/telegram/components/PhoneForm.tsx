'use client';

import { useState } from 'react';
import { startFlow } from '../api';

interface Props {
  tenantId: string;
  onSuccess: (flowId: string) => void;
}

export function PhoneForm({ tenantId, onSuccess }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function formatPhone(value: string): string {
    const digits = value.replace(/[^\d+]/g, '');
    if (!digits.startsWith('+')) return '+' + digits;
    return digits;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Número inválido. Use o formato internacional: +5511999999999');
      return;
    }

    setLoading(true);
    try {
      const res = await startFlow(tenantId, cleaned);
      if (res.success && res.data?.flowId) {
        onSuccess(res.data.flowId);
      } else {
        setError(res.error || 'Erro ao enviar código. Tente novamente.');
      }
    } catch {
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={styles.infoBox}>
        <p style={styles.infoText}>
          Informe o número do Telegram que será usado como assistente.
          Vamos enviar um código de confirmação para o seu app Telegram.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Número do Telegram</label>
          <input
            type="tel"
            placeholder="+55 11 99999-9999"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            required
            autoFocus
            style={styles.input}
          />
          <span style={styles.hint}>Formato internacional com código do país</span>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          ...styles.button,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Enviando código...' : 'Enviar código de verificação'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  infoBox: {
    background: '#E6F1FB', border: '1px solid #B5D4F4', borderRadius: 10,
    padding: '14px 18px', marginBottom: 24,
  },
  infoText: { fontSize: 13, color: '#0C447C', margin: 0, lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: '#333' },
  input: {
    padding: '12px 14px', fontSize: 16, border: '1px solid #ddd', borderRadius: 8,
    outline: 'none', fontFamily: 'monospace', letterSpacing: 1,
  },
  hint: { fontSize: 11, color: '#999' },
  button: {
    padding: '12px 24px', fontSize: 14, fontWeight: 600, background: '#185FA5',
    color: '#fff', border: 'none', borderRadius: 8, marginTop: 8,
  },
  error: {
    fontSize: 13, color: '#A32D2D', background: '#FCEBEB',
    padding: '8px 12px', borderRadius: 6, margin: 0,
  },
};
