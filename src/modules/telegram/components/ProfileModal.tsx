'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/core/lib/tenant-context';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ActiveSection = 'profile' | 'password';

export function ProfileModal({ open, onClose }: Props) {
  const { tenant, updateTenantLocal } = useTenant();

  const [section, setSection] = useState<ActiveSection>('profile');

  const [ownerName, setOwnerName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (open && tenant) {
      setOwnerName(tenant.ownerName || '');
      setDisplayName(tenant.displayName || '');
      setEmail(tenant.email || '');
      setProfileMsg(null);
      setPwMsg(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSection('profile');
    }
  }, [open, tenant]);

  if (!open || !tenant) return null;

  const memberSince = tenant.createdAt
    ? new Date(tenant.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N/A';

  async function handleSaveProfile() {
    setProfileMsg(null);
    setProfileLoading(true);
    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', tenantId: tenant!.tenantId, ownerName, displayName, email }),
      });
      const data = await res.json();
      if (data.success) {
        updateTenantLocal({ ownerName, displayName, email });
        setProfileMsg({ type: 'ok', text: 'Perfil atualizado' });
      } else {
        setProfileMsg({ type: 'err', text: data.error || 'Erro ao salvar' });
      }
    } catch {
      setProfileMsg({ type: 'err', text: 'Erro de conexão' });
    } finally { setProfileLoading(false); }
  }

  async function handleChangePassword() {
    setPwMsg(null);
    if (newPassword.length < 6) { setPwMsg({ type: 'err', text: 'Nova senha deve ter pelo menos 6 caracteres' }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: 'As senhas não coincidem' }); return; }

    setPwLoading(true);
    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', tenantId: tenant!.tenantId, currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso' });
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setPwMsg({ type: 'err', text: data.error || 'Erro ao trocar senha' });
      }
    } catch {
      setPwMsg({ type: 'err', text: 'Erro de conexão' });
    } finally { setPwLoading(false); }
  }

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      padding: '8px 16px',
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      background: 'none',
      border: 'none',
      borderBottomWidth: 2,
      borderBottomStyle: 'solid',
      borderBottomColor: active ? 'var(--accent)' : 'transparent',
      cursor: 'pointer',
      marginBottom: -1,
    };
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Configurações da conta</h2>
          <button onClick={onClose} style={s.closeBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={s.sectionTabs}>
          <button onClick={() => setSection('profile')} style={tabStyle(section === 'profile')}>Perfil</button>
          <button onClick={() => setSection('password')} style={tabStyle(section === 'password')}>Segurança</button>
        </div>

        <div style={s.modalBody}>
          {section === 'profile' && (
            <div style={s.sectionContent}>
              <div style={s.infoCard}>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>ID da conta</span>
                  <span style={s.infoValueMono}>{tenant.tenantId.slice(0, 8)}...</span>
                </div>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Membro desde</span>
                  <span style={s.infoValue}>{memberSince}</span>
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Nome completo</label>
                <input style={s.input} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Nome de exibição</label>
                <input style={s.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Como quer ser chamada" />
                <span style={s.hint}>Aparece no painel e nas interações</span>
              </div>
              <div style={s.field}>
                <label style={s.label}>Email</label>
                <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
              </div>

              {profileMsg && <div style={{ ...s.msg, ...(profileMsg.type === 'ok' ? s.msgOk : s.msgErr) }}>{profileMsg.text}</div>}
              <button onClick={handleSaveProfile} disabled={profileLoading} style={{ ...s.primaryBtn, opacity: profileLoading ? 0.6 : 1 }}>
                {profileLoading ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          )}

          {section === 'password' && (
            <div style={s.sectionContent}>
              <p style={s.sectionDesc}>Informe a senha atual e escolha uma nova com pelo menos 6 caracteres.</p>
              <div style={s.field}>
                <label style={s.label}>Senha atual</label>
                <input style={s.input} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Digite sua senha atual" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Nova senha</label>
                <input style={s.input} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Confirmar nova senha</label>
                <input style={s.input} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
              </div>

              {pwMsg && <div style={{ ...s.msg, ...(pwMsg.type === 'ok' ? s.msgOk : s.msgErr) }}>{pwMsg.text}</div>}
              <button onClick={handleChangePassword} disabled={pwLoading} style={{ ...s.primaryBtn, opacity: pwLoading ? 0.6 : 1 }}>
                {pwLoading ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 20, animation: 'fadeIn 0.15s ease',
  },
  modal: {
    background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
    width: '100%', maxWidth: 480, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px 0',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, border: 'none',
    background: 'var(--bg-muted)', color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  sectionTabs: {
    display: 'flex', gap: 0, padding: '16px 24px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  modalBody: { padding: '20px 24px 24px', overflowY: 'auto' as const, flex: 1 },
  sectionContent: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionDesc: { fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 },
  infoCard: {
    background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)',
    padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: 'var(--text-secondary)' },
  infoValue: { fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' },
  infoValueMono: { fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  input: {
    padding: '10px 14px', fontSize: 14, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)',
  },
  hint: { fontSize: 11, color: 'var(--text-tertiary)' },
  msg: { fontSize: 13, padding: '10px 14px', borderRadius: 'var(--radius-sm)', margin: 0 },
  msgOk: { background: 'var(--green-light)', color: 'var(--green)' },
  msgErr: { background: 'var(--red-light)', color: 'var(--red)' },
  primaryBtn: {
    padding: '11px 20px', fontSize: 14, fontWeight: 600,
    background: 'var(--accent)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', alignSelf: 'flex-start',
  },
};
