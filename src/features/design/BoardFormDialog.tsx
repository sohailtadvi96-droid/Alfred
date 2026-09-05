import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { useSaveBoard } from './hooks';
import type { DesignBoard } from './types';

export function BoardFormDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edit?: DesignBoard;
}) {
  const save = useSaveBoard();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? '');
    setDescription(edit?.description ?? '');
    setError(null);
  }, [open, edit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Give the board a name.');
    try {
      await save.mutateAsync({ id: edit?.id ?? null, name, description });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the board.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit board' : 'New board'}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="board-form"
            disabled={save.isPending || !name.trim()}
          >
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Create board'}
          </button>
        </>
      }
    >
      <form id="board-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="b-name">Name</label>
          <input
            id="b-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dashboard layouts"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="b-desc">Description</label>
          <textarea
            id="b-desc"
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional — what this board is for"
          />
        </div>
        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
