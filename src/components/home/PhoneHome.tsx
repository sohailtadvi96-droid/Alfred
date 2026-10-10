import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, type IconName } from '@/components/Icon';
import { Loading, LoadFailed } from '@/components/LoadState';
import { errMessage } from '@/lib/errors';
import { money, monthKey, monthLabel } from '@/lib/format';
import {
  useCompleteReminder,
  useCreateReminder,
  useRemindersToday,
  useUpcoming,
  useUserToday,
} from '@/features/reminders/hooks';
import { oneTimeDraft } from '@/features/reminders/QuickAdd';
import { whenLabel } from '@/features/reminders/NextUpList';
import { formatTime } from '@/features/reminders/schedule';
import { isOpen, nextUp } from '@/features/reminders/today';
import { useDayEvents, useSetTaskStatus, useTasks } from '@/features/office/hooks';
import { useGoogleEvents } from '@/features/office/useGoogleCalendar';
import { mergeAgenda, tasksDueToday } from '@/features/office/agenda';
import { dayEndISO, dayStartISO, todayKey } from '@/features/office/calendar';
import { dueLabel, localDateKey, timeLabel } from '@/features/office/datetime';
import { useMonthSummary } from '@/features/expenses/hooks';
import { useProjects } from '@/features/work/hooks';
import { useBoards } from '@/features/design/hooks';
import { useGoals, useGoalsWithPace } from '@/features/goals/hooks';
import { goalsToSnapshot } from '@/features/home/aggregator';

/** Home on a phone (docs/mobile/alfred-mobile-prototype.html): greeting →
 *  "Remind me to…" → today's timeline with NOW → Next up → Today's tasks →
 *  four glance tiles. No drag, no resize, no rail. */
export function PhoneHome() {
  return (
    <div className="ph-content ph-home">
      <HomeHead />
      <HomeQuickAdd />
      <NowLine />
      <NextUpSection />
      <TasksTile />
      <section className="ph-stack">
        <span className="tlabel">At a glance</span>
        <div className="ph-tiles">
          <ExpensesTile />
          <WorkTile />
          <DesignTile />
          <GoalsTile />
        </div>
      </section>
    </div>
  );
}

/** Re-renders once a minute, so "NOW" and the greeting move with the clock. */
function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const eyebrowFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function HomeHead() {
  const now = useNowMinute();
  // the date is the server's (user_today), never the device's
  const { data: userToday } = useUserToday();
  const h = now.getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const eyebrow = userToday
    ? eyebrowFmt.format(new Date(`${userToday}T00:00:00`)).replace(',', ' ·')
    : ' ';

  return (
    <div className="ph-home-head">
      <div>
        <div className="tlabel">{eyebrow}</div>
        <div className="ph-greet">{greeting}</div>
      </div>
      <Link to="/settings" className="ph-iconbtn" aria-label="Settings">
        <Icon name="settings" size={20} />
      </Link>
    </div>
  );
}

/** The same create path as Reminders' quick-add: a one-time reminder due
 *  today (oneTimeDraft + useCreateReminder). */
function HomeQuickAdd() {
  const [title, setTitle] = useState('');
  const { data: today } = useUserToday();
  const create = useCreateReminder();

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !today) return;
    create.mutate(oneTimeDraft(trimmed, today), { onSuccess: () => setTitle('') });
  }

  return (
    <div className="ph-stack ph-stack-tight">
      <form className="ph-command" onSubmit={submit}>
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
          disabled={!title.trim() || !today || create.isPending}
        >
          <Icon name="plus" size={16} />
        </button>
      </form>
      {create.error ? (
        <p className="ph-hint ph-hint-bad">{errMessage(create.error)}</p>
      ) : (
        <p className="ph-hint">
          Due today · <Link to="/reminders">repeat or schedule it in Reminders</Link>
        </p>
      )}
    </div>
  );
}

interface TimedItem {
  key: string;
  minute: number;
  time: string;
  title: string;
  sub: string;
  href: string;
  done: boolean;
}

/** Today's timed items — reminders with a time and Office/Google events — in
 *  time order, with NOW between what has passed and what is still to come. */
