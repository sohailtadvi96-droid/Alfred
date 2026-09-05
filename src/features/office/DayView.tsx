import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errMessage } from '@/lib/errors';
import { localEventId, mergeAgenda } from './agenda';
import { addDays, dayEndISO, dayStartISO, dayTitle, todayKey } from './calendar';
import { localDateKey, timeLabel } from './datetime';
import { EventDialog } from './EventDialog';
import { JournalBox } from './JournalBox';
import { TaskDialog } from './TaskDialog';
import { TaskRow } from './TaskRow';
import { useGoogleEvents } from './useGoogleCalendar';
import {
  useAddNote,
  useDayEvents,
  useDayNotes,
  useDayTasks,
  useDeleteEvent,
  useDeleteTask,
  useSetTaskStatus,
  useUpdateNote,
} from './hooks';
import type { AgendaEvent, OfficeEvent, OfficeTask } from './types';

function Schedule({ date }: { date: string }) {
  const { data: local, isLoading, error } = useDayEvents(date);
  const { events: googleEvents } = useGoogleEvents(dayStartISO(date), dayEndISO(date));
  const del = useDeleteEvent();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<OfficeEvent | null>(null);

  const googleForDay = googleEvents.filter((e) => localDateKey(e.startsAt) === date);
  const rows = mergeAgenda(local, googleForDay);

  return (
    <section className="office-section">
      <div className="office-section-head">
        <h3>Schedule</h3>
        <button className="btn sec sm" onClick={() => setAddOpen(true)}>
          New meeting
        </button>
      </div>
      <div className="office-list">
        {error ? (
          <div className="office-empty">Couldn’t load the schedule.</div>
        ) : isLoading ? (
          <div className="office-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="office-empty">Nothing scheduled.</div>
        ) : (
          rows.map((row: AgendaEvent) => {
            const isLocal = row.source === 'local';
            return (
              <div className="office-evt" key={row.id}>
                <span className="office-evt-time mono">
                  {row.allDay ? 'all day' : timeLabel(row.startsAt)}
                </span>
                <div className="office-evt-main">
                  <span className="office-evt-title">
                    {row.title}
                    {!isLocal && <span className="office-evt-badge">Google</span>}
                  </span>
                  {row.location && <span className="office-row-note">{row.location}</span>}
                </div>
                {isLocal ? (
                  <span className="office-evt-actions">
                    <button
                      className="row-x"
                      onClick={() => {
                        const id = localEventId(row.id);
                        const found = (local ?? []).find((e) => e.id === id);
                        if (found) setEdit(found);
                      }}
                      data-tip="Edit"
                      aria-label={`Edit ${row.title}`}
                    >
                      ✎
                    </button>
                    <button
                      className="row-x"
                      onClick={() => {
                        const id = localEventId(row.id);
                        if (id) del.mutate(id);
                      }}
                      data-tip="Delete"
                      aria-label={`Delete ${row.title}`}
                    >
                      ×
                    </button>
                  </span>
                ) : row.url ? (
                  <a
                    className="row-x"
                    href={row.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-tip="Open in Google Calendar"
                    aria-label="Open in Google Calendar"
                  >
                    ↗
                  </a>
                ) : (
                  <span className="office-evt-actions" />
                )}
              </div>
            );
          })
        )}
      </div>
      <EventDialog open={addOpen} onOpenChange={setAddOpen} defaultDate={date} />
      <EventDialog open={edit != null} onOpenChange={(v) => !v && setEdit(null)} edit={edit ?? undefined} />
    </section>
  );
}

function DueTasks({ date }: { date: string }) {
  const isToday = date === todayKey();
  const { data: tasks, isLoading, error } = useDayTasks(date, isToday);
  const setStatus = useSetTaskStatus();
  const del = useDeleteTask();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<OfficeTask | null>(null);

  const rows = tasks ?? [];
  const overdue = isToday ? rows.filter((t) => t.due_date && t.due_date < date) : [];
  const onDay = rows.filter((t) => t.due_date === date);

  const row = (t: OfficeTask) => (
    <TaskRow
      key={t.id}
      task={t}
      onToggle={() =>
        setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'open' : 'done' })
      }
      onEdit={() => setEdit(t)}
      onDelete={() => del.mutate(t.id)}
    />
  );

  return (
    <section className="office-section">
      <div className="office-section-head">
        <h3>Due</h3>
        <button className="btn sec sm" onClick={() => setAddOpen(true)}>
          New task
        </button>
      </div>
      <div className="office-list">
        {error ? (
          <div className="office-empty">Couldn’t load tasks.</div>
        ) : isLoading ? (
          <div className="office-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="office-empty">Nothing due this day.</div>
        ) : (
          <>
            {overdue.length > 0 && (
              <>
                <div className="office-group-label overdue">Overdue</div>
                {overdue.map(row)}
                <div className="office-group-label">Due today</div>
              </>
            )}
            {onDay.length > 0 ? (
              onDay.map(row)
            ) : overdue.length > 0 ? (
              <div className="office-empty">Nothing due today.</div>
            ) : null}
          </>
        )}
      </div>
      <TaskDialog open={addOpen} onOpenChange={setAddOpen} defaultDue={date} />
      <TaskDialog open={edit != null} onOpenChange={(v) => !v && setEdit(null)} edit={edit ?? undefined} />
    </section>
  );
}

