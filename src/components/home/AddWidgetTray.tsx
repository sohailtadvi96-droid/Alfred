import { Dialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { LATER } from '@/components/Sidebar';
import type { BoardLayout } from '@/features/home/layout';
import type { ModuleId } from '@/features/home/types';

const ALL_MODULES: { id: ModuleId; label: string; icon: IconName }[] = [
  { id: 'expenses', label: 'Expenses', icon: 'expenses' },
  { id: 'work', label: 'Work', icon: 'work' },
  { id: 'design', label: 'Design', icon: 'design' },
  { id: 'invest', label: 'Invest', icon: 'invest' },
  { id: 'health', label: 'Health', icon: 'health' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'travel', label: 'Travel', icon: 'travel' },
];

function tipFor(id: ModuleId): string | null {
  const later = LATER.find((l) => l.icon === id);
  if (later) return later.tip;
  if (id === 'travel') return 'Preview data — coming soon';
  return null;
}

export function AddWidgetTray({
  open,
  onOpenChange,
  layout,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layout: BoardLayout;
  onToggle: (id: ModuleId) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Board widgets"
      description="Choose which modules show on your board."
    >
      <div className="home-add-list">
        {ALL_MODULES.map((m) => {
          const on = layout.order.includes(m.id);
          const tip = tipFor(m.id);
          return (
            <div key={m.id} className="home-add-row" data-disabled={false}>
              <span className="home-add-row-label">
                <Icon name={m.icon} size={16} />
                {m.label}
                {tip && <span className="home-add-row-tip">{tip}</span>}
              </span>
              <button
                type="button"
                className={`btn sm ${on ? 'sec' : 'primary'}`}
                onClick={() => onToggle(m.id)}
              >
                {on ? 'Remove' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
