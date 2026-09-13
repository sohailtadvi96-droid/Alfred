import type { Pace, StreakPace } from './types';

const LABELS: Record<Pace['status'] | StreakPace['status'], string> = {
  ahead: 'Ahead of pace',
  'on-track': 'On track',
  behind: 'Behind pace',
  'at-risk': 'At risk',
  streak: 'Rolling streak',
  'no-deadline': 'No deadline set',
};

/** Pace colour is the only colour a goal row carries — see base.css .pace-*. */
export function PaceDot({ pace, className }: { pace: Pace | StreakPace; className?: string }) {
  const label = LABELS[pace.status];
  return (
    <span
      className={`goal-pace-dot pace-${pace.status}${className ? ` ${className}` : ''}`}
      data-tip={pace.stale ? `${label} — source may be stale` : label}
      aria-label={label}
    />
  );
}
