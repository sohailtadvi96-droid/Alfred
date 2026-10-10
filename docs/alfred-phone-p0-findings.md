# Alfred: phone install and Web Push — P0 findings

Snapshot of the read-only P0 investigation, 2026-10-10. Nothing in the repo was changed by
it; prod was only read (`supabase migration list`, secret names, three `select`s). P1
(install) has since shipped; later steps refine some of these proposals.

**Short version:** the app can be installed on the iPhone today with very little work. Web
Push is feasible: prod has `pg_cron` and `pg_net` available and the existing schedule
functions can be reused unchanged. iOS can't show action buttons on notifications, so tapping
a notification just opens the app. The narrow layout has visible bugs, worst on Home.

---

## A. Installability

**1. No PWA pieces existed.** `index.html` had no manifest link, no apple-touch-icon and no
theme-color tag. `vite.config.ts` only has `react()`. `public/` contained only `_redirects`.

- **Recommendation: a hand-written `public/sw.js`, not vite-plugin-pwa.** We only need a
  `push` handler and a `notificationclick` handler. Since Alfred is useless offline, leave out
  the fetch handler and precaching entirely. That removes the classic PWA bug where users get
  stuck on an old version after a deploy, and adds no dependencies.
- If offline support is wanted later, `vite-plugin-pwa@1.3.0` (released 2026-05-05) supports
  Vite ^6 and injectManifest. Its 2.0.0 also supports Vite 6 but was released 2026-10-03, too
  recent to pin.

**2. Vercel serves the real files.** Files on disk take priority over the catch-all rewrite
(that's how `/assets/*.js` already works), so `/sw.js` and `/manifest.webmanifest` are served
as themselves.
- `sw.js` would otherwise only match the generic header rule (Vercel's static default,
  `public, max-age=0, must-revalidate`). Proposed: `/sw.js` gets `Cache-Control: no-cache` and
  `Content-Type: application/javascript; charset=utf-8`; `/manifest.webmanifest` gets
  `Content-Type: application/manifest+json`.
- Failure mode is safe: if `sw.js` were missing, the rewrite would return `index.html` and
  registration would fail on the MIME type rather than install something broken.
- `public/_redirects` was a Netlify-format leftover (commit `48b4bb8`), ignored by Vercel but
  shipped in every `dist/`.

**3. Icons: there was no logo file.** The brand mark is CSS (`.mark` in `base.css`): a 26px
rounded square in `--base` with a weight-900 Archivo "A". iOS needs an opaque 180×180
`apple-touch-icon`; manifest icons 192, 512 and a 512 maskable; a favicon. Splash screens are
optional (one `apple-touch-startup-image` per device size) — skipped.

**4. Risks when running as an installed app:**
- **Safe areas:** turn on `viewport-fit=cover` only together with `env(safe-area-inset-*)`
  padding (P1.5). The translucent status-bar style forces white clock text, unreadable on
  light grounds.
- **Separate storage:** an installed iPhone app has its own storage, separate from Safari:
  sign in again, and the background, home layout, Google Calendar token and Secrets unlock
  state all start fresh. Some CSS uses `100vh` (dialog max-height, lightbox, `.side`);
  switch to `dvh` later.
- **Google Calendar (high risk):** Google's popup token flow (`initTokenClient` in
  `gcal.ts`) is unreliable from an installed iPhone app, and the silent re-grant after the
  1-hour expiry opens without a tap, so iOS will block it. Fallback: Calendar desktop-only.
- **`detectSessionInUrl`:** login is email + password, so it's effectively unused; any emailed
  link opens in Safari, not the installed app.
- **Background-paint script:** first launch falls back to `ink` until the profile loads (one
  flash). It's the right place to keep `theme-color` in step with the ground.
- **Intro animation:** uses `sessionStorage`, so it probably replays on every cold launch.
- **No browser back button:** nested pages (`/expenses/transactions`, `/work/:id`,
  `/design/:boardId`, invoice view) need an in-app back control.

## B. Phone shell

**5. Below 900px today:** `.app` collapses to one column and the whole sidebar sits above
every page (about 350px tall; `docs/screens/r8/19-narrow-home-tile.png`), its nav wrapping in
rows and still showing the disabled "Later" items. `TopBar` only gets smaller padding.

Everything that depends on the sidebar:
- **Collapse state:** `AppShell` reads/writes `alfred-sidebar-collapsed` and sets
  `data-collapsed`. The profile ground sync also lives in `AppShell` and must stay.
- **Lists:** `MODULES` isn't exported; `LATER` is imported by `AddWidgetTray`.
- **Reminders due-count badge:** calculated inline in `Sidebar.tsx`.
- **Home link:** the logo is the only link to `/home`.
- **Settings and sign out:** sidebar footer; sign out is also on Settings.
- **Tooltips:** 55 CSS hover tooltips (`data-tip`) and 6 Radix ones; the CSS ones stick on
  touch.

