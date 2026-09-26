import type { ReactNode } from 'react';
import type { VerdictTone } from './goalSummary';

/** Zone 1 of an expanded goal: the "so what", biggest and first. One panel
 *  shared by every goal kind so the verdict always looks like the verdict. */
export function GoalVerdict({
  tone,
  main,
  sub,
  children,
}: {
  tone: VerdictTone;
  main: string;
  sub?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="goal-verdict" data-tone={tone}>
      <p className="goal-verdict-main">{main}</p>
      {sub && <p className="goal-verdict-sub">{sub}</p>}
      {children}
    </div>
  );
}
