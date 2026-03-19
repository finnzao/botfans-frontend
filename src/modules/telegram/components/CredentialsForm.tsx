'use client';

import { useState } from 'react';
import { initSession } from '../api';

interface Props {
  tenantId: string;
  onSuccess: (sessionId: string) => void;
}

export function CredentialsForm({ tenantId, onSuccess }: Props) {
  const [phone, setPhone] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await initSession({ phone, apiId, apiHash, tenantId });
      if (res.success && res.data?.id) {
        onSuccess(res.data.id);
      } else {
        setError(res.error || 'Erro ao iniciar sessão');
      }
    } catch {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={styles.infoBox}>
        <p style={styles.infoTitle}>Como obter as credenciais</p>
        <ol style={styles.infoList}>
          <li>Acesse <strong>my.telegram.org</strong> e faça login</li>
          <li>Clique em <strong>API development tools</strong></li>
          <li>Crie um novo App (nome e descrição podem ser qualquer coisa)</li>
          <li>Copie o <strong>App api_id</strong> e <strong>App api_hash</strong></li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Número do Telegram</label>
          <input
            type="tel"
            placeholder="+5511999999999"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            style={styles.input}
          />
          <span style={styles.hint}>Formato internacional com código do país</span>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>API ID</label>
          <input
            type="text"
            placeholder="12345678"
            value={apiId}
            onChange={e => setApiId(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>API Hash</label>
          <input
            type="text"
            placeholder="a1b2c3d4e5f6..."
            value={apiHash}
            onChange={e => setApiHash(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          ...styles.button,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Conectando...' : 'Iniciar conexão'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  infoBox: {
    background: '#f0f7ff',
    border: '1px solid #c5ddf5',
    borderRadius: 10,
    padding: '14px 18px',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#185FA5',
    margin: '0 0 8px',
  },
  infoList: {
    fontSize: 13,
    color: '#333',
    margin: 0,
    paddingLeft: 18,
    lineHeight: 1.7,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: '#333',
  },
  input: {
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 11,
    color: '#999',
  },
  button: {
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    background: '#185FA5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    marginTop: 8,
  },
  error: {
    fontSize: 13,
    color: '#A32D2D',
    background: '#FCEBEB',
    padding: '8px 12px',
    borderRadius: 6,
    margin: 0,
  },
};
