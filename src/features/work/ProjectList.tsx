import { Link } from 'react-router-dom';
import { fullDate, moneyIn } from '@/lib/format';
import { projectStatusMeta } from './status';
import type { ProjectWithClient } from './types';

function rateSummary(p: ProjectWithClient): string {
  if (p.rate_type === 'hourly') {
    return p.rate_cents ? `${moneyIn(p.rate_cents, p.currency)} / hr` : 'Hourly — rate unset';
  }
  return p.fixed_amount_cents ? `${moneyIn(p.fixed_amount_cents, p.currency)} fixed` : 'Fixed — amount unset';
}

export function ProjectList({
  projects,
  isLoading,
  error,
}: {
  projects: ProjectWithClient[] | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  if (error) {
    return <div className="ledger-empty">Couldn’t load projects. Try again.</div>;
  }
  if (isLoading) {
    return <div className="ledger-empty">Loading…</div>;
  }
  if (!projects || projects.length === 0) {
    return (
      <div className="ledger-empty">
        <strong>No projects yet.</strong>
        <span>Create your first project — deliverables, time and invoices hang off it.</span>
      </div>
    );
  }

  return (
    <div className="work-grid">
      {projects.map((p) => {
        const meta = projectStatusMeta(p.status);
        return (
          <Link key={p.id} to={`/work/${p.id}`} className="work-card">
            <div className="work-card-head">
              <span className="work-status" style={{ ['--st' as string]: meta.color }}>
                {meta.label}
              </span>
              <span className="work-card-cur">{p.currency}</span>
            </div>
            <h3 className="work-card-name">{p.name}</h3>
            <div className="work-card-client">{p.client?.name ?? 'No client'}</div>
            <div className="work-card-foot">
              <span className="work-card-rate">{rateSummary(p)}</span>
              {p.target_delivery_on && (
                <span className="work-card-due">Due {fullDate(p.target_delivery_on)}</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
