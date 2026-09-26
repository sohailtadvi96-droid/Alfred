import type { ModuleId } from '@/features/home/types';

export type GoalType = 'count' | 'value' | 'milestone' | 'streak';
export type GoalDirection = 'up' | 'down';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'abandoned';

export interface Milestone {
  id: string;
  label: string;
  done: boolean;
  done_at: string | null;
  order: number;
}

/** Whitelisted at the DB (goals_source_kind_check, 0033, widened by 0038) --
 *  goal_current_value and goal_pace both dispatch on this. NewGoalDialog can
 *  create 'manual' and 'savings_target' goals; journal_streak/tasks_completed
 *  goals are still seeded, never created through the UI. */
export type GoalSourceKind = 'manual' | 'journal_streak' | 'tasks_completed' | 'savings_target';
export type GoalSource = { kind: GoalSourceKind };
export type GoalCadence = 'none' | 'weekly' | 'monthly' | 'quarterly';

export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  target: number;
  unit: string | null;
  direction: GoalDirection;
  start_date: string;
  target_date: string | null;
  source: GoalSource;
  module_id: ModuleId | null;
  status: GoalStatus;
  milestones: Milestone[] | null;
  created_at: string;
  updated_at: string;
  achieved_at: string | null;
}

/** One manual progress entry. Count/value goals: an increment, summed to get
 *  `actual`. Streak goals: one row per completed day. Only meaningful for
 *  source.kind === 'manual' -- journal_streak/tasks_completed goals never
 *  write here, their ledger lives in office_journal/office_tasks instead. */
export interface GoalProgress {
  id: string;
  goal_id: string;
  value: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
}

export interface NewGoal {
  id?: string;
  title: string;
  type: GoalType;
  target: number;
  unit: string | null;
  direction: GoalDirection;
  start_date: string;
  target_date: string | null;
  module_id: ModuleId | null;
  milestones?: Omit<Milestone, 'id' | 'done' | 'done_at'>[];
  /** Creation only -- an edit never sends either, so a computed goal is
   *  never reset to manual/none by GoalRow's "Save changes". Omitted =
   *  'manual' / the column default ('none'). */
  source_kind?: GoalSourceKind;
  cadence?: GoalCadence;
}

export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'at-risk' | 'no-deadline';

/** goal_pace's return shape -- the single pace engine, computed in SQL
 *  (0035). Covers manual linear, recurring, and streak goals alike.
 *  Milestone goals never call it (goal_pace rejects them outright); they
 *  read their checklist fraction off `milestones` directly and carry
 *  pace: null wherever this appears. */
export interface GoalPace {
  expectedByToday: number | null;
  actual: number;
  projectedEnd: string | null;
  status: PaceStatus;
}

// ---------- savings_plan (0039) ----------
// Mirrors the jsonb the function builds, field for field. Money is in
// RUPEES (numeric -> JSON number), not cents -- except a subscription's
// `median_cents`, which is passed through from recurring_series untouched.

export type PlanTrendDirection = 'up' | 'down' | 'flat';
/** 'frequency' when the line's average ticket is under 300, else 'ticket_size'. */
export type PlanLever = 'frequency' | 'ticket_size';

export interface PlanLine {
  rank: number;
  /** a category slug; 'person_transactions' is ONE pooled line, never per payee */
  category: string;
  pooled: boolean;
  /** last 3 complete months */
  total_last3: number;
  avg_last3: number;
  txns_per_month: number;
  /** null when the line had no transactions in those months */
  avg_ticket: number | null;
  /** lowest complete-month total, empty months counted as 0 */
  floor: number;
  /** how many complete months the floor rests on */
  data_points: number;
  trend: {
    last2_avg: number | null;
    /** null when there are no months before the last 2 */
    earlier_avg: number | null;
    delta_pct: number | null;
    direction: PlanTrendDirection | null;
  };
  /** max(0, avg_last3 - floor) */
  recoverable: number;
  lever: PlanLever;
  /** what the greedy packing asks of this line -- never more than `recoverable` */
  suggested_cut: number;
}

export interface PlanSubscription {
  match_key: string;
  median_cents: number;
  interval_days: number;
  occurrence_count: number;
  last_seen: string;
  next_expected: string | null;
}

/** 'insufficient_history' = no complete month exists yet, so `pool.lines` is empty. */
export type PlanFeasibility = 'feasible' | 'infeasible' | 'insufficient_history';

export interface SavingsPlan {
  goal_id: string;
  period: { start: string; end: string; /** last transaction day this month, not today */ as_of: string };
  target: number;
  meter_to_date: number;
  /** target - meter_to_date, floored at 0 */
  gap: number;
  projection: {
    method: string;
    months_used: number;
    remaining_net_avg: number;
    projected_month_end: number;
    /** what the cuts are packed against: target - projected_month_end, floored at 0 */
    projected_gap: number;
  };
  history: { data_points: number; first_complete_month: string | null; last_complete_month: string | null };
  pool: {
    avg_last3_total: number;
    floors_total: number;
    recoverable_total: number;
    suggested_cut_total: number;
    lines: PlanLine[];
  };
  feasibility: PlanFeasibility;
  /** projected_gap is already 0 -- no cuts are asked for */
  already_on_track: boolean;
  /** what cuts cannot find (the earn / extend side); null unless infeasible */
  shortfall: number | null;
  subscriptions: PlanSubscription[];
}

/** The goal exists but the function can't plan for it. */
export interface SavingsPlanError {
  error: 'not_a_savings_target' | 'unsupported_cadence';
  /** present with 'unsupported_cadence' */
  cadence?: GoalCadence;
}

/** null = no such goal for this caller. */
export type SavingsPlanResult = SavingsPlan | SavingsPlanError | null;

export function isSavingsPlanError(r: SavingsPlan | SavingsPlanError): r is SavingsPlanError {
  return 'error' in r;
}
