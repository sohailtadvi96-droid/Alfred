# ALFRED — MVP Specification

**App:** ALFRED — a single-user "personal butler" web app.
**MVP modules:** Expenses · Secrets · Work (Freelance tab only)
**Deferred:** Investment, Health, Entertainment, suggestions engine, chatbot.
**Post-MVP, shipped:** Office work (Phase 5), Design inspiration library (Phase 6).

## Locked decisions

| Decision | Choice |
|---|---|
| MVP scope | Expenses + Secrets + Freelance |
| Expense input | Modular ingestion pipeline; **Gmail adapter** is the only one built for MVP |
| Secrets encryption | Server-side (Supabase pgcrypto + key in Vault), biometric gate on reveal |
| Aesthetic | Refined & dark, "butler" elegance |

## Tech stack

- React 18 + Vite + TypeScript
- Tailwind CSS + Radix primitives (dialog, dropdown, tooltip, toast)
- TanStack Query + `@supabase/supabase-js`
- React Router
- Supabase: Postgres + Row Level Security + Edge Functions + `pg_cron`
- Deploy: Vercel (frontend), Supabase Cloud (backend)
- Single user: Supabase Auth email + password; every table RLS-scoped to that one `user_id`.

### Authentication (Phase 1)
- **Login screen** is the entry point — nothing in the app renders without a session.
- Email + password via Supabase Auth. Sign-up disabled after the first account (single user).
- Session persisted; "remember me"; sign-out in the top bar.
- The Secrets biometric gate is **separate** from login — an in-app re-auth on top of an already-authenticated session.

### Personalisation (Phase 1)
- **Owner-swappable background.** `data-ground` on `:root` selects a preset; each redefines the whole neutral set — `--ground`, the `--text` / `--text-dim` / `--text-faint` ramp, `--surface`, `--surface-2`, `--line`, `--base` accent, `--cut` (icon shadow) and shadow weight — so contrast holds on light or dark.
- **12 shipped presets**, extensible (append to the map): Ink, Slate, Char, Pine, Navy, Dusk, Oxblood, Espresso (dark) · Parchment, Linen, Fog, Oat (light). Picker shows each as a live preview tile (real background + `Aa` text colour + accent dot) with a hover tooltip of hex values.
- Custom hex allowed: build computes the `--text` ramp from the chosen background's relative luminance (WCAG), flipping dark/light and generating the dim/faint steps.
- Stored on the Supabase `profile` row; mirrored to `localStorage` for instant first paint (before React mounts).
- Fixed regardless of ground: the bento card-fill set (rust/ochre/sage/slate/clay/plum) and the semantic trio (positive/negative/in-progress).
- Sidebar collapse state also persisted (localStorage).

