import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import type { ModuleId } from '@/features/home/types';
import { useGoals, useSaveGoal } from './hooks';
import type { GoalDirection, GoalType } from './types';

/** Per-type field behaviour and copy. The tab label is display-only — the
 *  stored `type` enum stays count/value/milestone/streak either way (this
 *  is the "DEFAULT = relabel" option from the investigation: Value shows
 *  as "Amount", Milestone as "Checklist", the enum is untouched). */
const TYPE_CONFIG: Record<
  GoalType,
  {
    tabLabel: string;
    tagline: string;
    titlePlaceholder: string;
    targetLabel: string;
    targetPlaceholder: string;
    unitLabel: string;
    unitPlaceholder: string;
    showUnit: boolean;
    showDirection: boolean;
    showTargetDate: boolean;
    showSteps: boolean;
  }
> = {
  count: {
    tabLabel: 'Count',
    tagline: 'Count how many times you do something.',
    titlePlaceholder: 'e.g. Read 12 books',
    targetLabel: 'How many?',
    targetPlaceholder: '12',
    unitLabel: 'What are you counting?',
    unitPlaceholder: 'books, tasks, workouts',
    showUnit: true,
    showDirection: true,
    showTargetDate: true,
    showSteps: false,
  },
  value: {
    tabLabel: 'Amount',
    tagline: 'Reach a total — usually money.',
    titlePlaceholder: 'e.g. Save ₹60,000 buffer',
    targetLabel: 'Target amount',
    targetPlaceholder: '60000',
    unitLabel: 'In what?',
    unitPlaceholder: '₹, kg, hrs',
    showUnit: true,
    showDirection: true,
    showTargetDate: true,
    showSteps: false,
  },
  milestone: {
    tabLabel: 'Checklist',
    tagline: 'Tick off steps until the whole thing is done.',
    titlePlaceholder: 'e.g. Launch my portfolio site',
    targetLabel: '',
    targetPlaceholder: '',
    unitLabel: '',
    unitPlaceholder: '',
    showUnit: false,
    showDirection: false,
    showTargetDate: true,
    showSteps: true,
  },
  streak: {
    tabLabel: 'Streak',
    tagline: 'Do it on a run of days. Miss one and the streak resets.',
    titlePlaceholder: 'e.g. Journal every day',
    // goal_pace treats a streak's target as a per-week frequency (a daily
    // streak is just target=4-7) -- "optional" only means the field can be
    // left blank; the Number(target) || 1 fallback below still always
    // sends a positive number, since goals.target is NOT NULL and
    // check (target > 0).
    targetLabel: 'Aim for how many days a week? (optional)',
    targetPlaceholder: 'e.g. 4 — leave blank to just keep it going',
    unitLabel: '',
    unitPlaceholder: '',
    showUnit: false,
    showDirection: false,
    showTargetDate: false,
    showSteps: false,
  },
};

