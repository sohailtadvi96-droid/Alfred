import { dueLabel, localDateKey } from '@/features/office/datetime';
import { tasksDueToday } from '@/features/office/agenda';
import type { AgendaEvent, OfficeTask } from '@/features/office/types';
import type { Deliverable, InvoiceRow, Project, ProjectWithClient } from '@/features/work/types';
import type { GapMarker, NowMarker, RailRow, Snapshot, SnapshotStat, SpacerMarker, TimeBound } from './types';
import { PLACEHOLDER_SNAPSHOTS } from './placeholders';
import { money, monthLabel, shortDate } from '@/lib/format';
import type { MonthSummary } from '@/features/expenses/types';
import type { PeriodComparison } from '@/features/expenses/api';
import type { BoardWithCover } from '@/features/design/types';
import { fractionLabel, paceStatusLabel } from '@/features/goals/format';
import type { Goal, GoalPace } from '@/features/goals/types';

function dueAt(dateOnly: string): string {
  return new Date(`${dateOnly}T23:59:00`).toISOString();
}

export function officeEventsToTimeBound(rows: AgendaEvent[]): TimeBound[] {
  return rows.map((e) => ({
    id: `event:${e.id}`,
    entityId: e.id,
    module: 'work',
    kind: 'event',
    title: e.title,
    subtitle: e.location,
    at: e.startsAt,
    allDay: e.allDay,
    done: false,
    tone: 'today',
    needsAttention: false,
    href: `/work/day/${localDateKey(e.startsAt)}`,
  }));
}

export function officeTasksToTimeBound(tasks: OfficeTask[] | undefined): TimeBound[] {
  return tasksDueToday(tasks).map((t) => ({
    id: `task:${t.id}`,
    entityId: t.id,
    module: 'work',
    kind: 'task',
    title: t.title,
    subtitle: t.notes,
    at: dueAt(t.due_date as string),
    allDay: true,
    done: false,
    tone: dueLabel(t.due_date).tone,
    needsAttention: false,
    href: `/work/day/${t.due_date}`,
  }));
}

export function workDeliverablesToTimeBound(
  rows: (Deliverable & { project: Pick<Project, 'id' | 'name'> })[] | undefined,
): TimeBound[] {
  return (rows ?? [])
    .filter((d) => d.status === 'pending' && d.due_date)
    .map((d) => ({
      id: `deliverable:${d.id}`,
      entityId: d.id,
      module: 'work',
      kind: 'deliverable',
      title: d.label,
      subtitle: d.project.name,
      at: dueAt(d.due_date as string),
      allDay: true,
      done: false,
      tone: dueLabel(d.due_date).tone,
      needsAttention: false,
      href: `/work/${d.project.id}`,
    }));
}

export function workInvoicesToTimeBound(rows: InvoiceRow[] | undefined): TimeBound[] {
  return (rows ?? [])
    .filter((inv) => inv.due_date && inv.status !== 'paid')
    .map((inv) => ({
      id: `invoice:${inv.id}`,
      entityId: inv.id,
      module: 'work',
      kind: 'invoice',
      title: `Invoice ${inv.invoice_number}`,
      subtitle: inv.client?.name ?? inv.project?.name ?? null,
      at: dueAt(inv.due_date as string),
      allDay: true,
      done: false,
      tone: dueLabel(inv.due_date).tone,
      needsAttention: false,
      href: `/work/invoices/${inv.id}`,
    }));
}

export function workProjectTargetsToTimeBound(rows: ProjectWithClient[] | undefined): TimeBound[] {
  return (rows ?? [])
    .filter((p) => p.status === 'active' && p.target_delivery_on)
    .map((p) => ({
      id: `project:${p.id}`,
      entityId: p.id,
      module: 'work',
      kind: 'milestone',
      title: `${p.name} — target delivery`,
      subtitle: p.client?.name ?? null,
      at: dueAt(p.target_delivery_on as string),
      allDay: true,
      done: false,
      tone: dueLabel(p.target_delivery_on).tone,
      needsAttention: false,
      href: `/work/${p.id}`,
    }));
}

