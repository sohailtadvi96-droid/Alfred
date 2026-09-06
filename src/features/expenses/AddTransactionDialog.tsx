import { FormEvent, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { parseAmountToCents } from '@/lib/format';
import type { Direction } from './categories';
import { useAccounts, useAddTransaction, useCategories } from './hooks';

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AddTransactionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const add = useAddTransaction();
  const { data: accounts } = useAccounts();
  const cats = useCategories();

  const [direction, setDirection] = useState<Direction>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayLocalISODate);
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = cats.forDirection(direction);

  function reset() {
    setDirection('debit');
    setAmount('');
    setMerchant('');
    setDate(todayLocalISODate());
    setAccountId('');
    setCategory('');
    setNote('');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseAmountToCents(amount);
    if (cents === null || cents === 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    try {
      await add.mutateAsync({
        occurred_at: new Date(`${date}T12:00:00`).toISOString(),
        amount_cents: cents,
        direction,
        merchant_raw: merchant.trim(),
        category: category || (direction === 'credit' ? 'money_received' : 'uncategorised'),
        account_id: accountId || null,
        note: note.trim() || null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not add the transaction.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Add transaction"
      description="Left blank, the category is guessed from the merchant."
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="add-txn-form"
            disabled={add.isPending || !amount.trim()}
          >
            {add.isPending ? 'Saving…' : 'Save transaction'}
          </button>
        </>
      }
    >
      <form id="add-txn-form" onSubmit={onSubmit}>
        <div className="seg">
          <button
            type="button"
            className={direction === 'debit' ? 'on' : ''}
            onClick={() => {
              setDirection('debit');
              setCategory('');
            }}
          >
            Money out
          </button>
          <button
            type="button"
            className={direction === 'credit' ? 'on' : ''}
            onClick={() => {
              setDirection('credit');
              setCategory('');
            }}
          >
            Money in
          </button>
        </div>

        <div className="field-row">
          <div className={`field${error ? ' bad' : ''}`}>
            <label htmlFor="txn-amt">Amount (₹)</label>
            <input
              id="txn-amt"
              className="input mono"
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="txn-date">Date</label>
            <input
              id="txn-date"
              className="input"
              type="date"
              value={date}
              max={todayLocalISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="txn-merchant">Merchant</label>
          <input
            id="txn-merchant"
            className="input"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Blue Tokai Coffee"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="txn-cat">Category</label>
            <select id="txn-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Guess from merchant</option>
              {options.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="txn-acc">Account</label>
            <select id="txn-acc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` ··${a.last4}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="txn-note">Note</label>
          <input
            id="txn-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
          />
        </div>
        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
