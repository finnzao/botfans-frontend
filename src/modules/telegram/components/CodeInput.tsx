'use client';
import { useState, useRef, useEffect } from 'react';
interface Props { length?: number; title: string; description: string; descriptionColor?: string; descriptionBg?: string; descriptionBorder?: string; buttonText: string; loading?: boolean; error?: string; onSubmit: (code: string) => void; passwordMode?: boolean; passwordLabel?: string; }
export function CodeInput({ title, description, descriptionColor = '#633806', descriptionBg = '#FAEEDA', descriptionBorder = '#FAC775', buttonText, loading = false, error, onSubmit, passwordMode = false, passwordLabel = 'Senha' }: Props) {
  const [code, setCode] = useState(''); const [password, setPassword] = useState(''); const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, [passwordMode]);
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); if (passwordMode) { if (password.length > 0) onSubmit(password); } else { const trimmed = code.trim(); if (trimmed.length > 0) onSubmit(trimmed); } }
  return (<div>
    <div style={{ background: descriptionBg, border: `1px solid ${descriptionBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}><p style={{ fontSize: 13, color: descriptionColor, margin: 0, lineHeight: 1.6 }}>{description}</p></div>
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      {passwordMode ? (<div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}><label style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{passwordLabel}</label><input ref={inputRef} type="password" placeholder="Digite sua senha de verificação em duas etapas" value={password} onChange={e => setPassword(e.target.value)} required autoFocus style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none' }} /></div>)
      : (<div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 340 }}><label style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>Código de verificação</label><input ref={inputRef} type="text" placeholder="Ex: f2HHS4A04Ug" value={code} onChange={e => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" style={{ padding: '14px 16px', fontSize: 20, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center', border: '2px solid #ddd', borderRadius: 10, outline: 'none' }} /></div>)}
      {error && <p style={{ fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: 0, textAlign: 'center', width: '100%' }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ padding: '12px 32px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, width: '100%', maxWidth: 340, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Verificando...' : buttonText}</button>
    </form>
  </div>);
}
