# Alfred — Reminders module plan

> Drop this in `docs/` next to `alfred-goals-engine-plan.md`. Claude Code should read it
> before any Reminders step. Status: **R2 applied locally (27 Sep). Not pushed, not committed.**

### R0 findings that shaped this plan
- The 0033 `reminders` table has **zero readers and zero rows**. It was scaffolded for goal nudges (`kind` = checkin/pace/…, opaque `recurrence` jsonb, `next_fire_at`). We **alter it in 0040**: keep id/user_id/goal_id/title/channel/snoozed_until/RLS/trigger, and replace the rest.
- **Timezone:** only `goal_pace` and `savings_plan` read `profiles.timezone`. The client uses the browser clock everywhere (`todayKey()`), and the column defaults to `'UTC'`. Rule: **all reminder date logic is server-side through `user_today()`**, and the client never decides which day it is for reminders. Check that the stored value really is `Asia/Kolkata`.
- **Latent bug to fix in R7:** the `tasks_completed` branch uses `done_at::date`, which is the UTC day. A task done at 2 AM IST counts toward the previous day. When R7 rewrites `goal_current_value`, both terms use `(… at time zone tz)::date`.
- **No done-today feed exists.** Office's `DueTasks` lists tasks by `due_date`, so the feed is new work, not an extension.
- **"Scheduled days only" streaks have no precedent** in the codebase and get written from scratch in R2.
- `goal_current_value` must be restated in full on every change (0034 → 0038 → R7 will be the third rewrite).
- Next migration: **0040**. Sidebar already has placeholder rows (`Invest`, `Health`) to copy for the new entry.

---

## 1. What we're building

A **Reminders** page that is the daily "did I do my things" layer of Alfred. It has two
kinds of reminder:

| Kind | Examples | Lifecycle |
|---|---|---|
| **One-time** | Call Rahul, help Mehdi with the deck, pay the plumber | Due date + optional time → snooze → done → gone. Overdue ones carry forward to today. |
| **Recurring** (the real feature) | Vitamin D at 10:00, journal, gym Mon/Wed/Fri, rent on the 1st, water plants every 3 days | Stored as one rule. A card appears on each scheduled day and disappears once that day is done. Tracks a streak. |

Reminders connect to **Goals** now, to **Office** (done-today list and task count) now, and
to **Work** and **Home** later.

---

## 2. Non-negotiable rules

1. **Derive, don't materialise.** A recurring reminder is one row holding its schedule.
   The system never creates one row per day and never runs a cron job to spawn tomorrow's
   cards. Today's cards are computed on read. This is the same no-drift rule as
   `transaction_flows` and the goals engine.
2. **The only stored state is a completions ledger:** one row per (reminder, occurrence
   date). A tick writes a row and an un-tick deletes it.
3. **Module-satisfied reminders never store a completion.** If a reminder is "done when
   the journal is written", then `office_journal` is the source of truth and the tick UI
   is hidden. Nothing is tracked twice.
4. **Never copy reminder completions into `office_tasks`.** The Office done-today list is
   a derived union of both sources.
5. **"Today" always means today in `profiles.timezone`** (Asia/Kolkata), never UTC. All
   date logic goes through one `user_today()` helper.
6. **Streaks count scheduled days only.** For gym on Mon/Wed/Fri, Tuesday doesn't exist
   for the streak.
7. **Conventions:** RPCs are `language sql stable` (or `plpgsql` where writes need
   atomicity) and **security invoker**. Tables get the owner-all RLS policy and use
   `set_updated_at()`. Migrations are applied locally first and are immutable once pushed.

---

## 3. How a recurring card gets marked done

| Mode | Set by | What marks it done | Stored? |
|---|---|---|---|
| **Manual tick** | default | User ticks the card | Row in `reminder_completions` |
| **Module-satisfied** | `satisfied_by` = e.g. `'office_journal'` | Another module's data for that date | Nothing is stored; derived on read |
| **Goal-spawned** | created from a streak goal (`goal_id` set) | Either of the above, depending on the goal's source | As above. For a *manual* streak goal, the tick also writes that day's `goal_progress` row. |

Initial `satisfied_by` whitelist: `office_journal`. Later additions: `invoice_sent`
(Work), `gym_session` / `steps_8k` (health webhook, Phase D), and Home items.

---

## 4. Counting reminders as tasks

- A completed reminder appears in **Office → Done today**, with a small bell icon, on the
  day it was actually completed. An overdue call ticked today shows up today.
