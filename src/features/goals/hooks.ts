import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import { statusFromPlan } from './savingsPlanView';
import type { Goal, GoalPace, GoalStatus, Milestone, NewGoal } from './types';

const keys = {
  goals: ['goals', 'list'] as const,
  progress: ['goals', 'progress'] as const,
  pace: (goalId: string) => ['goals', 'pace', goalId] as const,
  savingsPlan: (goalId: string) => ['goals', 'savings-plan', goalId] as const,
};

/** single-user app — after any write just refresh the whole Goals subtree */
function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['goals'] });
}

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: api.listGoals });
}

export function useGoalProgress() {
  return useQuery({ queryKey: keys.progress, queryFn: api.listAllProgress });
}

/** goal_pace for a single goal. Disabled (and never fetched) for milestone
 *  goals — the RPC rejects them, so there's no point calling it. */
export function useGoalPace(goal: Pick<Goal, 'id' | 'type'> | undefined) {
  return useQuery({
    queryKey: goal ? keys.pace(goal.id) : keys.pace('none'),
    queryFn: () => api.fetchGoalPace((goal as Goal).id),
    enabled: !!goal && goal.type !== 'milestone',
  });
}

/** A goal whose header status and body both come from savings_plan rather
 *  than goal_pace: an ACTIVE savings_target goal. Nothing else ever asks for
 *  a plan, so it is never fanned out across the other kinds. */
function wantsPlan(goal: Pick<Goal, 'source' | 'status'>): boolean {
  return goal.source.kind === 'savings_target' && goal.status === 'active';
}

/** savings_plan for one goal. Every caller (the list's header status, the row's
 *  why-line, the expanded body) shares one cache entry, so it is one RPC. */
export function useSavingsPlan(goal: Pick<Goal, 'id' | 'source' | 'status'> | undefined) {
  return useQuery({
    queryKey: goal ? keys.savingsPlan(goal.id) : keys.savingsPlan('none'),
    queryFn: () => api.fetchSavingsPlan((goal as Goal).id),
    enabled: !!goal && wantsPlan(goal),
  });
}

/** goal_current_value for an explicit range — the lower-level primitive
 *  behind goal_pace, exposed for callers that want a raw current-period
 *  count without the pace math (e.g. a future "this period so far" widget).
 */
export function useGoalCurrentValue(goalId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['goals', 'current-value', goalId, from, to],
    queryFn: () => api.fetchGoalCurrentValue(goalId as string, from, to),
    enabled: !!goalId,
  });
}

/** Every goal paired with its computed pace from goal_pace — the shape
 *  both the module page and the Home rollup read from. Milestone goals
 *  carry pace: null (they read their checklist fraction directly, never
 *  call the RPC); everything else gets a live server-computed pace.
 *
 *  Except an active savings_target goal: goal_pace's linear expectation is
 *  wrong for a lump-sum salary (it said "On track" over a plan that said
 *  ₹27,615 short), so its status is taken from the plan's own projection
 *  (statusFromPlan) and the two linear-model fields (expectedByToday,
 *  projectedEnd) are dropped. `actual` -- the net so far -- is still
 *  goal_pace's. This is the one place that overlay happens, so the module
 *  page, its grouping and the Home tile can never disagree with the body. */
export function useGoalsWithPace() {
  const { data: goals, isLoading: goalsLoading } = useGoals();

  const paceQueries = useQueries({
    queries: (goals ?? []).map((goal) => ({
      queryKey: keys.pace(goal.id),
      queryFn: () => api.fetchGoalPace(goal.id),
      enabled: goal.type !== 'milestone',
    })),
  });

  // same query key as useSavingsPlan, so the row that later expands reads the cache
  const planQueries = useQueries({
    queries: (goals ?? []).map((goal) => ({
      queryKey: keys.savingsPlan(goal.id),
      queryFn: () => api.fetchSavingsPlan(goal.id),
      enabled: wantsPlan(goal),
    })),
  });

  const goalsWithPace = useMemo(() => {
    if (!goals) return undefined;
    return goals.map((goal, i) => {
      const pace = goal.type === 'milestone' ? null : ((paceQueries[i]?.data ?? null) as GoalPace | null);
      if (!wantsPlan(goal)) return { goal, pace };
      const status = statusFromPlan(planQueries[i]?.data ?? undefined);
      return {
        goal,
        pace: { actual: pace?.actual ?? 0, expectedByToday: null, projectedEnd: null, status } as GoalPace,
      };
    });
  }, [goals, paceQueries, planQueries]);

  const paceLoading = paceQueries.some((q) => q.isLoading) || planQueries.some((q) => q.isLoading);
  return { goalsWithPace, isLoading: goalsLoading || paceLoading };
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewGoal) => api.saveGoal(input),
    onSuccess: () => refresh(qc),
  });
}

export function useSetGoalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: GoalStatus }) => api.setGoalStatus(id, status),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: () => refresh(qc),
  });
}

export function useAddProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, value, occurredOn, note }: { goalId: string; value: number; occurredOn: string; note?: string }) =>
      api.addProgress(goalId, value, occurredOn, note),
    onSuccess: () => refresh(qc),
  });
}

export function useDeleteProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProgress(id),
    onSuccess: () => refresh(qc),
  });
}

export function useToggleStreakDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, occurredOn }: { goalId: string; occurredOn: string }) =>
      api.toggleStreakDay(goalId, occurredOn),
    onSuccess: () => refresh(qc),
  });
}

export function useToggleMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goal, milestoneId }: { goal: Goal; milestoneId: string }) => {
      const next: Milestone[] = (goal.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, done: !m.done, done_at: !m.done ? new Date().toISOString() : null }
          : m,
      );
      return api.setMilestones(goal.id, next);
    },
    onSuccess: () => refresh(qc),
  });
}

export function useAddMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goal, label }: { goal: Goal; label: string }) => {
      const next: Milestone[] = [
        ...(goal.milestones ?? []),
        { id: crypto.randomUUID(), label: label.trim(), order: goal.milestones?.length ?? 0, done: false, done_at: null },
      ];
      return api.setMilestones(goal.id, next);
    },
    onSuccess: () => refresh(qc),
  });
}

export function useRemoveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goal, milestoneId }: { goal: Goal; milestoneId: string }) => {
      const next = (goal.milestones ?? []).filter((m) => m.id !== milestoneId);
      return api.setMilestones(goal.id, next);
    },
    onSuccess: () => refresh(qc),
  });
}
