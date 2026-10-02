import { useCompleteReminder, useRemindersToday, useUpcoming, useUserToday } from './hooks';
import { formatTime } from './schedule';
import { daysBetween, nextUp, type NextUpItem } from './today';

// Only ever formats a date the server already gave us (occurrence_date).
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

function whenLabel(item: NextUpItem, today: string | undefined): string {
  const time = item.time ? formatTime(item.time) : null;
  switch (item.state) {
    case 'overdue': {
      const days = today ? daysBetween(item.occurrenceDate, today) : 0;
      return days > 0 ? `${days}d late` : 'Overdue';
    }
    case 'due_now':
      return 'Due now';
    case 'later':
      return time ?? 'Today';
    case 'upcoming': {
      const days = today ? daysBetween(today, item.occurrenceDate) : null;
      const day = days === 1 ? 'Tomorrow' : weekdayFmt.format(new Date(`${item.occurrenceDate}T00:00:00`));
      return time ? `${day} · ${time}` : day;
    }
  }
}

/** The Home "Next up" tile's body: the next three things due, with the same
 *  optimistic tick the Today page uses (useCompleteReminder), so a tick here
 *  drops the row at once and the next one moves up. Everything sits above the
 *  tile's full-bleed link, so the tick is clickable and anywhere else on the
 *  tile still opens /reminders. */
export function NextUpList() {
  const { data: today, isLoading, error } = useRemindersToday();
  const { data: upcoming } = useUpcoming();
  const { data: userToday } = useUserToday();
  const complete = useCompleteReminder();

  if (isLoading) {
    return (
      <div className="home-next" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="home-next-skel" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="home-next-empty">Couldn’t load reminders.</div>;
  }

  const items = nextUp(today, upcoming);

  if (items.length === 0) {
    return <div className="home-next-empty">Nothing due.</div>;
  }

  return (
    <ul className="home-next">
      {items.map((item) => (
        <li key={item.key} className="home-next-row" data-state={item.state}>
          {item.tickable ? (
            <button
              type="button"
              className="rem-tick home-next-tick"
              onClick={() => complete.mutate({ id: item.id, occurrenceDate: item.occurrenceDate })}
              aria-label={`Mark ${item.title} done`}
            >
              <span className={`rem-tick-shape ${item.kind === 'recurring' ? 'square' : 'circle'}`} />
            </button>
          ) : (
            <span className="home-next-dot" aria-hidden="true" />
          )}
          <span className="home-next-title">{item.title}</span>
          <span className="home-next-when">
            {item.state === 'due_now' && <span className="rem-due-dot" aria-hidden="true" />}
            {whenLabel(item, userToday)}
          </span>
        </li>
      ))}
    </ul>
  );
}
