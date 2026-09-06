import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { CATEGORY_PALETTE } from '@/lib/color';
import type { Category, Direction } from './categories';
import { useCategories, useDeleteCategory, useUpsertCategory } from './hooks';

type DirChoice = 'debit' | 'credit' | 'both';

export function EditCategoryDialog({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const up = useUpsertCategory();
  const del = useDeleteCategory();
  const cats = useCategories();

  const siblingExists = cats.all.some((c) => c.slug === cat.slug && c.direction !== cat.direction);
  const initialDir: DirChoice = siblingExists ? 'both' : cat.direction;

  const [label, setLabel] = useState(cat.label);
  const [color, setColor] = useState(cat.color);
  const [dir, setDir] = useState<DirChoice>(initialDir);
  const [error, setError] = useState<string | null>(null);

  const dirChanged = dir !== initialDir;
  const canRemove = cat.isOverride || !cat.hasSystemDefault;
  const removeLabel = cat.hasSystemDefault ? 'Reset to default' : 'Delete category';

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = { slug: cat.slug, label: label.trim() || cat.slug, color, sort: cat.sort };
    try {
      if (dir === 'both') {
        await up.mutateAsync({ ...base, direction: 'debit' });
        await up.mutateAsync({ ...base, direction: 'credit' });
      } else {
        await up.mutateAsync({ ...base, direction: dir });
        // drop the other flow's copy if it's one the owner added
        const other: Direction = dir === 'debit' ? 'credit' : 'debit';
        const otherCat = cats.all.find((c) => c.slug === cat.slug && c.direction === other);
        if (otherCat && (otherCat.isOverride || !otherCat.hasSystemDefault)) {
          try {
            await del.mutateAsync({ slug: cat.slug, direction: other });
          } catch {
            /* best effort */
          }
        }
      }
      onClose();
    } catch (err) {
      setError(errMessage(err, 'Could not save the category.'));
    }
  }

  async function onRemove() {
    setError(null);
    for (const d of ['debit', 'credit'] as const) {
      try {
        await del.mutateAsync({ slug: cat.slug, direction: d });
      } catch {
        /* not present / built-in */
      }
    }
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Edit “${cat.label}”`}
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
          <button
            className="btn primary sm"
            type="submit"
            form="edit-cat-form"
            disabled={up.isPending || !label.trim()}
          >
            {up.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="edit-cat-form" onSubmit={onSave}>
        <div className="seg">
          <button type="button" className={dir === 'debit' ? 'on' : ''} onClick={() => setDir('debit')}>
            Money out
          </button>
          <button type="button" className={dir === 'credit' ? 'on' : ''} onClick={() => setDir('credit')}>
            Money in
          </button>
          <button type="button" className={dir === 'both' ? 'on' : ''} onClick={() => setDir('both')}>
            Both
          </button>
        </div>

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

        {dir === 'both' && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Appears as a card in both the Money out and Money in flows.
          </p>
        )}
        {dir !== 'both' && dirChanged && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Past transactions keep their current flow — only new ones use this.
          </p>
        )}
        {!dirChanged && cat.hasSystemDefault && !cat.isOverride && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Editing a built-in category creates your own version of it.
          </p>
        )}
      </form>
    </Dialog>
  );
}