- `counts_as_task` boolean, editable per reminder:
  - **One-time → default `true`.** It counts toward the 15 tasks/week goal.
  - **Recurring → default `false`.** It appears in the done list for the record, but its
    own streak goal already tracks it.
- The `tasks_completed` branch of `goal_current_value` becomes
  `office_tasks done in period + reminder_completions in period where counts_as_task`.

---

## 5. Data model (final, migration 0040)

### `reminders`: alter the 0033 table (it has zero rows and zero readers)

| Column | Action | Final shape |
|---|---|---|
| `id`, `user_id`, `title`, `created_at`, `updated_at`, trigger, RLS | keep | unchanged |
| `channel`, `snoozed_until` | keep | `channel` is unused until dispatch. `snoozed_until` hides a one-time card until then |
| `goal_id` | alter FK | `on delete set null` (was cascade), so a habit survives its goal being deleted |
| `kind` | replace check | `not null check in ('one_time','recurring')`. Goal-nudge purposes (pace, weekly_review) return later as a separate column if dispatch needs them |
| `status` | add check | `in ('active','paused','archived')`, default `active`. Done-ness never lives here; it comes from completions |
| `recurrence`, `next_fire_at` | **drop** | typed columns below replace them. A next-fire cache can be added back when dispatch is built |
| `notes` | add | text |
| `due_date`, `due_time` | add | **one-time only**. A local date plus an optional local time, same convention as `office_tasks.due_date`, so no timestamptz conversion |
| `freq` | add | `check in ('daily','weekly','monthly','every_n_days')`, **recurring only** |
| `interval_n` | add | smallint not null default 1, ≥1 (every N days) |
| `weekdays` | add | smallint[], ISO 1=Mon…7=Sun, `<@ '{1,2,3,4,5,6,7}'` |
| `month_day` | add | smallint 1–31; clamps to the month's last day |
| `time_of_day` | add | time, optional (ordering, "due now", future pushes) |
| `start_date` | add | date, default `user_today()`; the anchor for every-N |
| `end_date` | add | date, optional |
| `paused_at` | add | timestamptz, set while `status='paused'` |
| `satisfied_by` | add | `check in ('office_journal')`, recurring only; null = manual tick |
| `counts_as_task` | add | boolean not null. A before-insert trigger fills a null with `kind = 'one_time'` |

Table checks: one-time → `due_date` not null and `freq` null. Recurring → `freq` and
`start_date` not null and `due_date` null. Weekly → non-empty `weekdays`. Monthly →
`month_day`. `end_date >= start_date`. `satisfied_by` is only allowed on recurring.
Indexes: drop `reminders_user`, add `(user_id, status, kind)`, keep `reminders_goal`.

### `reminder_completions` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid default auth.uid(), FK cascade | owner-all RLS. The with-check also requires owning the reminder |
| `reminder_id` | uuid FK → reminders on delete cascade | |
| `occurrence_date` | date not null | the scheduled day this satisfies. For one-time it's `due_date` |
| `status` | text not null default `done`, check in (`done`,`skipped`,`excused`) | `skipped` = a miss. `excused` = a paused day, written when the rule is resumed, which the streak steps over |
| `completed_at` | timestamptz not null default now() | its local date decides which done-today list and task-count day it counts toward |

`unique (reminder_id, occurrence_date)`; index `(user_id, completed_at)`.

Both kinds write completions, which gives a single ledger for "what did I do on day X".

### `user_today()` (also in 0040)
`language sql stable`, security invoker:
`(now() at time zone coalesce(profiles.timezone, 'Asia/Kolkata'))::date` for `auth.uid()`.
Existing `goal_pace` / `savings_plan` keep their inline logic for now, with no refactor.

---

## 6. SQL surface (RPCs)

