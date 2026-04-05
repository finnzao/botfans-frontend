'use client';

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: DataPoint[];
  height?: number;
  barColor?: string;
  showLabels?: boolean;
  showValues?: boolean;
}

export function MiniBarChart({
  data,
  height = 160,
  barColor = '#185FA5',
  showLabels = true,
  showValues = false,
}: Props) {
  if (data.length === 0) return <EmptyState height={height} />;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(Math.min(600 / data.length - 4, 32), 6);
  const chartWidth = data.length * (barWidth + 4);
  const chartHeight = height - (showLabels ? 28 : 0);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${chartWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible' }}
    >
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * (chartHeight - 20);
        const x = i * (barWidth + 4);
        const y = chartHeight - barH;
        const fill = d.color || barColor;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barH, 1)}
              rx={3}
              fill={fill}
              opacity={0.85}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {showValues && d.value > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
                fontWeight={500}
              >
                {d.value}
              </text>
            )}
            {showLabels && (
              <text
                x={x + barWidth / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
                fontWeight={400}
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function EmptyState({ height }: { height: number }) {
  return (
    <div style={{
      height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9ca3af',
      fontSize: 13,
    }}>
      Sem dados no período
    </div>
  );
}