function NowLine() {
  const now = useNowMinute();
  const day = todayKey();
  const reminders = useRemindersToday();
  const { data: userToday } = useUserToday();
  const events = useDayEvents(day);
  const { events: google } = useGoogleEvents(dayStartISO(day), dayEndISO(day));

  const items = useMemo<TimedItem[]>(() => {
    const out: TimedItem[] = [];
    for (const r of reminders.data ?? []) {
      const t = r.due_time ?? r.time_of_day;
      if (!t || r.occurrence_date !== userToday || r.completion_status === 'skipped') continue;
      const [hh, mm] = t.split(':').map(Number);
      out.push({
        key: `r:${r.id}`,
        minute: hh * 60 + mm,
        time: formatTime(t),
        title: r.title,
        // the time is in its own column — never repeated here
        sub: r.is_done ? 'Reminder · done' : 'Reminder',
        href: '/reminders',
        done: r.is_done,
      });
    }
    const agenda = mergeAgenda(events.data, google.filter((e) => localDateKey(e.startsAt) === day));
    for (const e of agenda) {
      if (e.allDay) continue;
      const at = new Date(e.startsAt);
      out.push({
        key: `e:${e.id}`,
        minute: at.getHours() * 60 + at.getMinutes(),
        time: timeLabel(e.startsAt),
        title: e.title,
        sub: e.location || (e.source === 'google' ? 'Calendar' : 'Event'),
        href: `/work/day/${day}`,
        done: false,
      });
    }
    return out.sort((a, b) => a.minute - b.minute || a.title.localeCompare(b.title));
  }, [reminders.data, userToday, events.data, google, day]);

  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const firstUpcoming = items.findIndex((i) => i.minute > nowMinute);
  const nowAt = firstUpcoming === -1 ? items.length : firstUpcoming;

  let body;
  if (reminders.isLoading || events.isLoading) {
    body = <Loading rows={3} label="Loading today" />;
  } else if (reminders.error || events.error) {
    body = (
      <LoadFailed
        what="today’s timeline"
        onRetry={() => {
          void reminders.refetch();
          void events.refetch();
        }}
      />
    );
  } else if (items.length === 0) {
    body = <div className="ph-empty">Nothing timed today.</div>;
  } else {
    const rows = items.map((it, i) => (
      <li key={it.key} className={clsx('ph-tl-row', i < nowAt && 'past', it.done && 'done')}>
        <span className="ph-tl-time">{it.time}</span>
        <Link to={it.href} className="ph-row-main">
          <span className="ph-row-t">{it.title}</span>
          <span className="ph-row-s">{it.sub}</span>
        </Link>
      </li>
    ));
    rows.splice(
      nowAt,
      0,
      <li key="now" className="ph-now" aria-label="Now">
        <b>NOW</b>
        <i />
      </li>,
    );
    body = <ul className="ph-timeline">{rows}</ul>;
  }

  return (
    <section className="ph-stack">
      <span className="tlabel">Today</span>
      {body}
    </section>
  );
}

