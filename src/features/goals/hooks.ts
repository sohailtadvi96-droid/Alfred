import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import { computePace } from './pace';
import { deriveProgress } from './progress';
import type { Goal, GoalStatus, Milestone, NewGoal } from './types';

const keys = {
  goals: ['goals', 'list'] as const,
  progress: ['goals', 'progress'] as const,
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

/** Every goal paired with its computed pace — the shape both the module
 *  page and the Board tile read from. */
export function useGoalsWithPace(today = new Date()) {
  const { data: goals, isLoading: goalsLoading } = useGoals();
  const { data: progress, isLoading: progressLoading } = useGoalProgress();

  const goalsWithPace = useMemo(() => {
    if (!goals) return undefined;
    return goals.map((goal) => ({
      goal,
      pace: computePace(goal, deriveProgress(goal, progress ?? []), today),
    }));
    // `today` intentionally excluded — it's a per-render default, not a
    // dependency that should invalidate the memo on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, progress]);

  return { goalsWithPace, isLoading: goalsLoading || progressLoading };
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
