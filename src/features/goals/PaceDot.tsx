import { paceStatusLabel } from './format';
import type { PaceStatus } from './types';

/** Pace colour is the only colour a goal row carries — see base.css .pace-*. */
export function PaceDot({ status, className }: { status: PaceStatus; className?: string }) {
  const label = paceStatusLabel(status);
  return (
    <span
      className={`goal-pace-dot pace-${status}${className ? ` ${className}` : ''}`}
      data-tip={label}
      aria-label={label}
    />
  );
}
