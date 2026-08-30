import { mergeAgenda, tasksDueToday } from './agenda';
import { dueLabel, isToday, timeLabel } from './datetime';
import { useEvents, useSetTaskStatus, useTasks } from './hooks';
import type { AgendaEvent } from './types';

const longDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function TodayView({ googleEvents }: { googleEvents: AgendaEvent[] }) {
  const { data: local } = useEvents();
  const { data: tasks } = useTasks();
  const setStatus = useSetTaskStatus();

  const todaysEvents = mergeAgenda(local, googleEvents).filter((e) => isToday(e.startsAt));
  const attention = tasksDueToday(tasks).sort(
    (a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''),
  );
  const clear = todaysEvents.length === 0 && attention.length === 0;

  return (
    <section className="office-today">
      <div className="office-today-head">
        <span className="office-today-kicker">Today</span>
        <span className="office-today-date">{longDate.format(new Date())}</span>
      </div>

      {clear ? (
        <div className="office-today-clear">Clear day — nothing scheduled, nothing due.</div>
      ) : (
        <div className="office-today-cols">
          <div className="office-today-col">
            <div className="office-today-col-h">Schedule</div>
            {todaysEvents.length === 0 ? (
              <div className="office-empty">No meetings today.</div>
            ) : (
              todaysEvents.map((e) => (
                <div className="office-evt" key={e.id}>
                  <span className="office-evt-time mono">
                    {e.allDay ? 'all day' : timeLabel(e.startsAt)}
                  </span>
                  <div className="office-evt-main">
                    <span className="office-evt-title">
                      {e.title}
                      {e.source === 'google' && <span className="office-evt-badge">Google</span>}
                    </span>
                    {e.location && <span className="office-row-note">{e.location}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="office-today-col">
            <div className="office-today-col-h">Due</div>
            {attention.length === 0 ? (
              <div className="office-empty">Nothing due today.</div>
            ) : (
              attention.map((t) => {
                const due = dueLabel(t.due_date);
                return (
                  <div className="office-row" key={t.id}>
                    <label className="office-check">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setStatus.mutate({ id: t.id, status: 'done' })}
                        aria-label={`${t.title} done`}
                      />
                    </label>
                    <div className="office-row-main">
                      <span className="office-row-label">{t.title}</span>
                      <span className="office-row-sub">
                        <span className={`office-due tone-${due.tone}`}>{due.text}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