| Function | Returns | Purpose |
|---|---|---|
| `user_today()` | date | shipped in 0040 (see §5) |
| `reminder_occurs_on(r reminders, d date)` | boolean | Pure schedule check covering freq, weekdays, month_day clamp, every-N from `start_date`, and start/end — **ignores `status` entirely** (paused/archived filtering is `reminders_today`'s job, not this function's) |
| `reminder_satisfied(r reminders, d date)` | boolean | CASE on `satisfied_by`. For example, `office_journal` → exists entry for `d` |
| `reminders_today(d date default user_today())` | table | Every card for the page: recurring occurring on `d`, one-time with `due_date ≤ d` and no completion (overdue carried), and `snoozed_until` respected. Columns: reminder fields, `occurrence_date`, `is_done`, `done_via` (`tick`/`module`), `is_overdue`, `due_state` (`later`/`due_now`/`overdue`/`done`), `streak` |
| `reminders_upcoming(days int default 7)` | table | Next N days of one-time reminders plus recurring occurrences, for the Upcoming tab |
| `reminder_complete(id, occurrence_date)` | void | plpgsql: insert a completion. If `goal_id` points to a manual streak goal, also insert that day's `goal_progress` row. Both are idempotent |
| `reminder_uncomplete(id, occurrence_date)` | void | Removes both rows from the step above |
| `reminder_skip(id, occurrence_date default user_today())` | void | Recurring only — marks the occurrence `skipped` (a miss; breaks `reminder_streak`, unlike `excused`); also unlogs a linked manual streak goal's `goal_progress` row for the day, via the internal `_reminder_unlog_goal` helper shared with `reminder_uncomplete` |
| `reminder_streak(id, p_today date default user_today())` | int | Consecutive **scheduled** occurrences done or satisfied, walking back from `p_today`. An unfinished `p_today` doesn't break it, skipped does, and excused days are stepped over. Bounded to 400 days back |
| `reminder_pause(id)` / `reminder_resume(id)` | void | Resume writes `excused` rows for every scheduled day between `paused_at` and yesterday (bounded, so streaks survive a pause), then clears `paused_at` |
| `done_today_feed(d date default user_today())` | table | Union of `office_tasks` completed on `d` and completions whose local `completed_at` date is `d`: `source`, `id`, `title`, `completed_at`, `counts_as_task` |

Goals changes:
- `goal_current_value`: the `tasks_completed` branch adds counted reminder completions.
- Streak goals linked to a reminder use that reminder's schedule for day-counting, via
  `reminder_streak`, instead of calendar days.

---

## 7. UI

**Route:** `/reminders` → `RemindersPage`. The sidebar entry gets a badge showing the
count of `due_now` + `overdue` items.

**Page layout (desktop)**
1. **Header:** date ("Sunday, 27 Sep"), a progress ring for today's done/total, and a
   **+ New reminder** button. A quick-add input sits under the header: type a title and
   press Enter to create a one-time reminder due today; a *More options* link opens the
   full sheet.
2. **Tabs:** `Today` · `Upcoming` · `All`
3. **Today tab:**
   - **Overdue** (only when present): one-time cards from past days, tinted with the
     danger accent. Actions: done, snooze (1h / tonight / tomorrow / pick), delete.
   - **Daily:** recurring cards ordered by `time_of_day`. Each card shows the checkbox,
     title, time, a schedule chip ("Daily", "Mon · Wed · Fri"), a streak count (🔥 12),
     and a linked-goal chip when there is one. **Module-satisfied** cards have no checkbox.
     They show an "Auto" chip and a CTA ("Write journal →") that deep-links to the module.
     The card flips to done by itself once the entry exists.
   - **Today (one-time):** due-today one-time cards.
   - **Done today:** collapsed list with undo. Ticked cards animate out of their section
     into this one.
4. **Upcoming tab:** next 7 days grouped by day.
5. **All tab:** manage the rules. Recurring rules show schedule, streak and last-30-days
   dots; one-time shows pending items. Row actions are edit, pause and archive.

**New/Edit sheet (Radix Dialog, side sheet)**
- Segmented control: **One-time** | **Repeating**
- Title and notes
- One-time: date + optional time
- Repeating: repeat chips `Daily` · `Weekdays` · `Custom days` (7 day-toggle chips) ·
  `Monthly` (day picker) · `Every N days`; time; start date and optional end date
- **Done automatically when…**: select (Never / Journal is written / …)
- **Link to goal**: select from active goals
- **Counts as a task** toggle, defaulting by kind
- A plain-language summary line: "Every Mon, Wed and Fri at 7:00 AM · counts toward Gym goal"

**Elsewhere**
- **Office → Done today:** renders `done_today_feed`, with a bell icon on reminder rows.
- **Goals:** a streak goal form gets a "Remind me" row with time and days, which creates
  the linked reminder. The goal card shows the reminder's next occurrence.
- **Home:** a "Next up" tile listing the next 3 due items, with inline tick.

**Empty/edge states:** nothing today ("Nothing due. Enjoy it."), all done (ring
complete), a paused rule shown dimmed in All, and a goal deleted while its reminder is
kept (the goal chip disappears).

---

## 8. Build steps (one Claude Code prompt each, applied locally first)

