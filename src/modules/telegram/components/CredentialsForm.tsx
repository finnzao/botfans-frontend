'use client';
import { useState } from 'react';
import { initSession } from '../api';
interface Props { tenantId: string; onSuccess: (sessionId: string) => void; }
export function CredentialsForm({ tenantId, onSuccess }: Props) {
  const [phone, setPhone] = useState(''); const [apiId, setApiId] = useState(''); const [apiHash, setApiHash] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); setLoading(true); try { const res = await initSession({ phone, apiId, apiHash, tenantId }); if (res.success && res.data?.id) onSuccess(res.data.id); else setError(res.error || 'Erro'); } catch { setError('Erro de conexão'); } finally { setLoading(false); } }
  return (<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <input type="tel" placeholder="+5511999999999" value={phone} onChange={e => setPhone(e.target.value)} required style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }} />
    <input placeholder="API ID" value={apiId} onChange={e => setApiId(e.target.value)} required style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }} />
    <input placeholder="API Hash" value={apiHash} onChange={e => setApiHash(e.target.value)} required style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }} />
    {error && <p style={{ color: '#A32D2D', fontSize: 13 }}>{error}</p>}
    <button type="submit" disabled={loading} style={{ padding: '12px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, opacity: loading ? 0.6 : 1 }}>{loading ? 'Conectando...' : 'Iniciar'}</button>
  </form>);
}