export function buildRailToday(input: {
  officeEvents: AgendaEvent[];
  officeTasks: OfficeTask[] | undefined;
  deliverables: (Deliverable & { project: Pick<Project, 'id' | 'name'> })[] | undefined;
  invoices: InvoiceRow[] | undefined;
  projects: ProjectWithClient[] | undefined;
}): TimeBound[] {
  const items = [
    ...officeEventsToTimeBound(input.officeEvents),
    ...officeTasksToTimeBound(input.officeTasks),
    ...workDeliverablesToTimeBound(input.deliverables),
    ...workInvoicesToTimeBound(input.invoices),
    ...workProjectTargetsToTimeBound(input.projects),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** At most `max` items may be needsAttention — overdue beats due-today beats
 *  starting-soon. Does not mutate the input; preserves the caller's order. */
export function rankNeedsAttention(items: TimeBound[], now: Date, max = 2): TimeBound[] {
  const score = (t: TimeBound): number => {
    if (t.done) return 0;
    if (t.tone === 'overdue') return 3;
    if (t.tone === 'today') return 2;
    if (t.kind === 'event') {
      const minsToStart = (new Date(t.at).getTime() - now.getTime()) / 60_000;
      if (minsToStart >= 0 && minsToStart <= 30) return 1;
    }
    return 0;
  };

  const winners = new Set(
    [...items]
      .map((t) => ({ t, s: score(t) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.t.at.localeCompare(b.t.at))
      .slice(0, max)
      .map((x) => x.t.id),
  );

  return items.map((t) => ({ ...t, needsAttention: winners.has(t.id) }));
}

/** Elastic-timeline row height for a gap this many minutes long — small
 *  gaps stay tight, bigger ones (up to the collapse threshold) get
 *  proportionally more visual room. */
export function elasticGapPx(minutes: number): number {
  return Math.max(2, Math.round(minutes * 0.6));
}

/** Inserts a gap marker wherever consecutive items are more than
 *  `thresholdMinutes` apart (the Rail's "Xh free" hairline), and a
 *  proportional spacer for smaller-but-real gaps in between — this is what
 *  makes the Rail's spacing "elastic" instead of a flat list. */
export function collapseGaps(
  items: TimeBound[],
  thresholdMinutes = 90,
): (TimeBound | GapMarker | SpacerMarker)[] {
  const rows: (TimeBound | GapMarker | SpacerMarker)[] = [];
  let prev: TimeBound | null = null;
  for (const item of items) {
    if (prev) {
      const gapMin = (new Date(item.at).getTime() - new Date(prev.at).getTime()) / 60_000;
      if (gapMin > thresholdMinutes) {
        rows.push({ kind: 'gap', id: `gap:${prev.id}`, minutes: Math.round(gapMin) });
      } else if (gapMin > 5) {
        rows.push({ kind: 'spacer', id: `spacer:${prev.id}`, px: elasticGapPx(gapMin) });
      }
    }
    rows.push(item);
    prev = item;
  }
  return rows;
}

/** Inserts the NOW row at its sorted position among the already-gap-collapsed rows. */
export function insertNowMarker(
  rows: (TimeBound | GapMarker | SpacerMarker)[],
  now: Date,
): RailRow[] {
  const marker: NowMarker = { kind: 'now', id: 'now', at: now.toISOString() };
  const nowTime = now.getTime();
  const out: RailRow[] = [];
  let inserted = false;
  for (const row of rows) {
    const at = 'at' in row ? row.at : null;
    if (!inserted && at && new Date(at).getTime() >= nowTime) {
      out.push(marker);
      inserted = true;
    }
    out.push(row);
  }
  if (!inserted) out.push(marker);
  return out;
}

/** "▲ 12%" / "▼ 20%", or null when there's nothing sensible to show —
 *  same rule as Expenses' dashboard: no prior data at all means hide it,
 *  not a bogus percentage. */
function comparisonStat(comparison: PeriodComparison | undefined): SnapshotStat | null {
  if (!comparison || comparison.priorExpenseCents == null) return null;
  const value =
    comparison.pct != null
      ? `${comparison.pct >= 0 ? '▲' : '▼'} ${Math.abs(comparison.pct)}%`
      : money(comparison.currentExpenseCents, true);
  return { label: 'vs same days last month', value };
}

function isGoalOnTrack(pace: GoalPace | null): boolean {
  return pace != null && (pace.status === 'ahead' || pace.status === 'on-track');
}

/** Milestone goals carry pace: null (goal_pace rejects them) — their
 *  "actual" is their own checklist doneCount, read straight off the goal,
 *  not from the RPC. */
function spotlightActualFor(entry: { goal: Goal; pace: GoalPace | null }): number | undefined {
  if (entry.goal.type === 'milestone') {
    return (entry.goal.milestones ?? []).filter((m) => m.done).length;
  }
  return entry.pace?.actual;
}

export function goalsToSnapshot(goalsWithPace: { goal: Goal; pace: GoalPace | null }[] | undefined): Snapshot {
  const active = (goalsWithPace ?? []).filter((g) => g.goal.status === 'active');
  // Milestone goals have no pace concept at all (see spotlightActualFor) —
  // folding them into this ratio would either always count against them or
  // require reintroducing a client-side pace guess, so the "on track"
  // stat is scoped to goals goal_pace can actually speak to.
  const paced = active.filter((g) => g.goal.type !== 'milestone');
  const onTrack = paced.filter((g) => isGoalOnTrack(g.pace)).length;

  const nearest = active
    .filter((g) => g.goal.target_date)
    .sort((a, b) => (a.goal.target_date as string).localeCompare(b.goal.target_date as string))[0];

  const spotlight = active[0];
  const spotlightActual = spotlight ? spotlightActualFor(spotlight) : undefined;
  const spotlightPaceLabel = spotlight?.pace ? paceStatusLabel(spotlight.pace.status) : null;

  return {
    module: 'goals',
    title: 'Goals',
    icon: 'goals',
    live: true,
    href: '/goals',
    stats: [{ label: 'On track', value: `${onTrack} / ${paced.length}` }],
    moreStats:
      spotlight && spotlightActual !== undefined
        ? [
            { label: spotlight.goal.title, value: fractionLabel(spotlight.goal, spotlightActual) },
            ...(spotlightPaceLabel ? [{ label: 'Pace', value: spotlightPaceLabel }] : []),
          ]
        : [],
    detail: nearest
      ? `Nearest: ${nearest.goal.title} · ${shortDate(`${nearest.goal.target_date}T00:00:00`)}`
      : null,
    actions: [{ label: 'All goals', href: '/goals' }],
  };
}

export function buildBoardSnapshots(input: {
  monthSummary: MonthSummary | undefined;
  periodComparison: PeriodComparison | undefined;
  projects: ProjectWithClient[] | undefined;
  upcomingDeliverables: (Deliverable & { project: Pick<Project, 'id' | 'name'> })[] | undefined;
  boards: BoardWithCover[] | undefined;
  goalsWithPace: { goal: Goal; pace: GoalPace | null }[] | undefined;
}): Snapshot[] {
  const { monthSummary, periodComparison, projects, upcomingDeliverables, boards, goalsWithPace } = input;

  const cmpStat = comparisonStat(periodComparison);
  const expenses: Snapshot = {
    module: 'expenses',
    title: 'Expenses',
    icon: 'expenses',
    live: true,
    href: '/expenses',
    stats: [
      {
        label: monthSummary ? monthLabel(monthSummary.month) : 'This month',
        value: money(monthSummary?.spendCents ?? 0, true),
      },
    ],
    moreStats: cmpStat ? [cmpStat] : [],
    detail: monthSummary ? `${monthSummary.count} transactions this month` : null,
    actions: [
      { label: 'Transactions', href: '/expenses/transactions' },
      { label: 'Review queue', href: '/expenses/review' },
      { label: 'People', href: '/expenses/people' },
    ],
  };

  const activeProjects = (projects ?? []).filter((p) => p.status === 'active');
  const dueThisWeek = (upcomingDeliverables ?? []).filter((d) => d.status === 'pending').length;
  const work: Snapshot = {
    module: 'work',
    title: 'Work',
    icon: 'work',
    live: true,
    href: '/work',
    stats: [{ label: 'Active projects', value: String(activeProjects.length) }],
    moreStats: [{ label: 'Due this week', value: String(dueThisWeek) }],
    detail: activeProjects[0] ? `Nearest: ${activeProjects[0].name}` : null,
    actions: [
      { label: 'Invoices', href: '/work/invoices' },
      { label: 'All projects', href: '/work' },
    ],
  };

  const sortedBoards = [...(boards ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  // homeCount, not itemCount: an item cross-listed into several boards is in
  // each board's itemCount but has exactly one home, so only homeCount sums to
  // the number of references.
  const totalRefs = (boards ?? []).reduce((s, b) => s + b.homeCount, 0);
  const design: Snapshot = {
    module: 'design',
    title: 'Design',
    icon: 'design',
    live: true,
    href: '/design',
    stats: [{ label: 'Boards', value: String(boards?.length ?? 0) }],
    moreStats: [{ label: 'References', value: String(totalRefs) }],
    detail: sortedBoards[0] ? `Last updated: ${sortedBoards[0].name}` : null,
    actions: [
      { label: 'Boards', href: '/design' },
      { label: 'Discover', href: '/design/discover' },
    ],
  };

  return [expenses, work, design, goalsToSnapshot(goalsWithPace), ...PLACEHOLDER_SNAPSHOTS];
}
