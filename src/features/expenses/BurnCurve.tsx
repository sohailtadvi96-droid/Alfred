import { useState, type MouseEvent } from 'react';
import { money } from '@/lib/format';
import type { BurnSeries } from './burnSeries';

const W = 640;
const H = 200;
const PAD_L = 56;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 30];

/** Cumulative daily expense, current month vs prior month, day-of-month on
 *  the x-axis. Each line is clipped to its own last day with data — the
 *  current month never runs flat to day 31, and the prior month draws its
 *  own full span rather than being clamped to match. */
export function BurnCurve({
  current,
  prior,
  currentLabel,
  priorLabel,
}: {
  current: BurnSeries;
  prior: BurnSeries;
  currentLabel: string;
  priorLabel: string;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const hasCurrent = current.lastDay > 0;
  const hasPrior = prior.lastDay > 0;

  if (!hasCurrent && !hasPrior) {
    return (
      <div className="burncurve burncurve-empty">
        <span className="tlabel">No expense data yet this month.</span>
      </div>
    );
  }

  const maxCents = Math.max(current.cumulative.at(-1) ?? 0, prior.cumulative.at(-1) ?? 0, 1);
  const xFor = (day: number) => PAD_L + ((day - 1) / 30) * PLOT_W;
  const yFor = (cents: number) => PAD_T + PLOT_H - (cents / maxCents) * PLOT_H;
  const pathFor = (series: BurnSeries) =>
    series.cumulative.map((c, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i + 1)} ${yFor(c)}`).join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxCents * f));

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const day = Math.round(1 + ((x - PAD_L) / PLOT_W) * 30);
    setHoverDay(Math.min(31, Math.max(1, day)));
  }

  const hoverCurrent =
    hoverDay !== null && hoverDay <= current.lastDay ? current.cumulative[hoverDay - 1] : null;
  const hoverPrior = hoverDay !== null && hoverDay <= prior.lastDay ? prior.cumulative[hoverDay - 1] : null;

  return (
    <div className="burncurve">
      <div className="burncurve-legend">
        <span className="burncurve-lg">
          <i className="burncurve-swatch burncurve-swatch--current" /> {currentLabel}
        </span>
        <span className="burncurve-lg">
          <i className="burncurve-swatch burncurve-swatch--prior" /> {priorLabel}
        </span>
      </div>

      <div className="burncurve-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="burncurve-svg"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverDay(null)}
        >
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)} className="burncurve-grid" />
              <text x={PAD_L - 8} y={yFor(v)} className="burncurve-ylabel" textAnchor="end" dominantBaseline="middle">
                {money(v, true)}
              </text>
            </g>
          ))}
          {DAY_TICKS.map((d) => (
            <text key={d} x={xFor(d)} y={H - 6} className="burncurve-xlabel" textAnchor="middle">
              {d}
            </text>
          ))}

          {hasPrior && <path d={pathFor(prior)} className="burncurve-line burncurve-line--prior" />}
          {hasCurrent && <path d={pathFor(current)} className="burncurve-line burncurve-line--current" />}

          {hoverDay !== null && (hoverCurrent !== null || hoverPrior !== null) && (
            <line
              x1={xFor(hoverDay)}
              x2={xFor(hoverDay)}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              className="burncurve-cursor"
            />
          )}
          {hoverCurrent !== null && (
            <circle cx={xFor(hoverDay!)} cy={yFor(hoverCurrent)} r={3.5} className="burncurve-dot burncurve-dot--current" />
          )}
          {hoverPrior !== null && (
            <circle cx={xFor(hoverDay!)} cy={yFor(hoverPrior)} r={3.5} className="burncurve-dot burncurve-dot--prior" />
          )}
        </svg>

        {hoverDay !== null && (hoverCurrent !== null || hoverPrior !== null) && (
          <div
            className="burncurve-tip"
            style={{ left: `${Math.min(88, Math.max(8, (xFor(hoverDay) / W) * 100))}%` }}
          >
            <div className="burncurve-tip-day">Day {hoverDay}</div>
            {hoverCurrent !== null && (
              <div className="burncurve-tip-row">
                <i className="burncurve-swatch burncurve-swatch--current" /> {money(hoverCurrent, true)}
              </div>
            )}
            {hoverPrior !== null && (
              <div className="burncurve-tip-row">
                <i className="burncurve-swatch burncurve-swatch--prior" /> {money(hoverPrior, true)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
