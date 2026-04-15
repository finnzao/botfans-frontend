'use client';
import { useState } from 'react';
interface Props { tenantId: string; onSuccess: () => void; }
export function AiProfileForm({ tenantId, onSuccess }: Props) {
  const [businessName, setBusinessName] = useState(''); const [tone, setTone] = useState('informal');
  const [welcomeMessage, setWelcomeMessage] = useState('Olá! Seja bem-vindo(a)!'); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); setLoading(true); try { const res = await fetch('/api/telegram/ai-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, businessName, tone, welcomeMessage }) }); const data = await res.json(); if (data.success) onSuccess(); else setError(data.error || 'Erro'); } catch { setError('Erro de conexão'); } finally { setLoading(false); } }
  return (<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <input placeholder="Nome do negócio" value={businessName} onChange={e => setBusinessName(e.target.value)} required style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8 }} />
    <select value={tone} onChange={e => setTone(e.target.value)} style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8 }}><option value="informal">Informal</option><option value="formal">Formal</option></select>
    <textarea placeholder="Mensagem de boas-vindas" value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} rows={3} style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit' }} />
    {error && <p style={{ color: '#A32D2D', fontSize: 13 }}>{error}</p>}
    <button type="submit" disabled={loading} style={{ padding: '12px', fontSize: 14, fontWeight: 600, background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, opacity: loading ? 0.6 : 1 }}>{loading ? 'Salvando...' : 'Salvar'}</button>
  </form>);
}
