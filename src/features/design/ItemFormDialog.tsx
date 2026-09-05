import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { useSaveItem } from './hooks';
import { parseTags, tagsToInput } from './tags';
import type { BoardWithCover, DesignItem } from './types';

export function ItemFormDialog({
  open,
  onOpenChange,
  boards,
  defaultBoardId,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  boards: BoardWithCover[];
  /** board pre-selected when adding from a board page */
  defaultBoardId?: string;
  edit?: DesignItem;
}) {
  const save = useSaveItem();
  const [boardId, setBoardId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewBad, setPreviewBad] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBoardId(edit?.board_id ?? defaultBoardId ?? boards[0]?.id ?? '');
    setImageUrl(edit?.image_url ?? '');
    setLinkUrl(edit?.link_url ?? '');
    setTitle(edit?.title ?? '');
    setNote(edit?.note ?? '');
    setTags(edit ? tagsToInput(edit.tags) : '');
    setError(null);
    setPreviewBad(false);
  }, [open, edit, defaultBoardId, boards]);

  useEffect(() => {
    setPreviewBad(false);
  }, [imageUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!boardId) return setError('Pick a board.');
    if (!imageUrl.trim()) return setError('Paste an image URL.');
    try {
      await save.mutateAsync({
        id: edit?.id ?? null,
        board_id: boardId,
        image_url: imageUrl,
        link_url: linkUrl,
        title,
        note,
        tags: parseTags(tags),
      });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the reference.'));
    }
  }

  const canSave = !!boardId && !!imageUrl.trim() && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit reference' : 'Add reference'}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn primary sm" type="submit" form="item-form" disabled={!canSave}>
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Add reference'}
          </button>
        </>
      }
    >
      <form id="item-form" onSubmit={onSubmit}>
        <div className="di-preview">
          {imageUrl.trim() && !previewBad ? (
            <img src={imageUrl} alt="" onError={() => setPreviewBad(true)} />
          ) : (
            <span>{previewBad ? 'Image didn’t load' : 'Preview'}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="i-board">Board</label>
          <select
            id="i-board"
            className="input"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="i-image">Image URL</label>
          <input
            id="i-image"
            className="input"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/screenshot.png"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="i-link">Source link</label>
          <input
            id="i-link"
            className="input"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="optional — the page you found it on"
          />
        </div>

        <div className="field">
          <label htmlFor="i-title">Title</label>
          <input
            id="i-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="optional"
          />
        </div>

        <div className="field">
          <label htmlFor="i-tags">Tags</label>
          <input
            id="i-tags"
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma-separated — e.g. typography, dark, grid"
          />
        </div>

        <div className="field">
          <label htmlFor="i-note">Note</label>
          <textarea
            id="i-note"
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional — what caught your eye"
          />
        </div>

        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
