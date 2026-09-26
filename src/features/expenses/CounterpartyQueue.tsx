import { useState } from 'react';
import { money, shortDate } from '@/lib/format';
import { errMessage } from '@/lib/errors';
import {
  useQueueStats,
  useResolutionQueue,
  useResolveAmbiguousSameEntity,
  useResolveAmbiguousSeparated,
  useResolveCounterparty,
} from './hooks';
import { notSaved, outcomeText } from './recategoriseSummary';
import { ResolveEntityDialog } from './ResolveEntityDialog';
import { SeparateEntitiesDialog } from './SeparateEntitiesDialog';
import type { QueueRow, ResolveEntityInput } from './api';

type ActiveResolve = {
  keyValue: string;
  title: string;
  sampleName: string;
  txnCount: number;
  totalCents: number;
  initialType: ResolveEntityInput['entityType'];
};

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

export function CounterpartyQueue() {
  const { data: rows, isLoading } = useResolutionQueue();
  const { data: stats } = useQueueStats();
  const resolve = useResolveCounterparty();
  const sameEntity = useResolveAmbiguousSameEntity();
  const separated = useResolveAmbiguousSeparated();

  const [activeResolve, setActiveResolve] = useState<ActiveResolve | null>(null);
  const [separatingKey, setSeparatingKey] = useState<QueueRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (isLoading) return <div className="ledger-empty">Loading…</div>;

  const ambiguous = (rows ?? []).filter((r) => r.queueSection === 'ambiguous');
  const unresolved = (rows ?? []).filter((r) => r.queueSection === 'unresolved');

  async function runResolve(input: ResolveEntityInput) {
    if (!activeResolve) return;
    try {
      const res = await resolve.mutateAsync({ keyValue: activeResolve.keyValue, input });
      setMsg(`Resolved “${activeResolve.title}” — ${outcomeText(res)}.${notSaved(res.unwritten)}`);
      setActiveResolve(null);
    } catch (e) {
      setMsg(errMessage(e, 'Could not resolve this counterparty.'));
    }
  }

  async function runSameEntity(row: QueueRow) {
    try {
      await sameEntity.mutateAsync(row.keyValue);
      setMsg(`Kept “${row.entityDisplayName}” as one entity.`);
    } catch (e) {
      setMsg(errMessage(e, 'Could not update this key.'));
    }
  }

  async function runSeparate(perName: Parameters<typeof separated.mutateAsync>[0]['perName']) {
    if (!separatingKey) return;
    try {
      const res = await separated.mutateAsync({ keyValue: separatingKey.keyValue, perName });
      setMsg(`Separated into ${perName.length} entities — ${outcomeText(res)}.${notSaved(res.unwritten)}`);
      setSeparatingKey(null);
    } catch (e) {
      setMsg(errMessage(e, 'Could not separate these entities.'));
    }
  }

  return (
    <div className="txn-panel">
      {stats && (
        <p className="tlabel" style={{ marginBottom: 12 }}>
          {stats.resolvedCount} of {stats.totalRepeatingKeys} resolved
          {stats.ambiguousCount > 0 && ` · ${stats.ambiguousCount} ambiguous`}
          {' · '}
          {stats.singletonKeys} one-off key{stats.singletonKeys === 1 ? '' : 's'} not queued
        </p>
      )}
      {msg && (
        <p className="tlabel" style={{ marginBottom: 12 }}>
          {msg}
        </p>
      )}

      {ambiguous.length > 0 && (
        <>
          <h4 className="menu-label" style={{ marginBottom: 8 }}>
            Ambiguous — pinned but still uncertain
          </h4>
          <div style={{ marginBottom: 20 }}>
            {ambiguous.map((row) => (
              <div key={row.keyValue} className="queue-card ambiguous">
                <div className="queue-card-row">
                  <span className="queue-card-title">
                    {row.keyValue} — currently pinned as “{row.entityDisplayName}”
                  </span>
                  <span className="queue-card-sub">
                    {row.txnCount} txn{row.txnCount === 1 ? '' : 's'} · {money(row.totalCents, true)}
                  </span>
                </div>
                {row.nameBreakdown?.map((n) => (
                  <div className="queue-name-row" key={n.name}>
                    <span>{title(n.name)}</span>
                    <span>
                      {n.txn_count} txn{n.txn_count === 1 ? '' : 's'} · {money(n.total_cents, true)}
                    </span>
                  </div>
                ))}
                <div className="queue-card-actions">
                  <button
                    type="button"
                    className="btn sec sm"
                    onClick={() => runSameEntity(row)}
                    disabled={sameEntity.isPending}
                  >
                    Same entity, name varies
                  </button>
                  <button type="button" className="btn sec sm" onClick={() => setSeparatingKey(row)}>
                    Different entities
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h4 className="menu-label" style={{ marginBottom: 8 }}>
        Unresolved
      </h4>
      {unresolved.length === 0 ? (
        <div className="ledger-empty">
          <strong>Nothing to resolve.</strong>
          <span>Every repeating counterparty is either pinned or in the ambiguous list above.</span>
        </div>
      ) : (
        <div>
          {unresolved.map((row) => {
            const sample = row.sampleNames[0] ?? row.keyValue;
            return (
              <div key={row.keyValue} className="queue-card">
                <div className="queue-card-row">
                  <span className="queue-card-title">
                    {row.sampleNames.map(title).join(' / ')}
                    {row.isAmbiguous && (
                      <span className="tlabel" style={{ marginLeft: 6, fontWeight: 400 }}>
                        (multiple names — resolving will pin all of them together)
                      </span>
                    )}
                  </span>
                  <span className="queue-card-sub">
                    {row.txnCount} txn{row.txnCount === 1 ? '' : 's'} · {money(row.totalCents, true)}
                  </span>
                </div>
                <div className="queue-card-row">
                  <span className="queue-card-sub">
                    {shortDate(row.firstSeen)} – {shortDate(row.lastSeen)}
                  </span>
                  <span className="queue-card-sub">{row.currentCategory ?? '—'}</span>
                </div>
                <div className="queue-card-actions">
                  {(['person', 'merchant', 'self'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="btn sec sm"
                      onClick={() =>
                        setActiveResolve({
                          keyValue: row.keyValue,
                          title: title(sample),
                          sampleName: title(sample),
                          txnCount: row.txnCount,
                          totalCents: row.totalCents,
                          initialType: t,
                        })
                      }
                    >
                      {t === 'person' ? 'Person' : t === 'merchant' ? 'Shop' : 'Me'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeResolve && (
        <ResolveEntityDialog
          open
          onOpenChange={(v) => !v && setActiveResolve(null)}
          title={`Resolve “${activeResolve.title}”`}
          sampleName={activeResolve.sampleName}
          txnCount={activeResolve.txnCount}
          totalCents={activeResolve.totalCents}
          initialType={activeResolve.initialType}
          pending={resolve.isPending}
          onResolve={runResolve}
        />
      )}

      {separatingKey && (
        <SeparateEntitiesDialog
          open
          onOpenChange={(v) => !v && setSeparatingKey(null)}
          names={separatingKey.nameBreakdown ?? []}
          pending={separated.isPending}
          onConfirm={runSeparate}
        />
      )}
    </div>
  );
}
