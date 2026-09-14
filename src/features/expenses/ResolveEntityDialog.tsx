import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { money } from '@/lib/format';
import { useCategories } from './hooks';
import type { ResolveEntityInput } from './api';

type EntityType = ResolveEntityInput['entityType'];

/** Person / Shop / Me resolution form — used both for a plain unresolved
 *  key and for each individual name inside an ambiguous "separated" split. */
export function ResolveEntityDialog({
  open,
  onOpenChange,
  title,
  sampleName,
  txnCount,
  totalCents,
  pending,
  initialType = 'person',
  onResolve,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  sampleName: string;
  txnCount: number;
  totalCents: number;
  pending: boolean;
  initialType?: EntityType;
  onResolve: (input: ResolveEntityInput) => void;
}) {
  const cats = useCategories();
  const [entityType, setEntityType] = useState<EntityType>(initialType);
  const [displayName, setDisplayName] = useState(sampleName);
  const [categorySlug, setCategorySlug] = useState('');

  const shopCategories = cats.forDirection('debit').filter((c) => c.kind !== 'transfer');

  function reset() {
    setEntityType(initialType);
    setDisplayName(sampleName);
    setCategorySlug('');
  }

  function submit() {
    if (!displayName.trim()) return;
    if (entityType === 'merchant' && !categorySlug) return;
    onResolve({
      entityType,
      displayName: displayName.trim(),
      categorySlug: entityType === 'merchant' ? categorySlug : undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={title}
      description={`${txnCount} transaction${txnCount === 1 ? '' : 's'} · ${money(totalCents, true)}`}
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="button"
            onClick={submit}
            disabled={pending || !displayName.trim() || (entityType === 'merchant' && !categorySlug)}
          >
            {pending ? 'Saving…' : 'Resolve'}
          </button>
        </>
      }
    >
      <div className="seg">
        <button type="button" className={entityType === 'person' ? 'on' : ''} onClick={() => setEntityType('person')}>
          Person
        </button>
        <button type="button" className={entityType === 'merchant' ? 'on' : ''} onClick={() => setEntityType('merchant')}>
          Shop
        </button>
        <button type="button" className={entityType === 'self' ? 'on' : ''} onClick={() => setEntityType('self')}>
          Me
        </button>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="resolve-name">Display name</label>
        <input
          id="resolve-name"
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      {entityType === 'merchant' && (
        <div className="field">
          <label htmlFor="resolve-cat">Category</label>
          <select
            id="resolve-cat"
            className="input"
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
          >
            <option value="">Choose a category…</option>
            {shopCategories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {entityType === 'self' && (
        <p className="tlabel" style={{ marginTop: 4 }}>
          Marks this as an internal transfer — categorised as Self Transfer, excluded from spend.
        </p>
      )}
    </Dialog>
  );
}
