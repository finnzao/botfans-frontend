'use client';

import { useState, useRef, useEffect } from 'react';
import { verifyCode } from '../api';

interface Props {
  sessionId: string;
  needs2fa?: boolean;
  onSuccess: () => void;
  onNeed2fa: () => void;
}

export function VerifyCodeForm({ sessionId, needs2fa, onSuccess, onNeed2fa }: Props) {
  const [code, setCode] = useState(['', '', '', '', '']);
  const [password2fa, setPassword2fa] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function handleCodeChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    if (value && index < 4) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (pasted.length === 5) { setCode(pasted.split('')); inputRefs.current[4]?.focus(); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 5) return;
    setError('');
    setLoading(true);
    try {
      const res = await verifyCode({ sessionId, code: fullCode, password2fa: password2fa || undefined });
      if (res.success) {
        if (res.data?.status === 'awaiting_2fa' || res.data?.status === 'verify_2fa') onNeed2fa();
        else onSuccess();
      } else {
        setError(res.error || 'Código inválido');
      }
    } catch { setError('Erro de conexão'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div style={styles.infoBox}>
        <p style={styles.infoText}>
          {needs2fa
            ? 'Sua conta tem verificação em duas etapas. Digite a senha cloud do Telegram.'
            : 'Um código de 5 dígitos foi enviado para o seu app do Telegram. Digite-o abaixo.'}
        </p>
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        {!needs2fa && (
          <div style={styles.codeContainer} onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input key={i} ref={el => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={e => handleCodeChange(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
                style={{ ...styles.codeInput, borderColor: digit ? '#185FA5' : '#ddd' }} />
            ))}
          </div>
        )}
        {needs2fa && (
          <div style={styles.field}>
            <label style={styles.label}>Senha 2FA (Cloud Password)</label>
            <input type="password" placeholder="Sua senha de verificação em duas etapas" value={password2fa}
              onChange={e => setPassword2fa(e.target.value)} required style={styles.input} autoFocus />
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Verificando...' : 'Verificar'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  infoBox: { background: '#FAEEDA', border: '1px solid #FAC775', borderRadius: 10, padding: '12px 16px', marginBottom: 24 },
  infoText: { fontSize: 13, color: '#633806', margin: 0, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' },
  codeContainer: { display: 'flex', gap: 10, justifyContent: 'center' },
  codeInput: { width: 48, height: 56, textAlign: 'center' as const, fontSize: 22, fontWeight: 700, fontFamily: 'monospace', border: '2px solid #ddd', borderRadius: 10, outline: 'none', transition: 'border-color 0.2s' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' },
  label: { fontSize: 13, fontWeight: 500, color: '#333' },
  input: { padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none' },
  button: { padding: '12px 32px', fontSize: 14, fontWeight: 600, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, width: '100%', maxWidth: 300 },
  error: { fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: 0, textAlign: 'center' as const },
};
