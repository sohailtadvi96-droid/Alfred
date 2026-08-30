import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { moneyIn, parseAmountToCents } from '@/lib/format';
import { useClients, useProjects, useSaveInvoice } from './hooks';
import type { DraftLineItem, InvoiceFull, ProjectWithClient } from './types';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function blankRow(): DraftLineItem {
  return { id: null, description: '', quantity: '1', unitPrice: '' };
}

function centsToInput(cents: number): string {
  return cents ? (cents / 100).toString() : '';
}

/** Row amount for the live preview; 0 when either side is unparseable. */
function rowAmount(r: DraftLineItem): number {
  const q = Number(r.quantity);
  const unit = parseAmountToCents(r.unitPrice);
  if (!Number.isFinite(q) || q <= 0 || unit === null) return 0;
  return Math.round(q * unit);
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  project,
  edit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** generate-from-project flow: locks the project, seeds client + currency */
  project?: ProjectWithClient;
  /** edit an existing invoice */
  edit?: InvoiceFull;
  onSaved?: (invoiceId: string) => void;
}) {
  const save = useSaveInvoice();
  const { data: clients } = useClients();
  const { data: projects } = useProjects();

  const lockedProject = project ?? null;

  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [rows, setRows] = useState<DraftLineItem[]>([blankRow()]);
  const [tax, setTax] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setProjectId(edit.project_id ?? '');
      setClientId(edit.client_id ?? '');
      setIssueDate(edit.issue_date);
      setDueDate(edit.due_date ?? '');
      setCurrency(edit.currency);
      setRows(
        edit.line_items.length
          ? edit.line_items.map((li) => ({
              id: li.id,
              description: li.description,
              quantity: String(li.quantity),
              unitPrice: centsToInput(li.unit_price_cents),
            }))
          : [blankRow()],
      );
      setTax(centsToInput(edit.tax_cents));
      setNotes(edit.notes ?? '');
    } else {
      setProjectId(lockedProject?.id ?? '');
      setClientId(lockedProject?.client?.id ?? '');
      setIssueDate(todayISO());
      setDueDate('');
      setCurrency(lockedProject?.currency ?? 'INR');
      setRows([blankRow()]);
      setTax('');
      setNotes('');
    }
    setError(null);
  }, [open, edit, lockedProject]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + rowAmount(r), 0), [rows]);
  const taxCents = parseAmountToCents(tax) ?? 0;
  const total = subtotal + taxCents;

  function patchRow(i: number, p: Partial<DraftLineItem>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const clean = rows
      // an untouched row (no description, no price) is dropped silently
      .filter((r) => r.description.trim() || r.unitPrice.trim())
      .map((r) => ({
        description: r.description.trim(),
        q: Number(r.quantity),
        unit: parseAmountToCents(r.unitPrice),
      }));

    if (clean.length === 0) return setError('Add at least one line item.');
    for (const r of clean) {
      if (!r.description) return setError('Every line item needs a description.');
      if (!Number.isFinite(r.q) || r.q <= 0) return setError(`“${r.description}” needs a quantity above zero.`);
      if (r.unit === null) return setError(`“${r.description}” has an invalid unit price.`);
    }
    if (tax.trim() && parseAmountToCents(tax) === null) return setError('Tax is not a valid amount.');

    try {
      const id = await save.mutateAsync({
        id: edit?.id ?? null,
        project_id: projectId || null,
        client_id: clientId || null,
        issue_date: issueDate,
        due_date: dueDate || null,
        currency,
        notes,
        tax_cents: taxCents,
        lineItems: clean.map((r) => ({
          description: r.description,
          quantity: Math.round(r.q * 100) / 100,
          unit_price_cents: r.unit as number,
        })),
      });
      onOpenChange(false);
      onSaved?.(id);
    } catch (err) {
      setError(errMessage(err, 'Could not save the invoice.'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? `Edit ${edit.invoice_number}` : 'New invoice'}
      description={
        edit
          ? 'Line items are rewritten on save. The invoice number never changes.'
          : 'A number (ALF-YYYY-####) is allocated when you create it.'
      }
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn primary sm" type="submit" form="invoice-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : edit ? 'Save changes' : 'Create invoice'}
          </button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={onSubmit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="inv-project">Project</label>
            <select
              id="inv-project"
              className="input"
              value={projectId}
              disabled={!!lockedProject}
              onChange={(e) => {
                setProjectId(e.target.value);
                const p = (projects ?? []).find((pr) => pr.id === e.target.value);
                if (p) {
                  setClientId(p.client?.id ?? '');
                  setCurrency(p.currency);
                }
              }}
            >
              <option value="">— no project —</option>
              {lockedProject && !(projects ?? []).some((p) => p.id === lockedProject.id) && (
                <option value={lockedProject.id}>{lockedProject.name}</option>
              )}
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="inv-client">Client</label>
            <select
              id="inv-client"
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">— no client —</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="inv-issue">Issue date</label>
            <input
              id="inv-issue"
              className="input"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-due">Due date</label>
            <input
              id="inv-due"
              className="input"
              type="date"
              value={dueDate}
              min={issueDate || undefined}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="inv-cur">Currency</label>
            <select
              id="inv-cur"
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Line items</label>
          <div className="inv-lines">
            <div className="inv-line inv-line-head">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span>Amount</span>
              <span aria-hidden="true" />
            </div>
            {rows.map((r, i) => (
              <div className="inv-line" key={i}>
                <input
                  className="input sm-select"
                  value={r.description}
                  onChange={(e) => patchRow(i, { description: e.target.value })}
                  placeholder="e.g. Homepage design"
                  aria-label={`Line ${i + 1} description`}
                />
                <input
                  className="input sm-select mono"
                  value={r.quantity}
                  inputMode="decimal"
                  onChange={(e) => patchRow(i, { quantity: e.target.value })}
                  aria-label={`Line ${i + 1} quantity`}
                />
                <input
                  className="input sm-select mono"
                  value={r.unitPrice}
                  inputMode="decimal"
                  onChange={(e) => patchRow(i, { unitPrice: e.target.value })}
                  placeholder="0.00"
                  aria-label={`Line ${i + 1} unit price`}
                />
                <span className="inv-line-amt mono">{moneyIn(rowAmount(r), currency)}</span>
                <button
                  type="button"
                  className="row-x"
                  onClick={() => removeRow(i)}
                  aria-label={`Remove line ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="gate-link" onClick={addRow}>
            + Add line item
          </button>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="inv-tax">Tax (flat, {currency})</label>
            <input
              id="inv-tax"
              className="input mono"
              value={tax}
              inputMode="decimal"
              onChange={(e) => setTax(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="inv-totals">
          <div>
            <span>Subtotal</span>
            <span className="mono">{moneyIn(subtotal, currency)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span className="mono">{moneyIn(taxCents, currency)}</span>
          </div>
          <div className="inv-totals-grand">
            <span>Total</span>
            <span className="mono">{moneyIn(total, currency)}</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="inv-notes">Notes</label>
          <textarea
            id="inv-notes"
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms, bank details, thanks…"
          />
        </div>

        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
