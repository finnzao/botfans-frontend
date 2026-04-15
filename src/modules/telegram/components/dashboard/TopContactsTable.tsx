'use client';
import { timeAgo, contactDisplayName, contactInitials } from '@/core/lib/utils';
import type { TopContact } from '../../analytics.types';
interface Props { contacts: TopContact[]; }
export function TopContactsTable({ contacts }: Props) {
  if (contacts.length === 0) return <div style={st.empty}><p style={st.emptyText}>Nenhum contato ativo no período</p></div>;
  return (
    <div style={st.list}>
      {contacts.map((c, i) => (
        <div key={c.id} style={st.row}>
          <div style={st.rank}>{i + 1}</div>
          <div style={st.avatar}>{contactInitials(c.first_name, c.last_name)}</div>
          <div style={st.info}>
            <div style={st.nameRow}><span style={st.name}>{contactDisplayName(c.first_name, c.last_name, c.telegram_username)}</span>{c.is_new && <span style={st.newBadge}>Novo</span>}</div>
            {c.telegram_username && <span style={st.username}>@{c.telegram_username}</span>}
          </div>
          <div style={st.stats}><span style={st.msgCount}>{c.message_count} msgs</span><span style={st.lastSeen}>{timeAgo(c.last_message_at)}</span></div>
        </div>
      ))}
    </div>
  );
}
const st: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0' },
  rank: { width: 22, height: 22, borderRadius: '50%', background: '#e5e7eb', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: '#EEEDFE', color: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  info: { flex: 1, minWidth: 0 }, nameRow: { display: 'flex', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontWeight: 500, color: '#222' },
  newBadge: { fontSize: 9, fontWeight: 600, background: '#EAF3DE', color: '#3B6D11', padding: '1px 5px', borderRadius: 6 },
  username: { fontSize: 11, color: '#9ca3af', display: 'block' },
  stats: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  msgCount: { fontSize: 12, fontWeight: 600, color: '#185FA5' },
  lastSeen: { fontSize: 10, color: '#9ca3af' },
  empty: { padding: '2rem', textAlign: 'center', background: '#fafafa', borderRadius: 10, border: '1px dashed #ddd' },
  emptyText: { fontSize: 13, color: '#999', margin: 0 },
};
