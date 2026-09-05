import { useEffect, useState } from 'react';
import type { OfficeNote } from './types';

export function NoteCard({
  note,
  onSave,
  onDelete,
  onTogglePin,
}: {
  note: OfficeNote;
  onSave: (body: string) => void;
  onDelete: () => void;
  /** omitted for dated notes — only the running quick notes can be pinned */
  onTogglePin?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  useEffect(() => {
    if (!editing) setDraft(note.body);
  }, [note.body, editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== note.body) onSave(next);
    setEditing(false);
  }

  return (
    <div className={`office-note${note.pinned ? ' pinned' : ''}`}>
      {editing ? (
        <>
          <textarea
            className="input"
            rows={3}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(note.body);
                setEditing(false);
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
            }}
          />
          <div className="office-note-actions">
            <button
              className="office-note-btn"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              cancel
            </button>
            <button className="office-note-btn strong" onClick={commit}>
              save
            </button>
          </div>
        </>
      ) : (
        <>
          <p
            className="office-note-body"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {note.body}
          </p>
          <div className="office-note-actions">
            {onTogglePin && (
              <button
                className="office-note-btn"
                onClick={onTogglePin}
                data-tip={note.pinned ? 'Unpin' : 'Pin'}
                aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
              >
                {note.pinned ? '★' : '☆'}
              </button>
            )}
            <button
              className="office-note-btn"
              onClick={() => setEditing(true)}
              data-tip="Edit"
              aria-label="Edit note"
            >
              ✎
            </button>
            <button
              className="office-note-btn"
              onClick={onDelete}
              data-tip="Remove"
              aria-label="Remove note"
            >
              ×
            </button>
          </div>
        </>
      )}
    </div>
  );
}
