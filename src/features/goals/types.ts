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

/** Whitelisted at the DB (0033's goals_source_kind_check) -- goal_current_value
 *  and goal_pace both dispatch on this. 'manual' is the only kind the UI
 *  ever writes (saveGoal) -- journal_streak/tasks_completed goals are
 *  populated by other modules, never created through NewGoalDialog. */
export type GoalSourceKind = 'manual' | 'journal_streak' | 'tasks_completed';
export type GoalSource = { kind: GoalSourceKind };

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
