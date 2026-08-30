import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/Tooltip';
import { localDateKey } from './datetime';
import { addMonths, monthGrid, monthKey, monthTitle, todayKey, WEEKDAYS } from './calendar';
import { useMonthActivity } from './hooks';
import type { AgendaEvent, DaySummary } from './types';

const EMPTY: DaySummary = { events: [], tasks: [], noteCount: 0, journal: null };

/** first `n`, then a "+k more" tail */
function capped(items: string[], n = 3): string {
  if (items.length <= n) return items.join(' · ');
  return `${items.slice(0, n).join(' · ')} · +${items.length - n} more`;
}

function CellTip({ s }: { s: DaySummary }) {
  return (
    <div className="office-tip">
      {s.events.length > 0 && (
        <div>
          <b>Meetings</b>
          {capped(s.events)}
        </div>
      )}
      {s.tasks.length > 0 && (
        <div>
          <b>Tasks</b>
          {capped(s.tasks.map((t) => (t.done ? `✓ ${t.title}` : t.title)))}
        </div>
      )}
      {s.noteCount > 0 && (
        <div>
          <b>Notes</b>
          {s.noteCount} note{s.noteCount === 1 ? '' : 's'}
        </div>
      )}
      {s.journal && (
        <div>
          <b>Journal</b>
          {s.journal}
          {s.journal.length >= 90 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

export function OfficeCalendar({ googleEvents }: { googleEvents: AgendaEvent[] }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthKey);
  const grid = useMemo(() => monthGrid(month), [month]);
  const { data: activity } = useMonthActivity(grid.start, grid.end);

  const googleByDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of googleEvents) {
      const k = localDateKey(e.startsAt);
      (m.get(k) ?? m.set(k, []).get(k)!).push(e.title);
    }
    return m;
  }, [googleEvents]);

  const today = todayKey();

  return (
    <section className="office-cal office-section">
      <div className="office-cal-head">
        <button
          className="office-cal-nav"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="office-cal-title">{monthTitle(month)}</div>
        <button
          className="office-cal-nav"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
        {month !== today.slice(0, 7) && (
          <button className="office-cal-today" onClick={() => setMonth(monthKey())}>
            This month
          </button>
        )}
      </div>

      <div className="office-cal-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="office-cal-wd" role="columnheader">
            {w}
          </div>
        ))}
        {grid.cells.map((cell) => {
          const base = activity?.[cell.key] ?? EMPTY;
          const gTitles = googleByDay.get(cell.key) ?? [];
          const s: DaySummary = gTitles.length
            ? { ...base, events: [...base.events, ...gTitles] }
            : base;

          const dots = [
            s.events.length > 0 && 'evt',
            s.tasks.length > 0 && 'task',
            s.noteCount > 0 && 'note',
            !!s.journal && 'jrnl',
          ].filter(Boolean) as string[];
          const hasAny = dots.length > 0;
          const day = Number(cell.key.slice(8));

          const btn = (
            <button
              key={cell.key}
              role="gridcell"
              className={[
                'office-cal-cell',
                cell.inMonth ? '' : 'out',
                cell.key === today ? 'today' : '',
              ].join(' ')}
              onClick={() => navigate(`/work/day/${cell.key}`)}
              aria-label={cell.key}
            >
              <span className="office-cal-num">{day}</span>
              {hasAny && (
                <span className="office-cal-dots">
                  {dots.map((d) => (
                    <span key={d} className={`office-cal-dot ${d}`} />
                  ))}
                </span>
              )}
            </button>
          );

          return hasAny ? (
            <Tooltip key={cell.key} content={<CellTip s={s} />} side="top">
              {btn}
            </Tooltip>
          ) : (
            btn
          );
        })}
      </div>

      <div className="office-cal-legend">
        <span>
          <i className="office-cal-dot evt" /> Meeting
        </span>
        <span>
          <i className="office-cal-dot task" /> Task due
        </span>
        <span>
          <i className="office-cal-dot note" /> Note
        </span>
        <span>
          <i className="office-cal-dot jrnl" /> Journal
        </span>
      </div>
    </section>
  );
}
