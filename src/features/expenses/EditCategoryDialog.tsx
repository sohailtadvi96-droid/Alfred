import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { CATEGORY_PALETTE } from '@/lib/color';
import type { Category } from './categories';
import { useDeleteCategory, useUpsertCategory } from './hooks';

export function EditCategoryDialog({
  cat,
  onClose,
}: {
  cat: Category;
  onClose: () => void;
}) {
  const up = useUpsertCategory();
  const del = useDeleteCategory();
  const [label, setLabel] = useState(cat.label);
  const [color, setColor] = useState(cat.color);
  const [error, setError] = useState<string | null>(null);

  const canRemove = cat.isOverride || !cat.hasSystemDefault;
  const removeLabel = cat.hasSystemDefault ? 'Reset to default' : 'Delete category';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await up.mutateAsync({
        slug: cat.slug,
        label: label.trim() || cat.slug,
        direction: cat.direction,
        color,
        sort: cat.sort,
      });
      onClose();
    } catch (err) {
      setError(errMessage(err, 'Could not save the category.'));
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await del.mutateAsync({ slug: cat.slug, direction: cat.direction });
      onClose();
    } catch (err) {
      setError(errMessage(err, 'Could not remove the category.'));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Edit “${cat.label}”`}
      description={cat.direction === 'credit' ? 'Money in' : 'Money out'}
      footer={
        <>
          {canRemove && (
            <button
              className="btn neg sm"
              type="button"
              onClick={onRemove}
              disabled={del.isPending}
              style={{ marginRight: 'auto' }}
            >
              {del.isPending ? '…' : removeLabel}
            </button>
          )}
          <button className="btn ghost sm" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary sm" type="submit" form="edit-cat-form" disabled={up.isPending || !label.trim()}>
            {up.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="edit-cat-form" onSubmit={onSave}>
        <div className={`field${error ? ' bad' : ''}`}>
          <label htmlFor="edit-cat-label">Name</label>
          <input
            id="edit-cat-label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          {error && <span className="err">{error}</span>}
        </div>

        <div className="field">
          <label>Colour</label>
          <div className="swatch-row">
            {CATEGORY_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch-pick${color.toLowerCase() === c.toLowerCase() ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Use ${c}`}
              />
            ))}
            <label className="swatch-pick custom" style={{ background: color }} aria-label="Custom colour">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>
        </div>

        {cat.hasSystemDefault && !cat.isOverride && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Editing a built-in category creates your own version of it.
          </p>
        )}
      </form>
    </Dialog>
  );
}
