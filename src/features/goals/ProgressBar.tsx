import type { Pace, StreakPace } from './types';

export function ProgressBar({
  actual,
  target,
  status,
}: {
  actual: number;
  target: number;
  status: Pace['status'] | StreakPace['status'];
}) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
  return (
    <div className="goal-bar">
      <div className={`goal-bar-fill pace-${status}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
