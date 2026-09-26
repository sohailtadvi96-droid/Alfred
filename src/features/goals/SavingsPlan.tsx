import { errMessage } from '@/lib/errors';
import { casualDayMonth } from '@/lib/format';
import { formatRupees } from './format';
import { useSavingsPlan } from './hooks';
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
import { isSavingsPlanError, type Goal, type PlanLine, type SavingsPlan as Plan } from './types';

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

/** Mounted by GoalRow only while a savings_target row is expanded, so the RPC
 *  is never fanned out across the goal list. */
export function SavingsPlan({ goal }: { goal: Goal }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useSavingsPlan(goal);

  if (isLoading) return <p className="sp-note">Working out your plan…</p>;

  if (isError) {
    return (
      <div className="savings-plan">
        <p className="sp-note">{errMessage(error, 'Could not load the savings plan.')}</p>
        <button type="button" className="btn sec sm" onClick={() => refetch()} disabled={isFetching}>
          Try again
        </button>
      </div>
    );
  }

  // null: the function found no goal for this caller
  if (!data) {
    return <p className="sp-note">No plan for this goal — it may have been deleted. Reload to refresh.</p>;
  }

  if (isSavingsPlanError(data)) {
    return (
      <p className="sp-note">
        {data.error === 'unsupported_cadence'
          ? `Savings plans work month by month, and this goal's cadence is ${data.cadence ?? 'not monthly'}. Add it again as a monthly savings goal.`
          : "This goal isn't set up as a savings target, so there's no plan to show."}
      </p>
    );
  }

  return <PlanBody plan={data} />;
}

function PlanBody({ plan }: { plan: Plan }) {
  const headline = headlineOf(plan);
  const { cuts, heldBack } = splitLines(plan.pool.lines);
  const asOf = day(plan.period.as_of);

  return (
    <div className="savings-plan">
      <Headline h={headline} plan={plan} asOf={asOf} />

      {headline.kind === 'infeasible' && <Options h={headline} />}

      {cuts.length > 0 && (
        <section className="sp-section">
          <h4 className="sp-h">
            {headline.kind === 'infeasible' ? 'Every cut available, biggest first' : 'Where to cut, biggest first'}
          </h4>
          <ol className="sp-cuts">
            {cuts.map((line) => (
              <CutItem key={line.category} line={line} />
            ))}
          </ol>
        </section>
      )}

      {heldBack.length > 0 && headline.kind !== 'insufficient_history' && (
        <p className="sp-held">
          {headline.kind === 'infeasible' ? 'Nothing more to cut in: ' : 'Not needed to close this gap: '}
          {heldBack.map((l) => lineLabel(l)).join(', ')}.
        </p>
      )}

      {plan.history.data_points > 0 && (
        <p className="sp-fine">
          Recoverable amounts are full-month figures, and each floor is a different month — so treat{' '}
          {formatRupees(plan.pool.recoverable_total)} as a ceiling, not a promise. Floors rest on{' '}
          {plan.history.data_points} complete month{plan.history.data_points === 1 ? '' : 's'}
          {plan.history.first_complete_month && plan.history.last_complete_month
            ? ` (${month(plan.history.first_complete_month)}–${month(plan.history.last_complete_month)})`
            : ''}
          , and only debits in your want categories count, plus person-to-person payments under ₹1,000.
        </p>
      )}

      <Subscriptions plan={plan} />
    </div>
  );
}

function Headline({ h, plan, asOf }: { h: PlanHeadline; plan: Plan; asOf: string }) {
  const proj = plan.projection;
  const rest = `${formatRupees(plan.meter_to_date)} net so far as of ${asOf}; the rest of a typical month moves it by ${change(proj.remaining_net_avg)}.`;

  switch (h.kind) {
    case 'insufficient_history':
      return (
        <div className="sp-headline" data-tone="warn">
          <p className="sp-headline-main">Not enough history to plan yet.</p>
          <p className="sp-headline-sub">
            A plan needs at least one complete month of statements to learn your own floors from. So far this month:{' '}
            {formatRupees(h.netSoFar)} net as of {asOf}. Import a full month and it will fill in.
          </p>
        </div>
      );
    case 'on_track':
      return (
        <div className="sp-headline" data-tone="ok">
          <p className="sp-headline-main">
            On track — projected to land near {formatRupees(h.projectedMonthEnd)} against your {formatRupees(h.target)} target.
          </p>
          <p className="sp-headline-sub">No cuts needed. That is {rest}</p>
        </div>
      );
    case 'closable':
      return (
        <div className="sp-headline" data-tone="warn">
          <p className="sp-headline-main">
            Projected {formatRupees(h.projectedGap)} short of {formatRupees(h.target)} at month end.
          </p>
          <p className="sp-headline-sub">
            {rest} That lands near {formatRupees(h.projectedMonthEnd)}. The cuts below cover the gap.
          </p>
        </div>
      );
    case 'infeasible':
      return (
        <div className="sp-headline" data-tone="bad">
          <p className="sp-headline-main">You can't get there on cuts alone.</p>
          <p className="sp-headline-sub">
            Projected {formatRupees(h.projectedGap)} short of {formatRupees(h.target)} at month end. Even taking every cut
            below — each category down to your own lowest month — recovers about {formatRupees(h.recoverable)}, which
            leaves {formatRupees(h.shortfall)} still missing. {rest}
          </p>
        </div>
      );
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

function CutItem({ line }: { line: PlanLine }) {
  const advice = describeCut(line);
  const evidence = evidenceOf(line);
  const trend = trendNote(line);
  return (
    <li className="sp-cut" data-evidence={evidence.tier}>
      <div className="sp-cut-top">
        <span className="sp-cut-name">{lineLabel(line)}</span>
        <span className="sp-cut-amt">{advice.amount}</span>
      </div>
      <p className="sp-cut-behaviour">{advice.behaviour}</p>
      <p className="sp-cut-meta">
        <span className={`sp-badge sp-badge-${evidence.tier}`}>{evidence.badge}</span> {evidence.note}
        {trend && <> · {trend}</>}
      </p>
    </li>
  );
}

function Subscriptions({ plan }: { plan: Plan }) {
  return (
    <section className="sp-section">
      <h4 className="sp-h">Recurring subscriptions — worth eyeballing</h4>
      {plan.subscriptions.length === 0 ? (
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
            These are only charges that repeat — nothing here says any of them is unused or should be cancelled; that's
            your call. Detection is run by hand, so the list can lag behind your latest statement.
          </p>
        </>
      )}
    </section>
  );
}
