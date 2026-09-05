import { errMessage } from '@/lib/errors';
import type { AgendaEvent } from './types';

/** Read-only Google Calendar access via Google Identity Services (GIS).
 *  The access token lives in memory only; a "was connected" flag in
 *  localStorage lets us re-acquire it silently on the next visit. */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CONNECTED_KEY = 'alfred.office.gcalConnected';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
interface GoogleOAuth2 {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const isGoogleConfigured = () => GOOGLE_CLIENT_ID.length > 0;

export function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberConnected(on: boolean) {
  try {
    if (on) localStorage.setItem(CONNECTED_KEY, '1');
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* storage disabled — silent reconnect just won't happen */
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in.')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

let accessToken: string | null = null;
let tokenExpiry = 0;

/** Acquire an access token. `silent` uses prompt:'' (no UI) for auto-reconnect
 *  on a returning visit; an interactive call shows Google's account chooser. */
export async function connect(silent = false): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;
  if (!isGoogleConfigured()) throw new Error('Google Calendar is not configured.');

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in unavailable.');

  const token = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    // a silent (prompt:'') request can simply never call back if there's no
    // existing grant — don't let the promise hang.
    const timer = setTimeout(
      () => done(() => reject(new Error('Google sign-in timed out.'))),
      silent ? 8_000 : 120_000,
    );
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          done(() => reject(new Error(resp.error || 'Google did not return a token.')));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
        done(() => resolve(resp.access_token as string));
      },
      error_callback: (err) =>
        done(() => reject(new Error(err.message || err.type || 'Google sign-in failed.'))),
    });
    client.requestAccessToken({ prompt: silent ? '' : 'consent' });
  });

  rememberConnected(true);
  return token;
}

export function disconnect() {
  accessToken = null;
  tokenExpiry = 0;
  rememberConnected(false);
}

// ---------- shared auth state (module store) ----------
// Connection status is global — the calendar month view and any day page all
// read the same token — so it lives here rather than in one component's state.
export interface GAuthState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}
let authState: GAuthState = {
  connected: isGoogleConfigured() && wasConnected(),
  connecting: false,
  error: null,
};
const authListeners = new Set<() => void>();

export function subscribeAuth(cb: () => void): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}
export function getAuthState(): GAuthState {
  return authState;
}
function setAuth(patch: Partial<GAuthState>) {
  authState = { ...authState, ...patch };
  authListeners.forEach((l) => l());
}

/** Interactive connect (shows Google's account chooser). */
export async function connectInteractive(): Promise<void> {
  setAuth({ connecting: true, error: null });
  try {
    await connect(false);
    setAuth({ connected: true, connecting: false });
  } catch (e) {
    setAuth({ connecting: false, error: errMessage(e, 'Could not connect to Google Calendar.') });
  }
}
export function disconnectAll() {
  disconnect();
  setAuth({ connected: false, error: null });
}
/** Called when a range fetch fails — drop to the Connect prompt. */
export function reportAuthError(message: string) {
  setAuth({ connected: false, error: message });
}

interface GCalItem {
  id: string;
  summary?: string;
  htmlLink?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Pull events for an explicit [timeMin, timeMax) window on the primary
 *  calendar — the caller passes whatever range is on screen. */
export async function fetchRange(timeMinISO: string, timeMaxISO: string): Promise<AgendaEvent[]> {
  const token = await connect(true);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMinISO);
  url.searchParams.set('timeMax', timeMaxISO);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) {
    disconnect();
    throw new Error('Google Calendar access expired — reconnect.');
  }
  if (!res.ok) throw new Error(`Google Calendar error (${res.status}).`);

  const body = (await res.json()) as { items?: GCalItem[] };
  return (body.items ?? [])
    .filter((it) => it.status !== 'cancelled' && (it.start?.dateTime || it.start?.date))
    .map((it): AgendaEvent => {
      const allDay = !it.start?.dateTime;
      return {
        id: `g:${it.id}`,
        source: 'google',
        title: it.summary || '(no title)',
        startsAt: (it.start?.dateTime || it.start?.date) as string,
        endsAt: it.end?.dateTime || it.end?.date || null,
        allDay,
        location: it.location ?? null,
        url: it.htmlLink ?? null,
      };
    });
}
