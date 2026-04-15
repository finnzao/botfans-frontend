'use client';
import { useState } from 'react';
import { startFlow } from '../api';
interface Props { tenantId: string; onSuccess: (flowId: string) => void; }
export function PhoneForm({ tenantId, onSuccess }: Props) {
  const [phone, setPhone] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); setError(''); const cleaned = phone.replace(/\s/g, ''); if (cleaned.length < 10) { setError('Número inválido.'); return; } setLoading(true); try { const res = await startFlow(tenantId, cleaned); if (res.success && res.data?.flowId) onSuccess(res.data.flowId); else setError(res.error || 'Erro'); } catch { setError('Erro de conexão'); } finally { setLoading(false); } }
  return (<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <input type="tel" placeholder="+55 11 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} required style={{ padding: '12px', fontSize: 16, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }} />
    {error && <p style={{ color: '#A32D2D', fontSize: 13 }}>{error}</p>}
    <button type="submit" disabled={loading} style={{ padding: '12px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, opacity: loading ? 0.6 : 1 }}>{loading ? 'Enviando...' : 'Enviar código'}</button>
  </form>);
}
