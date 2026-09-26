import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import { casualDayMonth } from '@/lib/format';
import { formatRupees } from './format';
import { GoalVerdict } from './GoalVerdict';
import type { VerdictTone } from './goalSummary';
import {
  cadenceWords,
  describeCut,
  evidenceOf,
  headlineOf,
  lineLabel,
  splitLines,
  subscriptionName,
  trendNote,
  type PlanHeadline,
} from './savingsPlanView';
import { isSavingsPlanError, type PlanLine, type SavingsPlan as Plan, type SavingsPlanResult } from './types';

/** The savings_target goal's expanded body, in two of the row's three zones:
 *  SavingsVerdict (zone 1, the "so what") and SavingsDetail (zone 2, the cut
 *  list and subscriptions). Both read the ONE query GoalRow already holds --
 *  the same cache entry the list uses for the header status -- so the header
 *  and the body can never disagree. */
export type PlanQuery = UseQueryResult<SavingsPlanResult, Error>;

/** "26 Sept" -- prose, not the uppercase mono of a table cell */
function day(iso: string): string {
  return casualDayMonth(`${iso}T00:00:00`);
}

/** '2026-04-01' (a complete month's first day) -> "Apr" */
function month(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleString('en-IN', { month: 'short' });
}

/** "+₹1,200" / "−₹6,527" -- a change, so the sign is always shown. */
function change(n: number): string {
  return `${n >= 0 ? '+' : ''}${formatRupees(n)}`;
}

// ---------- zone 1: verdict ----------

export function SavingsVerdict({ query }: { query: PlanQuery }) {
  const { data, isLoading, isError, error, refetch, isFetching } = query;

  if (isLoading) return <GoalVerdict tone="neutral" main="Working out your plan…" />;

  if (isError) {
    return (
      <GoalVerdict tone="neutral" main={errMessage(error, 'Could not load the savings plan.')}>
        <button type="button" className="btn sec sm" onClick={() => refetch()} disabled={isFetching}>
          Try again
        </button>
      </GoalVerdict>
    );
  }

  // null: the function found no goal for this caller
  if (!data) {
    return <GoalVerdict tone="neutral" main="No plan for this goal — it may have been deleted. Reload to refresh." />;
  }

  if (isSavingsPlanError(data)) {
    return (
      <GoalVerdict
        tone="neutral"
        main={
          data.error === 'unsupported_cadence'
            ? `Savings plans work month by month, and this goal's cadence is ${data.cadence ?? 'not monthly'}. Add it again as a monthly savings goal.`
            : "This goal isn't set up as a savings target, so there's no plan to show."
        }
      />
    );
  }

  const h = headlineOf(data);
  const copy = headlineCopy(h, data);
  return (
    <GoalVerdict tone={copy.tone} main={copy.main} sub={copy.sub}>
      {h.kind === 'infeasible' && <Options h={h} />}
    </GoalVerdict>
  );
}

function headlineCopy(h: PlanHeadline, plan: Plan): { tone: VerdictTone; main: string; sub: string } {
  const asOf = day(plan.period.as_of);
  const proj = plan.projection;
  const rest = `${formatRupees(plan.meter_to_date)} net so far as of ${asOf}; the rest of a typical month moves it by ${change(proj.remaining_net_avg)}.`;

  switch (h.kind) {
    case 'insufficient_history':
      return {
        tone: 'neutral',
        main: 'Not enough history to plan yet.',
        sub: `A plan needs at least one complete month of statements to learn your own floors from. So far this month: ${formatRupees(h.netSoFar)} net as of ${asOf}. Import a full month and it will fill in.`,
      };
    case 'on_track':
      return {
        tone: 'ok',
        main: `On track — projected to land near ${formatRupees(h.projectedMonthEnd)} against your ${formatRupees(h.target)} target.`,
        sub: `No cuts needed. That is ${rest}`,
      };
    case 'closable':
      return {
        tone: 'warn',
        main: `Projected ${formatRupees(h.projectedGap)} short of ${formatRupees(h.target)} at month end.`,
        sub: `${rest} That lands near ${formatRupees(h.projectedMonthEnd)}. The cuts below cover the gap.`,
      };
    case 'infeasible':
      return {
        tone: 'bad',
        main: "You can't get there on cuts alone.",
        sub: `Projected ${formatRupees(h.projectedGap)} short of ${formatRupees(h.target)} at month end. Even taking every cut below — each category down to your own lowest month — recovers about ${formatRupees(h.recoverable)}, which leaves ${formatRupees(h.shortfall)} still missing. ${rest}`,
      };
  }
}

/** The honest three-way framing when the cuts can't cover it. */
function Options({ h }: { h: Extract<PlanHeadline, { kind: 'infeasible' }> }) {
  return (
    <ul className="sp-options">
      <li>
        <strong>Cut</strong> — take every line below and this month lands near {formatRupees(h.achievable)}.
      </li>
      <li>
        <strong>Earn</strong> — bring in {formatRupees(h.shortfall)} more than usual this month.
      </li>
      <li>
        <strong>Extend</strong> — settle for about {formatRupees(h.achievable)} this month and make up the rest over
        more months: a lower monthly target, or a longer horizon.
      </li>
    </ul>
  );
}

