import { FormEvent, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { fullDate } from '@/lib/format';
import { useAddTimeEntry, useDeleteTimeEntry, useTimeEntries } from './hooks';

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2));

export function TimeLog({ projectId }: { projectId: string }) {
  const { data: entries, isLoading } = useTimeEntries(projectId);
  const add = useAddTimeEntry(projectId);
  const del = useDeleteTimeEntry(projectId);

  const [date, setDate] = useState(todayLocalISODate);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const total = (entries ?? []).reduce((s, e) => s + e.hours, 0);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return setError('Enter hours greater than zero.');
    try {
      await add.mutateAsync({ entryDate: date, hours: h, note });
      setHours('');
      setNote('');
      setDate(todayLocalISODate());
    } catch (err) {
      setError(errMessage(err, 'Could not log that time.'));
    }
  }

  return (
    <section className="work-section">
      <div className="work-section-head">
        <h3>Time log</h3>
        <span className="work-count">{fmtHours(total)} h total</span>
      </div>

      <div className="work-list">
        {isLoading ? (
          <div className="work-empty">Loading…</div>
        ) : (entries?.length ?? 0) === 0 ? (
          <div className="work-empty">No time logged yet.</div>
        ) : (
          (entries ?? []).map((e) => (
            <div className="work-row time" key={e.id}>
              <span className="work-time-date">{fullDate(e.entry_date)}</span>
              <div className="work-row-main">
                <span className="work-row-label mono">{fmtHours(e.hours)} h</span>
                {e.note && <span className="work-row-note">{e.note}</span>}
              </div>
              <button
                className="row-x"
                onClick={() => del.mutate(e.id)}
                data-tip="Remove"
                aria-label="Remove time entry"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <form className="work-add time" onSubmit={onAdd}>
        <input
          className="input sm-select"
          type="date"
          value={date}
          max={todayLocalISODate()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Entry date"
        />
        <input
          className="input sm-select mono"
          value={hours}
          inputMode="decimal"
          onChange={(e) => setHours(e.target.value)}
          placeholder="Hours"
          aria-label="Hours"
        />
        <input
          className="input sm-select"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Time note"
        />
        <button className="btn sec sm" type="submit" disabled={add.isPending || !hours.trim()}>
          Log
        </button>
      </form>
      {error && <div className="err">{error}</div>}
    </section>
  );
}
