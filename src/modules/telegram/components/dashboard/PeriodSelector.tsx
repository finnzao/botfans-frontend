'use client';

import type { AnalyticsPeriod } from '../../analytics.types';

interface Props {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
}

const OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <div style={styles.container}>
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            ...styles.button,
            ...(opt.value === value ? styles.active : {}),
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: 2,
    background: '#f0f2f5',
    borderRadius: 8,
    padding: 2,
  },
  button: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  active: {
    background: '#fff',
    color: '#185FA5',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
};
