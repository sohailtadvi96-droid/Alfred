import { useEffect, useMemo, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { parentOf, screenLabel, tabFor } from '../nav';
import { PhoneChromeContext, type PhoneChrome } from './chrome';
import { launchRestoreTarget, rememberLocation } from './phoneNav';
import { isStandalone } from './useIsPhone';
import { TabBar } from './TabBar';

const MORE_MEMBERS = ['/goals', '/design', '/secrets', '/settings'];

/** The phone layout: the routed screen, then the tab bar. Screens keep
 *  rendering their own header (TopBar, compacted by phone.css); the shell
 *  only tells them whether to show a back button. */
export function PhoneShell() {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();

  // A mirror of this session's history (pathnames), so the back button can
  // return the way the user came — the same step an iPhone edge-swipe takes.
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

  const tab = tabFor(location.pathname);
  const s = stack.current;
  const prev = s.length >= 2 ? s[s.length - 2] : null;

  const chrome = useMemo<PhoneChrome>(() => {
    const here = location.pathname;
    const parent = parentOf(here);
    if (!parent) return { back: null };
    // the previous screen, when it is where this one was opened from
    if (prev && prev !== here && (tabFor(prev) === tabFor(here) || MORE_MEMBERS.includes(here))) {
      return { back: { label: screenLabel(prev), onBack: () => navigate(-1) } };
    }
    // same tab: keep the address's filters (Expenses' ?month=) on the way up
    const search = tabFor(parent) === tabFor(here) ? location.search : '';
    return { back: { label: screenLabel(parent), onBack: () => navigate({ pathname: parent, search }) } };
  }, [location.pathname, location.search, prev, navigate]);

  return (
    <PhoneChromeContext.Provider value={chrome}>
      <div className="ph-app" data-tab={tab}>
        <main className="ph-main">
          <Outlet />
        </main>
        <TabBar active={tab} />
      </div>
      <ScrollRestoration />
    </PhoneChromeContext.Provider>
  );
}
