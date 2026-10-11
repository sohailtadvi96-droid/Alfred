import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, LoadFailed } from '@/components/LoadState';
import { errMessage } from '@/lib/errors';
import { money, monthKey } from '@/lib/format';
import { useCompleteReminder, useCreateReminder, useRemindersToday, useUserToday } from '@/features/reminders/hooks';
import { oneTimeDraft } from '@/features/reminders/QuickAdd';
import { formatTime } from '@/features/reminders/schedule';
import { daysBetween, isOpen, nextUp, type NextUpItem } from '@/features/reminders/today';
import { useTasks } from '@/features/office/hooks';
import { tasksDueToday } from '@/features/office/agenda';
import { todayKey } from '@/features/office/calendar';
import { useMonthSummary } from '@/features/expenses/hooks';
import { useProjects } from '@/features/work/hooks';
import { useBoards } from '@/features/design/hooks';
import { useGoals, useGoalsWithPace } from '@/features/goals/hooks';
import { goalsToSnapshot } from '@/features/home/aggregator';

/** Home on a phone, as docs/mobile/alfred-mobile-prototype.html draws it:
 *  date eyebrow + greeting + the A mark (→ Settings), the input, Next up (a
 *  due line, then a card of up to four rows), At a glance. Agreed additions:
 *  the input creates a reminder (not a command field), and a full-width
 *  "Tasks" tile under the four. Rendered inside .phone-only by HomePage. */
export function PhoneHome() {
  return (
    <div className="ph-home">
      <HomeHead />
      <HomeInput />
      <NextUp />
      <section className="ph-stack">
        <span className="tlabel">At a glance</span>
        <div className="ph-tiles">
          <SpentTile />
          <GoalsTile />
          <WorkTile />
          <DesignTile />
          <TasksTile />
        </div>
      </section>
    </div>
  );
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function HomeHead() {
  // the date is the server's (user_today), never the device's
  const { data: today } = useUserToday();
  const d = today ? new Date(`${today}T00:00:00`) : null;
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="ph-between">
      <div>
        <div className="tlabel">{d ? `${DOW[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]}` : ' '}</div>
        <div className="ph-greet">{greeting}</div>
      </div>
      <Link to="/settings" className="ph-avatar" aria-label="Settings">
        <span className="mark">A</span>
      </Link>
    </div>
  );
}

/** The prototype's command field, but it does one thing: a one-time reminder
 *  due today — the same create path as Reminders' quick-add. */
function HomeInput() {
  const [title, setTitle] = useState('');
  const { data: today } = useUserToday();
  const create = useCreateReminder();

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !today) return;
    create.mutate(oneTimeDraft(t, today), { onSuccess: () => setTitle('') });
  }

  return (
    <div>
      <form className="ph-command" onSubmit={submit}>
        <span className="ph-command-ic">
          <Icon name="search" size={16} />
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Remind me to…"
          aria-label="Remind me to… (due today)"
          autoComplete="off"
          enterKeyHint="done"
          disabled={!today}
        />
        <button
          type="submit"
          className="ph-command-go"
          aria-label="Add reminder"
          // never dimmed, as in the prototype — an empty submit just does nothing
          disabled={!today || create.isPending}
        >
          <Icon name="chevron" size={14} />
        </button>
      </form>
      {create.error && <p className="ph-command-err">{errMessage(create.error)}</p>}
    </div>
  );
}

function dueTag(item: NextUpItem, today: string | undefined) {
  if (item.state === 'overdue') {
    const days = today ? daysBetween(item.occurrenceDate, today) : 0;
    return <span className="ph-due late">{days > 0 ? `${days}d late` : 'Overdue'}</span>;
  }
  if (item.state === 'due_now') return <span className="ph-due now">Due now</span>;
  return <span className="ph-due">{item.time ? formatTime(item.time) : 'Later'}</span>;
}