### Tooltips (Phase 1)
- Any element whose surface omits detail carries a tooltip. Built on **Radix Tooltip** — 300 ms open delay, dismiss on `Esc` / scroll, long-press on touch, every trigger focusable.
- Standard placements: above (default), below, right, and a wrapping `wide` variant. Content is short, specific, in ALFRED's voice.
- Applied across: sidebar items (labels when collapsed, module summaries when expanded), wallet account roles, card corner-index / meters / status glyphs, invoice number, seal, disabled buttons (why they're disabled).

### Load choreography (Phase 1)
- **First load per session:** a hero holds ~1s (wordmark draws in, accent line wipes), then **submerges** (translateY +46px, scale .955, blur 6px, opacity→0) as the bento cards **rise** in a 70 ms stagger (`cubic-bezier(.22,1,.36,1)`). ≈1.9s total.
- Runs once per session (`sessionStorage` flag); **replayable** from Settings.
- `prefers-reduced-motion`: skip the hero entirely, cards appear seated (no transform), 0 delay.
- Ground + hero must paint pre-hydration (inline critical CSS + stored ground) so there is no flash or layout shift.

---

## Module 1 — Expenses

### Ingestion architecture (modular by design)

Ingestion is decoupled so the source can be swapped or extended without touching the rest of Expenses:

```
Source adapter  →  NormalizedTxn[]  →  ingest_transactions() RPC  →  dedupe  →  categorize  →  transactions
```

- **Adapter contract:** every source implements `parse(input) -> NormalizedTxn[]`, where
  `NormalizedTxn = { occurred_at, amount_cents, currency, direction, merchant_raw, account_hint, external_ref, raw_snippet }`.
- **Idempotency:** `transactions.source_type` + `transactions.source_ref` (= adapter's `external_ref`) carry a `UNIQUE` constraint, so re-runs never double-insert.
- **Categorization & the rest of Expenses only ever read `merchant_raw` / `direction`** — they don't know or care which adapter produced the row.
- **MVP builds one adapter: `gmail`.** Future adapters (`statement` = PDF/CSV bank-statement upload, `aa` = account-aggregator / Setu / Finvu, `sms`) drop in against the same contract and RPC with no schema change. `manual` entries use `source_type = 'manual'`, `source_ref = null`.

### Features
- **Transaction list** — filter by date range, category, direction (debit/credit), account. Inline edit / recategorize.
- **Gmail auto-ingest** — `pg_cron` triggers the `ingest-gmail` Edge Function every 15 min. It queries Gmail for bank-alert senders, parses each new mail into `NormalizedTxn[]`, and calls `ingest_transactions()`. De-duped by Gmail message ID (`source_ref`).
- **Manual add** transaction.
- **Recategorize** — changing a transaction's category offers "always categorize *<merchant>* as X" → writes a `category_rules` row and back-applies.
- **Dashboard** — current-month spend, by-category breakdown, month-over-month delta, recent activity.

### Categories
- **Debit:** `online_shopping`, `dineout`, `grocery`, `alcohol`, `person`, `ticket_booking`, `misc`
- **Credit:** `person`, `refund`

### Seed rules (from the doc)
- online_shopping ← hnm, zara, uniqlo, myntra, amazon, "web purchase"
- dineout ← restaurant, bar, hotel, villa, stay
- grocery ← swiggy, instamart, blinkit, zepto, zomato, district
- alcohol ← wine shop, beer shop
- ticket_booking ← bookmyshow, bms, district
- credit / refund ← "refunded", "reversal"
- everything else → misc (debit) / person (credit)

### Data model
- `accounts` (id, name, type, last4, created_at)
- `ingestion_sources` (id, type [`gmail`|`statement`|`aa`|`sms`], name, config jsonb, status, last_run_at, created_at)
- `transactions` (id, occurred_at, amount_cents, currency, direction, merchant_raw, merchant_normalized, category, account_id, source_type [`gmail`|`statement`|`aa`|`sms`|`manual`], source_ref text NULLABLE, raw_snippet, note, created_at, updated_at) — `UNIQUE (source_type, source_ref)`
- `category_rules` (id, match_type [`contains`|`equals`|`regex`], pattern, direction, category, priority, created_at)
- `gmail_sync_state` (id, last_history_id, last_synced_at)

### Out of scope (MVP)
Building the `statement` / `aa` / `sms` adapters (architecture supports them; not implemented), currency conversion, budgets & alerts, receipt attachments, transaction splitting.

---

## Module 2 — Secrets

### Features
- **Vault list** — app label, username, secret (masked `••••`), URL, tags, notes. Search by label.
- **Add / edit / delete** entry.
- **Reveal & copy gated by biometric** — WebAuthn platform authenticator (Touch ID). Fallback: master PIN. Gate produces a short-lived session token that authorizes the decrypt Edge Function.
- **Encryption at rest** — `pgcrypto` symmetric encryption; key held in Supabase Vault. Ciphertext never leaves the DB except through the decrypt function.
- **Safety** — revealed value auto-hides after ~20s; clipboard cleared after ~30s; every reveal/copy logged.
- **Password generator** — length + character-class options.

### Data model
- `secrets` (id, label, username, secret_ciphertext, url, notes_ciphertext, tags text[], created_at, updated_at, last_revealed_at)
- `webauthn_credentials` (id, credential_id, public_key, counter, created_at)
- `secret_access_log` (id, secret_id, action [`reveal`|`copy`], at)

### Out of scope (MVP)
TOTP/2FA code storage, breach check, import from other managers, sharing, browser extension.

---

## Module 3 — Work / Freelance

*(The "Office work" tab — a journal calendar landing → per-day pages with
schedule, tasks, a journal entry and notes, plus optional read-only Google
Calendar sync — shipped in Phase 5.)*

### Features
- **Project list** with status: `prospective`, `active`, `delivered`, `closed`, `on_hold`.
- **Project detail:**
  - Description, client, rate (`hourly` or `fixed`), currency, start / target-delivery dates.
  - **Assets required** — checklist (label, provided?, note).
  - **Deliverables** — label, status (`pending`/`delivered`), due date, delivered date.
  - **Time entries** — date, hours, note → running total.
  - **Earnings summary** — hourly: `hours × rate`; fixed: `fixed_amount`. Shows effective hourly = earned ÷ hours.
  - **Invoices** for the project.
- **Invoices:**
  - Generate from a project — line items (description, qty, unit price), flat tax field, notes, client billing block.
  - **Auto number** `ALF-YYYY-####`, sequential and tracked via `invoice_counters`.
  - Status: `draft`, `sent`, `paid`, `overdue`.
  - **PDF export** (client-side, print-styled).
  - Global invoice list across all projects — number, client, amount, status.

### Data model
- `clients` (id, name, email, billing_address, created_at)
- `projects` (id, name, client_id, description, status, rate_type, rate_cents, fixed_amount_cents, currency, started_on, target_delivery_on, created_at, updated_at)
- `project_assets` (id, project_id, label, provided bool, note)
- `deliverables` (id, project_id, label, status, due_date, delivered_at, note)
- `time_entries` (id, project_id, entry_date, hours numeric, note)
- `invoices` (id, invoice_number UNIQUE, project_id, client_id, issue_date, due_date, status, currency, subtotal_cents, tax_cents, total_cents, notes, created_at)
- `invoice_line_items` (id, invoice_id, description, quantity, unit_price_cents, amount_cents, position)
- `invoice_counters` (year PK, last_seq)

### Out of scope (MVP)
Recurring invoices, payment-gateway integration, contracts / e-sign, per-project expenses, multi-user.

---

## Module 4 — Design (inspiration library)

A private swipe file for visual references. **URLs only — no file uploads.**

### Features
- **Boards** — named moodboards (name + optional description). Overview is a card grid;
  each card shows a mosaic cover from its four most recent images and a reference count.
- **References** — captured by **image URL**, with an optional **source link** back to the
  page it came from, an optional title and note, and free-form **tags**. `source` (the
  link's hostname) is derived on save for the little chip.
- **Tags cross-cut every board.** On a board (or the "All references" view) a tag bar shows
  each tag with its count; selecting tags filters the grid (match-any). Clicking a tag on a
  card adds it to the filter.
- **All references** — one pseudo-board (`/design/all`) that pools every item across boards.
- Item grid is a CSS-columns masonry; broken image URLs show an inline "didn't load" tile.
- Add/edit reference dialog has a live image preview and a board picker (so an item can be
  moved between boards on edit).

### Data model
- `design_boards` (id, name, description, created_at, updated_at)
- `design_items` (id, board_id → boards **on delete cascade**, title, image_url, link_url,
  source, note, tags text[], created_at, updated_at) — GIN index on `tags`

### Routes
`/design` (boards overview), `/design/:boardId` (a board; `:boardId = all` is the pooled view).

### Out of scope (for now)
File/Storage uploads, drag-to-reorder, board covers you pick by hand, palette/font extraction,
scraping a pasted page URL for its preview image, sharing.

---

## App shell (MVP)
- Left nav: **Expenses · Secrets · Work**. Top bar with page title + primary action.
- Dark theme only.
- No suggestions engine, no chatbot.

## Build phases
1. ✅ Scaffold + Supabase schema + login/auth + app shell + design system
2. Expenses
   - ✅ **2a** — manual entry, month dashboard (bento), ledger with recategorise + standing rules, accounts wallet (`account_balances` view, migration 0006)
   - **2b** — `gmail` adapter: Edge Function parsing bank-alert emails → `ingest_transactions('gmail', …)`, `pg_cron` schedule, Google OAuth setup
3. Secrets
   - ✅ **3a** — vault list + search, add/edit/delete against `secret_upsert`, gated reveal/copy (`secret_reveal`) with ~20s auto-hide + ~30s clipboard clear, password generator, access log. Reveal gate is client-side for now: platform-authenticator (Touch ID) via WebAuthn or a per-device master PIN.
   - **3b** — decrypt Edge Function with server-verified WebAuthn challenges against `webauthn_credentials`, issuing the short-lived token the gate is meant to produce.
4. Freelance (projects → deliverables/assets/time → invoices → PDF)
   - ✅ **4a** — Work page with Freelance / Office-work category toggle; project list + detail; project form with inline client create; assets checklist, deliverables (with due/overdue), time log + running total, earnings summary (effective hourly). Routes `/work`, `/work/:projectId`.
   - ✅ **4b** — invoice builder (dialog, dynamic line items, flat tax, notes) from a project or blank; `ALF-YYYY-####` via `next_invoice_number()` on create; status draft/sent/paid/overdue (sent + past-due reads as overdue); per-project + global invoice lists; print-styled invoice document (`@media print`) with client billing block. Routes `/work/invoices`, `/work/invoices/:invoiceId`.
   - ✅ **4c** — per-project **Client brief** box (edit-in-place, `projects.brief`, migration 0008); Edit + PDF actions on invoice list rows (`?print=1` deep-link auto-opens the print dialog); print names the file after the invoice number.
5. Office work (Work module, second tab) — migrations 0009 (`office_tasks`, `office_events`, `office_notes`), 0010 (`office_notes.entry_date`, `office_journal`)
   - ✅ Journal calendar as the landing: a Monday-first month grid with per-day dots (meeting / task due / note / journal), month + Today nav, plus a running **Quick notes** panel (undated, pin/archive) and the Google-sync strip.
   - ✅ Per-day page `/work/day/:date` — Schedule (local meetings + that day's Google events, add/edit local), Due (tasks with that due date, add pre-dated), Journal (one free-text entry per day, autosaves on blur), Notes (short notes filed to that date). Prev/next-day nav.
   - ✅ Optional Google Calendar read-only sync via GIS token client (`VITE_GOOGLE_CLIENT_ID`); events merged into calendar dots + the day schedule, never stored. Degrades to a setup note when unconfigured.
6. Design — inspiration library (migration 0011: `design_boards`, `design_items`)
   - ✅ Boards overview (`/design`) — card grid with mosaic covers + reference counts, new/edit-board dialog, "All references" pooled link.
   - ✅ Board page (`/design/:boardId`, `all` = pooled) — CSS-columns masonry of reference cards (image URL, optional source link / title / note, tags), tag-bar filter (match-any, counts), add/edit/remove reference, edit/delete board. Add dialog has a live image preview and a board picker.
