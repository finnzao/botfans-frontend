'use client';
interface DataPoint { label: string; values: { key: string; value: number; color: string }[]; }
interface Props { data: DataPoint[]; height?: number; showLegend?: boolean; }
export function AreaChart({ data, height = 200, showLegend = true }: Props) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Dados insuficientes para o gráfico</div>;
  const padding = { top: 16, right: 12, bottom: 36, left: 40 }; const svgWidth = 600; const svgHeight = height;
  const chartW = svgWidth - padding.left - padding.right; const chartH = svgHeight - padding.top - padding.bottom;
  const allKeys = data[0]?.values.map(v => v.key) || []; const allValues = data.flatMap(d => d.values.map(v => v.value)); const maxVal = Math.max(...allValues, 1);
  const stepX = chartW / (data.length - 1);
  function getY(val: number): number { return padding.top + chartH - (val / maxVal) * chartH; }
  function buildPath(key: string) { const points = data.map((d, i) => { const v = d.values.find(v => v.key === key); return { x: padding.left + i * stepX, y: getY(v?.value || 0) }; }); const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' '); const areaBase = padding.top + chartH; const area = `${line} L${points[points.length - 1].x},${areaBase} L${points[0].x},${areaBase} Z`; const color = data[0]?.values.find(v => v.key === key)?.color || '#185FA5'; return { line, area, color }; }
  const gridLines = 4; const gridStep = maxVal / gridLines;
  return (<div><svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
    {Array.from({ length: gridLines + 1 }, (_, i) => { const val = Math.round(gridStep * i); const y = getY(val); return <g key={i}><line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y} stroke="#f0f0f0" strokeWidth={1} /><text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{val}</text></g>; })}
    {allKeys.map(key => { const { line, area, color } = buildPath(key); return <g key={key}><path d={area} fill={color} opacity={0.1} /><path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></g>; })}
    {data.map((d, i) => { const x = padding.left + i * stepX; const showLabel = data.length <= 14 || i % Math.ceil(data.length / 10) === 0; return showLabel ? <text key={i} x={x} y={svgHeight - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.label}</text> : null; })}
  </svg>{showLegend && allKeys.length > 0 && <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>{allKeys.map(key => { const color = data[0]?.values.find(v => v.key === key)?.color || '#185FA5'; return <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: color }} /><span style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>{key === 'incoming' ? 'Recebidas' : key === 'outgoing' ? 'Enviadas' : key}</span></div>; })}</div>}</div>);
}
