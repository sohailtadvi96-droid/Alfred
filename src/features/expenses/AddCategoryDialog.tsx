import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { CATEGORY_PALETTE } from '@/lib/color';
import { slugify, type Direction } from './categories';
import { useCategories, useUpsertCategory } from './hooks';

type DirChoice = 'debit' | 'credit' | 'both';

export function AddCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const up = useUpsertCategory();
  const cats = useCategories();

  const [label, setLabel] = useState('');
  const [dir, setDir] = useState<DirChoice>('debit');
  const [color, setColor] = useState(CATEGORY_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setDir('debit');
    setColor(CATEGORY_PALETTE[0]);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const slug = slugify(label);
    const targets: Direction[] = dir === 'both' ? ['debit', 'credit'] : [dir];

    for (const t of targets) {
      if (cats.forDirection(t).some((c) => c.slug === slug)) {
        setError(
          `A category named “${label.trim()}” already exists for ${
            t === 'debit' ? 'money out' : 'money in'
          }.`,
        );
        return;
      }
    }

    try {
      for (const t of targets) {
        const maxSort = Math.max(0, ...cats.forDirection(t).map((c) => c.sort));
        await up.mutateAsync({ slug, label: label.trim(), direction: t, color, sort: maxSort + 10 });
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not add the category.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Add category"
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="add-cat-form"
            disabled={up.isPending || !label.trim()}
          >
            {up.isPending ? 'Adding…' : 'Add category'}
          </button>
        </>
      }
    >
      <form id="add-cat-form" onSubmit={onSubmit}>
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
          <label htmlFor="cat-label">Name</label>
          <input
            id="cat-label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Family, Subscriptions"
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
            Creates a card in both the Money out and Money in flows — e.g. Family.
          </p>
        )}
      </form>
    </Dialog>
  );
}
