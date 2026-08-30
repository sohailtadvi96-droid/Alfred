import { useEffect, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { useUpdateProjectBrief } from './hooks';

export function BriefBox({ projectId, brief }: { projectId: string; brief: string | null }) {
  const save = useUpdateProjectBrief(projectId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brief ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(brief ?? '');
  }, [brief, editing]);

  async function commit() {
    setError(null);
    try {
      await save.mutateAsync(draft);
      setEditing(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the brief.'));
    }
  }

  return (
    <section className="work-section work-section-wide brief-box">
      <div className="work-section-head">
        <h3>Client brief</h3>
        {!editing && (
          <button className="btn sec sm" onClick={() => setEditing(true)}>
            {brief ? 'Edit' : 'Add brief'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            className="input"
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste the brief the client sent — scope, goals, constraints, references…"
            autoFocus
          />
          <div className="brief-actions">
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button
              className="btn primary sm"
              type="button"
              onClick={commit}
              disabled={save.isPending}
            >
              {save.isPending ? 'Saving…' : 'Save brief'}
            </button>
          </div>
          {error && <div className="err">{error}</div>}
        </>
      ) : brief ? (
        <p className="brief-text">{brief}</p>
      ) : (
        <div className="work-empty">No brief captured yet.</div>
      )}
    </section>
  );
}