**6. Proposal:** breakpoint `max-width: 640px`; `AppShell` renders either the existing
desktop shell or a new `<PhoneShell>` around the same `<Outlet/>`; `MODULES`/`LATER` move to
`nav.ts` and the due count to `useReminderDueCount()`; tab bar Home, Reminders, Expenses,
Work, More (More active on `/secrets`, `/design`, `/goals`, `/settings`, `/more`); compact
`TopBar` via CSS with `padding-top: env(safe-area-inset-top)`; tab bar fixed bottom, 56px +
`env(safe-area-inset-bottom)`; More is a route, not a sheet; tooltips off on `hover: none`.
(Parked as of P2.)

**7. Home on a phone is visibly broken:**
- `.home > .home-board { grid-column: 2 }` and `.home > .home-rail { grid-column: 1 }` beat
  the 1320px one-column rule (as do the slim/hidden rail modes), so the rail is squashed into
  a sliver behind the tiles — this also happens on desktop between 900 and 1320px.
- Below 1320px the rail isn't positioned, so its absolute `[` toggle escapes to the page
  corner.
- The rail scrolls the NOW marker into view on mount; with no inner scroll container that
  scrolls the whole page.
- The hidden rail mode can only be undone with the `[` key.

Drag-to-reorder doesn't fight scrolling — it just doesn't work: listeners are only on the
`⠿` handle (`Tile.tsx`), which has no `touch-action: none`, so iOS scrolls and cancels the
drag. The handle is under 44pt. Recommendation: hide drag and resize on phones.

**8. Per-module phone problems (from code, not device-tested):**
- **Expenses:** 6-column transactions table inside `.ledger` (`overflow:hidden` — clips, no
  scroll); two 5-column Review queue tables; two `people-tbl` tables; hover-only category card
  tools and receipt reveal; wallet chip in the header.
- **Secrets:** `vault-table` has no narrow layout; WebAuthn/Face ID needs a device check.
- **Work:** `inv-table` has no narrow layout; invoice printing untested; two header actions.
- **Office:** 7-column month calendar only gets a gap tweak at 560px; Google Calendar sign-in.
- **Design:** the board picker can't be reached on touch (right-click only, and the `+` in
  `.item-card-actions` is `opacity:0` until `:hover`); board tile edit hover-only; lightbox
  uses `100vh`.
- **Settings:** "Hover a tile for its hex values".
- **Reminders:** best prepared (container query + 640px sheet).
- **Everywhere:** keyboard shortcuts have no touch equivalent.

## C. Subscriptions

**9.** Next migration was `0046` (local and prod both ended at 0045). Proposed
`push_subscriptions`: `id`, `user_id default auth.uid()` cascade, `endpoint`, `p256dh`,
`auth`, `device_label`, `user_agent`, `created_at`, `updated_at`, `last_seen_at`,
`last_success_at`, `failure_count`, `last_failure_at`, `last_failure_status`,
`unique (user_id, endpoint)`, owner-all RLS. Sign-out deletes this device's row.

**10.** A "Notifications" section on Settings above Account, five states: not installed (no
`PushManager`) → Add to Home Screen steps; installed, not asked → "Enable notifications on
this device" (the click calls `Notification.requestPermission()` before anything else);
denied → iOS Settings → Notifications → Alfred; enabled → "On for this device", "Send test",
"Turn off"; allowed but no subscription → "Re-enable".

## D. Scheduler and dispatch

**11.** Prod has `pg_cron` 1.6.4 and `pg_net` 0.20.4 available, not installed;
`supabase_vault` 0.3.1 installed. `config.toml` said `major_version = 15` while prod is
Postgres 17.6 — fix before P3. Cron → Edge Function auth: a dedicated random
`PUSH_DISPATCH_SECRET` in Vault and as a function secret, read by a private `security definer`
function (the `_alfred_key()` pattern) that calls `net.http_post` only when something is due.
`push-dispatch` runs with `verify_jwt = false` and checks the bearer itself. Don't copy the
service-role key into Vault.

**12.** `push_claim_due(p_now timestamptz default now()) returns setof push_sends` —
plpgsql volatile, `security definer`, executable by `service_role` only. Per user:
`tz := coalesce(profiles.timezone, 'Asia/Kolkata')`, local now/today from it (a
`user_today_for(uuid)` helper that `user_today()` is redefined on). Reuses
`reminder_occurs_on(r, d)` and `reminder_satisfied(r, d)` unchanged (they take the row and
never read `auth.uid()`).
- Recurring fires when active, occurs today, `time_of_day` set and today's local fire time is
  ≤ now within the catch-up window, no `reminder_completions` row of any status, not
  module-satisfied.
