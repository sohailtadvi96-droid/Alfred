import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { fromLocalInput, toLocalInput } from './datetime';
import { useSaveEvent } from './hooks';
import type { OfficeEvent } from './types';

function defaultStart(dayKey?: string): string {
  if (dayKey) {
    const [y, m, d] = dayKey.split('-').map(Number);
    return toLocalInput(new Date(y, m - 1, d, 9, 0).toISOString());
  }
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

export function EventDialog({
  open,
  onOpenChange,
  edit,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edit?: OfficeEvent;
  /** when adding from a day page, seed the start at 09:00 on that date */
  defaultDate?: string;
}) {
  const save = useSaveEvent();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [attendees, setAttendees] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(edit?.title ?? '');
    setStart(edit ? toLocalInput(edit.starts_at) : defaultStart(defaultDate));
    setEnd(edit?.ends_at ? toLocalInput(edit.ends_at) : '');
    setLocation(edit?.location ?? '');
    setAttendees(edit?.attendees ?? '');
    setNotes(edit?.notes ?? '');
    setError(null);
  }, [open, edit, defaultDate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give the meeting a title.');
    const startsAt = fromLocalInput(start);
    if (!startsAt) return setError('Pick a start time.');
    const endsAt = fromLocalInput(end);
    if (endsAt && endsAt < startsAt) return setError('End time is before the start.');
    try {
      await save.mutateAsync({
        id: edit?.id ?? null,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        location,
        attendees,
        notes,
      });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the meeting.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit meeting' : 'New meeting'}
      description="Local meetings you enter here sit alongside anything synced from Google Calendar."
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="event-form"
            disabled={save.isPending || !title.trim()}
          >
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Add meeting'}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="e-title">Title</label>
          <input
            id="e-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Kickoff call — Acme"
            autoFocus
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="e-start">Starts</label>
            <input
              id="e-start"
              className="input"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="e-end">Ends (optional)</label>
            <input
              id="e-end"
              className="input"
              type="datetime-local"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="e-loc">Location / link</label>
            <input
              id="e-loc"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Meet link, room, address…"
            />
          </div>
          <div className="field">
            <label htmlFor="e-att">Attendees</label>
            <input
              id="e-att"
              className="input"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="comma, separated"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="e-notes">Notes</label>
          <textarea
            id="e-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Agenda, prep, follow-ups…"
          />
        </div>
        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
