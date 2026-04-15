'use client';
import { useState, useRef, useEffect } from 'react';
import { useTenant } from '@/core/lib/tenant-context';
interface Props { onOpenSettings: () => void; }
export function ProfileDropdown({ onOpenSettings }: Props) {
  const { tenant, logout } = useTenant(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function handleClickOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } if (open) document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, [open]);
  if (!tenant) return null;
  const initial = tenant.ownerName?.[0]?.toUpperCase() || 'U';
  const memberSince = tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : null;
  return (<div ref={ref} style={{ position: 'relative' }}>
    <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{initial}</div>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{tenant.displayName || tenant.ownerName}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
    </button>
    {open && (<div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 100, animation: 'fadeIn 0.15s ease', overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{initial}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{tenant.ownerName}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{tenant.email}</span>{memberSince && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Membro desde {memberSince}</span>}</div>
      </div>
      <div style={{ height: 1, background: 'var(--border)' }} />
      <button onClick={() => { setOpen(false); onOpenSettings(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'left' as const }}>Configurações da conta</button>
      <button onClick={() => { setOpen(false); logout(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--red)', textAlign: 'left' as const }}>Sair da conta</button>
    </div>)}
  </div>);
}
