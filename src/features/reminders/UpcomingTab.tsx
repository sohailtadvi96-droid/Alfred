import type { SheetRequest } from './ReminderSheet';
import { describeScheduleShort, formatTime } from './schedule';
import { useReminderRules, useUpcoming } from './hooks';
import type { ReminderUpcoming } from './types';

// Formatted separately (not one combined Intl call) so the pieces join
// without Intl's own locale punctuation (a comma after the weekday, etc.) --
// this only ever formats a date the server already gave us (occurrence_date),
// never "today".
const wdFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric' });
const monFmt = new Intl.DateTimeFormat('en-IN', { month: 'short' });
function formatDayHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${wdFmt.format(d)} ${dayFmt.format(d)} ${monFmt.format(d)}`.toUpperCase();
}

function groupByDay(rows: ReminderUpcoming[]): [string, ReminderUpcoming[]][] {
  const groups = new Map<string, ReminderUpcoming[]>();
  for (const r of rows) {
    const list = groups.get(r.occurrence_date);
    if (list) list.push(r);
    else groups.set(r.occurrence_date, [r]);
  }
  return [...groups.entries()];
}

export function UpcomingTab({ onOpenSheet }: { onOpenSheet: (req: SheetRequest) => void }) {
  const { data: rows, isLoading } = useUpcoming(7);
  const { data: rules } = useReminderRules();

  if (isLoading) {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rem-skel-row" />
        ))}
      </div>
    );
  }

  const list = rows ?? [];
  if (list.length === 0) {
    return <div className="rem-empty">Nothing in the next 7 days.</div>;
  }

  function openEdit(item: ReminderUpcoming) {
    const full = rules?.find((r) => r.id === item.id);
    if (full) onOpenSheet({ kind: 'edit', reminder: full });
  }

  return (
    <div>
      {groupByDay(list).map(([date, items]) => (
        <section key={date}>
          <div className="rem-section-label">
            <span>{formatDayHeader(date)}</span>
          </div>
          {items.map((item) => (
            <button
              key={`${item.id}-${item.occurrence_date}`}
              type="button"
              className="rem-upcoming-row"
              onClick={() => openEdit(item)}
            >
              <span className="rem-upcoming-time">{item.time ? formatTime(item.time) : '—'}</span>
              <span className="rem-upcoming-title">{item.title}</span>
              <span className="rem-upcoming-schedule">{describeScheduleShort(item)}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