// The real 7-id ModuleId union, matching goals.module_id's DB check
// constraint exactly -- not the reference's invented 'office' area.
const MODULE_OPTIONS: { id: ModuleId; label: string }[] = [
  { id: 'expenses', label: 'Money' },
  { id: 'work', label: 'Work' },
  { id: 'design', label: 'Design' },
  { id: 'invest', label: 'Invest' },
  { id: 'health', label: 'Health' },
  { id: 'travel', label: 'Travel' },
  { id: 'goals', label: 'Goals (no linkage)' },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NewGoalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSaveGoal();
  const { data: goals } = useGoals();
  const activeCount = (goals ?? []).filter((g) => g.status === 'active').length;

  const [type, setType] = useState<GoalType>('count');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('1');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<GoalDirection>('up');
  const [startDate, setStartDate] = useState(todayISO());
  const [targetDate, setTargetDate] = useState('');
  const [moduleId, setModuleId] = useState<ModuleId | ''>('');
  const [milestoneLabels, setMilestoneLabels] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const cfg = TYPE_CONFIG[type];
  const atCap = activeCount >= 7;
  const isValid =
    title.trim().length > 0 &&
    (cfg.showSteps
      ? milestoneLabels.some((l) => l.trim())
      : type === 'streak'
        ? true // optional to type -- Number(target) || 1 below always sends a valid positive number
        : Number(target) > 0);

  function reset() {
    setType('count');
    setTitle('');
    setTarget('1');
    setUnit('');
    setDirection('up');
    setStartDate(todayISO());
    setTargetDate('');
    setModuleId('');
    setMilestoneLabels(['', '']);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return;
    if (cfg.showSteps && milestoneLabels.filter((l) => l.trim()).length === 0) {
      setError('Add at least one step.');
      return;
    }
    try {
      await save.mutateAsync({
        title,
        type,
        target: Number(target) || 1,
        unit: unit || null,
        direction: cfg.showDirection ? direction : 'up',
        start_date: startDate,
        target_date: cfg.showTargetDate ? targetDate || null : null,
        module_id: moduleId || null,
        milestones: cfg.showSteps
          ? milestoneLabels.filter((l) => l.trim()).map((label, i) => ({ label: label.trim(), order: i }))
          : undefined,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not add the goal.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="New goal"
      description={atCap ? 'You have 7 active goals — pause one before adding another.' : undefined}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn primary sm" type="submit" form="new-goal-form" disabled={save.isPending || !isValid || atCap}>
            {save.isPending ? 'Adding…' : 'Add goal'}
          </button>
        </>
      }
    >
      <form id="new-goal-form" onSubmit={onSubmit}>
        <div className="field">
          <label>Type</label>
          <div className="seg goal-type-seg">
            {(Object.keys(TYPE_CONFIG) as GoalType[]).map((t) => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {TYPE_CONFIG[t].tabLabel}
              </button>
            ))}
          </div>
          <span className="hint">{cfg.tagline}</span>
        </div>

        <div className={`field${error ? ' bad' : ''}`}>
          <label htmlFor="goal-title">What's the goal?</label>
          <input
            id="goal-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={cfg.titlePlaceholder}
            autoFocus
          />
          {error && <span className="err">{error}</span>}
        </div>

        {cfg.showSteps ? (
          <div className="field">
            <label>Steps, in order</label>
            {milestoneLabels.map((label, i) => (
              <div key={i} className="goal-milestone-input">
                <input
                  className="input"
                  value={label}
                  onChange={(e) =>
                    setMilestoneLabels((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                  placeholder={`Step ${i + 1}`}
                />
                {milestoneLabels.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setMilestoneLabels((arr) => arr.filter((_, idx) => idx !== i))}
                    aria-label="Remove step"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn sec sm" onClick={() => setMilestoneLabels((arr) => [...arr, ''])}>
              Add step
            </button>
          </div>
        ) : (
          <div className={cfg.showUnit ? 'field-row' : 'field'}>
            <div className="field">
              <label htmlFor="goal-target">{cfg.targetLabel}</label>
              <input
                id="goal-target"
                className="input"
                type="number"
                min="0"
                step="any"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={cfg.targetPlaceholder}
              />
            </div>
            {cfg.showUnit && (
              <div className="field">
                <label htmlFor="goal-unit">{cfg.unitLabel}</label>
                <input
                  id="goal-unit"
                  className="input"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={cfg.unitPlaceholder}
                />
              </div>
            )}
          </div>
        )}

        {cfg.showDirection && (
          <div className="field">
            <label>Which way?</label>
            <div className="seg">
              <button type="button" className={direction === 'up' ? 'on' : ''} onClick={() => setDirection('up')}>
                Reach at least
              </button>
              <button type="button" className={direction === 'down' ? 'on' : ''} onClick={() => setDirection('down')}>
                Stay under
              </button>
            </div>
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor="goal-start">Start date</label>
            <input id="goal-start" className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {cfg.showTargetDate && (
            <div className="field">
              <label htmlFor="goal-due">Deadline</label>
              <input id="goal-due" className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              <span className="hint">Leave blank if there's no rush — we just won't track pace against a date.</span>
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="goal-module">Area</label>
          <div className="goal-area-row">
            <select
              id="goal-module"
              className="input"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value as ModuleId | '')}
            >
              <option value="">None</option>
              {MODULE_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span
              className="goal-area-swatch"
              style={{ background: moduleId ? `var(--m-${moduleId})` : 'transparent' }}
              aria-hidden="true"
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
