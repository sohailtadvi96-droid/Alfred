import { useAccessLog } from './hooks';
import type { Secret } from './types';

const ACTION_LABEL: Record<string, string> = {
  reveal: 'Revealed',
  copy: 'Copied',
  create: 'Added',
  update: 'Edited',
  delete: 'Deleted',
};

function ago(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AccessLogPanel({ secrets }: { secrets: Secret[] | undefined }) {
  const { data, isLoading } = useAccessLog();
  const nameOf = (id: string | null) =>
    (id && secrets?.find((s) => s.id === id)?.label) || 'a deleted entry';

  return (
    <aside className="access-log">
      <h3>Access log</h3>
      {isLoading ? (
        <p className="al-empty">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="al-empty">No activity yet.</p>
      ) : (
        <ul>
          {data.map((row) => (
            <li key={row.id}>
              <span className={`al-act al-${row.action}`}>{ACTION_LABEL[row.action] ?? row.action}</span>
              <span className="al-name">{nameOf(row.secret_id)}</span>
              <span className="al-when">{ago(row.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
