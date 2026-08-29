import { FormEvent, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { useAddAsset, useAssets, useDeleteAsset, useUpdateAsset } from './hooks';

export function AssetsChecklist({ projectId }: { projectId: string }) {
  const { data: assets, isLoading } = useAssets(projectId);
  const add = useAddAsset(projectId);
  const update = useUpdateAsset(projectId);
  const del = useDeleteAsset(projectId);

  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const provided = (assets ?? []).filter((a) => a.provided).length;
  const total = assets?.length ?? 0;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return;
    try {
      await add.mutateAsync({ label, note });
      setLabel('');
      setNote('');
    } catch (err) {
      setError(errMessage(err, 'Could not add that asset.'));
    }
  }

  return (
    <section className="work-section">
      <div className="work-section-head">
        <h3>Assets required</h3>
        <span className="work-count">
          {total > 0 ? `${provided} / ${total} in hand` : 'nothing listed'}
        </span>
      </div>

      <div className="work-list">
        {isLoading ? (
          <div className="work-empty">Loading…</div>
        ) : total === 0 ? (
          <div className="work-empty">No assets tracked yet.</div>
        ) : (
          (assets ?? []).map((a) => (
            <div className={`work-row asset${a.provided ? ' done' : ''}`} key={a.id}>
              <label className="work-check">
                <input
                  type="checkbox"
                  checked={a.provided}
                  onChange={(e) =>
                    update.mutate({ id: a.id, patch: { provided: e.target.checked } })
                  }
                  aria-label={`${a.label} provided`}
                />
              </label>
              <div className="work-row-main">
                <span className="work-row-label">{a.label}</span>
                {a.note && <span className="work-row-note">{a.note}</span>}
              </div>
              <button
                className="row-x"
                onClick={() => del.mutate(a.id)}
                data-tip="Remove"
                aria-label={`Remove ${a.label}`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <form className="work-add" onSubmit={onAdd}>
        <input
          className="input sm-select"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Asset — e.g. brand fonts"
          aria-label="Asset label"
        />
        <input
          className="input sm-select"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Asset note"
        />
        <button className="btn sec sm" type="submit" disabled={add.isPending || !label.trim()}>
          Add
        </button>
      </form>
      {error && <div className="err">{error}</div>}
    </section>
  );
}
