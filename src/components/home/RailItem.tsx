import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { timeLabel } from '@/features/office/datetime';
import type { ModuleId, TimeBound } from '@/features/home/types';

const MODULE_ICON: Record<ModuleId, IconName> = {
  expenses: 'expenses',
  invest: 'invest',
  work: 'work',
  design: 'design',
  health: 'health',
  goals: 'goals',
  travel: 'travel',
};

const ACTIONABLE_KINDS: TimeBound['kind'][] = ['task', 'deliverable'];

function timeCell(item: TimeBound): string {
  if (item.kind === 'event') return timeLabel(item.at);
  switch (item.tone) {
    case 'overdue':
      return 'OVERDUE';
    case 'today':
      return 'TODAY';
    case 'soon':
      return 'SOON';
    default:
      return 'LATER';
  }
}

export function RailItem({
  item,
  onComplete,
}: {
  item: TimeBound;
  onComplete: (item: TimeBound) => void;
}) {
  const settled = item.kind === 'event' && new Date(item.at).getTime() < Date.now();
  const actionable = ACTIONABLE_KINDS.includes(item.kind);

  return (
    <div
      className="home-rail-item"
      data-settled={settled ? 'true' : 'false'}
      data-attention={item.needsAttention ? 'true' : 'false'}
    >
      <span className="home-rail-time">{timeCell(item)}</span>
      <span className="home-rail-icon" data-module={item.module}>
        <Icon name={MODULE_ICON[item.module]} size={12} />
      </span>
      {item.href ? (
        <Link to={item.href} className="home-rail-main">
          <span className="home-rail-item-title">{item.title}</span>
          {item.subtitle && <span className="home-rail-item-subtitle">{item.subtitle}</span>}
        </Link>
      ) : (
        <span className="home-rail-main">
          <span className="home-rail-item-title">{item.title}</span>
          {item.subtitle && <span className="home-rail-item-subtitle">{item.subtitle}</span>}
        </span>
      )}
      {actionable && (
        <button
          type="button"
          className="home-rail-check"
          aria-label={`Mark "${item.title}" done`}
          onClick={() => onComplete(item)}
        >
          <Icon name="check" size={11} />
        </button>
      )}
      {item.needsAttention && <span className="home-rail-dot" aria-hidden="true" />}
    </div>
  );
}
