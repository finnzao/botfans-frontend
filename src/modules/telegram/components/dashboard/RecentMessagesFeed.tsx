'use client';

import type { RecentMessage } from '../../analytics.types';

interface Props {
  messages: RecentMessage[];
}

function contactName(m: RecentMessage): string {
  const parts = [m.first_name, m.last_name].filter(Boolean);
  return parts.join(' ') || m.telegram_username || 'Desconhecido';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

export function RecentMessagesFeed({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Nenhuma mensagem recente</p>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {messages.map(m => (
        <div key={m.id} style={styles.row}>
          <div style={{
            ...styles.dirIndicator,
            background: m.direction === 'incoming' ? '#185FA5' : '#0F6E56',
          }} />
          <div style={styles.content}>
            <div style={styles.header}>
              <span style={styles.name}>
                {m.direction === 'incoming' ? contactName(m) : 'Bot'}
              </span>
              <span style={styles.time}>{formatTime(m.created_at)}</span>
            </div>
            <p style={styles.text}>{truncate(m.content, 120)}</p>
            <div style={styles.meta}>
              {m.direction === 'incoming' && (
                <span style={styles.tag}>
                  {m.direction === 'incoming' ? 'Recebida' : 'Enviada'}
                </span>
              )}
              {m.direction === 'outgoing' && (
                <span style={{
                  ...styles.tag,
                  background: m.responded_by === 'ai' ? '#E6F1FB' : '#FAEEDA',
                  color: m.responded_by === 'ai' ? '#185FA5' : '#633806',
                }}>
                  {m.responded_by === 'ai' ? 'IA' : 'Humano'}
                </span>
              )}
              {m.sentiment && (
                <span style={{
                  ...styles.tag,
                  background: m.sentiment === 'positive' ? '#E1F5EE' : m.sentiment === 'negative' ? '#FCEBEB' : '#f5f5f5',
                  color: m.sentiment === 'positive' ? '#0F6E56' : m.sentiment === 'negative' ? '#A32D2D' : '#666',
                }}>
                  {m.sentiment}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: {
    display: 'flex',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  dirIndicator: {
    width: 3,
    borderRadius: 2,
    flexShrink: 0,
    marginTop: 4,
    minHeight: 32,
  },
  content: { flex: 1, minWidth: 0 },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  name: { fontSize: 12, fontWeight: 600, color: '#333' },
  time: { fontSize: 10, color: '#9ca3af' },
  text: {
    fontSize: 13,
    color: '#555',
    margin: '0 0 4px',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  meta: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  tag: {
    fontSize: 10,
    fontWeight: 500,
    padding: '1px 6px',
    borderRadius: 4,
    background: '#f0f2f5',
    color: '#6b7280',
  },
  empty: {
    padding: '2rem',
    textAlign: 'center',
    background: '#fafafa',
    borderRadius: 10,
    border: '1px dashed #ddd',
  },
  emptyText: { fontSize: 13, color: '#999', margin: 0 },
};
