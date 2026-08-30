import { ReactNode, useState } from 'react';
import { groupByDay, localEventId, mergeAgenda } from './agenda';
import { timeLabel } from './datetime';
import { EventDialog } from './EventDialog';
import { useDeleteEvent, useEvents } from './hooks';
import type { AgendaEvent, OfficeEvent } from './types';

export function EventList({
  googleEvents,
  syncStrip,
}: {
  googleEvents: AgendaEvent[];
  syncStrip?: ReactNode;
}) {
  const { data: local, isLoading, error } = useEvents();
  const del = useDeleteEvent();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<OfficeEvent | null>(null);

  const days = groupByDay(mergeAgenda(local, googleEvents));

  function openEdit(row: AgendaEvent) {
    const id = localEventId(row.id);
    const found = (local ?? []).find((e) => e.id === id);
    if (found) setEdit(found);
  }

  return (
    <section className="office-section">
      <div className="office-section-head">
        <h3>Meetings</h3>
        <button className="btn sec sm" onClick={() => setAddOpen(true)}>
          New meeting
        </button>
      </div>

      {syncStrip}

      <div className="office-list">
        {error ? (
          <div className="office-empty">Couldn’t load meetings.</div>
        ) : isLoading ? (
          <div className="office-empty">Loading…</div>
        ) : days.length === 0 ? (
          <div className="office-empty">Nothing on the calendar for the next two weeks.</div>
        ) : (
          days.map((day) => (
            <div className="office-day" key={day.key}>
              <div className="office-day-label">{day.label}</div>
              {day.items.map((row) => {
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
                          onClick={() => openEdit(row)}
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
              })}
            </div>
          ))
        )}
      </div>

      <EventDialog open={addOpen} onOpenChange={setAddOpen} />
      <EventDialog open={edit != null} onOpenChange={(v) => !v && setEdit(null)} edit={edit ?? undefined} />
    </section>
  );
}
