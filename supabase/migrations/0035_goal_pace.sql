-- 0035_goal_pace.sql — the single pace engine, in SQL.
--
-- Plain function, no `security definer` — same reasoning as 0020/0034:
-- goals/goal_progress/office_journal/office_tasks/profiles all carry the
-- standard owner-all RLS, so running as the caller (invoker, the default)
-- is enough. Milestone goals are rejected outright — they read their
-- checklist fraction directly off goals.milestones, never a ledger, and
-- have no "pace" in this sense.
--
-- Three models, dispatched on goal.type and goal.cadence:
--   * streak            -> trailing 28-day completion window (unaffected
--                          by cadence — computeStreakPace never had a
--                          period concept, and this doesn't add one)
--   * count/value, cadence='none' -> linear, one span across the goal's
--                          whole lifetime — matches computeValuePace
--   * count/value, cadence set    -> recurring, a per-period target over
--                          the current calendar-aligned period — NEW,
--                          no TS analog
--
-- expected_by_today/actual/status are the fields computeValuePace already
-- returns, so those three are what the parity gate checks for linear
-- goals. For streak goals there is no TS "expected"/"actual"/four-bucket
-- status at all (computeStreakPace's status is the literal 'streak', not
-- one of these four) — this function derives actual = completions in the
-- trailing 28 days and expected_by_today = target*4 so their ratio
-- reproduces computeStreakPace's completionRate4wk exactly, then buckets
-- that ratio the same way value goals are bucketed. That mapping is new,
-- not a literal port, and is called out as such in the parity report.
-- projected_end is new for every model — computeValuePace never returned
-- a projected date, only a required-rate label.
create or replace function public.goal_pace(p_goal_id uuid)
returns table (
  expected_by_today numeric,
  actual numeric,
  projected_end date,
  status text
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_goal          public.goals%rowtype;
  v_tz            text;
  v_now           timestamptz := now();
  v_today         date;
  v_start_ts      timestamptz;
  v_end_ts        timestamptz;
  v_total_days    numeric;
  v_elapsed_days  numeric;
  v_elapsed       numeric;
  v_period_start  date;
  v_period_end    date;
  v_actual        numeric;
  v_expected      numeric;
  v_status        text;
  v_ratio         numeric;
  v_projected     date;
  v_achieved      boolean;
  v_days_since_start numeric;
  v_rate          numeric;
begin
  select * into v_goal from public.goals where id = p_goal_id and user_id = auth.uid();
  if not found then
    return; -- not yours, or doesn't exist: empty result, not an error
  end if;

  if v_goal.type = 'milestone' then
    raise exception 'goal_pace: milestone goals are not supported — read goals.milestones directly';
  end if;

  select coalesce(p.timezone, 'UTC') into v_tz from public.profiles p where p.id = auth.uid();
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (v_now at time zone v_tz)::date;

  if v_goal.type = 'streak' then
    v_period_start := v_today - 27;
    v_period_end := v_today;
    v_actual := public.goal_current_value(p_goal_id, v_period_start, v_period_end);
    v_expected := v_goal.target * 4;
    v_projected := null;

  elsif v_goal.cadence = 'none' then
    -- deriveProgress sums the ENTIRE ledger with no date filter, so this
    -- call is intentionally unbounded rather than clipped to the goal's
    -- own [start_date, target_date] span.
    v_actual := public.goal_current_value(p_goal_id, '0001-01-01'::date, '9999-12-31'::date);

    if v_goal.target_date is null then
      v_expected := null;
      v_status := 'no-deadline';
    else
      v_start_ts := (v_goal.start_date::timestamp) at time zone v_tz;
      v_end_ts := (v_goal.target_date::timestamp) at time zone v_tz;
      v_total_days := greatest(1, extract(epoch from (v_end_ts - v_start_ts)) / 86400.0);
      v_elapsed_days := least(v_total_days, greatest(0, extract(epoch from (v_now - v_start_ts)) / 86400.0));
      v_elapsed := v_elapsed_days / v_total_days;
      v_expected := v_goal.target * v_elapsed;
    end if;

  else
    -- recurring: calendar-aligned current period (ISO week / calendar
    -- month / calendar quarter) — a deliberate, documented choice; there
    -- was no existing precedent to match since this model is new.
    if v_goal.cadence = 'weekly' then
      v_period_start := v_today - (extract(isodow from v_today)::int - 1);
      v_period_end := v_period_start + 6;
    elsif v_goal.cadence = 'monthly' then
      v_period_start := date_trunc('month', v_today::timestamp)::date;
      v_period_end := (date_trunc('month', v_today::timestamp) + interval '1 month' - interval '1 day')::date;
    else -- quarterly
      v_period_start := date_trunc('quarter', v_today::timestamp)::date;
      v_period_end := (date_trunc('quarter', v_today::timestamp) + interval '3 months' - interval '1 day')::date;
    end if;

    v_actual := public.goal_current_value(p_goal_id, v_period_start, v_today);
    v_total_days := greatest(1, (v_period_end - v_period_start));
    v_elapsed_days := least(v_total_days, greatest(0, (v_today - v_period_start)));
    v_elapsed := v_elapsed_days / v_total_days;
    v_expected := v_goal.target * v_elapsed;
    v_projected := v_period_end;
  end if;

  -- status: same ratio + bucket thresholds as pace.ts's paceRatioFor/
  -- statusFromRatio, applied uniformly across all three models.
  if v_status is null then
    if v_expected is null then
      v_status := 'no-deadline';
    else
      if v_goal.direction = 'up' then
        v_ratio := case when v_expected = 0 then (case when v_actual = 0 then 1 else 3 end) else v_actual / v_expected end;
      else
        v_ratio := case when v_actual = 0 then 3 else v_expected / v_actual end;
      end if;
      v_ratio := least(greatest(v_ratio, 0), 3);
      v_status := case
        when v_ratio >= 1.0 then 'ahead'
        when v_ratio >= 0.85 then 'on-track'
        when v_ratio >= 0.6 then 'behind'
        else 'at-risk'
      end;
    end if;
  end if;

  -- projected completion date at the current lifetime rate — linear only.
  -- Streak has no completion date (stays null); recurring reports the
  -- current period's own end, since a recurring goal never "finishes".
  if v_goal.type <> 'streak' and v_goal.cadence = 'none' then
    v_achieved := case when v_goal.direction = 'up' then v_actual >= v_goal.target else v_actual <= v_goal.target end;
    if v_achieved then
      v_projected := v_today;
    else
      v_days_since_start := greatest(1, extract(epoch from (v_now - ((v_goal.start_date::timestamp) at time zone v_tz))) / 86400.0);
      v_rate := v_actual / v_days_since_start;
      if v_rate > 0 then
        v_projected := v_goal.start_date + ceil(v_goal.target / v_rate)::int;
      else
        v_projected := null;
      end if;
    end if;
  end if;

  return query select v_expected, v_actual, v_projected, v_status;
end;
$$;

revoke all on function public.goal_pace(uuid) from public;
grant execute on function public.goal_pace(uuid) to authenticated;
