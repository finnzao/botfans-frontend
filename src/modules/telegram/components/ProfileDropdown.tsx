'use client';

import { useState, useRef, useEffect } from 'react';
import { useTenant } from '@/core/lib/tenant-context';

interface Props {
  onOpenSettings: () => void;
}

export function ProfileDropdown({ onOpenSettings }: Props) {
  const { tenant, logout } = useTenant();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!tenant) return null;

  const initial = tenant.ownerName?.[0]?.toUpperCase() || 'U';
  const memberSince = tenant.createdAt
    ? new Date(tenant.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div ref={ref} style={s.wrapper}>
      <button onClick={() => setOpen(!open)} style={s.trigger}>
        <div style={s.avatar}>{initial}</div>
        <span style={s.name}>{tenant.displayName || tenant.ownerName}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={s.dropdown}>
          <div style={s.dropdownHeader}>
            <div style={s.avatarLg}>{initial}</div>
            <div style={s.headerInfo}>
              <span style={s.headerName}>{tenant.ownerName}</span>
              <span style={s.headerEmail}>{tenant.email}</span>
              {memberSince && <span style={s.headerSince}>Membro desde {memberSince}</span>}
            </div>
          </div>

          <div style={s.divider} />

          <button onClick={() => { setOpen(false); onOpenSettings(); }} style={s.menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Configurações da conta
          </button>

          <button onClick={() => { setOpen(false); logout(); }} style={{ ...s.menuItem, color: 'var(--red)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { position: 'relative' },
  trigger: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px 6px', borderRadius: 8,
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'var(--purple-light)', color: 'var(--purple)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
  },
  name: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    width: 280, background: 'var(--bg-card)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)', zIndex: 100,
    animation: 'fadeIn 0.15s ease',
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: '16px 16px 14px',
    display: 'flex', gap: 12, alignItems: 'flex-start',
  },
  avatarLg: {
    width: 40, height: 40, borderRadius: '50%',
    background: 'var(--purple-light)', color: 'var(--purple)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 600, flexShrink: 0,
  },
  headerInfo: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  headerName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  headerEmail: { fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  headerSince: { fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 },
  divider: { height: 1, background: 'var(--border)' },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '11px 16px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
    textAlign: 'left' as const,
  },
};
