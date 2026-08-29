import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { parseAmountToCents } from '@/lib/format';
import { ACCOUNT_TYPES } from './categories';
import { useAddAccount } from './hooks';

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const add = useAddAccount();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('bank');
  const [last4, setLast4] = useState('');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setType('bank');
    setLast4('');
    setOpening('');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = opening.trim() ? parseAmountToCents(opening) : 0;
    if (cents === null) {
      setError('Opening balance is not a valid amount.');
      return;
    }
    try {
      await add.mutateAsync({
        name: name.trim(),
        type,
        last4: last4.trim() || null,
        opening_balance_cents: cents,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the account.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Add account"
      footer={
        <>
          <button className="btn ghost sm" onClick={() => onOpenChange(false)} type="button">
            Cancel
          </button>
          <button className="btn primary sm" type="submit" form="add-account-form" disabled={add.isPending || !name.trim()}>
            {add.isPending ? 'Adding…' : 'Add account'}
          </button>
        </>
      }
    >
      <form id="add-account-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="acc-name">Name</label>
          <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="acc-type">Type</label>
            <select id="acc-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acc-last4">Last 4</label>
            <input
              id="acc-last4"
              className="input"
              value={last4}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              placeholder="optional"
            />
          </div>
        </div>
        <div className={`field${error ? ' bad' : ''}`}>
          <label htmlFor="acc-open">Opening balance</label>
          <input
            id="acc-open"
            className="input mono"
            value={opening}
            inputMode="decimal"
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.00"
          />
          {error && <span className="err">{error}</span>}
        </div>
      </form>
    </Dialog>
  );
}
