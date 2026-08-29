import { FormEvent, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { fullDate } from '@/lib/format';
import {
  useAddDeliverable,
  useDeleteDeliverable,
  useDeliverables,
  useSetDeliverableStatus,
} from './hooks';

function dueMeta(due: string | null, delivered: boolean): { text: string; overdue: boolean } {
  if (!due) return { text: '', overdue: false };
  const overdue = !delivered && new Date(due) < new Date(new Date().toDateString());
  return { text: `Due ${fullDate(due)}`, overdue };
}

export function DeliverablesList({ projectId }: { projectId: string }) {
  const { data: items, isLoading } = useDeliverables(projectId);
  const add = useAddDeliverable(projectId);
  const setStatus = useSetDeliverableStatus(projectId);
  const del = useDeleteDeliverable(projectId);

  const [label, setLabel] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const done = (items ?? []).filter((d) => d.status === 'delivered').length;
  const total = items?.length ?? 0;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return;
    try {
      await add.mutateAsync({ label, dueDate: due || null });
      setLabel('');
      setDue('');
    } catch (err) {
      setError(errMessage(err, 'Could not add that deliverable.'));
    }
  }

  return (
    <section className="work-section">
      <div className="work-section-head">
        <h3>Deliverables</h3>
        <span className="work-count">
          {total > 0 ? `${done} / ${total} delivered` : 'nothing listed'}
        </span>
      </div>

      <div className="work-list">
        {isLoading ? (
          <div className="work-empty">Loading…</div>
        ) : total === 0 ? (
          <div className="work-empty">No deliverables yet.</div>
        ) : (
          (items ?? []).map((d) => {
            const delivered = d.status === 'delivered';
            const meta = dueMeta(d.due_date, delivered);
            return (
              <div className={`work-row${delivered ? ' done' : ''}`} key={d.id}>
                <label className="work-check">
                  <input
                    type="checkbox"
                    checked={delivered}
                    onChange={(e) =>
                      setStatus.mutate({
                        id: d.id,
                        status: e.target.checked ? 'delivered' : 'pending',
                      })
                    }
                    aria-label={`${d.label} delivered`}
                  />
                </label>
                <div className="work-row-main">
                  <span className="work-row-label">{d.label}</span>
                  {delivered && d.delivered_at ? (
                    <span className="work-row-note">Delivered {fullDate(d.delivered_at)}</span>
                  ) : (
                    meta.text && (
                      <span className={`work-row-note${meta.overdue ? ' overdue' : ''}`}>
                        {meta.overdue ? `Overdue — ${meta.text.toLowerCase()}` : meta.text}
                      </span>
                    )
                  )}
                </div>
                <button
                  className="row-x"
                  onClick={() => del.mutate(d.id)}
                  data-tip="Remove"
                  aria-label={`Remove ${d.label}`}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      <form className="work-add" onSubmit={onAdd}>
        <input
          className="input sm-select"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Deliverable — e.g. Homepage mockup"
          aria-label="Deliverable label"
        />
        <input
          className="input sm-select"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
        />
        <button className="btn sec sm" type="submit" disabled={add.isPending || !label.trim()}>
          Add
        </button>
      </form>
      {error && <div className="err">{error}</div>}
    </section>
  );
}