Each step ends with: typecheck and lint pass, the local migration applied, and the listed
checks done by hand. Commit per step. Push to prod only after R2 and again after R7.

### R0 · Investigate and report *(sent)*
Output: the existing `reminders` shape, streak and task meters, `office_tasks` completion
columns, the timezone helper, the next migration number, and a gap list.

### R1 · Schema migration `0040_reminders_schema.sql`
Alters `reminders` and creates `reminder_completions` and `user_today()`, exactly per §5.
The full prompt is in the chat, and is kept below for reference.

Check: `\d` of both tables; valid inserts of each kind; constraint rejections; the
`counts_as_task` default; `user_today()` returns today in IST; deleting a goal nulls
`goal_id`. Also check that `profiles.timezone` is `Asia/Kolkata`, not `UTC`.

### R2 · Schedule and today RPCs (`0041_reminders_rpcs.sql`)
> Add `reminder_occurs_on`, `reminder_satisfied`, `reminders_today`,
> `reminders_upcoming`, `reminder_complete`, `reminder_uncomplete`, `reminder_pause`/`reminder_resume` and `reminder_streak`
> per §6. Also write `supabase/tests/reminders.sql` with fixtures proving: weekly
> Mon/Wed/Fri occurs only on those days; `month_day=31` fires on 30 Sep; every-3-days is
> anchored to `start_date`; an overdue one-time appears today; snoozed is hidden; the
> journal-satisfied reminder flips done when an `office_journal` row exists; a streak
> ignores unscheduled days and survives an unfinished today.

Plus: pausing for 3 days and then resuming keeps the streak intact.

Check: every fixture passes locally. Then push R1 and R2 to prod.

### R3 · Feature module `src/features/reminders/`
> `types.ts`, `api.ts` (RPC calls and CRUD), and `hooks.ts` (TanStack Query:
> `useRemindersToday`, `useUpcoming`, `useReminderRules`, and mutations with optimistic
> tick/untick that invalidate `reminders`, `goals` and `office-done` keys). Add a
> `schedule.ts` helper that renders a rule as plain text ("Mon · Wed · Fri at 7:00 AM").
> No UI yet.

### R4 · Reminders page (Today tab)
> Add the route and sidebar entry with its badge, and build `RemindersPage` Today
> sections per §7: overdue, daily, one-time and done today, plus quick-add. Use existing
> tokens and components from `tokens.css`/`base.css`. The tick animation moves a card to
> Done; undo works. Module-satisfied cards show the Auto chip and a deep link, with no
> checkbox.

### R5 · Create/Edit sheet + Upcoming and All tabs
> Radix Dialog side sheet per §7 with the live summary line. Upcoming groups by day. All
> lists rules with pause, archive and edit, and shows a 30-day dot strip per recurring
> rule.

### R6 · Goals integration
> Add a "Remind me" row to the streak goal form, which creates or updates the linked
> reminder. Journal-streak goals create a reminder with `satisfied_by='office_journal'`.
> Linked manual streak goals use `reminder_streak` for day-counting. Show the next
> occurrence on the goal card. Verify that ticking Vitamin D writes a `goal_progress` row
> and un-ticking removes it.

### R7 · Office done-today + task meter (`0042_reminders_tasks.sql`, number may shift)
> Add `done_today_feed`. Restate `goal_current_value` in full and change the `tasks_completed` branch of `goal_current_value` to
> include counted completions, and run a parity check that the old vs new value for this
> week differs by exactly the count of `counts_as_task` completions, plus any tasks done between midnight and 05:30 IST that were previously miscounted. Switch the
> OfficeDayPage done list to the feed, with the bell icon on reminder rows.

Check: push to prod.

### R8 · Home tile + polish
> Add the "Next up" Home tile with inline tick, empty states, keyboard support (`n` new,
> `x` toggle focused card), and mobile layout.

### Later (not this build)
- **Dispatch (Goals Phase E):** pg_cron → Edge Function → Rail notification, then
  Telegram, driven by `time_of_day` and `due_state`.
- **Work/Home links:** add a generic `target_type` + `target_id` to `reminders` and new
  `satisfied_by` checks such as `invoice_sent`.
- The Alfred assistant creates reminders from natural language through the action
  registry.

---

## 9. Open decisions (defaults chosen; change if needed)

- **Skip = miss.** Skipping hides today's card but breaks the streak. Pausing is the
  honest way to take days off: resuming backfills `excused` rows so the streak survives.
