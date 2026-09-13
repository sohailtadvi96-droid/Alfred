export function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return <p className="goal-spark-empty">Not enough history yet.</p>;

  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);
  const range = max - min || 1;
  const w = 160;
  const h = 32;
  const step = w / (series.length - 1);
  const points = series.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');

  return (
    <svg className="goal-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