- One-time fires when active, due today, `due_time` set, no completion; fire time is the later
  of the due time and `snoozed_until` (snooze 1h/3h exists for one-time reminders).
- Claims insert into the ledger with `on conflict do nothing returning`, so overlapping cron
  runs can't both claim a send.

**13.** Ledger `push_sends`: `user_id`, `subscription_id` (cascade), `kind`
(`reminder`/`digest`/`test`), `reminder_id`, `occurrence_date`, `fire_at`, `status`
(`claimed`/`sent`/`failed`), `http_status`, `error`, `attempts`, timestamps;
`unique nulls not distinct (subscription_id, kind, reminder_id, occurrence_date, fire_at)`.
Stuck claims older than 5 minutes re-claimed, up to 3 attempts. 404/410 → delete the
subscription; 429/5xx → `failure_count`++, removed after 5 consecutive failures over ≥ 24h.
Notification tag `reminder:<id>:<date>`.

**14.** Prod: 1 user (Asia/Kolkata), 6 active reminders, all `channel = 'rail'`; 4 have no
time (2 one-time, 2 recurring), so the morning digest is the main path. Proposed
`profiles.digest_time time not null default '09:00'`; digest = that day's untimed open items
(recurring still open + untimed one-time due today or overdue), skipped when empty; deduped as
`kind = 'digest'`, `reminder_id` null, `occurrence_date` = local today.

**15.** Library `jsr:@negrel/webpush@0.5.0` (RFC 8291 + RFC 8292 on Web Crypto, Deno-native;
author's caveat: not reviewed by crypto experts). `npm:web-push@3.6.7` was last published Jan
2024 and relies on Node crypto. VAPID keys generated once with the library's
`generateVapidKeys` / `exportVapidKeys`; secrets `VAPID_KEYS_JWK`, `VAPID_SUBJECT`; public key
in `VITE_VAPID_PUBLIC_KEY`.

**16.** One global switch per device; every active reminder pushes once a device is enabled.
`reminders.channel` stays unread.

## E. iOS constraints (checked against current sources)

- **Install requirement:** push works only for Home Screen web apps, and permission must be
  requested from a direct tap. On iOS 26 any site added to the Home Screen opens as an app by
  default, even without a manifest; the user can untick "Open as Web App".
- **Action buttons don't work:** MDN compat data lists `Notification.actions` as unsupported in
  Safari (iOS mirrors it); Declarative Web Push has no actions. A tap only opens a URL.
- **A push that shows nothing can cost the subscription:** WebKit revokes the subscription
  when a push handler shows no notification; Declarative Web Push (iOS 18.4+) has "no
  penalty". Always send the declarative format and keep a SW handler that parses the same
  JSON.
- **Badging works:** `setAppBadge` / `clearAppBadge` from iOS 16.4, Home Screen apps only;
  settable while handling a push, and the declarative payload has `app_badge`.

## F. Risks

Google sign-in in the installed app; Postgres 15 vs 17 locally; the push library has had no
crypto audit; status-bar text on light grounds; iOS revoking subscriptions; no back button in
the installed app; missed sends if cron stalls past the catch-up window.

## Steps

| Step | Work | Done when |
|---|---|---|
| **P1 Install** | Delete `_redirects`; manifest, icons, favicon, minimal `sw.js` (no fetch handler) registered in production; `vercel.json` headers. | Add to Home Screen shows the icon and name and opens without Safari chrome at `/home`; the SW is active; `curl -I` shows the right types; desktop unchanged. |
| **P1.5 Phone shell** | `nav.ts`, `useReminderDueCount`, `PhoneShell`, `TabBar`, `/more`; compact `TopBar`; safe areas; tooltips off on touch. | 5 tabs, badge matches desktop, nothing under the Dynamic Island or home indicator; desktop screenshots identical. |
| **P2 Subscribe** | Migration `0046_push_subscriptions` (local first, RLS test); VAPID secrets; SW push + click handlers; Settings section; `push-test` function. | Enable → row with a `web.push.apple.com` endpoint; "Send test" arrives on the locked phone and opens `/reminders`; denied handled; sign-out deletes the row. |
| **P3 Dispatch** | Postgres 17 locally; `0047`: extensions, `digest_time`, `push_sends`, `push_claim_due`, cron caller + job; Vault values set by hand; `push-dispatch`. | SQL tests with a fixed clock pass; a reminder 3 minutes ahead arrives once; the 09:00 digest arrives once; an early tick suppresses the push; a 410 prunes the row. |
| **P4 Polish** | Per-module list, Home rail/grid, `TopBar` back, app badge, Google Calendar, `dvh`, intro replay. | Each item checked on the phone. |

## Sources

- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WebKit: Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data)
- [@negrel/webpush on JSR](https://jsr.io/@negrel/webpush)
