# Alfred on phones — implementation brief

Hand this file to Claude Code. It turns the approved phone design into real code, in the
existing app, one phase at a time.

- **Look and behaviour to match:** `docs/mobile/alfred-mobile-prototype.html` (open it in a
  browser) and the "Alfred Mobile" design system
  (https://claude.ai/artifact/CHb3YH9HJMAwc6Gob3CPDd).
- **Golden rule:** desktop must not change. Every visual change lives inside
  `@media (max-width: 760px)` in one new stylesheet, `src/styles/mobile.css`. New components
  that only exist on phones render always and are hidden by CSS above 760px; no JS
  breakpoint checks.
- **Follow `CLAUDE.md`.** Feature folders stay `{api, hooks, types, components}`, routes stay
  thin, no new npm dependencies, no hex colours in components (use the tokens in
  `src/styles/tokens.css`; they already re-derive for all 12 grounds).
- Do one phase per commit. After each phase: `npm run typecheck`, `npm run build`, then
  check it in the browser at 390×844 **and** at desktop width (desktop must look identical
  to `main`).

---

## Phase 0 — groundwork

1. **Viewport.** In `index.html`, change the viewport meta to
   `width=device-width, initial-scale=1, viewport-fit=cover` so safe-area insets work in the
   installed app.
2. **Stylesheet.** Create `src/styles/mobile.css` and import it in `src/main.tsx` **after**
   `base.css`:
   ```ts
   import './styles/tokens.css';
   import './styles/base.css';
   import './styles/mobile.css';
   ```
   Start it with the helpers every later phase uses:
   ```css
   /* Phone layer — everything here is ≤760px only. Desktop never sees it. */
   .phone-only { display: none !important; }
   @media (max-width: 760px) {
     .phone-only { display: revert !important; }
     .desk-only { display: none !important; }
   }
   ```
3. **Icons.** Add these paths to `PATHS` in `src/components/Icon.tsx` (same solid
   woodcut style as the rest):
   ```ts
   plus: 'M10.5 3h3v7.5H21v3h-7.5V21h-3v-7.5H3v-3h7.5Z',
   close: 'M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1-6.4 6.4 6.4 6.4-2.1 2.1-6.4-6.4-6.4 6.4-2.1-2.1 6.4-6.4-6.4-6.4Z',
   search: 'M10 2a8 8 0 0 1 6.32 12.9l5.4 5.4-2.12 2.12-5.4-5.4A8 8 0 1 1 10 2Zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
   more: 'M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
   grid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
   list: 'M3 4.5h3.5V8H3zM9 4.5h12V8H9zM3 10.25h3.5v3.5H3zM9 10.25h12v3.5H9zM3 16h3.5v3.5H3zM9 16h12v3.5H9z',
   ```
4. **Due-count hook.** `Sidebar.tsx` computes the reminders due count inline. Move that into
   `src/features/reminders/hooks.ts` as `useRemindersDueCount()` (same filter: skip
   `completion_status === 'skipped'`, count `due_now` + `overdue`) and use it in the Sidebar,
   so the Dock can share it.

**Done when:** typecheck and build pass; nothing looks different anywhere.

---

## Phase 1 — the dock (side-scrolling bottom bar)

Replaces the sidebar on phones. Every built module sits in one floating row that scrolls
sideways; there is no "More" tab. Settings stays reachable from Home (Phase 3).

1. Create `src/components/Dock.tsx`:
   ```tsx
   import { useEffect, useRef } from 'react';
   import { NavLink, useLocation } from 'react-router-dom';
   import clsx from 'clsx';
   import { Icon, type IconName } from './Icon';
   import { useRemindersDueCount } from '@/features/reminders/hooks';

   // Module index order, same as the sidebar. Add Invest / Health / Travel here only
   // once those modules are built.
   const DOCK: { to: string; label: string; icon: IconName }[] = [
     { to: '/home', label: 'Home', icon: 'home' },
     { to: '/expenses', label: 'Expenses', icon: 'expenses' },
     { to: '/reminders', label: 'Reminders', icon: 'bell' },
     { to: '/work', label: 'Work', icon: 'work' },
     { to: '/goals', label: 'Goals', icon: 'goals' },
     { to: '/design', label: 'Design', icon: 'design' },
     { to: '/secrets', label: 'Secrets', icon: 'secrets' },
   ];

   export function Dock() {
     const { pathname } = useLocation();
     const due = useRemindersDueCount();
     const scroller = useRef<HTMLDivElement>(null);
     const firstPaint = useRef(true);
     const active = DOCK.find((d) => pathname === d.to || pathname.startsWith(`${d.to}/`))?.to;

     // Centre the active item whenever the module changes; leave the owner's own
     // scroll position alone otherwise.
     useEffect(() => {
       const sc = scroller.current;
       const on = sc?.querySelector<HTMLElement>('.dock-item.active');
       if (!sc || !on) return;
       sc.scrollTo({
         left: Math.max(0, on.offsetLeft - (sc.clientWidth - on.offsetWidth) / 2),
         behavior: firstPaint.current ? 'auto' : 'smooth',
       });
       firstPaint.current = false;
     }, [active]);

     return (
       <nav className="dock phone-only" aria-label="Sections">
         <div className="dock-scroll" ref={scroller}>
           {DOCK.map((d) => (
             <NavLink key={d.to} to={d.to} className={({ isActive }) => clsx('dock-item', isActive && 'active')}>
               <Icon name={d.icon} size={20} />
               <span>{d.label}</span>
               {d.icon === 'bell' && due > 0 && (
                 <span className="dock-badge" aria-label={`${due} due now or overdue`}>{due}</span>
               )}
             </NavLink>
           ))}
         </div>
       </nav>
     );
   }
   ```
2. In `AppShell.tsx`, render `<Dock />` right after `<main className="main">…</main>`, inside
   `.app`.
3. Add to `mobile.css` (inside the media query):
   ```css
   @media (max-width: 760px) {
     .app { display: block; }
     .side { display: none; }
     .main { min-height: 100dvh; padding-top: env(safe-area-inset-top, 0px);
             padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }

     .dock {
       position: fixed; left: 10px; right: 10px; z-index: 60;
       bottom: calc(10px + env(safe-area-inset-bottom, 0px));
       background: color-mix(in srgb, var(--surface) 94%, transparent);
       backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
       border: 1px solid var(--line-soft); border-radius: 24px;
       box-shadow: var(--sh-sm); overflow: hidden;
     }
     .dock-scroll {
       position: relative; /* offsetLeft of items is measured against this */
       display: flex; gap: 2px; padding: 6px;
       overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none;
       -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
       mask-image: linear-gradient(90deg, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
     }
     .dock-scroll::-webkit-scrollbar { display: none; }
     .dock-item {
       position: relative; flex: none; scroll-snap-align: center;
       display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
       min-width: 64px; height: 52px; padding: 0 10px; border-radius: 18px;
       color: var(--text-faint); font-size: 11px; font-weight: 600; text-decoration: none;
       transition: background 0.28s cubic-bezier(0.22, 1, 0.36, 1), color 0.13s ease;
     }
     .dock-item.active { flex-direction: row; gap: 8px; padding: 0 16px;
       background: var(--base); color: var(--base-ink); font-size: 14px; font-weight: 700; }
     .dock-item:not(.active):active { background: var(--surface-2); }
     .dock-badge { position: absolute; top: 4px; right: 10px; min-width: 16px; height: 16px; padding: 0 4px;
       border-radius: 100px; background: var(--base); color: var(--base-ink);
       font: 700 9px/16px var(--mono); text-align: center; }
     .dock-item.active .dock-badge { position: static; background: var(--base-ink); color: var(--base); }
   }
   ```

**Done when:** at 390px wide the sidebar is gone and the dock floats at the bottom; about
four and a half items show, the next is cut off at the edge, and you can swipe to Secrets.
Opening any module centres its pill. The Reminders badge matches the old sidebar badge.
Desktop is unchanged.

---

## Phase 2 — quiet headers and bottom sheets

**Header.** On phones `TopBar` loses the bar, the rule, the numbered crumb and the wallet
chip; the title sits on the ground at 28px.

1. Give `TopBar` an optional `phoneAction?: ReactNode` prop, rendered inside `.tr` wrapped
   in `<span className="phone-only">`; wrap the existing `action` + wallet chip in
   `<span className="desk-only">` **only when `phoneAction` is passed**, so pages that don't
   pass it keep their buttons on phones. Pass round icon buttons from the busy pages, e.g.
   Expenses:
   ```tsx
   phoneAction={<>
     <button className="hbtn" onClick={toggle} aria-label={hidden ? 'Show amounts' : 'Hide amounts'}><Icon name="eye" size={18} /></button>
     <button className="hbtn primary" onClick={() => setAddOpen(true)} aria-label="Add transaction"><Icon name="plus" size={18} /></button>
   </>}
   ```
   Do the same for Reminders (New reminder), Work (New project / New task), Goals (New goal),
   Design (New board) and Secrets (Add).
2. CSS:
   ```css
   @media (max-width: 760px) {
     .topbar { position: sticky; top: env(safe-area-inset-top, 0px); padding: 8px 20px 12px;
               background: var(--ground); backdrop-filter: none; border-bottom: 0; flex-wrap: nowrap; }
     .topbar .tl .tlabel { display: none; }
     .topbar .tl h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0; }
     .topbar .tr { gap: 4px; }
     .hbtn { width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent;
             color: var(--text-dim); display: grid; place-items: center; cursor: pointer; }
     .hbtn.primary { background: var(--base); color: var(--base-ink); }
     .wrap { padding: 4px 20px 32px; }
   }
   ```

**Bottom sheets.** Every dialog becomes a sheet on phones; this is CSS only, because every
module already uses `src/components/Dialog.tsx`.
```css
@media (max-width: 760px) {
  .dlg, .dlg.dlg-wide {
    left: 0; right: 0; top: auto; bottom: 0; transform: none; width: 100%;
    max-height: 92dvh; border-radius: 18px 18px 0 0; border-bottom: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    animation: sheet-up 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .dlg::before { content: ''; display: block; width: 36px; height: 5px; border-radius: 5px;
                 background: var(--line); margin: 8px auto 0; }
  .dlg-rule { display: none; }
  .dlg-f { display: grid; grid-template-columns: 1fr 1.4fr; }
  .dlg-f .btn { min-height: 48px; justify-content: center; }
  .dock { visibility: hidden; } /* hidden while any dialog is open — see note */
  body:not(:has(.dlg)) .dock { visibility: visible; }
}
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: none; } }
```
(If `:has()` is unwanted, drop those two `.dock` lines and leave the dock visible; the
overlay already covers it.)

**Touch sizes.** In the same media query: inputs at 16px font (stops iOS zooming on focus),
buttons and inputs at least 44px tall:
```css
@media (max-width: 760px) {
  .input, select.input, textarea.input { font-size: 16px; min-height: 48px; }
  .btn { min-height: 44px; }
  .btn.sm { min-height: 36px; }
}
```

**Done when:** every page shows a quiet header with round icon actions; New reminder, Add
transaction, New goal and the rest all slide up from the bottom; no input zooms the page
on an iPhone.

---

## Phase 3 — Home

The phone Home is: date eyebrow + "Good morning" + the A mark (links to `/settings`) → the
command field → **Next up** (a due line, then a card of up to four reminder rows with tick
boxes) → **At a glance** (four small tiles: Spent, Goals, Work, Design).

- Reuse what exists: `NextUpList` for Next up, the Board tiles' data from `useHomeBoard()`
  for At a glance, and the Rail's command input for the field. Build a small
  `src/components/home/PhoneHome.tsx` that composes them, render it inside `HomePage`
  wrapped in `.phone-only`, and wrap the existing `.home` grid in `.desk-only`. Keep the
  keyboard shortcuts as they are; they're harmless on phones.
- At a glance tiles keep the module colour as the 3px left edge and icon chip only (never a
  fill), at a compact size: 12px 14px padding, 24px figure, 12px caption.
- On phones only, Home's `TopBar` is replaced by the greeting row, so pass nothing to it
  inside `.phone-only`, or hide `.home-page .topbar` there.

**Done when:** Home at 390px matches the prototype's Home; ticking a reminder there updates
the dock badge; the A mark opens Settings.

---

## Phase 4 — Expenses (including the list ⇄ cards toggle)

Target order on phones: compact month switcher → **hero figure** → **accounts row** (opens
the wallet) → **Where it went** with the Out / In / All switch **and the view toggle** →
**section links**.

1. **Hero.** In `MonthDashboard.tsx`, add a `.phone-only` block at the top of
   `.dash-layout` that shows: an eyebrow "Spent this month", the spend figure at 40px/900
   (`AnimatedNumber`, `money(c, true)`), the existing comparison line (colour only the
   arrow and %: `--neg` when up, `--pos` when down), then three plain label/value pairs:
   Income (in `--pos`, masked by `usePrivacy().hidden`), Left over (income − spend, masked
   the same way), Transfers. Wrap the existing three `.sumcard`s, `BurnCurve` and
   `BucketBar` in `.desk-only`. (BurnCurve and BucketBar can come back later behind
   Insights; they're too much for the first screen on a phone.)
2. **Accounts row.** On phones the `AccountsWallet` starts collapsed. Add a `.phone-only`
   button: three overlapping 18px dots in the wallet's account colours, "ACROSS N ACCOUNTS"
   eyebrow, the total (masked by `walletHidden`), and a chevron; tapping toggles a
   `walletOpen` state that shows `<AccountsWallet />` below it. On desktop the wallet
   renders as today.
3. **Category view toggle.** Create
   `src/features/expenses/CategoryViewToggle.tsx` and `CategoryList.tsx`:
   ```tsx
   // CategoryViewToggle.tsx
   import { Icon } from '@/components/Icon';
   export type CategoryView = 'list' | 'cards';
   const KEY = 'alfred-expenses-category-view';
   export function readCategoryView(): CategoryView {
     try { return localStorage.getItem(KEY) === 'cards' ? 'cards' : 'list'; } catch { return 'list'; }
   }
   export function CategoryViewToggle({ value, onChange }: { value: CategoryView; onChange: (v: CategoryView) => void }) {
     const set = (v: CategoryView) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } onChange(v); };
     return (
       <div className="viewtoggle" role="group" aria-label="Category view">
         <button type="button" className={value === 'list' ? 'on' : ''} aria-pressed={value === 'list'} aria-label="Simple list" onClick={() => set('list')}><Icon name="list" size={14} /></button>
         <button type="button" className={value === 'cards' ? 'on' : ''} aria-pressed={value === 'cards'} aria-label="Category cards" onClick={() => set('cards')}><Icon name="grid" size={14} /></button>
       </div>
     );
   }
   ```
   ```tsx
   // CategoryList.tsx — the simple view: dot, name + entries, amount, share bar.
   import type { Category } from './categories';
   import { money } from '@/lib/format';
   import { MASK } from './privacy';
   export function CategoryList({ rows, hidden, onOpen }: {
     rows: { cat: Category; cents: number; count: number }[];
     hidden: boolean;
     onOpen: (cat: Category) => void;
   }) {
     const top = rows[0]?.cents || 1;
     return (
       <div className="catlist">
         {rows.map(({ cat, cents, count }) => (
           <button key={`${cat.direction}:${cat.slug}`} type="button" className="catrow"
             style={{ ['--cat' as string]: cat.color }} onClick={() => onOpen(cat)}>
             <span className="cdot" />
             <span className="cname">{cat.label}<small>{count}</small></span>
             <span className="camt">{cat.direction === 'credit' && hidden ? MASK : money(cents, true)}</span>
             <span className="cbar"><i style={{ width: `${(cents / top) * 100}%` }} /></span>
           </button>
         ))}
       </div>
     );
   }
   ```
   In `MonthDashboard`, keep `view` in state (`useState(readCategoryView)`). On phones,
   render a section header ("Where it went" / "Where it came from" / "Everything" by flow)
   with the existing `FlowToggle` (restyled small, below) and `CategoryViewToggle`, then
   either `<CategoryList rows={activeCards} …/>` or the existing `CategoryCard` grid
   (two per row). Show the top 5 rows (list) or 6 cards, then a "Show all N" text button.
   Both views use the same `openCategory`. On desktop leave the current grid exactly as is;
   the toggle is phone-only for now. If the owner wants it on desktop later, the same
   component drops into `.expenses-head`.
4. **Section links.** On phones hide `.expenses-head-nav` and the Add category button in
   `.expenses-head`, and render at the bottom of the page a `.links` list of rows:
   Transactions (count), Review queue (brass badge with the queue total), Insights,
   Family & shops, Add a category. Each row is a `Link` (keep `search: location.search` like
   today's buttons) with a chevron.
5. **Month switcher.** On phones `MonthNav` shrinks to `‹ October 2026 ›` in 14px/700
   `--text-dim`, 32px chevron buttons, left-aligned above the hero.
6. CSS for this phase (inside the media query):
   ```css
   .hero { display: flex; flex-direction: column; gap: 4px; }
   .hero-v { font-weight: 900; font-size: 40px; letter-spacing: -0.035em; line-height: 1; font-variant-numeric: tabular-nums; }
   .hero-s { font-size: 13px; color: var(--text-dim); }
   .hero-s .up { color: var(--neg); } .hero-s .down { color: var(--pos); }
   .pairs { display: flex; gap: 28px; margin-top: 14px; }
   .pair { display: flex; flex-direction: column; gap: 2px; }
   .pair b { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
   .pair b.in { color: var(--pos); }

   .acctbar { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px;
              background: var(--surface); border: 1px solid var(--line-soft); border-radius: 15px;
              color: inherit; font: inherit; text-align: left; cursor: pointer; }
   .acct-dots { display: flex; }
   .acct-dots i { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--surface); margin-left: -7px; }
   .acct-dots i:first-child { margin-left: 0; }
   /* the three account colours already live in base.css's .wallet .acct.a1/a2/a3 —
      lift them into tokens.css as --acct-1..3 rather than repeating hexes here */

   .catlist { display: flex; flex-direction: column; }
   .catrow { display: grid; grid-template-columns: 10px 1fr auto; gap: 4px 12px; align-items: center;
             padding: 12px 0; border: 0; border-bottom: 1px solid var(--line-soft); background: none;
             width: 100%; text-align: left; color: inherit; font: inherit; cursor: pointer; }
   .catrow:last-child { border-bottom: 0; }
   .catrow .cdot { width: 10px; height: 10px; border-radius: 50%; background: var(--cat); }
   .catrow .cname { font-size: 15px; font-weight: 600; }
   .catrow .cname small { font-family: var(--mono); font-size: 11px; font-weight: 400; color: var(--text-faint); margin-left: 6px; }
   .catrow .camt { font-weight: 800; font-size: 15px; font-variant-numeric: tabular-nums; }
   .catrow .cbar { grid-column: 2 / -1; height: 3px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
   .catrow .cbar i { display: block; height: 100%; background: var(--cat); border-radius: 3px; }
   .catgrid { grid-template-columns: 1fr 1fr; gap: 12px; }
   .catcard { min-height: 168px; }
   .catcard:hover { transform: none; } /* no hover lift on touch */

   .viewtoggle { display: flex; border: 1px solid var(--line-soft); border-radius: 100px; padding: 2px; }
   .viewtoggle button { width: 30px; height: 28px; border-radius: 100px; border: 0; background: none;
                        color: var(--text-faint); display: grid; place-items: center; cursor: pointer; }
   .viewtoggle button.on { background: var(--surface-2); color: var(--text); }

   .links { display: flex; flex-direction: column; border-top: 1px solid var(--line-soft); }
   .linkrow { display: flex; align-items: center; gap: 12px; min-height: 52px; border-bottom: 1px solid var(--line-soft);
              color: var(--text); font-size: 15px; font-weight: 600; text-decoration: none; }
   .linkrow .grow { flex: 1; }
   .linkrow .sub { font-family: var(--mono); font-size: 12px; font-weight: 400; color: var(--text-faint); }
   ```

**Done when:** Expenses at 390px matches the prototype; the toggle switches between the list
and the web's category cards, survives a reload, and both views open the same category
transactions; hiding amounts masks income in both views; desktop Expenses is pixel-identical
to `main`.

---

## Phase 5 — the other modules (mostly CSS)

- **Reminders.** Replace the two `StatStrip` cards on phones with one header meta line:
  "1 of 5 done today · 12d best streak" (streak part in `--c-ochre`); wrap `StatStrip` in
  `.desk-only`. Hide the keyboard hint row (`N new · X tick`) on phones. On phones, tapping
  the row body opens the row's existing menu (Edit / Skip / Pause / Archive) instead of a
  ⋯ button; hide the ⋯ button there. Rows get a 60px minimum height and a 44px tick target
  (already 44px in `.rem-tick`).
- **Work.** Freelance: replace the earnings cards with the same hero pattern ("Waiting to be
  paid" figure, overdue count in `--neg`, then "Paid this FY" and "Active" pairs) and move
  the Invoices button into a `.links` row. Project cards go full width, one per row.
  Office: the calendar grid becomes a 7-day week strip on phones; Schedule / Due / Done /
  Journal / Notes stay as stacked cards.
- **Goals.** Already list-shaped. On phones: 20px gutters, 15px titles, the expanded row's
  actions wrap; Abandon stays the only red button.
- **Design.** Medium chips scroll sideways in one row; the board grid is three per row; the
  item grid is two-column masonry; the hover overlay on `ItemCard` is always visible (no
  hover on touch); right-click "Also show in" becomes long-press (or a visible `+` on the
  card) opening the same `BoardPicker`.
- **Secrets.** Keep `SecretGate`'s logic; on phones lay the PIN entry out as dots and a 3×4
  keypad of 72px round keys. Don't add Face ID yet; that needs WebAuthn work in its own
  phase.
- **Everywhere.** Cards and lists use `--line-soft` borders on phones (`line` stays on
  inputs). Remove hover lifts under `(hover: none)`. Respect `prefers-reduced-motion`.

---

## Phase 6 — wrap up

- Update `CLAUDE.md`: add `src/styles/mobile.css` and `Dock.tsx` to Layout; add a Conventions
  bullet: "Phone layout lives in `mobile.css` under `@media (max-width: 760px)`; phone-only /
  desktop-only markup uses `.phone-only` / `.desk-only`; desktop must not change."
- Test on a real iPhone through the installed home-screen app: safe areas (notch, home bar),
  dock never covering the last row of a list, sheets above the keyboard, no page zoom on
  focus, all 12 grounds including the four light ones.

## Not in scope

Invest, Health and Travel stay out of the dock until they're built. Push notifications,
Face ID for Secrets, swipe-to-tick and pull-to-refresh are later phases.