// ---------- zone 2: detail ----------

/** How many cut rows show before the rest fold behind a toggle. A real plan can
 *  have nine lines; the biggest few carry most of the money, and an expanded
 *  goal shouldn't push every other goal off the screen. Folding is only done
 *  when it hides at least two rows, and the toggle states what is folded. */
const CUT_PREVIEW = 5;

export function SavingsDetail({ query }: { query: PlanQuery }) {
  const { data } = query;
  const [showAll, setShowAll] = useState(false);
  // nothing to detail until there is a readable plan; the verdict zone says why
  if (!data || isSavingsPlanError(data)) return null;

  const headline = headlineOf(data);
  const { cuts, heldBack } = splitLines(data.pool.lines);
  const fold = cuts.length > CUT_PREVIEW + 1 && !showAll;
  const shown = fold ? cuts.slice(0, CUT_PREVIEW) : cuts;
  const folded = fold ? cuts.slice(CUT_PREVIEW) : [];

  return (
    <>
      {cuts.length > 0 && (
        <section className="sp-section">
          <h4 className="sp-h">
            {headline.kind === 'infeasible' ? 'Every cut available, biggest first' : 'Where to cut, biggest first'}
          </h4>
          <ol className="sp-cuts">
            {shown.map((line) => (
              <CutItem key={line.category} line={line} />
            ))}
          </ol>
          {folded.length > 0 && (
            <button type="button" className="sp-showmore" onClick={() => setShowAll(true)}>
              Show {folded.length} smaller cuts · {formatRupees(folded.reduce((n, l) => n + l.suggested_cut, 0))} a month ▸
            </button>
          )}
          {showAll && cuts.length > CUT_PREVIEW + 1 && (
            <button type="button" className="sp-showmore" onClick={() => setShowAll(false)}>
              Show fewer ▴
            </button>
          )}
        </section>
      )}

      {heldBack.length > 0 && headline.kind !== 'insufficient_history' && (
        <p className="sp-fine">
          {headline.kind === 'infeasible' ? 'Nothing more to cut in: ' : 'Not needed to close this gap: '}
          {heldBack.map((l) => lineLabel(l)).join(', ')}.
        </p>
      )}

      {data.history.data_points > 0 && <Caveats plan={data} />}

      <Subscriptions plan={data} />
    </>
  );
}

function Caveats({ plan }: { plan: Plan }) {
  const n = plan.history.data_points;
  const range =
    plan.history.first_complete_month && plan.history.last_complete_month
      ? ` (${month(plan.history.first_complete_month)}–${month(plan.history.last_complete_month)})`
      : '';
  return (
    <>
      <p className="sp-fine">
        {formatRupees(plan.pool.recoverable_total)} is a ceiling, not a promise: each floor is a different month, from{' '}
        {n} complete month{n === 1 ? '' : 's'}
        {range}.
      </p>
      <details className="sp-more">
        <summary>What counts here</summary>
        <p className="sp-fine">
          Debits in your want categories, plus person-to-person payments under ₹1,000 (larger ones look like lending and
          are left out). Recoverable amounts are full-month figures, so for a month that is partly over they overstate
          what is still cuttable.
        </p>
      </details>
    </>
  );
}

function CutItem({ line }: { line: PlanLine }) {
  const advice = describeCut(line);
  const evidence = evidenceOf(line);
  const trend = trendNote(line);
  return (
    <li className="sp-cut" data-evidence={evidence.tier}>
      <div className="sp-cut-top">
        <span className="sp-cut-name">{lineLabel(line)}</span>
        <span className={`sp-badge sp-badge-${evidence.tier}`} title={evidence.hint}>
          {evidence.badge}
        </span>
        <span className="sp-cut-amt">{advice.amount}</span>
      </div>
      <p className="sp-cut-behaviour">{advice.behaviour}</p>
      <p className="sp-cut-meta">
        {evidence.note}
        {trend && <> · {trend}</>}
      </p>
    </li>
  );
}

function Subscriptions({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="sp-section">
      <button type="button" className="sp-h sp-h-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Recurring subscriptions — worth eyeballing {open ? '▾' : '▸'}
      </button>
      {open &&
        (plan.subscriptions.length === 0 ? (
          <p className="sp-fine">No active subscription series have been detected.</p>
        ) : (
          <>
            <ul className="sp-subs">
              {plan.subscriptions.map((s) => (
                <li key={`${s.match_key}-${s.median_cents}`}>
                  <span className="sp-sub-name">{subscriptionName(s)}</span>
                  <span className="sp-sub-amt">
                    {formatRupees(s.median_cents / 100)} · {cadenceWords(s.interval_days)}
                  </span>
                  <span className="sp-sub-last">last charged {day(s.last_seen)}</span>
                </li>
              ))}
            </ul>
            <p className="sp-fine">
              Only charges that repeat — nothing here says any is unused or should be cancelled; that's your call.
              Detection is run by hand, so the list can lag your latest statement.
            </p>
          </>
        ))}
    </section>
  );
}