function NextUpSection() {
  const { data: today, isLoading, error, refetch } = useRemindersToday();
  const { data: upcoming } = useUpcoming();
  const { data: userToday } = useUserToday();
  const complete = useCompleteReminder();

  let body;
  if (isLoading) {
    body = <Loading rows={3} label="Loading reminders" />;
  } else if (error) {
    body = <LoadFailed what="reminders" onRetry={() => void refetch()} />;
  } else {
    const open = (today ?? []).filter(isOpen);
    const dueNow = open.filter((r) => r.due_state === 'due_now').length;
    const late = open.filter((r) => r.due_state === 'overdue').length;
    const items = nextUp(today, upcoming, 4);
    body =
      items.length === 0 ? (
        <div className="ph-empty">
          <Icon name="check" size={16} className="ph-ok" />
          Nothing else due today.
        </div>
      ) : (
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
          <ul className="ph-card ph-list">
            {items.map((item) => (
              <li key={item.key} className="ph-list-row">
                {item.tickable ? (
                  <button
                    type="button"
                    className="ph-tick"
                    onClick={() => complete.mutate({ id: item.id, occurrenceDate: item.occurrenceDate })}
                    aria-label={`Mark ${item.title} done`}
                  >
                    <span className={clsx('ph-box', item.kind === 'one_time' && 'round')} />
                  </button>
                ) : (
                  <span className="ph-tick" aria-hidden="true">
                    <span className="ph-dot" />
                  </span>
                )}
                <span className="ph-row-main">
                  <span className="ph-row-t">{item.title}</span>
                </span>
                <span className={clsx('ph-due', item.state === 'overdue' && 'late', item.state === 'due_now' && 'now')}>
                  {whenLabel(item, userToday)}
                </span>
              </li>
            ))}
          </ul>
        </>
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

/** Today's open Office tasks (due today or overdue), tickable, linking to
 *  the Office day. */
function TasksTile() {
  const { data: tasks, isLoading, error, refetch } = useTasks();
  const setStatus = useSetTaskStatus();
  const day = todayKey();
  const open = tasksDueToday(tasks);

  let body;
  if (isLoading) body = <Loading rows={2} label="Loading tasks" />;
  else if (error) body = <LoadFailed what="tasks" onRetry={() => void refetch()} />;
  else if (open.length === 0) body = <div className="ph-empty ph-empty-plain">No tasks due today.</div>;
  else
    body = (
      <ul className="ph-list">
        {open.map((t) => {
          const due = dueLabel(t.due_date);
          const sub = due.tone === 'overdue' ? due.text : t.notes;
          const busy = setStatus.isPending && setStatus.variables?.id === t.id;
          return (
            <li key={t.id} className="ph-list-row">
              <button
                type="button"
                className="ph-tick"
                disabled={busy}
                onClick={() => setStatus.mutate({ id: t.id, status: 'done' })}
                aria-label={`Mark ${t.title} done`}
              >
                <span className="ph-box" />
              </button>
              <Link to={`/work/day/${day}`} className="ph-row-main">
                <span className="ph-row-t">{t.title}</span>
                {sub && <span className={clsx('ph-row-s', due.tone === 'overdue' && 'late')}>{sub}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="ph-card ph-wide-tile" data-module="work">
      <div className="ph-tile-head">
        <span className="ph-chip">
          <Icon name="work" size={14} />
        </span>
        <span className="ph-tile-title">Today’s tasks</span>
        <Link to={`/work/day/${day}`} className="ph-link ph-push">
          Office day
        </Link>
      </div>
      {body}
    </section>
  );
}

function GlanceTile({
  module,
  icon,
  title,
  to,
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
  if (failed) {
    return (
      <div className="ph-tile" data-module={module}>
        {head}
        <LoadFailed what={title.toLowerCase()} onRetry={onRetry} />
      </div>
    );
  }
  return (
    <Link to={to} className="ph-tile" data-module={module}>
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

function ExpensesTile() {
  const month = monthKey();
  const q = useMonthSummary(month);
  return (
    <GlanceTile
      module="expenses"
      icon="expenses"
      title="Spent"
      to="/expenses"
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={money(q.data?.spendCents ?? 0, true)}
      sub={monthLabel(month)}
    />
  );
}

function WorkTile() {
  const q = useProjects();
  const active = (q.data ?? []).filter((p) => p.status === 'active').length;
  return (
    <GlanceTile
      module="work"
      icon="work"
      title="Work"
      to="/work"
      loading={q.isLoading}
      failed={!!q.error}
      onRetry={() => void q.refetch()}
      figure={String(active)}
      sub="Active projects"
    />
  );
}

function DesignTile() {
  const q = useBoards();
  // homeCount sums to the library; itemCount double-counts cross-listings
  const refs = (q.data ?? []).reduce((s, b) => s + b.homeCount, 0);
  return (
    <GlanceTile
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

function GoalsTile() {
  const goals = useGoals();
  const { goalsWithPace, isLoading } = useGoalsWithPace();
  const onTrack = goalsToSnapshot(goalsWithPace).stats[0]?.value ?? '—';
  return (
    <GlanceTile
      module="goals"
      icon="goals"
      title="Goals"
      to="/goals"
      loading={goals.isLoading || isLoading}
      failed={!!goals.error}
      onRetry={() => void goals.refetch()}
      figure={onTrack.replace(' / ', '/')}
      sub="On track"
    />
  );
}
