import { useSyncExternalStore } from 'react';

/** The phone layout: a narrow window, or a touch device turned sideways
 *  with a short viewport (a phone in landscape — which then keeps the same
 *  layout in a centred column rather than switching to the desktop shell). */
export const PHONE_QUERY =
  '(max-width: 640px), (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 500px)';

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const snapshot = () => window.matchMedia(PHONE_QUERY).matches;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Running as the installed home-screen app (not a browser tab). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
