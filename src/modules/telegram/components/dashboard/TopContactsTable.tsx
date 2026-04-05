'use client';

import type { TopContact } from '../../analytics.types';

interface Props {
  contacts: TopContact[];
}

function contactName(c: TopContact): string {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  return parts.join(' ') || c.telegram_username || 'Desconhecido';
}

function initials(c: TopContact): string {
  return ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase() || '?';
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

export function TopContactsTable({ contacts }: Props) {
  if (contacts.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Nenhum contato ativo no período</p>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {contacts.map((c, i) => (
        <div key={c.id} style={styles.row}>
          <div style={styles.rank}>{i + 1}</div>
          <div style={styles.avatar}>{initials(c)}</div>
          <div style={styles.info}>
            <div style={styles.nameRow}>
              <span style={styles.name}>{contactName(c)}</span>
              {c.is_new && <span style={styles.newBadge}>Novo</span>}
            </div>
            {c.telegram_username && (
              <span style={styles.username}>@{c.telegram_username}</span>
            )}
          </div>
          <div style={styles.stats}>
            <span style={styles.msgCount}>{c.message_count} msgs</span>
            <span style={styles.lastSeen}>{timeAgo(c.last_message_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: '#fafafa',
    border: '1px solid #f0f0f0',
  },
  rank: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#e5e7eb',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#EEEDFE',
    color: '#534AB7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontWeight: 500, color: '#222' },
  newBadge: {
    fontSize: 9,
    fontWeight: 600,
    background: '#EAF3DE',
    color: '#3B6D11',
    padding: '1px 5px',
    borderRadius: 6,
  },
  username: { fontSize: 11, color: '#9ca3af', display: 'block' },
  stats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  msgCount: { fontSize: 12, fontWeight: 600, color: '#185FA5' },
  lastSeen: { fontSize: 10, color: '#9ca3af' },
  empty: {
    padding: '2rem',
    textAlign: 'center',
    background: '#fafafa',
    borderRadius: 10,
    border: '1px dashed #ddd',
  },
  emptyText: { fontSize: 13, color: '#999', margin: 0 },
};
