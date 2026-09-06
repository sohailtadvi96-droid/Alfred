import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import { useCounterparties, useFerrariShops, usePeople } from './hooks';
import { RetagConfirmDialog, type RetagTarget } from './RetagConfirmDialog';

export function PeopleManager() {
  const { data: people, isLoading: pl } = usePeople();
  const { data: shops, isLoading: sl } = useFerrariShops();
  const { data: counterparties } = useCounterparties();
  const [target, setTarget] = useState<RetagTarget | null>(null);
  const [q, setQ] = useState('');

  const cpByVpa = useMemo(
    () => new Map((counterparties ?? []).map((c) => [c.vpa, c])),
    [counterparties],
  );

  const family = (people ?? []).filter((p) => p.is_family);
  const familyVpas = new Set(family.map((p) => p.vpa));
  const shopVpas = new Set((shops ?? []).map((s) => s.vpa));

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (counterparties ?? [])
      .filter(
        (c) =>
          !familyVpas.has(c.vpa) &&
          !shopVpas.has(c.vpa) &&
          (c.name.toLowerCase().includes(term) || c.vpa.toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [q, counterparties, familyVpas, shopVpas]);

  return (
    <div className="people-mgr">
      <section className="people-sec">
        <div className="people-sec-h">
          <h3>Family</h3>
          <span className="tlabel">
            {family.length} {family.length === 1 ? 'person' : 'people'} · money out counts as a
            transfer, money in as Income
          </span>
        </div>
        {pl ? (
          <p className="tlabel">Loading…</p>
        ) : family.length === 0 ? (
          <p className="tlabel">No one tagged yet. Add relatives below or from a transaction row.</p>
        ) : (
          <table className="people-tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>VPA</th>
                <th style={{ textAlign: 'right' }}>Txns</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {family.map((p) => {
                const cp = cpByVpa.get(p.vpa);
                return (
                  <tr key={p.id}>
                    <td>{p.display_name || <span className="tlabel">—</span>}</td>
                    <td className="mono">{p.vpa}</td>
                    <td style={{ textAlign: 'right' }}>{cp?.txnCount ?? 0}</td>
                    <td style={{ textAlign: 'right' }} className={cp && cp.netCents < 0 ? 'am' : 'am in'}>
                      {cp ? money(cp.netCents, true) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setTarget({ vpa: p.vpa, name: p.display_name, kind: 'family', next: false })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="people-sec">
        <div className="people-sec-h">
          <h3>Ferrari shops</h3>
          <span className="tlabel">
            {(shops ?? []).length} pinned · small payments on the ₹20 grid go to My Ferrari
          </span>
        </div>
        {sl ? (
          <p className="tlabel">Loading…</p>
        ) : (shops ?? []).length === 0 ? (
          <p className="tlabel">No shops pinned.</p>
        ) : (
          <table className="people-tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>VPA</th>
                <th style={{ textAlign: 'right' }}>Txns</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(shops ?? []).map((s) => {
                const cp = cpByVpa.get(s.vpa);
                return (
                  <tr key={s.id}>
                    <td>{s.display_name || <span className="tlabel">—</span>}</td>
                    <td className="mono">{s.vpa}</td>
                    <td style={{ textAlign: 'right' }}>{cp?.txnCount ?? 0}</td>
                    <td className="tlabel">{s.added_by}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setTarget({ vpa: s.vpa, name: s.display_name, kind: 'ferrari', next: false })
                        }
                      >
                        Unpin
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="people-sec">
        <div className="people-sec-h">
          <h3>Tag someone</h3>
          <span className="tlabel">Search every counterparty seen in your transactions</span>
        </div>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or VPA…"
        />
        {q.trim() && (
          <table className="people-tbl" style={{ marginTop: 8 }}>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td className="tlabel">No untagged matches.</td>
                </tr>
              ) : (
                matches.map((c) => (
                  <tr key={c.vpa}>
                    <td>{c.name}</td>
                    <td className="mono">{c.vpa}</td>
                    <td style={{ textAlign: 'right' }}>{c.txnCount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setTarget({ vpa: c.vpa, name: c.name, kind: 'family', next: true })
                        }
                      >
                        → Family
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setTarget({ vpa: c.vpa, name: c.name, kind: 'ferrari', next: true })
                        }
                      >
                        → Shop
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>

      <RetagConfirmDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
