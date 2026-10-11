import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { dockFor, parentOf, screenLabel } from '../nav';
import type { PhoneChrome } from './chrome';
import { isStandalone, launchRestoreTarget, rememberLocation } from './phoneNav';

/** The back button for the screen on show, plus the bookkeeping behind the
 *  dock's per-module memory and the installed app's launch restore. Runs at
 *  every width (no breakpoint checks); only phone CSS ever shows the button.
 *
 *  Back goes the way the user came when the previous screen is in the same
 *  module — the same step an iPhone edge-swipe takes — else to parentOf(),
 *  keeping the search string (Expenses' ?month=) within a module. */
export function useNavChrome(): PhoneChrome {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();

  // A mirror of this session's history (pathnames).
  const stack = useRef<string[]>([]);
  const seenKey = useRef<string | null>(null);
  if (seenKey.current !== location.key) {
    seenKey.current = location.key;
    const s = stack.current;
    const here = location.pathname;
    if (navType === 'PUSH') s.push(here);
    else if (navType === 'REPLACE' && s.length) s[s.length - 1] = here;
    else if (s.length >= 2 && s[s.length - 2] === here) s.pop();
    else stack.current = [here];
  }

  // Cold launch of the installed app opens /home: go back to the last screen.
  // Declared before the effect below, which overwrites the saved last screen
  // with the current one — effects run in order, so this one reads it first.
  useEffect(() => {
    const target = launchRestoreTarget(location.pathname, location.search, isStandalone());
    if (target) navigate(target, { replace: true });
    // first mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rememberLocation(location.pathname, location.search);
  }, [location.pathname, location.search]);

  const s = stack.current;
  const prev = s.length >= 2 ? s[s.length - 2] : null;

  return useMemo<PhoneChrome>(() => {
    const here = location.pathname;
    const parent = parentOf(here);
    if (!parent) return { back: null };
    if (prev && prev !== here && dockFor(prev) === dockFor(here)) {
      return { back: { label: screenLabel(prev), onBack: () => navigate(-1) } };
    }
    const search = dockFor(parent) === dockFor(here) ? location.search : '';
    return { back: { label: screenLabel(parent), onBack: () => navigate({ pathname: parent, search }) } };
  }, [location.pathname, location.search, prev, navigate]);
}