- **Overdue recurring days are not carried forward.** A missed Vitamin D yesterday is just
  a miss. Only one-time reminders roll over.
- **Monthly on the 29th–31st** clamps to the month's last day.
- **Reminder completion time vs occurrence:** the streak uses `occurrence_date`, while
  the done-today list and the task count use the local date of `completed_at`.

---

## Appendix · R1 prompt (as sent)

```
Reminders R1: schema migration 0040. First read docs/alfred-reminders-plan.md
(§2 rules, §5 data model). Write supabase/migrations/0040_reminders_schema.sql.
Do NOT edit 0033. Apply LOCALLY only; do not push.

0. Safety guard at the top of the migration:
   do $$ begin if exists (select 1 from public.reminders) then
     raise exception '0040 assumes reminders is empty'; end if; end $$;

1. user_today(): language sql stable, security invoker, returns date:
   (now() at time zone coalesce((select timezone from public.profiles
     where <pk> = auth.uid()), 'Asia/Kolkata'))::date
   Confirm the profiles PK column name (id vs user_id) before writing it.
   Don't touch goal_pace / savings_plan.

2. Alter public.reminders:
   - drop index reminders_user; drop columns recurrence, next_fire_at
   - kind: drop the old check, add check (kind in ('one_time','recurring')), set not null
   - status: add check (status in ('active','paused','archived')), keep default 'active'
   - goal_id: recreate the FK as on delete set null (currently cascade)
   - add columns: notes text; due_date date; due_time time;
     freq text check (freq in ('daily','weekly','monthly','every_n_days'));
     interval_n smallint not null default 1 check (interval_n >= 1);
     weekdays smallint[] check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]);  -- ISO, 1=Mon
     month_day smallint check (month_day between 1 and 31);
     time_of_day time; start_date date default public.user_today(); end_date date;
     paused_at timestamptz;
     satisfied_by text check (satisfied_by in ('office_journal'));
     counts_as_task boolean   -- no default; see trigger
   - named table checks:
     reminders_one_time_shape:  kind <> 'one_time'  or (due_date is not null and freq is null and satisfied_by is null)
     reminders_recurring_shape: kind <> 'recurring' or (freq is not null and start_date is not null and due_date is null and due_time is null)
     reminders_weekly_days:     freq is distinct from 'weekly'  or cardinality(weekdays) > 0
     reminders_monthly_day:     freq is distinct from 'monthly' or month_day is not null
     reminders_date_range:      end_date is null or end_date >= start_date
   - before insert trigger reminders_default_counts_as_task:
     new.counts_as_task := coalesce(new.counts_as_task, new.kind = 'one_time');
     then alter counts_as_task set not null
   - index (user_id, status, kind); keep reminders_goal and the updated_at trigger.
   - comment on table/columns: derived-on-read rule, ISO weekdays, local-date convention.

3. Create public.reminder_completions:
   id uuid pk default gen_random_uuid(),
   user_id uuid not null default auth.uid() references auth.users on delete cascade,
   reminder_id uuid not null references public.reminders on delete cascade,
   occurrence_date date not null,
   status text not null default 'done' check (status in ('done','skipped','excused')),
   completed_at timestamptz not null default now(),
   unique (reminder_id, occurrence_date);
   index (user_id, completed_at).
   RLS on. Policy: using (auth.uid() = user_id) with check (auth.uid() = user_id and
   exists (select 1 from public.reminders r where r.id = reminder_id and r.user_id = auth.uid())).
   Table comment: append-only ledger; one-time uses occurrence_date = due_date;
   'excused' is written by resume (R2) so pauses don't break streaks.

4. Apply locally and show me:
   - \d public.reminders and \d public.reminder_completions
   - in a transaction you ROLL BACK, as the local test user:
     a) one-time insert with due_date only → counts_as_task = true
     b) recurring weekly weekdays {1,3,5} time 07:00 → counts_as_task = false
     c) rejected: weekly with empty weekdays; one-time without due_date;
        recurring with due_date; one-time with satisfied_by
     d) completion insert, then a duplicate (reminder_id, occurrence_date) is rejected
     e) delete a goal linked to a reminder → reminder survives, goal_id null
     f) select public.user_today() alongside now() at time zone 'Asia/Kolkata'
   - select timezone from public.profiles for my row, locally AND the prod value
     (read-only). If prod says 'UTC', tell me; don't change it yourself.

5. Update the status line at the top of docs/alfred-reminders-plan.md to
   "R1 applied locally". Don't commit until I've reviewed.
```
