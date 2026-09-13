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

export interface SourceQuery {
  metric: string;
  filter?: Record<string, unknown>;
}

export type GoalSource =
  | { kind: 'manual' }
  | { kind: 'module'; moduleId: ModuleId; query: SourceQuery }
  | { kind: 'hybrid'; moduleId: ModuleId; query: SourceQuery; allowManualAdjust: true };

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
 *  `actual`. Streak goals: one row per completed day (value is unused). */
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

export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'at-risk';

export interface Pace {
  status: PaceStatus | 'no-deadline';
  paceRatio: number | null;
  actual: number;
  expected: number | null;
  requiredRate: number | null;
  requiredRateLabel: string | null;
  stale: boolean;
}

export interface StreakPace {
  status: 'streak';
  currentStreak: number;
  bestStreak: number;
  completionRate4wk: number;
  stale: boolean;
}

export type GoalProgressInput =
  | { kind: 'value'; actual: number; lastUpdatedAt: string | null }
  | { kind: 'streak'; completions: string[]; lastUpdatedAt: string | null };
