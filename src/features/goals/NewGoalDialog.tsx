import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import type { ModuleId } from '@/features/home/types';
import { useGoals, useSaveGoal } from './hooks';
import type { GoalDirection, GoalType } from './types';

const TYPE_LABEL: Record<GoalType, string> = {
  count: 'Count — reach N of something',
  value: 'Value — reach an amount',
  milestone: 'Milestone — an ordered checklist',
  streak: 'Streak — do X on N days',
};

const MODULE_OPTIONS: { id: ModuleId; label: string }[] = [
  { id: 'expenses', label: 'Expenses' },
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

  const atCap = activeCount >= 7;

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
    if (type === 'milestone' && milestoneLabels.filter((l) => l.trim()).length === 0) {
      setError('Add at least one milestone.');
      return;
    }
    try {
      await save.mutateAsync({
        title,
        type,
        target: Number(target) || 1,
        unit: unit || null,
        direction: type === 'value' ? direction : 'up',
        start_date: startDate,
        target_date: targetDate || null,
        module_id: moduleId || null,
        milestones:
          type === 'milestone'
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
          <button className="btn primary sm" type="submit" form="new-goal-form" disabled={save.isPending || !title.trim() || atCap}>
            {save.isPending ? 'Adding…' : 'Add goal'}
          </button>
        </>
      }
    >
      <form id="new-goal-form" onSubmit={onSubmit}>
        <div className="field">
          <label>Type</label>
          <div className="seg goal-type-seg">
            {(Object.keys(TYPE_LABEL) as GoalType[]).map((t) => (
              <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
          <span className="hint">{TYPE_LABEL[type]}</span>
        </div>

        <div className={`field${error ? ' bad' : ''}`}>
          <label htmlFor="goal-title">Title</label>
          <input
            id="goal-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Read 12 books"
            autoFocus
          />
          {error && <span className="err">{error}</span>}
        </div>

        {type === 'milestone' ? (
          <div className="field">
            <label>Milestones, in order</label>
            {milestoneLabels.map((label, i) => (
              <div key={i} className="goal-milestone-input">
                <input
                  className="input"
                  value={label}
                  onChange={(e) =>
                    setMilestoneLabels((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                  placeholder={`e.g. ${['A1', 'A2', 'B1', 'B2'][i] ?? `Step ${i + 1}`}`}
                />
                {milestoneLabels.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setMilestoneLabels((arr) => arr.filter((_, idx) => idx !== i))}
                    aria-label="Remove milestone"
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
          <div className="field-row">
            <div className="field">
              <label htmlFor="goal-target">Target</label>
              <input
                id="goal-target"
                className="input"
                type="number"
                min="0"
                step="any"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="goal-unit">Unit</label>
              <input
                id="goal-unit"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="books, ₹, days…"
              />
            </div>
          </div>
        )}

        {type === 'value' && (
          <div className="field">
            <label>Direction</label>
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
          <div className="field">
            <label htmlFor="goal-due">Target date</label>
            <input id="goal-due" className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            <span className="hint">Blank = open-ended, no pace tracked</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="goal-module">Colour / linked module</label>
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
        </div>
      </form>
    </Dialog>
  );
}
