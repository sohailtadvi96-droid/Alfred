import { supabase } from '@/lib/supabase';
import type { Goal, GoalProgress, GoalStatus, Milestone, NewGoal } from './types';

export async function listGoals(): Promise<Goal[]> {
  const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Goal[];
}

/** Every progress row for every goal — grouped client-side. Phase 1 goal
 *  counts are small (max 7 active + archive), so one query beats N. */
export async function listAllProgress(): Promise<GoalProgress[]> {
  const { data, error } = await supabase
    .from('goal_progress')
    .select('*')
    .order('occurred_on', { ascending: true });
  if (error) throw error;
  return data as GoalProgress[];
}

export async function saveGoal(input: NewGoal): Promise<void> {
  const milestones =
    input.type === 'milestone'
      ? (input.milestones ?? []).map((m, i) => ({
          id: crypto.randomUUID(),
          label: m.label,
          order: m.order ?? i,
          done: false,
          done_at: null,
        }))
      : null;
  const row = {
    title: input.title.trim(),
    type: input.type,
    // a milestone goal's target is its checklist length, not a free number
    target: input.type === 'milestone' ? Math.max(1, milestones?.length ?? 1) : input.target,
    unit: input.unit?.trim() || null,
    direction: input.direction,
    start_date: input.start_date,
    target_date: input.target_date,
    module_id: input.module_id,
    milestones,
    source: { kind: 'manual' },
  };
  if (input.id) {
    const { error } = await supabase.from('goals').update(row).eq('id', input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('goals').insert(row);
    if (error) throw error;
  }
}

export async function setGoalStatus(id: string, status: GoalStatus): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ status, achieved_at: status === 'achieved' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function setMilestones(id: string, milestones: Milestone[]): Promise<void> {
  const { error } = await supabase.from('goals').update({ milestones }).eq('id', id);
  if (error) throw error;
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}

/** Count/value increment — several may land on the same day. */
export async function addProgress(goalId: string, value: number, occurredOn: string, note?: string): Promise<void> {
  const { error } = await supabase
    .from('goal_progress')
    .insert({ goal_id: goalId, value, occurred_on: occurredOn, note: note?.trim() || null });
  if (error) throw error;
}

export async function deleteProgress(id: string): Promise<void> {
  const { error } = await supabase.from('goal_progress').delete().eq('id', id);
  if (error) throw error;
}

/** Streak day toggle — at most one row per goal per day, flipped by
 *  presence rather than a DB constraint (mixed with count/value goals,
 *  which allow several rows a day, in the same table). */
export async function toggleStreakDay(goalId: string, occurredOn: string): Promise<void> {
  const { data, error } = await supabase
    .from('goal_progress')
    .select('id')
    .eq('goal_id', goalId)
    .eq('occurred_on', occurredOn)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const { error: delErr } = await supabase.from('goal_progress').delete().eq('id', data.id);
    if (delErr) throw delErr;
  } else {
    const { error: insErr } = await supabase
      .from('goal_progress')
      .insert({ goal_id: goalId, occurred_on: occurredOn, value: 1 });
    if (insErr) throw insErr;
  }
}
