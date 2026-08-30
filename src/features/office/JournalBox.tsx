import { useEffect, useState } from 'react';
import { errMessage } from '@/lib/errors';
import { useJournal, useSaveJournal } from './hooks';

export function JournalBox({ date }: { date: string }) {
  const { data: entry, isLoading } = useJournal(date);
  const save = useSaveJournal(date);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setDraft(entry?.body ?? '');
  }, [entry, dirty, date]);

  // leaving edits dirty across a date change would be surprising
  useEffect(() => {
    setDirty(false);
  }, [date]);

  async function commit() {
    setError(null);
    try {
      await save.mutateAsync(draft);
      setDirty(false);
    } catch (err) {
      setError(errMessage(err, 'Could not save the journal entry.'));
    }
  }

  return (
    <section className="office-section office-section-wide">
      <div className="office-section-head">
        <h3>Journal</h3>
        {dirty && (
          <button className="btn primary sm" onClick={commit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <textarea
        className="input office-journal"
        rows={8}
        value={isLoading ? '' : draft}
        placeholder="How the day went — decisions, blockers, follow-ups…"
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (dirty) void commit();
        }}
      />
      {error && <div className="err">{error}</div>}
    </section>
  );
}
