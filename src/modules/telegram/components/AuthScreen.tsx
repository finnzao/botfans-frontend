'use client';
import { useState } from 'react';
import { useTenant } from '@/core/lib/tenant-context';

export function AuthScreen() {
  const { login, register, error } = useTenant();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try { if (mode === 'register') await register(email, password, ownerName); else await login(email, password); } finally { setLoading(false); }
  }

  return (
    <div style={s.page}><div style={s.card}>
      <div style={s.logoRow}><div style={s.logoIcon}>B</div><span style={s.logoText}>BotFans</span></div>
      <h2 style={s.title}>{mode === 'login' ? 'Acessar sua conta' : 'Criar sua conta'}</h2>
      <p style={s.subtitle}>{mode === 'login' ? 'Entre para gerenciar sua assistente IA' : 'Configure sua assistente em minutos'}</p>
      <form onSubmit={handleSubmit} style={s.form}>
        {mode === 'register' && <div style={s.field}><label style={s.label}>Seu nome</label><input style={s.input} placeholder="Ex: Maria Silva" value={ownerName} onChange={e => setOwnerName(e.target.value)} required /></div>}
        <div style={s.field}><label style={s.label}>Email</label><input style={s.input} type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div style={s.field}><label style={s.label}>Senha</label><input style={s.input} type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></div>
        {error && <p style={s.error}>{error}</p>}
        <button type="submit" disabled={loading} style={{ ...s.button, opacity: loading ? 0.6 : 1 }}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
      </form>
      <p style={s.switchText}>{mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}<button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={s.switchBtn}>{mode === 'login' ? 'Criar conta' : 'Fazer login'}</button></p>
    </div></div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-body)', padding: 20 },
  card: { background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: '44px 40px', width: '100%', maxWidth: 400, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 0.3s ease' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  logoText: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  title: { fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 28px' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: { padding: '11px 14px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)' },
  error: { fontSize: 13, color: 'var(--red)', background: 'var(--red-light)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', margin: 0 },
  button: { padding: '12px', fontSize: 14, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginTop: 4 },
  switchText: { fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 24 },
  switchBtn: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
};
