import { useState } from 'react';
import type { SheetRequest } from './ReminderSheet';
import { useCreateReminder, useUserToday } from './hooks';
import type { ReminderDraft } from './types';

/** A one-time reminder due today, with nothing else set — every recurring
 *  field is present (ReminderDraft has no optional fields besides
 *  counts_as_task) but null/empty, matching 0040's one_time shape check. */
function oneTimeDraft(title: string, dueDate: string): ReminderDraft {
  return {
    title,
    notes: '',
    kind: 'one_time',
    goal_id: null,
    due_date: dueDate,
    due_time: null,
    freq: null,
    interval_n: 1,
    weekdays: [],
    month_day: null,
    time_of_day: null,
    start_date: null,
    end_date: null,
    satisfied_by: null,
  };
}

export function QuickAdd({ onOpenSheet }: { onOpenSheet: (req: SheetRequest) => void }) {
  const [title, setTitle] = useState('');
  const { data: today } = useUserToday();
  const create = useCreateReminder();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !today) return;
    create.mutate(oneTimeDraft(trimmed, today), {
      onSuccess: () => setTitle(''),
      // keep the typed text on error so nothing is lost
    });
  };

  return (
    <div className="rem-quickadd">
      <input
        className="input"
        placeholder="Remind me to… (due today)"
        value={title}
        disabled={!today}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="rem-quickadd-hint">
        ⏎ to add ·{' '}
        <button
          type="button"
          className="rem-more-options"
          onClick={() => onOpenSheet({ kind: 'create', prefillTitle: title.trim() || undefined })}
        >
          More options
        </button>{' '}
        for repeating ones
        <span className="rem-keys-hint">
          {' '}
          · <kbd>N</kbd> new · <kbd>X</kbd> tick
        </span>
      </div>
    </div>
  );
}
