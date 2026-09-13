import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mergeAgenda } from '@/features/office/agenda';
import { localDateKey } from '@/features/office/datetime';
import { dayEndISO, dayStartISO, todayKey } from '@/features/office/calendar';
import { useDayEvents, useTasks } from '@/features/office/hooks';
import { useGoogleEvents } from '@/features/office/useGoogleCalendar';
import * as officeApi from '@/features/office/api';
import { useInvoices, useProjects, useUpcomingDeliverables } from '@/features/work/hooks';
import * as workApi from '@/features/work/api';
import { useMonthSummary, usePeriodComparison } from '@/features/expenses/hooks';
import { useBoards } from '@/features/design/hooks';
import { useGoalsWithPace } from '@/features/goals/hooks';
import { monthKey } from '@/lib/format';
import {
  buildBoardSnapshots,
  buildRailToday,
  collapseGaps,
  insertNowMarker,
  rankNeedsAttention,
} from './aggregator';
import type { RailRow, Snapshot, TimeBound } from './types';

export function useHomeRail(): RailRow[] {
  const today = todayKey();
  const { data: officeEvents } = useDayEvents(today);
  const { events: googleEvents } = useGoogleEvents(dayStartISO(today), dayEndISO(today));
  const { data: officeTasks } = useTasks();
  const { data: deliverables } = useUpcomingDeliverables(14);
  const { data: invoices } = useInvoices();
  const { data: projects } = useProjects();

  return useMemo(() => {
    const merged = mergeAgenda(
      officeEvents,
      googleEvents.filter((e) => localDateKey(e.startsAt) === today),
    );
    const items = buildRailToday({
      officeEvents: merged,
      officeTasks,
      deliverables,
      invoices,
      projects,
    });
    const now = new Date();
    const ranked = rankNeedsAttention(items, now);
    return insertNowMarker(collapseGaps(ranked), now);
  }, [officeEvents, googleEvents, officeTasks, deliverables, invoices, projects, today]);
}

/** Marks a Rail task/deliverable done, from the Rail itself. */
export function useCompleteRailItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: TimeBound) =>
      item.kind === 'task'
        ? officeApi.setTaskStatus(item.entityId, 'done')
        : workApi.setDeliverableStatus(item.entityId, 'delivered'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office'] });
      qc.invalidateQueries({ queryKey: ['work'] });
    },
  });
}

export function useHomeBoard(): Snapshot[] {
  const { data: monthSummary } = useMonthSummary(monthKey());
  const { data: periodComparison } = usePeriodComparison(monthKey(), monthSummary?.lastTxnDay ?? null);
  const { data: projects } = useProjects();
  const { data: upcomingDeliverables } = useUpcomingDeliverables(7);
  const { data: boards } = useBoards();
  const { goalsWithPace } = useGoalsWithPace();

  return useMemo(
    () =>
      buildBoardSnapshots({
        monthSummary,
        periodComparison,
        projects,
        upcomingDeliverables,
        boards,
        goalsWithPace,
      }),
    [monthSummary, periodComparison, projects, upcomingDeliverables, boards, goalsWithPace],
  );
}
