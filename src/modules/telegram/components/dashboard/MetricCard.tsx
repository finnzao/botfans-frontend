'use client';

interface Props {
  label: string;
  value: string | number;
  previousValue?: number;
  currentValue?: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

function calcChange(current: number, previous: number): { pct: string; positive: boolean } | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { pct: '+100%', positive: true };
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? '+' : '';
  return { pct: `${sign}${diff.toFixed(0)}%`, positive: diff >= 0 };
}

export function MetricCard({ label, value, previousValue, currentValue, icon, color, bgColor }: Props) {
  const change = currentValue !== undefined && previousValue !== undefined
    ? calcChange(currentValue, previousValue)
    : null;

  return (
    <div style={styles.card}>
      <div style={{ ...styles.iconBox, background: bgColor, color }}>
        {icon}
      </div>
      <div style={styles.info}>
        <span style={styles.label}>{label}</span>
        <div style={styles.row}>
          <span style={styles.value}>{value}</span>
          {change && (
            <span style={{
              ...styles.change,
              color: change.positive ? '#0F6E56' : '#A32D2D',
              background: change.positive ? '#E1F5EE' : '#FCEBEB',
            }}>
              {change.pct}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '18px 20px',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 500,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a1a',
    lineHeight: 1.2,
  },
  change: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 6,
  },
};
