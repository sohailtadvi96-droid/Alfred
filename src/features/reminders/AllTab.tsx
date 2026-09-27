import { useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import type { SheetRequest } from './ReminderSheet';
import { describeSchedule } from './schedule';
import {
  useArchiveReminder,
  useDoneReminderIds,
  usePauseReminder,
  useReminderHistory,
  useReminderRules,
  useResumeReminder,
} from './hooks';
import type { Reminder, ReminderHistoryRow, ReminderHistoryState } from './types';

const HISTORY_DAYS = 30;

function DotStrip({ reminderId, history }: { reminderId: string; history: ReminderHistoryRow[] }) {
  const rows = history.filter((h) => h.reminder_id === reminderId).sort((a, b) => a.d.localeCompare(b.d));
  return (
    <div className="rem-dot-strip" aria-hidden="true">
      {rows.map((r) => (
        <span key={r.d} className={`rem-dot state-${r.state}`} title={`${r.d}: ${r.state}`} />
      ))}
    </div>
  );
}

function RowActions({
  reminder,
  onOpenSheet,
  showPause,
}: {
  reminder: Reminder;
  onOpenSheet: (req: SheetRequest) => void;
  showPause: boolean;
}) {
  const pause = usePauseReminder();
  const resume = useResumeReminder();
  const archive = useArchiveReminder();
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  if (confirmingArchive) {
    return (
      <div className="rem-archive-confirm">
        <span>Archive?</span>
        <button type="button" className="rem-confirm-yes" onClick={() => archive.mutate(reminder.id)}>
          Yes
        </button>
        <button type="button" className="rem-confirm-no" onClick={() => setConfirmingArchive(false)}>
          No
        </button>
      </div>
    );
  }

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button type="button" className="rem-row-menu-btn" aria-label={`More actions for ${reminder.title}`}>
          ⋯
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content className="menu" align="end" sideOffset={6}>
          <DM.Item className="menu-item" onSelect={() => onOpenSheet({ kind: 'edit', reminder })}>
            Edit…
          </DM.Item>
          {reminder.status === 'paused' ? (
            <DM.Item className="menu-item" onSelect={() => resume.mutate(reminder.id)}>
              Resume
            </DM.Item>
          ) : (
            showPause && (
              <DM.Item className="menu-item" onSelect={() => pause.mutate(reminder.id)}>
                Pause
              </DM.Item>
            )
          )}
          <DM.Separator className="menu-sep" />
          <DM.Item className="menu-item" onSelect={() => setConfirmingArchive(true)}>
            Archive
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function AllTab({ onOpenSheet }: { onOpenSheet: (req: SheetRequest) => void }) {
  const { data: rules, isLoading } = useReminderRules();
  const { data: history } = useReminderHistory(HISTORY_DAYS);
  const { data: doneIds } = useDoneReminderIds();

  if (isLoading) {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rem-skel-row" />
        ))}
      </div>
    );
  }

  const all = rules ?? [];
  const recurring = all.filter((r) => r.kind === 'recurring' && r.status === 'active');
  const oneTimePending = all.filter(
    (r) => r.kind === 'one_time' && r.status === 'active' && !(doneIds ?? new Set()).has(r.id),
  );
  const paused = all.filter((r) => r.status === 'paused');

  if (all.length === 0) {
    return <div className="rem-empty">No reminders yet.</div>;
  }

  return (
    <div>
      <section>
        <div className="rem-section-label">
          <span>Recurring</span>
        </div>
        {recurring.length === 0 ? (
          <div className="rem-empty">No active recurring reminders.</div>
        ) : (
          recurring.map((r) => (
            <div key={r.id} className="rem-all-row">
              <div className="rem-row-titleblock">
                <span className="rem-row-title">{r.title}</span>
                <span className="rem-row-sub">{describeSchedule(r)}</span>
              </div>
              <span className="rem-streak">{streakFor(r, history)}</span>
              <DotStrip reminderId={r.id} history={history ?? []} />
              <RowActions reminder={r} onOpenSheet={onOpenSheet} showPause />
            </div>
          ))
        )}
      </section>

      <section>
        <div className="rem-section-label">
          <span>One-time</span>
        </div>
        {oneTimePending.length === 0 ? (
          <div className="rem-empty">Nothing pending.</div>
        ) : (
          oneTimePending.map((r) => (
            <div key={r.id} className="rem-all-row">
              <div className="rem-row-titleblock">
                <span className="rem-row-title">{r.title}</span>
                <span className="rem-row-sub">{describeSchedule(r)}</span>
              </div>
              <RowActions reminder={r} onOpenSheet={onOpenSheet} showPause={false} />
            </div>
          ))
        )}
      </section>

      {paused.length > 0 && (
        <section>
          <div className="rem-section-label">
            <span>Paused</span>
          </div>
          {paused.map((r) => (
            <div key={r.id} className="rem-all-row">
              <div className="rem-row-titleblock">
                <span className="rem-row-title">{r.title}</span>
                <span className="rem-row-sub">{describeSchedule(r)}</span>
              </div>
              <RowActions reminder={r} onOpenSheet={onOpenSheet} showPause={false} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Consecutive scheduled days done/module, walking back from the history
 *  window's most recent day -- the client-side read of the same rule
 *  reminder_streak computes server-side, from data already fetched for the
 *  dot strip, so this tab doesn't need N extra reminder_streak round trips. */
function streakFor(r: Reminder, history: ReminderHistoryRow[] | undefined): string {
  const rows = (history ?? [])
    .filter((h) => h.reminder_id === r.id)
    .sort((a, b) => b.d.localeCompare(a.d));
  let streak = 0;
  for (const row of rows) {
    const s: ReminderHistoryState = row.state;
    if (s === 'excused') continue;
    if (s === 'done' || s === 'module') {
      streak += 1;
      continue;
    }
    if (s === 'open') continue;
    if (s === 'unscheduled') continue;
    break;
  }
  return `${streak}d`;
}