function NextUp() {
  const { data: rows, isLoading, error, refetch } = useRemindersToday();
  const { data: today } = useUserToday();
  const complete = useCompleteReminder();

  let body;
  if (isLoading) body = <Loading rows={3} label="Loading reminders" />;
  else if (error) body = <LoadFailed what="reminders" onRetry={() => void refetch()} />;
  else {
    const open = (rows ?? []).filter(isOpen);
    const dueNow = open.filter((r) => r.due_state === 'due_now').length;
    const late = open.filter((r) => r.due_state === 'overdue').length;
    // today only, as in the prototype — no fallback to tomorrow
    const items = nextUp(rows, undefined, 4);
    body = items.length ? (
      <>
        <div className="ph-dueline">
          {dueNow ? <b>{dueNow} due now</b> : 'Nothing due right now'}
          {late > 0 && (
            <>
              {' · '}
              <span className="late">{late} late</span>
            </>
          )}
        </div>
        <div className="ph-card ph-nextcard">
          {items.map((item) => (
            <div key={item.key} className="ph-nextup-row">
              {item.tickable ? (
                <button
                  type="button"
                  className="ph-tick"
                  onClick={() => complete.mutate({ id: item.id, occurrenceDate: item.occurrenceDate })}
                  aria-label={`Tick ${item.title}`}
                >
                  <span className={clsx('ph-box', item.kind === 'one_time' && 'round')} />
                </button>
              ) : (
                <span className="ph-tick" title="Ticks itself">
                  <span className="ph-box" />
                </span>
              )}
              <span className="ph-grow">{item.title}</span>
              {dueTag(item, today)}
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="ph-empty">
        <Icon name="check" size={16} className="ph-ok" />
        Nothing else due today.
      </div>
    );
  }

  return (
    <section className="ph-stack">
      <div className="ph-sect-h">
        <span className="tlabel">Next up</span>
        <Link to="/reminders" className="ph-link">
          See all
        </Link>
      </div>
      {body}
    </section>
  );
}

function Tile({
  module,
  icon,
  title,
  to,
  wide,
  loading,
  failed,
  onRetry,
  figure,
  sub,
}: {
  module: string;
  icon: IconName;
  title: string;
  to: string;
  wide?: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  figure: string;
  sub: string;
}) {
  const head = (
    <span className="ph-tile-head">
      <span className="ph-chip">
        <Icon name={icon} size={14} />
      </span>
      <span className="ph-tile-title">{title}</span>
    </span>
  );
  const cls = clsx('ph-tile', wide && 'wide');
  if (failed) {
    return (
      <div className={cls} data-module={module}>
        {head}
        <LoadFailed what={title.toLowerCase()} onRetry={onRetry} />
      </div>
    );
  }
  return (
    <Link to={to} className={cls} data-module={module}>
      {head}
      {loading ? (
        <Loading rows={1} label={`Loading ${title}`} />
      ) : (
        <>
          <span className="ph-tile-fig">{figure}</span>
          <span className="ph-tile-sub">{sub}</span>
        </>
      )}
    </Link>
  );
}

function SpentTile() {
  const month = monthKey();
  const q = useMonthSummary(month);
  return (
    <Tile
      module="expenses"
      icon="expenses"
      title="Spent"
      to="/expenses"
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={money(q.data?.spendCents ?? 0, true)}
      sub={MONTH[Number(month.slice(5, 7)) - 1]}
    />
  );
}

function GoalsTile() {
  const goals = useGoals();
  const { goalsWithPace, isLoading } = useGoalsWithPace();
  const onTrack = (goalsToSnapshot(goalsWithPace).stats[0]?.value ?? '—').replace(' / ', '/');
  return (
    <Tile
      module="goals"
      icon="goals"
      title="Goals"
      to="/goals"
      loading={goals.isLoading || isLoading}
      failed={!!goals.error}
      onRetry={() => void goals.refetch()}
      figure={onTrack}
      sub="On track"
    />
  );
}

function WorkTile() {
  const q = useProjects();
  return (
    <Tile
      module="work"
      icon="work"
      title="Work"
      to="/work"
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={String((q.data ?? []).filter((p) => p.status === 'active').length)}
      sub="Active projects"
    />
  );
}

function DesignTile() {
  const q = useBoards();
  // homeCount sums to the library; itemCount double-counts cross-listings
  const refs = (q.data ?? []).reduce((s, b) => s + b.homeCount, 0);
  return (
    <Tile
      module="design"
      icon="design"
      title="Design"
      to="/design"
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={String(refs)}
      sub="References"
    />
  );
}

/** Agreed addition: today's open Office tasks (due today or overdue), full
 *  width under the four, linking to the Office day. */
function TasksTile() {
  const q = useTasks();
  const open = tasksDueToday(q.data).length;
  return (
    <Tile
      module="work"
      icon="work"
      title="Tasks"
      to={`/work/day/${todayKey()}`}
      wide
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={String(open)}
      sub={open === 1 ? 'Open task today' : 'Open tasks today'}
    />
  );
}
