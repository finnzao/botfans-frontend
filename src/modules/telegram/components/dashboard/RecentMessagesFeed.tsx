'use client';
import { timeAgo, contactDisplayName } from '@/core/lib/utils';
import type { RecentMessage } from '../../analytics.types';
interface Props { messages: RecentMessage[]; }
function truncate(str: string, len: number): string { return str.length <= len ? str : str.substring(0, len) + '...'; }
export function RecentMessagesFeed({ messages }: Props) {
  if (messages.length === 0) return <div style={st.empty}><p style={st.emptyText}>Nenhuma mensagem recente</p></div>;
  return (
    <div style={st.list}>
      {messages.map(m => (
        <div key={m.id} style={st.row}>
          <div style={{ ...st.dirIndicator, background: m.direction === 'incoming' ? '#185FA5' : '#0F6E56' }} />
          <div style={st.content}>
            <div style={st.header}><span style={st.name}>{m.direction === 'incoming' ? contactDisplayName(m.first_name, m.last_name, m.telegram_username) : 'Bot'}</span><span style={st.time}>{timeAgo(m.created_at)}</span></div>
            <p style={st.text}>{truncate(m.content, 120)}</p>
            <div style={st.meta}>
              {m.direction === 'incoming' && <span style={st.tag}>Recebida</span>}
              {m.direction === 'outgoing' && <span style={{ ...st.tag, background: m.responded_by === 'ai' ? '#E6F1FB' : '#FAEEDA', color: m.responded_by === 'ai' ? '#185FA5' : '#633806' }}>{m.responded_by === 'ai' ? 'IA' : 'Humano'}</span>}
              {m.sentiment && <span style={{ ...st.tag, background: m.sentiment === 'positive' ? '#E1F5EE' : m.sentiment === 'negative' ? '#FCEBEB' : '#f5f5f5', color: m.sentiment === 'positive' ? '#0F6E56' : m.sentiment === 'negative' ? '#A32D2D' : '#666' }}>{m.sentiment}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
const st: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 6 },
  dirIndicator: { width: 3, borderRadius: 2, flexShrink: 0, marginTop: 4, minHeight: 32 },
  content: { flex: 1, minWidth: 0 }, header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  name: { fontSize: 12, fontWeight: 600, color: '#333' }, time: { fontSize: 10, color: '#9ca3af' },
  text: { fontSize: 13, color: '#555', margin: '0 0 4px', lineHeight: 1.4, wordBreak: 'break-word' },
  meta: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  tag: { fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: '#f0f2f5', color: '#6b7280' },
  empty: { padding: '2rem', textAlign: 'center', background: '#fafafa', borderRadius: 10, border: '1px dashed #ddd' },
  emptyText: { fontSize: 13, color: '#999', margin: 0 },
};
