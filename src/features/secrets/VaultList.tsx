import { useMemo, useState } from 'react';
import { fullDate } from '@/lib/format';
import type { RevealedSecret, Secret } from './types';

export interface VaultRowState {
  revealed?: RevealedSecret;
  busy?: boolean;
}

export function VaultList({
  secrets,
  isLoading,
  error,
  rowState,
  onReveal,
  onHide,
  onCopy,
  onEdit,
  onDelete,
}: {
  secrets: Secret[] | undefined;
  isLoading: boolean;
  error: unknown;
  rowState: Record<string, VaultRowState>;
  onReveal: (s: Secret) => void;
  onHide: (id: string) => void;
  onCopy: (s: Secret) => void;
  onEdit: (s: Secret) => void;
  onDelete: (s: Secret) => void;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return secrets ?? [];
    return (secrets ?? []).filter(
      (s) =>
        s.label.toLowerCase().includes(needle) ||
        (s.username ?? '').toLowerCase().includes(needle) ||
        s.tags.some((t) => t.includes(needle)),
    );
  }, [secrets, q]);

  return (
    <div className="txn-panel">
      <div className="txn-filters">
        <input
          className="input sm-select"
          style={{ minWidth: 220 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, tag"
          aria-label="Search the vault"
        />
      </div>

      <div className="ledger">
        {error ? (
          <div className="ledger-empty">Couldn’t load the vault. Try again.</div>
        ) : isLoading ? (
          <div className="ledger-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="ledger-empty">
            <strong>{q ? 'Nothing matches that search.' : 'The vault is empty.'}</strong>
            {!q && <span>Add your first entry — secrets are encrypted before they’re stored.</span>}
          </div>
        ) : (
          <table className="vault-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / username</th>
                <th>Secret</th>
                <th>Last revealed</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const st = rowState[s.id] ?? {};
                return (
                  <tr key={s.id}>
                    <td className="mc">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer noopener">
                          {s.label}
                        </a>
                      ) : (
                        s.label
                      )}
                      {s.tags.length > 0 && <span className="mc-note">{s.tags.join(' · ')}</span>}
                    </td>
                    <td className="dt">{s.username || '—'}</td>
                    <td className="secret-cell">
                      {st.revealed ? (
                        <code className="mono">{st.revealed.secret}</code>
                      ) : (
                        <span className="dots" aria-label="hidden">
                          ••••••••••
                        </span>
                      )}
                    </td>
                    <td className="dt last-revealed">
                      {s.last_revealed_at ? fullDate(s.last_revealed_at) : '—'}
                    </td>
                    <td className="vault-actions">
                      <div className="vault-actions-inner">
                        <button
                          className="btn ghost"
                          disabled={st.busy}
                          onClick={() => (st.revealed ? onHide(s.id) : onReveal(s))}
                          data-tip={st.revealed ? 'Hide' : 'Reveal (gated)'}
                        >
                          {st.busy ? '…' : st.revealed ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          className="btn ghost"
                          disabled={st.busy}
                          onClick={() => onCopy(s)}
                          data-tip="Copy — clipboard clears after 30s"
                        >
                          Copy
                        </button>
                        <button
                          className="row-x"
                          onClick={() => onEdit(s)}
                          data-tip="Edit"
                          aria-label={`Edit ${s.label}`}
                        >
                          ✎
                        </button>
                        <button
                          className="row-x"
                          onClick={() => onDelete(s)}
                          data-tip="Delete"
                          aria-label={`Delete ${s.label}`}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
