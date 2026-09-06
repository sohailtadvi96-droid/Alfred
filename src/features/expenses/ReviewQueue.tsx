import { useMemo, useState } from 'react';
import { shortDate, signedMoney } from '@/lib/format';
import { errMessage } from '@/lib/errors';
import { useAiCandidates, useAiFallback, useReviewQueue } from './hooks';
import { PinCategoryMenu } from './PinCategoryMenu';
import type { ReviewTxn } from './types';

type Scope = 'all' | 'local_merchant' | 'person_transactions';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All to review' },
  { key: 'local_merchant', label: 'Local Merchant' },
  { key: 'person_transactions', label: 'Person Transactions' },
];

interface Group {
  key: string;
  matchType: 'vpa' | 'counterparty';
  vpa: string | null;
  counterparty: string | null;
  merchant: string | null;
  direction: ReviewTxn['direction'];
  category: string;
  count: number;
  totalCents: number;
}

export function ReviewQueue() {
  const { data: rows, isLoading } = useReviewQueue();
  const { data: aiCandidates } = useAiCandidates();
  const ai = useAiFallback();
  const [scope, setScope] = useState<Scope>('all');
  const [grouped, setGrouped] = useState(true);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const aiCount = aiCandidates?.length ?? 0;

  async function runAi() {
    setAiMsg(null);
    try {
      const r = await ai.mutateAsync();
      if (r.notConfigured) {
        setAiMsg('AI fallback isn’t set up — deploy the categorise-ai function and set ANTHROPIC_API_KEY.');
      } else if (r.candidates === 0) {
        setAiMsg('Nothing left for the AI — every low-confidence row is already pinned.');
      } else {
        setAiMsg(
          `Asked about ${r.candidates}, pinned ${r.pinned}, moved ${r.moved} transaction${r.moved === 1 ? '' : 's'}.`,
        );
      }
    } catch (e) {
      setAiMsg(errMessage(e, 'AI fallback failed.'));
    }
  }

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => (scope === 'all' ? true : r.category === scope)),
    [rows, scope],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of filtered) {
      const key = (r.vpa ?? r.counterparty ?? r.id).trim();
      const g = map.get(key) ?? {
        key,
        matchType: r.vpa ? 'vpa' : 'counterparty',
        vpa: r.vpa,
        counterparty: r.counterparty,
        merchant: r.merchant_raw,
        direction: r.direction,
        category: r.category,
        count: 0,
        totalCents: 0,
      };
      g.count += 1;
      g.totalCents += r.amount_cents;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [filtered]);

  const totalToReview = rows?.length ?? 0;

  return (
    <div className="txn-panel">
      <div className="txn-filters">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            className={`chip${scope === s.key ? ' on' : ''}`}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
        <label className="chip-check">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by payee
        </label>
        <span className="tlabel" style={{ marginLeft: 'auto' }}>
          {totalToReview} low/medium-confidence rows
        </span>
      </div>

      {(aiCount > 0 || aiMsg) && (
        <div className="ai-fallback">
          <span className="tlabel">
            {aiCount > 0
              ? `${aiCount} row${aiCount === 1 ? '' : 's'} the engine couldn’t place`
              : 'AI fallback'}
          </span>
          <button className="btn sec sm" onClick={runAi} disabled={ai.isPending || aiCount === 0}>
            {ai.isPending ? 'Asking Claude…' : `Ask AI to sort ${aiCount || ''}`.trim()}
          </button>
          {aiMsg && <span className="tlabel">{aiMsg}</span>}
        </div>
      )}

      <div className="ledger">
        {isLoading ? (
          <div className="ledger-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="ledger-empty">
            <strong>Nothing to review here.</strong>
            <span>Everything in this slice was classified with high confidence.</span>
          </div>
        ) : grouped ? (
          <table>
            <thead>
              <tr>
                <th>Payee</th>
                <th>VPA / name</th>
                <th style={{ textAlign: 'right' }}>Txns</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Pin category</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key}>
                  <td className="mc">{g.merchant || g.counterparty || '—'}</td>
                  <td className="dt mono">{g.vpa ?? g.counterparty}</td>
                  <td className="am">{g.count}</td>
                  <td className="am">{signedMoney(g.totalCents, g.direction)}</td>
                  <td>
                    <PinCategoryMenu
                      direction={g.direction}
                      category={g.category}
                      vpa={g.vpa}
                      counterparty={g.counterparty}
                      merchant={g.merchant}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>VPA</th>
                <th>Conf.</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Pin category</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="dt">{shortDate(t.occurred_at)}</td>
                  <td className="mc">{t.merchant_raw || t.counterparty || '—'}</td>
                  <td className="dt mono">{t.vpa ?? '—'}</td>
                  <td className="dt">{t.confidence}</td>
                  <td className="am">{signedMoney(t.amount_cents, t.direction)}</td>
                  <td>
                    <PinCategoryMenu
                      direction={t.direction}
                      category={t.category}
                      vpa={t.vpa}
                      counterparty={t.counterparty}
                      merchant={t.merchant_raw}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && (
        <p className="tlabel" style={{ marginTop: 10 }}>
          Pinning writes a rule keyed on the VPA (or the payee name if there’s no VPA) and
          re-categorises every matching transaction. To move a whole person’s history to Family,
          use{' '}
          <a href="/expenses/people" className="lk">
            Family &amp; shops
          </a>{' '}
          instead.
        </p>
      )}
    </div>
  );
}
