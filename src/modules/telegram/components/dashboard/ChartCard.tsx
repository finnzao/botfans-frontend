'use client';

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function ChartCard({ title, subtitle, children, action }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>{title}</h3>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={styles.body}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '16px 20px 0',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: '0 0 2px',
  },
  subtitle: {
    fontSize: 11,
    color: '#9ca3af',
    margin: 0,
  },
  body: {
    padding: '16px 20px 20px',
  },
};
