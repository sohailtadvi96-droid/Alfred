import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { money } from '@/lib/format';
import { useCategories } from './hooks';
import type { QueueNameBreakdown, ResolveEntityInput } from './api';

type EntityType = ResolveEntityInput['entityType'];
type Row = { name: string; entityType: EntityType; displayName: string; categorySlug: string };

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** "Different entities" — one row per distinct name, each resolved
 *  independently. Confirms all at once; the prefix itself gets detached
 *  and tombstoned regardless of what's chosen here. */
export function SeparateEntitiesDialog({
  open,
  onOpenChange,
  names,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  names: QueueNameBreakdown[];
  pending: boolean;
  onConfirm: (perName: (ResolveEntityInput & { name: string })[]) => void;
}) {
  const cats = useCategories();
  const shopCategories = cats.forDirection('debit').filter((c) => c.kind !== 'transfer');

  const [rows, setRows] = useState<Row[]>(() =>
    names.map((n) => ({ name: n.name, entityType: 'person', displayName: title(n.name), categorySlug: '' })),
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const allValid = rows.every((r) => r.displayName.trim() && (r.entityType !== 'merchant' || r.categorySlug));

  function submit() {
    if (!allValid) return;
    onConfirm(
      rows.map((r) => ({
        name: r.name,
        entityType: r.entityType,
        displayName: r.displayName.trim(),
        categorySlug: r.entityType === 'merchant' ? r.categorySlug : undefined,
      })),
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve as different entities"
      description="Each name below becomes its own entity. The shared prefix is retired — it never gets reattached to any of them."
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn primary sm" type="button" onClick={submit} disabled={pending || !allValid}>
            {pending ? 'Saving…' : 'Confirm separation'}
          </button>
        </>
      }
    >
      {rows.map((r, i) => {
        const n = names[i];
        return (
          <div key={r.name} className="field-row" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>
                “{n.name}” · {n.txn_count} txn{n.txn_count === 1 ? '' : 's'} · {money(n.total_cents, true)}
              </label>
              <div className="seg">
                <button type="button" className={r.entityType === 'person' ? 'on' : ''} onClick={() => update(i, { entityType: 'person' })}>
                  Person
                </button>
                <button type="button" className={r.entityType === 'merchant' ? 'on' : ''} onClick={() => update(i, { entityType: 'merchant' })}>
                  Shop
                </button>
                <button type="button" className={r.entityType === 'self' ? 'on' : ''} onClick={() => update(i, { entityType: 'self' })}>
                  Me
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`sep-name-${i}`}>Display name</label>
              <input
                id={`sep-name-${i}`}
                className="input"
                value={r.displayName}
                onChange={(e) => update(i, { displayName: e.target.value })}
              />
            </div>
            {r.entityType === 'merchant' && (
              <div className="field">
                <label htmlFor={`sep-cat-${i}`}>Category</label>
                <select
                  id={`sep-cat-${i}`}
                  className="input"
                  value={r.categorySlug}
                  onChange={(e) => update(i, { categorySlug: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {shopCategories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </Dialog>
  );
}
