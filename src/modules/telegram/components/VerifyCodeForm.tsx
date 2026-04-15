'use client';
import { useState, useRef, useEffect } from 'react';
import { verifyCode } from '../api';
interface Props { sessionId: string; needs2fa?: boolean; onSuccess: () => void; onNeed2fa: () => void; }
export function VerifyCodeForm({ sessionId, needs2fa, onSuccess, onNeed2fa }: Props) {
  const [code, setCode] = useState(['', '', '', '', '']); const [password2fa, setPassword2fa] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);
  function handleCodeChange(index: number, value: string) { if (value.length > 1) value = value.slice(-1); if (!/^\d*$/.test(value)) return; const newCode = [...code]; newCode[index] = value; setCode(newCode); if (value && index < 4) inputRefs.current[index + 1]?.focus(); }
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); const fullCode = code.join(''); if (fullCode.length !== 5) return; setLoading(true); try { const res = await verifyCode({ sessionId, code: fullCode, password2fa: password2fa || undefined }); if (res.success) { if (res.data?.status === 'awaiting_2fa') onNeed2fa(); else onSuccess(); } else setError(res.error || 'Código inválido'); } catch { setError('Erro de conexão'); } finally { setLoading(false); } }
  return (<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
    {!needs2fa && <div style={{ display: 'flex', gap: 10 }}>{code.map((digit, i) => (<input key={i} ref={el => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={e => handleCodeChange(i, e.target.value)} style={{ width: 48, height: 56, textAlign: 'center' as const, fontSize: 22, fontWeight: 700, fontFamily: 'monospace', border: '2px solid #ddd', borderRadius: 10, outline: 'none' }} />))}</div>}
    {needs2fa && <input type="password" placeholder="Senha 2FA" value={password2fa} onChange={e => setPassword2fa(e.target.value)} required autoFocus style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, width: '100%' }} />}
    {error && <p style={{ color: '#A32D2D', fontSize: 13 }}>{error}</p>}
    <button type="submit" disabled={loading} style={{ padding: '12px 32px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, width: '100%', maxWidth: 300, opacity: loading ? 0.6 : 1 }}>{loading ? 'Verificando...' : 'Verificar'}</button>
  </form>);
}
