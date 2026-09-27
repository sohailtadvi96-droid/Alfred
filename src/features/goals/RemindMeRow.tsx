import { SwitchRow } from '@/components/SwitchRow';
import { ScheduleFields, type ScheduleValue } from '@/features/reminders/ScheduleFields';

/** Shared by NewGoalDialog (create) and GoalRow's edit block (edit) -- the
 *  switch plus, when on, the same schedule picker ReminderSheet uses
 *  (idPrefix keeps its field ids distinct from any open ReminderSheet).
 *  Save orchestration (create/update the goal, then the linked reminder)
 *  lives in each caller, not here -- this component only owns form state. */
export function RemindMeRow({
  checked,
  onToggle,
  value,
  onChange,
  autoNote,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  value: ScheduleValue;
  onChange: (patch: Partial<ScheduleValue>) => void;
  /** shown for a journal_streak goal, whose reminder's satisfied_by is
   *  fixed to office_journal rather than user-chosen. */
  autoNote?: string;
}) {
  return (
    <div className="goal-remind">
      <SwitchRow
        id="goal-remind-me"
        label="Remind me"
        hint="Creates a linked reminder you can edit any time from Reminders."
        checked={checked}
        onChange={onToggle}
      />
      {checked && (
        <div className="goal-remind-fields">
          <ScheduleFields value={value} onChange={onChange} idPrefix="goal-remind" showSummary={false} />
          {autoNote && <span className="hint">{autoNote}</span>}
        </div>
      )}
    </div>
  );
}
