import { FormEvent, useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { errMessage } from '@/lib/errors';
import { parseAmountToCents } from '@/lib/format';
import { PROJECT_STATUSES } from './status';
import { useAddClient, useClients, useUpsertProject } from './hooks';
import type { ProjectStatus, ProjectWithClient, RateType } from './types';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];

/** cents -> plain "1234.50" for editing */
function centsToInput(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toString();
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** absent → add mode; present → edit that project */
  edit?: ProjectWithClient;
}) {
  const save = useUpsertProject();
  const { data: clients } = useClients();
  const addClient = useAddClient();

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('prospective');
  const [rateType, setRateType] = useState<RateType>('hourly');
  const [rate, setRate] = useState('');
  const [fixed, setFixed] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [startedOn, setStartedOn] = useState('');
  const [targetOn, setTargetOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  // inline "add new client"
  const [newClient, setNewClient] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncEmail, setNcEmail] = useState('');
  const [ncAddress, setNcAddress] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? '');
    setClientId(edit?.client_id ?? '');
    setDescription(edit?.description ?? '');
    setStatus(edit?.status ?? 'prospective');
    setRateType(edit?.rate_type ?? 'hourly');
    setRate(centsToInput(edit?.rate_cents ?? null));
    setFixed(centsToInput(edit?.fixed_amount_cents ?? null));
    setCurrency(edit?.currency ?? 'INR');
    setStartedOn(edit?.started_on ?? '');
    setTargetOn(edit?.target_delivery_on ?? '');
    setError(null);
    setNewClient(false);
    setNcName('');
    setNcEmail('');
    setNcAddress('');
  }, [open, edit]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Give the project a name.');

    let resolvedClientId: string | null = clientId || null;
    const rateCents = rateType === 'hourly' && rate.trim() ? parseAmountToCents(rate) : null;
    const fixedCents = rateType === 'fixed' && fixed.trim() ? parseAmountToCents(fixed) : null;
    if (rateType === 'hourly' && rate.trim() && rateCents === null)
      return setError('Hourly rate is not a valid amount.');
    if (rateType === 'fixed' && fixed.trim() && fixedCents === null)
      return setError('Fixed amount is not a valid amount.');

    try {
      if (newClient && ncName.trim()) {
        const c = await addClient.mutateAsync({
          name: ncName,
          email: ncEmail,
          billing_address: ncAddress,
        });
        resolvedClientId = c.id;
      }
      await save.mutateAsync({
        id: edit?.id ?? null,
        name,
        client_id: resolvedClientId,
        description,
        status,
        rate_type: rateType,
        rate_cents: rateCents,
        fixed_amount_cents: fixedCents,
        currency,
        started_on: startedOn || null,
        target_delivery_on: targetOn || null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the project.'));
    }
  }

  const busy = save.isPending || addClient.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit project' : 'New project'}
      description="Client, rate and dates. Assets, deliverables and time are logged on the project page."
      footer={
        <>
          <button className="btn ghost sm" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="btn primary sm"
            type="submit"
            form="project-form"
            disabled={busy || !name.trim()}
          >
            {busy ? 'Saving…' : edit ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input
            id="p-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Portfolio site redesign"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="p-client">Client</label>
          {newClient ? (
            <div className="work-newclient">
              <input
                className="input"
                value={ncName}
                onChange={(e) => setNcName(e.target.value)}
                placeholder="Client name"
                aria-label="New client name"
              />
              <div className="field-row">
                <input
                  className="input"
                  value={ncEmail}
                  onChange={(e) => setNcEmail(e.target.value)}
                  placeholder="Email (optional)"
                  inputMode="email"
                  aria-label="New client email"
                />
              </div>
              <textarea
                className="input"
                rows={2}
                value={ncAddress}
                onChange={(e) => setNcAddress(e.target.value)}
                placeholder="Billing address (optional)"
                aria-label="New client billing address"
              />
              <button
                type="button"
                className="gate-link"
                onClick={() => {
                  setNewClient(false);
                  setNcName('');
                }}
              >
                Pick an existing client instead
              </button>
            </div>
          ) : (
            <>
              <select
                id="p-client"
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
              <button type="button" className="gate-link" onClick={() => setNewClient(true)}>
                + Add a new client
              </button>
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="p-desc">Description</label>
          <textarea
            id="p-desc"
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="p-status">Status</label>
            <select
              id="p-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-currency">Currency</label>
            <select
              id="p-currency"
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

        <div className="seg">
          <button
            type="button"
            className={rateType === 'hourly' ? 'on' : ''}
            onClick={() => setRateType('hourly')}
          >
            Hourly
          </button>
          <button
            type="button"
            className={rateType === 'fixed' ? 'on' : ''}
            onClick={() => setRateType('fixed')}
          >
            Fixed
          </button>
        </div>

        <div className="field-row">
          {rateType === 'hourly' ? (
            <div className="field">
              <label htmlFor="p-rate">Rate per hour ({currency})</label>
              <input
                id="p-rate"
                className="input mono"
                value={rate}
                inputMode="decimal"
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="p-fixed">Fixed amount ({currency})</label>
              <input
                id="p-fixed"
                className="input mono"
                value={fixed}
                inputMode="decimal"
                onChange={(e) => setFixed(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="p-start">Started</label>
            <input
              id="p-start"
              className="input"
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="p-target">Target delivery</label>
            <input
              id="p-target"
              className="input"
              type="date"
              value={targetOn}
              onChange={(e) => setTargetOn(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="err" style={{ marginTop: -6 }}>{error}</div>}
      </form>
    </Dialog>
  );
}
