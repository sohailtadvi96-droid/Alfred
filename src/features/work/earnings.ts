import type { Earnings, Project, TimeEntry } from './types';

/** Hourly → hours × rate. Fixed → the fixed amount, regardless of hours.
 *  Effective hourly = earned ÷ hours (so a fixed project shows what the
 *  logged time actually paid). */
export function computeEarnings(project: Project, entries: TimeEntry[]): Earnings {
  const hours = entries.reduce((s, e) => s + e.hours, 0);

  const earnedCents =
    project.rate_type === 'hourly'
      ? Math.round(hours * (project.rate_cents ?? 0))
      : project.fixed_amount_cents ?? 0;

  return {
    hours,
    earnedCents,
    effectiveHourlyCents: hours > 0 ? Math.round(earnedCents / hours) : null,
    basis: project.rate_type,
  };
}
