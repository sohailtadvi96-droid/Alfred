import { moneyIn } from '@/lib/format';
import { computeEarnings } from './earnings';
import { useTimeEntries } from './hooks';
import type { Project } from './types';

const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2));

export function EarningsSummary({ project }: { project: Project }) {
  const { data: entries, isLoading } = useTimeEntries(project.id);
  if (isLoading || !entries) {
    return <div className="work-earn" aria-busy="true" />;
  }

  const e = computeEarnings(project, entries);
  const rateLine =
    project.rate_type === 'hourly'
      ? `${project.rate_cents ? moneyIn(project.rate_cents, project.currency) : '—'} / hr`
      : `${project.fixed_amount_cents ? moneyIn(project.fixed_amount_cents, project.currency) : '—'} fixed`;

  return (
    <div className="work-earn">
      <span className="work-earn-l">Earnings · {rateLine}</span>
      <span className="work-earn-v">{moneyIn(e.earnedCents, project.currency)}</span>
      <span className="work-earn-s">
        {fmtHours(e.hours)} h logged
        {e.effectiveHourlyCents != null && (
          <>
            {' · '}
            {moneyIn(e.effectiveHourlyCents, project.currency)} / hr effective
          </>
        )}
      </span>
    </div>
  );
}