function DayNotes({ date }: { date: string }) {
  const { data: notes, isLoading, error } = useDayNotes(date);
  const add = useAddNote();
  const update = useUpdateNote();
  const [body, setBody] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await add.mutateAsync({ body, entryDate: date });
      setBody('');
    } catch (err) {
      setBanner(errMessage(err, 'Could not save the note.'));
    }
  }

  return (
    <section className="office-section office-section-wide">
      <div className="office-section-head">
        <h3>Notes</h3>
        <span className="office-count">{notes?.length ?? 0}</span>
      </div>
      {banner && <div className="err">{banner}</div>}
      <form className="office-add" onSubmit={onAdd}>
        <input
          className="input sm-select"
          style={{ flex: 1 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Note for this day…"
          aria-label="New note"
        />
        <button className="btn sec sm" type="submit" disabled={add.isPending || !body.trim()}>
          Add
        </button>
      </form>
      <div className="office-notes">
        {error ? (
          <div className="office-empty">Couldn’t load notes.</div>
        ) : isLoading ? (
          <div className="office-empty">Loading…</div>
        ) : (notes?.length ?? 0) === 0 ? (
          <div className="office-empty">No notes for this day.</div>
        ) : (
          (notes ?? []).map((n) => (
            <div className="office-note" key={n.id}>
              <p>{n.body}</p>
              <div className="office-note-actions">
                <button
                  className="office-note-btn"
                  onClick={() => update.mutate({ id: n.id, patch: { archived: true } })}
                  data-tip="Remove"
                  aria-label="Remove note"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function DayView({ date }: { date: string }) {
  const navigate = useNavigate();
  const isToday = date === todayKey();

  return (
    <div className="office-day-page">
      <div className="office-day-nav">
        <Link className="btn sec sm" to="/work">
          ‹ Calendar
        </Link>
        <div className="office-day-title">
          {dayTitle(date)}
          {isToday && <span className="office-day-today"> · today</span>}
        </div>
        <div className="office-day-step">
          <button
            className="office-cal-nav"
            onClick={() => navigate(`/work/day/${addDays(date, -1)}`)}
            aria-label="Previous day"
          >
            ‹
          </button>
          <button
            className="office-cal-nav"
            onClick={() => navigate(`/work/day/${addDays(date, 1)}`)}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      <div className="office-grid">
        <Schedule date={date} />
        <DueTasks date={date} />
      </div>

      <JournalBox date={date} />
      <DayNotes date={date} />
    </div>
  );
}
