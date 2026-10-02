import { useState } from 'react';
import { AllTab } from './AllTab';
import { QuickAdd } from './QuickAdd';
import type { SheetRequest } from './ReminderSheet';
import { StatStrip } from './StatStrip';
import { TodayTab } from './TodayTab';
import { UpcomingTab } from './UpcomingTab';
import { useRemindersToday, useReminderRules, useUpcoming } from './hooks';

type Tab = 'today' | 'upcoming' | 'all';

const FIRST_RUN_SUB: Record<Tab, string> = {
  today: 'Add a one-off nudge or a repeating habit — what’s due each day shows up here to tick off.',
  upcoming: 'Once you add one, the next 7 days show up here.',
  all: 'Every reminder you set up is listed here, with its schedule and streak.',
};

export function RemindersView({ onOpenSheet }: { onOpenSheet: (req: SheetRequest) => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const { data: today } = useRemindersToday();
  const { data: upcoming } = useUpcoming();
  const { data: rules } = useReminderRules();

  const rows = today ?? [];
  // Nothing has ever been set up: every tab says the same thing, with the
  // way in, rather than three different "nothing here" lines. Only once both
  // reads have actually answered -- never while loading or on an error. A
  // finished one-time reminder still has its rule row, so it doesn't count
  // as "none yet"; archived rules aren't listed, so a user who archived
  // everything sees this too, which is the right prompt for them as well.
  const noneYet = rules !== undefined && today !== undefined && rules.length === 0 && rows.length === 0;

  return (
    <div className="rem-view">
      <StatStrip rows={rows} />
      <QuickAdd onOpenSheet={onOpenSheet} />

      <div className="rem-tabs">
        <button type="button" className={`rem-tab${tab === 'today' ? ' active' : ''}`} onClick={() => setTab('today')}>
          Today · {rows.length}
        </button>
        <button
          type="button"
          className={`rem-tab${tab === 'upcoming' ? ' active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming · {upcoming?.length ?? 0}
        </button>
        <button type="button" className={`rem-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
          All · {rules?.length ?? 0}
        </button>
      </div>

      {noneYet ? (
        <div className="rem-firstrun">
          <div className="rem-firstrun-title">No reminders yet.</div>
          <div className="rem-firstrun-sub">{FIRST_RUN_SUB[tab]}</div>
          <button type="button" className="btn primary" onClick={() => onOpenSheet({ kind: 'create' })}>
            New reminder
          </button>
        </div>
      ) : (
        <>
          {tab === 'today' && <TodayTab onOpenSheet={onOpenSheet} />}
          {tab === 'upcoming' && <UpcomingTab onOpenSheet={onOpenSheet} />}
          {tab === 'all' && <AllTab onOpenSheet={onOpenSheet} />}
        </>
      )}
    </div>
  );
}
