import { useState } from 'react';
import { AllTab } from './AllTab';
import { QuickAdd } from './QuickAdd';
import type { SheetRequest } from './ReminderSheet';
import { StatStrip } from './StatStrip';
import { TodayTab } from './TodayTab';
import { UpcomingTab } from './UpcomingTab';
import { useRemindersToday, useReminderRules, useUpcoming } from './hooks';

type Tab = 'today' | 'upcoming' | 'all';

export function RemindersView({ onOpenSheet }: { onOpenSheet: (req: SheetRequest) => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const { data: today } = useRemindersToday();
  const { data: upcoming } = useUpcoming();
  const { data: rules } = useReminderRules();

  const rows = today ?? [];

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

      {tab === 'today' && <TodayTab onOpenSheet={onOpenSheet} />}
      {tab === 'upcoming' && <UpcomingTab onOpenSheet={onOpenSheet} />}
      {tab === 'all' && <AllTab onOpenSheet={onOpenSheet} />}
    </div>
  );
}
