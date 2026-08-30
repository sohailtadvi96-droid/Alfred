import { FormEvent, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { useAddNote, useNotes, useUpdateNote } from './hooks';

export function NotesPanel() {
  const { data: notes, isLoading, error } = useNotes();
  const add = useAddNote();
  const update = useUpdateNote();
  const [body, setBody] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await add.mutateAsync({ body });
      setBody('');
    } catch (err) {
      setBanner(errMessage(err, 'Could not save the note.'));
    }
  }

  return (
    <section className="office-section office-section-wide">
      <div className="office-section-head">
        <h3>Quick notes</h3>
        <span className="office-count">{notes?.length ?? 0}</span>
      </div>

      {banner && <div className="err">{banner}</div>}

      <form className="office-add" onSubmit={onAdd}>
        <input
          className="input sm-select"
          style={{ flex: 1 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Jot a note or a follow-up…"
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
          <div className="office-empty">No notes yet.</div>
        ) : (
          (notes ?? []).map((n) => (
            <div className={`office-note${n.pinned ? ' pinned' : ''}`} key={n.id}>
              <p>{n.body}</p>
              <div className="office-note-actions">
                <button
                  className="office-note-btn"
                  onClick={() => update.mutate({ id: n.id, patch: { pinned: !n.pinned } })}
                  data-tip={n.pinned ? 'Unpin' : 'Pin'}
                  aria-label={n.pinned ? 'Unpin note' : 'Pin note'}
                >
                  {n.pinned ? '★' : '☆'}
                </button>
                <button
                  className="office-note-btn"
                  onClick={() => update.mutate({ id: n.id, patch: { archived: true } })}
                  data-tip="Archive"
                  aria-label="Archive note"
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
