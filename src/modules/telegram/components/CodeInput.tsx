'use client';

import { useState, useRef, useEffect } from 'react';

interface Props {
  length?: number;
  title: string;
  description: string;
  descriptionColor?: string;
  descriptionBg?: string;
  descriptionBorder?: string;
  buttonText: string;
  loading?: boolean;
  error?: string;
  onSubmit: (code: string) => void;
  /** Se true, mostra campo de senha ao invés dos dígitos */
  passwordMode?: boolean;
  passwordLabel?: string;
}

export function CodeInput({
  length = 5,
  title,
  description,
  descriptionColor = '#633806',
  descriptionBg = '#FAEEDA',
  descriptionBorder = '#FAC775',
  buttonText,
  loading = false,
  error,
  onSubmit,
  passwordMode = false,
  passwordLabel = 'Senha',
}: Props) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''));
  const [password, setPassword] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!passwordMode) inputRefs.current[0]?.focus();
  }, [passwordMode]);

  function handleChange(index: number, value: string) {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted.length >= length) {
      const digits = pasted.split('').slice(0, length);
      setCode(digits);
      inputRefs.current[length - 1]?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordMode) {
      if (password.length > 0) onSubmit(password);
    } else {
      const full = code.join('');
      if (full.length === length) onSubmit(full);
    }
  }

  return (
    <div>
      <div style={{ background: descriptionBg, border: `1px solid ${descriptionBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: descriptionColor, margin: 0, lineHeight: 1.6 }}>
          {description}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        {passwordMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{passwordLabel}</label>
            <input
              type="password"
              placeholder="Digite sua senha de verificação em duas etapas"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              style={{ padding: '10px 14px', fontSize: 14, border: '1px solid #ddd', borderRadius: 8, outline: 'none' }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                style={{
                  width: 48, height: 56, textAlign: 'center', fontSize: 22,
                  fontWeight: 700, fontFamily: 'monospace',
                  border: `2px solid ${digit ? '#185FA5' : '#ddd'}`,
                  borderRadius: 10, outline: 'none', transition: 'border-color 0.2s',
                }}
              />
            ))}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, color: '#A32D2D', background: '#FCEBEB', padding: '8px 12px', borderRadius: 6, margin: 0, textAlign: 'center', width: '100%' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '12px 32px', fontSize: 14, fontWeight: 600, background: '#185FA5',
          color: '#fff', border: 'none', borderRadius: 8, width: '100%', maxWidth: 340,
          opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Verificando...' : buttonText}
        </button>
      </form>
    </div>
  );
}
