import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { Goal, GoalPace, GoalStatus, Milestone, NewGoal } from './types';

const keys = {
  goals: ['goals', 'list'] as const,
  progress: ['goals', 'progress'] as const,
  pace: (goalId: string) => ['goals', 'pace', goalId] as const,
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
 *  call the RPC); everything else gets a live server-computed pace. */
export function useGoalsWithPace() {
  const { data: goals, isLoading: goalsLoading } = useGoals();

  const paceQueries = useQueries({
    queries: (goals ?? []).map((goal) => ({
      queryKey: keys.pace(goal.id),
      queryFn: () => api.fetchGoalPace(goal.id),
      enabled: goal.type !== 'milestone',
    })),
  });

  const goalsWithPace = useMemo(() => {
    if (!goals) return undefined;
    return goals.map((goal, i) => ({
      goal,
      pace: goal.type === 'milestone' ? null : ((paceQueries[i]?.data ?? null) as GoalPace | null),
    }));
  }, [goals, paceQueries]);

  const paceLoading = paceQueries.some((q) => q.isLoading);
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
