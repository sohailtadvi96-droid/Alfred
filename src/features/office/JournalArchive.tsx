import { Link } from 'react-router-dom';
import { dayTitle } from './calendar';
import { useRecentJournal } from './hooks';

export function JournalArchive() {
  const { data: entries, isLoading } = useRecentJournal(12);

  // hide the panel entirely until there's something to show
  if (isLoading || !entries || entries.length === 0) return null;

  return (
    <section className="office-section office-section-wide">
      <div className="office-section-head">
        <h3>Journal</h3>
        <span className="office-count">{entries.length} recent</span>
      </div>
      <div className="office-list">
        {entries.map((e) => (
          <Link key={e.id} to={`/work/day/${e.entry_date}`} className="office-jr-row">
            <span className="office-jr-date">{dayTitle(e.entry_date)}</span>
            <span className="office-jr-snip">{e.body.replace(/\s+/g, ' ').trim()}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
