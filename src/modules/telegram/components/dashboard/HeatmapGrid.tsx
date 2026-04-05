'use client';

interface Props {
  data: { label: string; value: number }[];
  colorScale?: string[];
  cellSize?: number;
}

export function HeatmapGrid({
  data,
  colorScale = ['#f0f2f5', '#B5D4F4', '#6BA3D6', '#185FA5', '#0C447C'],
  cellSize = 36,
}: Props) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);

  function getColor(value: number): string {
    if (value === 0) return colorScale[0];
    const ratio = value / maxVal;
    const idx = Math.min(Math.floor(ratio * (colorScale.length - 1)), colorScale.length - 1);
    return colorScale[Math.max(idx, 1)];
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.label}: ${d.value} mensagens`}
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: 6,
            background: getColor(d.value),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'default',
            transition: 'transform 0.15s',
          }}
        >
          <span style={{ fontSize: 9, color: d.value > maxVal * 0.5 ? '#fff' : '#6b7280', fontWeight: 500 }}>
            {d.label}
          </span>
          {d.value > 0 && (
            <span style={{ fontSize: 10, color: d.value > maxVal * 0.5 ? 'rgba(255,255,255,0.9)' : '#333', fontWeight: 600 }}>
              {d.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
