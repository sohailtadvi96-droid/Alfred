import { useState } from 'react';
import { money } from '@/lib/format';
import { useFrequencyBubbles } from './hooks';

const W = 640;
const H = 360;
const PAD_L = 64;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 44;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const MIN_R = 9;
const MAX_R = 42;

/** x = transaction count, y = average ticket (log scale — habits cluster
 *  bottom-right, high count/low ticket; decisions cluster top-left, a
 *  single large transaction), bubble area ∝ total spend. The lens the
 *  card grid and CategoryBars can't express: two categories with the same
 *  total can look identical on a bar chart and be completely different
 *  spending behaviours. */
export function FrequencyTicket({ month }: { month: string }) {
  const { data, isLoading } = useFrequencyBubbles(month);
  const [hover, setHover] = useState<string | null>(null);

  if (isLoading) return <div className="ledger-empty">Loading…</div>;
  if (data.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>No expense data yet this month.</strong>
      </div>
    );
  }

  const counts = data.map((d) => d.count);
  const totals = data.map((d) => d.totalCents);
  const logAvgs = data.map((d) => Math.log10(Math.max(d.avgCents, 1)));

  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const countPad = Math.max(1, (maxCount - minCount) * 0.15);
  const countDomain: [number, number] = [Math.max(0, minCount - countPad), maxCount + countPad];

  const minLog = Math.min(...logAvgs);
  const maxLog = Math.max(...logAvgs);
  const logRange = maxLog - minLog || 1;
  const logPad = logRange * 0.2;
  const logDomain: [number, number] = [minLog - logPad, maxLog + logPad];

  const maxTotal = Math.max(...totals);
  const radiusFor = (totalCents: number) =>
    maxTotal > 0 ? MIN_R + (MAX_R - MIN_R) * Math.sqrt(totalCents / maxTotal) : MIN_R;

  const xFor = (count: number) =>
    PAD_L + ((count - countDomain[0]) / (countDomain[1] - countDomain[0])) * PLOT_W;
  const yFor = (avgCents: number) => {
    const log = Math.log10(Math.max(avgCents, 1));
    return PAD_T + PLOT_H - ((log - logDomain[0]) / (logDomain[1] - logDomain[0])) * PLOT_H;
  };

  // y-axis ticks at nice round rupee values that actually fall in range
  const yTickRupees = [10, 32, 100, 320, 1000, 3200, 10000, 32000].filter((v) => {
    const log = Math.log10(v * 100);
    return log >= logDomain[0] && log <= logDomain[1];
  });
  const xTicks = Array.from(
    new Set(Array.from({ length: 5 }, (_, i) => Math.round(countDomain[0] + (i / 4) * (countDomain[1] - countDomain[0])))),
  );

  // Greedy label placement: biggest bubbles claim their default spot right
  // above the bubble first; smaller/later ones nudge upward in steps until
  // they clear anything already placed. A tight cluster (several small
  // categories at similar count/ticket) is common real data, not an edge
  // case — an unlabelled or overlapping-label bubble chart reads as
  // decoration, not information.
  const CHAR_W = 5.6;
  const LINE_H = 12;
  const placedLabels: { cx: number; y: number; halfWidth: number }[] = [];
  const points = data
    .map((d) => ({ d, cx: xFor(d.count), cy: yFor(d.avgCents), r: radiusFor(d.totalCents) }))
    .sort((a, b) => b.r - a.r);
  const labelYFor = new Map<string, number>();
  for (const p of points) {
    const text = p.d.label + (p.d.isUnresolved ? ' (unresolved)' : '');
    const halfWidth = (text.length * CHAR_W) / 2;
    let y = p.cy - p.r - 6;
    for (let attempt = 0; attempt < 10; attempt++) {
      const collides = placedLabels.some(
        (o) => Math.abs(o.cx - p.cx) < halfWidth + o.halfWidth + 4 && Math.abs(o.y - y) < LINE_H,
      );
      if (!collides) break;
      y -= LINE_H;
    }
    placedLabels.push({ cx: p.cx, y, halfWidth });
    labelYFor.set(p.d.slug, y);
  }

  return (
    <div className="insight-panel">
      <svg viewBox={`0 0 ${W} ${H}`} className="freqticket-svg">
        {yTickRupees.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={yFor(v * 100)} y2={yFor(v * 100)} className="burncurve-grid" />
            <text x={PAD_L - 8} y={yFor(v * 100)} textAnchor="end" dominantBaseline="middle" className="burncurve-ylabel">
              {money(v * 100, true)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={xFor(v)} y={H - PAD_B + 18} textAnchor="middle" className="burncurve-xlabel">
            {v}
          </text>
        ))}
        <text x={PAD_L + PLOT_W / 2} y={H - 6} textAnchor="middle" className="freqticket-axis-title">
          Transactions this month
        </text>
        <text
          x={16}
          y={PAD_T + PLOT_H / 2}
          textAnchor="middle"
          className="freqticket-axis-title"
          transform={`rotate(-90 16 ${PAD_T + PLOT_H / 2})`}
        >
          Average ticket (log scale)
        </text>

        {data.map((d) => {
          const cx = xFor(d.count);
          const cy = yFor(d.avgCents);
          const r = radiusFor(d.totalCents);
          const isHover = hover === d.slug;
          return (
            <g key={d.slug} onMouseEnter={() => setHover(d.slug)} onMouseLeave={() => setHover(null)}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={`freqticket-bubble${d.isUnresolved ? ' unresolved' : ''}${isHover ? ' hover' : ''}`}
              />
              <text x={cx} y={labelYFor.get(d.slug) ?? cy - r - 6} textAnchor="middle" className="freqticket-label">
                {d.label}
                {d.isUnresolved ? ' (unresolved)' : ''}
              </text>
              {isHover && (
                <text x={cx} y={cy + r + 16} textAnchor="middle" className="freqticket-label dim">
                  {d.count} txn{d.count === 1 ? '' : 's'} · {money(d.avgCents, true)} avg · {money(d.totalCents, true)} total
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
