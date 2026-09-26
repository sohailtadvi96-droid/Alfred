# ALFRED

A personal "butler for one" app — private, single/few-user, self-hosted-feeling. Not a
multi-tenant SaaS product; every table is scoped by `user_id` + RLS, but there's no
concept of teams/orgs/sharing.

## Stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind (design tokens as CSS custom
  properties, see `src/styles/tokens.css`), Radix UI primitives, TanStack Query,
  React Router, `@dnd-kit` for drag-and-drop.
- **Backend:** Supabase — Postgres + Auth + Row Level Security + Edge Functions
  (no separate app server; the client talks to Supabase directly via `src/lib/supabase.ts`).
- **Schema management:** raw SQL migrations in `supabase/migrations/`, applied via the
  Supabase CLI. **Migrations are immutable once pushed** — never edit a shipped file;
  always add a new `NNNN_name.sql`. Filenames are zero-padded sequence numbers, applied
  in order.
- **Edge Functions** (`supabase/functions/`): `categorise-ai` (Claude Haiku 4.5
  second opinion on payees the rule engine can't place — see "Expenses engine" → AI sweep; at most
  40 items per call, and its answer allow-list excludes the structural categories and `my_ferrari`;
  the system prompt tells the model the bank truncates names and VPAs; answers are validated
  against the allow-list server-side; `503 {error:'not configured'}` when the key is missing,
  `502 {error:'anthropic <status>', detail}` when the upstream call fails); for the Design module, `design-search` (image search proxy),
  `design-capture` (creates a `design_items` row and hands off to `design-ingest`; home
  board = explicit `board_id`, else the inbox. An explicit `medium` with no `board_id`
  additionally *cross-lists* the item into the existing board of that name
  (case-insensitive) via a `design_item_boards` row — capture-time only, never after ingest
  classifies it, never auto-creates a board, a failed link is logged not surfaced),
  `design-ingest` (resolves/caches media, parses dimensions, runs AI enrichment —
  service-role only, invoked via `EdgeRuntime.waitUntil`, never awaited by the caller),
  `design-retry` (re-invokes `design-ingest` for one item under the caller's own JWT),
  `design-backfill-dimensions` (manual-only sweep, caller's own JWT throughout — see
  Design schema section). API keys live server-side as Supabase secrets, never in the
  client `.env`.
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional
  `VITE_GOOGLE_CLIENT_ID` (Google Calendar read-only sync in Work/Office). App still
  boots without `.env` and shows a "not configured" login screen.
- **Deploy:** Vercel (`vercel.json`, `.vercel/`).

## Layout

```
src/
  auth/        AuthProvider, RequireAuth, LoginPage
  theme/       grounds.ts (12 background presets), ThemeProvider
  components/  AppShell, Sidebar, TopBar, GroundPicker, Tooltip, Icon, home/ (Board/Rail)
  routes/      router.tsx + one page per module (one file per feature screen)
  features/    one folder per module: {api.ts, hooks.ts, types.ts, *.tsx components}
  lib/         supabase client, TanStack queryClient, color/format/error helpers
  styles/      tokens.css (grounds/design tokens), base.css (shell + components)
supabase/
  migrations/  0001 … 0039, sequential, immutable once pushed
  functions/   categorise-ai, design-search, design-capture, design-ingest, design-retry,
               design-backfill-dimensions (+ _shared/: cors.ts, imageDimensions.ts)
docs/          MVP.md (spec), DEPLOY.md
```

Each feature module under `src/features/<name>/` follows the same shape: `api.ts`
(Supabase queries/RPC calls), `hooks.ts` (TanStack Query wrappers), `types.ts`, plus
presentational components. Routes in `src/routes/` are thin — they compose feature
components, not business logic.

## Modules (status)

| Module | Route(s) | Migration(s) | Status |
|---|---|---|---|
| **Expenses** | `ExpensesPage`, `TransactionsPage`, `ReviewPage`, `PeoplePage`, `InsightsPage` | 0002, 0005–0007, 0012–0015, 0017–0028 | Shipped, actively evolving |
| **Secrets** (password/vault) | `SecretsPage` | 0003 | Shipped |
| **Work** (freelance: clients/projects/invoices) | `WorkPage`, `ProjectDetailPage`, `InvoicesPage`, `InvoiceViewPage` | 0004, 0008 | Shipped |
| **Office** (tasks/calendar/journal) | `OfficeDayPage` | 0009, 0010 | Shipped |
| **Design** (inspiration boards) | `DesignPage`, `DesignBoardPage`, `DesignDiscoverPage` | 0011, 0029–0032, 0036, 0037 | Shipped; Discover is parked (route and `DiscoverView` kept, no nav link to it) |
| **Goals** | `GoalsPage` | 0016, 0033–0035, 0038, 0039 | Shipped. `NewGoalDialog` creates `manual` and `savings_target` goals (a "Tracking" control; savings is fixed to type `value`, cadence `monthly`, direction `up`, unit ₹, no deadline). Computed progress exists server-side (`goal_current_value`, `goal_pace`, cadence periods) for `journal_streak` / `tasks_completed` sources fed from Office — still seeded, nothing creates them from the UI — and `savings_target`, income minus spend from `transaction_flows` (0038), whose expanded `GoalRow` renders the `savings_plan` coach RPC (0039) via `SavingsPlan.tsx` / `savingsPlanView.ts`. No goal reads Work / Design data yet |
| **Home** (Board/Rail dashboard) | `HomePage` | — (reads across modules, no own tables) | Shipped |

## Expenses engine (client-side categorisation)

Statements are categorised **in the browser**, not by SQL: the PDF/CSV is parsed on-device,
`categorize.ts` classifies each row, and only the result goes to Supabase (statement rows
arrive pre-categorised). Re-runs page rows down, re-classify, and patch them back. Files, all
under `src/features/expenses/`:

- `categorize.ts` — the pure engine (`normalize` → `classify`). No I/O; its one import is
  `taxonomy.ts`, a static engine-name → slug table (the engine speaks category *names*, the
  database stores *slugs*).
- `engineImport.ts` — parser ⇄ engine bridge: `buildEngineRows` (import), `recategoriseStored`
  (re-runs), `buildEntityCategoryMaps`, `buildExpenseCategories`.
- `api.ts` — `loadEngineLists` and everything that reads or writes on the engine's behalf.
- `recategoriseSummary.ts` (status-line wording), `entityCategories.ts` (which categories may be
  an entity's default).

**Tier order — first match wins** (`matched_by` in brackets; confidence is high unless noted):

0. **pin** (`override`) — a `merchant_rules` row for the VPA or the upper-cased counterparty; applies at any amount and in either direction.
1. **structural** (`channel`) — ATM, fees, interest, the salary credit.
2. **Ferrari** (`ferrari`) — VPA in `ferrariShops` **and** a debit of ≤ ₹220 that is a multiple of 20 (or 25 / 33 / 53).
3. **family** (`family`) — VPA in `familyVpas`; a debit is Family, a credit is Income.
3b. **entity default** (`entity`) — `entities.default_category`, found by VPA key, then by upper-cased name key.
4. **brand** (`brand`) — the `RULES` regexes.
5. **your UPI remark** (`remark`) — `REMARK_RULES`, on the remark alone.
6. **merchant QR** (`qr`, medium) — VPA shapes matching `MERCHANT_QR`: ≤ ₹300 Daily Spends, else Local Merchant. Then a card row is `card` (low, Card — Unclassified).
7. **person-to-person** (`p2p`, medium) — has a VPA: Person Transactions / Money Received. Anything left is `none` (low, Uncategorised).

The **credit guard** (see Conventions) then runs over whatever tier won and may suffix it, so
`matched_by` is one of `override channel ferrari family entity brand remark qr card p2p none`,
optionally followed by `:credit`. The review queue is every row below high confidence.

**Writing rules** (`RULES`, `REMARK_RULES`, `MERCHANT_QR`):

- `RULES` are tested against `hay` = `` `${vpa} ${counterparty}` `` (lower-cased) — **two fields
  joined**. `^` anchors to the start of the *VPA*, so it can never match a brand in the payee
  field, and on card rows (empty VPA) `hay` starts with a space so it never matches at all. Use
  `(^|\s)word`. `$` is safe: `hay` ends where the counterparty ends.
- The bank cuts the **payee name to 10 characters, the VPA to 14 and the UPI remark to 10**, so a
  brand at the end of a longer name arrives mid-word ("Dimple Win", "Delhi Metr"). Match a word
  prefix (`namma ?yatr`, `prime ?vid`) or the cut form at the end (`\bwin$`), and make a
  multi-word separator optional (`indian ?oil` — the payee has the space, the VPA doesn't).
- `REMARK_RULES` run on the remark alone (one field, so `^` is valid there) and need the same
  prefix discipline. `MERCHANT_QR` is tested against `f.vpa` directly; its anchors are correct.
- The `categorise-ai` prompt teaches the model the same truncation rule.

**`Lists`** is what `classify` is given: `familyVpas` and `ferrariShops` (the `vpa_prefix` keys of
`is_family` / `is_ferrari` entities), `overrides` (`merchant_rules`), `entityCategoryByVpa` /
`entityCategoryByName` (entity default categories; name keys upper-cased; keys in state
`needs_review` or `separated` skipped), and `expenseCategories` (credit guard).
`loadEngineLists` **throws** if any read fails — it never returns empty or partial lists. Callers
write whatever the engine says, so empty lists (no pins, no family, no entity defaults) would
silently re-categorise everything. Every read in it is paged. Callers load the lists *before*
they write (`pinMerchant`, `commitVpaTag`, and `runAiFallback` once per run, before the first
paid call), so a failure leaves nothing half-saved.

**Re-runs.** `recategoriseStored` skips a row only when **all seven** fields the engine writes
already match — `category`, `confidence`, `matched_by`, `channel`, `counterparty`, `vpa_prefix`,
`remark` (DB null == engine ''). A re-run reports `{ moved, refreshed, unwritten }`: **moved** =
written and the category changed; **refreshed** = written, same category, other fields had
drifted (a stale `medium` keeps a row in the review queue); **unwritten** = the engine meant to
write it and the database didn't accept it. An update that matches no row (RLS, a row deleted
mid-run) succeeds with zero rows and no error, so the counts come from `.select('id')` on the
update, never from `updates.length`. A dry run writes nothing and reports what would be written.
**Where it runs:** recategorise-all is the "Re-run categorisation rules" button in the Import
Statement dialog (`useRecategorizeAll`) — browser only, under your session, never scheduled.
Per-payee re-runs happen on pin, resolve and retag. The SQL `recategorize_all()` /
`categorize()` are the older server-side path: `api.recategorizeAll` wraps the RPC but nothing
calls it.

**AI sweep** (Review queue → "Ask AI to sort", `runAiFallback`). Candidates are the queue's rows
grouped by payee key, **minus two exclusions**: keys already pinned in `merchant_rules`, and any
key attached to an entity — a VPA that is a `vpa_prefix` key or a payee name that is a
`merchant_name` / `counterparty` key, checked per row — so an explicitly resolved payee is never
re-decided by the model (without this, un-pinning a payee re-exposed it and the model re-pinned
it). Ordered by the key's total transaction value (low confidence breaks ties), read once, sent in
calls of 40 (`AI_CALL_SIZE`, the function's `MAX_ITEMS`) up to 400 merchants per click
(`AI_SWEEP_CAP`); above 100 the UI asks first ("N merchants in M calls") and shows progress. Each
answer is pinned the moment it arrives (`source` is `'manual'` — AI and hand pins are
indistinguishable), so a failed call keeps everything already pinned: the run returns what it did
with `error` set, except a failure before anything was pinned, which throws. `my_ferrari` and the
structural categories are not in the model's allow-list.

**Review queue.** Every low/medium row, loaded (paged) and sorted low-confidence first, then by
amount. `listReviewQueue` returns `{ rows, total }`: `rows` is capped at 300 for display, `total`
is the true count. The scope chips and payee grouping work on the displayed rows only.

**Transactions row menu** (`RecategoriseMenu`). *Durable:* "Pin … as…" — writes a `merchant_rules`
pin through `pinMerchant` (replacing any existing pin for that key) and re-categorises the payee's
rows. *Not durable:* "Set category" edits one row, and "Always “X” as…" writes `category_rules`,
which the client engine doesn't read — the next recategorise-all puts the engine's answer back.

**Family / Ferrari tags** are flags on the payee's **entity** (`setFamilyMember`,
`setFerrariShop`), reached through its `vpa_prefix` key. The flag is per entity, so it covers all
the payee's VPAs, and preview/commit re-run every VPA the payee owns. Tagging a VPA with no entity
creates one (a person for Family, a merchant for a Ferrari shop); untagging clears the flag and
keeps the entity; a `separated` key can't be tagged. The legacy `people` / `ferrari_shops` tables
are not written.

**`my_ferrari` is gated** — by the flagged shop plus the amount rule in tier 2. A category default
or a pin ignores the gate, so `my_ferrari` isn't offered as an entity default
(`entityCategories.ts`) or to the model; the pin menus still offer it, and a pin to it bypasses
the gate.

**Known limits** (deliberate, or not yet fixed):

- Guarded credits (`…:credit`) are `medium`, so they stay in the review queue for good; pinning
  their payee can't clear them.
- A pin ignores direction: a pin to a credit category (e.g. `money_received`) also captures the
  payee's debits.
- Tier 0 outranks Ferrari, family and entity defaults, so tagging a VPA that is pinned changes
  nothing until the pin is removed.
- A masked VPA (`xx9526@axl` for `8169849526@axl`) is a distinct prefix that nothing links to the
  real one. Attach the masked prefix as a `vpa_prefix` key on the payee's entity. A name key
  (`merchant_name`) works too but is weaker: a 10-character name also matches longer names that
  cut to the same 10 characters.
- `separated` VPAs are tombstones and can't carry Family / Ferrari flags.
- The month views (`listTransactions`, `getMonthSummary`) aren't paged — fine until a single month
  passes 1,000 rows.

## Database schema (as of migration 0039)

All tables live in `public`, have RLS enabled, and (unless noted) use the same
per-row policy: `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`.
`user_id` defaults to `auth.uid()` and cascades on delete from `auth.users`.

**Core / auth**
- `profiles` (1:1 with `auth.users`) — `ground` (active background preset), `custom_ground`,
  `sidebar_collapsed`, `timezone` (0033 — the client's calendar day, so goal-pace period
  boundaries agree between client and server). Auto-created on signup via `handle_new_user()` trigger.

**Expenses**
- `accounts` — name, type (bank/credit/cash/wallet), last4, `opening_balance_cents`.
- `account_balances` (view) — live balance = opening + sum(credits) − sum(debits).
- `ingestion_sources` — adapter registry (gmail/statement/aa/sms), config as jsonb.
- `transactions` — the core ledger: `amount_cents`, `direction` (debit/credit),
  `merchant_display/normalized`, `category` (text slug, FK-less), `account_id`, `source_type`
  + `source_ref` (unique per user, used for de-dupe on ingest). Engine columns added in
  0013: `channel`, `counterparty`, `vpa_prefix`, `remark`, `matched_by` (the engine tier that
  decided — see "Expenses engine"), `confidence` (high/medium/low; below high = the review queue).
  Three-column merchant contract (0017): `raw_snippet` is the complete untransformed
  source narration (ground truth, never sliced or aliased); `counterparty` is the
  extracted payee segment pre-alias; `merchant_display` is the classified/display label
  after `merchant_rules` overrides — it's what the UI shows, not raw data. `vpa_prefix`
  is capped at 14 chars by ICICI in the statement PDF itself (a bank-side limit, not a
  parser bug) — treat it as a prefix, not a resolvable full VPA; `merchant_rules.match_value` (and
  the legacy `people.vpa` / `ferrari_shops.vpa`) hold the same truncated values under the old,
  unrenamed name. The bank also caps the payee name (`counterparty`) and the UPI `remark` at 10
  characters, and some VPAs arrive masked as `xx` + the last 4 characters + `@handle` (e.g.
  `xx9526@axl`) — a separate prefix from the real VPA (see "Known limits").
  `transfer_group_id` + `is_internal` (0018) pair the two legs of an internal transfer
  detected by `pair_internal_transfers()` — defined but not auto-invoked; run manually
  and check the result before trusting it (the same-amount/48h heuristic is prone to
  false positives on coincidental same-amount transactions).
- `category_rules` — regex/contains/equals rules; `user_id is null` = system default,
  otherwise a per-user override, ranked by priority.
- `categories` — user-editable label/color/sort on top of the slug system; `user_id is
  null` = system row, a user row of the same `(slug, direction)` shadows it. `kind`
  (expense/income/transfer) added in 0013. `bucket` (0021: need/want/obligation/invest,
  nullable) applies to expense-kind categories only — null means "not applicable"
  (income/transfer) or "not yet resolved" (a low-confidence catch-all, or
  `person_transactions` pending Phase 3 identity resolution), never "forgot to set".
- `transaction_flows` (view, 0018) — the only place spend/income/transfer totals may be
  computed from; joins `categories` on `(slug, direction)` to derive `flow_kind` as `coalesce(user row kind,
  system row kind, direction fallback)` (a slug with no row for that direction falls back to income
  for a credit, expense for a debit) and
  `excluded_from_spend` (`is_internal` or `kind = 'transfer'`, wrapped in `is true` per
  0019 so a null-kind category can't leak a SQL-null through). `security_invoker = on`
  like `account_balances` — no RLS bypass. No query outside this view should read
  `transactions.direction` for a total. Amounts are unsigned: `getMonthSummary` adds every
  `flow_kind = 'expense'` row into spend, credits included — which is why the engine has a credit
  guard.
- `people` — legacy VPA → display name / `is_family` list (0013). Superseded by `entities` /
  `entity_keys` (0023), and now **neither read nor written by the client**: the engine and the
  Family & shops screen both read entity flags. Rows are left in place as history and are stale —
  they can disagree with the entity flags (family tags made after 0023 were saved here and never
  applied). Do not resurrect.
- `ferrari_shops` — legacy pinned merchant QRs for the "My Ferrari" tier (0013). Same status as
  `people`. Some seed rows are VPAs that were later `separated` and so can't be tagged at all.
- `entities` / `entity_keys` (0023) — counterparty identity, replacing the one-row-per-vpa model
  above (the data is many-to-many: a truncated `vpa_prefix` can cover more than one real payee,
  and one payee can appear under more than one prefix).
  `entities`: `display_name`, `entity_type` (person/merchant/self), `default_category`,
  `is_family`, `is_ferrari`, `notes`, `resolved_at`. `entity_keys`: `entity_id` (null once
  `separated`), `key_type` (vpa_prefix/merchant_name/counterparty), `key_value`, `confidence`
  (exact/prefix) — unique on `(user_id, key_type, key_value)`, so a key is claimed by at most one
  entity. `confidence = 'exact'` means "not a truncated prefix, cannot silently collide" — it does
  **not** mean the key uniquely identifies the entity; one entity can legitimately hold several
  exact keys.
  **What reads them:** the engine — `is_family` / `is_ferrari` through the entity's `vpa_prefix`
  keys (tiers 2–3), and `default_category` as tier 3b (after family/ferrari, before the brand
  rules; `merchant_rules` pins in tier 0 still win; skips keys in state `needs_review` or
  `separated` — `buildEntityCategoryMaps`). A default applies at any amount, so a `my_ferrari`
  default would bypass the Ferrari amount rule; the resolve and separate dialogs don't offer it
  (`entityCategories.ts`). The AI sweep never sends an entity-attached key. The flags are written
  by the tag flow (see "Expenses engine").
  **Key types:** `merchant_name` is what the app writes for a payee name (the separate flow,
  api.ts); `counterparty` keys were seeded by the 0023 migration from upper-cased pins. The engine
  treats both alike (name keys are compared upper-cased). Name keys on 10-character truncated
  names can collide with unrelated payees. A masked VPA is attached as its own `vpa_prefix` key.
  Migrated from `people`/`ferrari_shops` by grouping on `display_name` (not row-per-row — the source
  tables already contained duplicate rows for the same person/shop under different vpas), plus
  identities found in `merchant_rules` with a category pin but no `people`/`ferrari_shops` row at
  all. Deliberately does not yet cover the lending/receivable ledger (planned separately, not
  before this queue has been used for a while). `entity_keys.ambiguity_state`
  (0024: `unknown`/`same_entity`/`separated`/`needs_review`) is a stored decision, not a
  recomputed inference — a key stays `needs_review` (surfaced in the resolution queue's AMBIGUOUS
  section) until explicitly resolved, even if its entity is otherwise pinned; `separated` nulls
  `entity_id` permanently (tombstoned, never reattached) once the distinct payees under a colliding
  prefix are split into their own entities via `merchant_name`-keyed keys.
- `merchant_rules` — learned exact-match category pins by `vpa` or `counterparty` (`match_value`:
  the VPA as-is, the counterparty upper-cased), distinct from the regex `category_rules` (0013).
  `category` holds a **slug** (some early rows were seeded with display labels; the engine maps
  either through `slugForCategory`). Tier 0 of the engine: applies at any amount and either
  direction, and beats every other tier. Written by `pinMerchant` (an upsert — re-pinning replaces
  the pin), the resolve flows and the AI sweep; `source` is `'manual'` for all of them. Excluded
  from AI candidates. Orthogonal to identity — unaffected by the `entities` migration.
- `recurring_series` (0026–0028) — detected recurring charges: `entity_id` (preferred)
  or `match_key` (merchant-name fallback), `category`, `median_cents`/`interval_days`
  (robust stats over a single-linkage amount-chain cluster, not a naive average),
  `occurrence_count`, `first_seen`/`last_seen`/`next_expected`, `status`
  (active/lapsed/cancelled). Populated by `detect_recurring_series()` — **not
  auto-invoked**, run manually. Upserts (never duplicates on re-run) and preserves
  `status = 'cancelled'` across re-runs (a user dismissal must not be resurrected).
  0027/0028 fixed two Postgres type errors in the original 0026 function body
  (`max(uuid)` has no default aggregate; `date - numeric` isn't a valid operator) —
  0028 is the live, correct version.
- `gmail_sync_state` — one row per user, Gmail history-id checkpoint.
- Key RPCs: `categorize(merchant, direction)` (SQL categoriser — the older server-side path; statements are
  categorised by the client engine), `ingest_transactions(source_type, rows jsonb)` (dedupe +
  insert + categorise), `recategorize_all()` (server-side re-run; `api.recategorizeAll` wraps it,
  nothing calls it — the live pass is `recategorizeAllClient`), `upsert_category` (accepts `bucket` since 0021) /
  `delete_category`, `period_summary(from, to)` (0020, reads `transaction_flows`,
  returns expense/income/transfer rows separately — caller decides what to exclude),
  `pair_internal_transfers()` (0018, manual-only, see above),
  `unresolved_counterparties(p_min_txns default 2)` (0024/0025 — two-section
  counterparty resolution queue: `unresolved` vpa_prefix keys with no entity_keys row,
  and `ambiguous` keys already claimed but flagged `needs_review`, with a per-name
  `name_breakdown`), `counterparty_queue_stats(p_min_txns default 2)` (resolved/
  ambiguous/unresolved/singleton counts for the queue's progress line — ambiguous is
  never folded into resolved), `detect_recurring_series()` (0026–0028, `security
  definer`, returns match count — single-linkage amount-chain clustering in
  sorted-amount order with a 25% per-step tolerance, plus a gap-consistency filter;
  see `recurring_series` above).
- **Taxonomy history:** 0007 shipped a small hand-picked category set; 0013 replaced it
  with a 25-category engine taxonomy (`kind` added); 0014/0015 migrated existing rows
  off the four retired slugs (`dineout`, `person`, `refund`, `misc`) onto the new ones
  and deleted the old category rows. If you see old slugs anywhere, that's dead/legacy.

**Secrets**
- `secrets` — label/username/url/tags + `secret_ciphertext`/`notes_ciphertext`
  (`bytea`, pgp_sym encrypted server-side via a Supabase Vault key). Never decrypted
  client-side or in plain columns.
- `webauthn_credentials`, `secret_access_log` (audit trail: reveal/copy/create/update/delete).
- RPCs: `secret_upsert`, `secret_reveal` (both `security definer`, encrypt/decrypt using
  `_alfred_key()` which reads from `vault.decrypted_secrets`).

**Work (freelance)**
- `clients`, `projects` (status, hourly/fixed rate, `brief` text added 0008),
  `project_assets`, `deliverables`, `time_entries`.
- `invoices` + `invoice_line_items`, numbered via `invoice_counters`
  (per user+year sequence) and `next_invoice_number()` RPC → `ALF-<year>-<seq>`.

**Office**
- `office_tasks` (priority/status), `office_events` (manual entries only — Google
  Calendar events are fetched client-side, never persisted), `office_notes` (pinned/
  archived, optional `entry_date` for day-pinned notes), `office_journal` (one free-text
  entry per calendar day, unique per user+date).

**Design**
- `design_boards` — name/description; `is_inbox` (0029) flags each user's one
  catch-all board (`design_inbox_board()` RPC gets-or-creates it), so an item saved
  without an explicit board is never unfiled-and-invisible.
- `design_items` — `image_url` (nullable, 0029 — null until `design-ingest` unfurls a
  page-only save) + optional `link_url`, `tags` via `text[]` + GIN index,
  `media_type` (image/video/gif), `poster_url` (video's poster frame from the source
  page), `thumb_path` (path in the private `design-media` storage bucket — despite the
  name this is the cached *original*, unresized, not a thumbnail; grid/vision renditions
  come from Storage's image-transform endpoint at read time), `medium` (identity/
  packaging/editorial/motion/type/web/illustration/other), `colors`/`caption`/
  `embedding` (`vector(1536)`, HNSW-indexed) and `enrich_status`/`enrich_error` — all
  written by `design-ingest`. `width`/`height` (0036, both int, nullable together) hold
  the media's natural pixel size, parsed by `design-ingest` straight from the
  downloaded bytes' file header (PNG IHDR / JPEG SOF / WebP VP8-VP8L-VP8X — no image
  codec survives the edge runtime, so no library; parsers live in
  `_shared/imageDimensions.ts`) — the grid uses these to size masonry cards from real
  aspect ratio: `ItemCard` sets `--item-ratio` (width/height, floored at 1:2.1) on
  `.item-card-frame--sized`, the frame owns the card's height and the `<img>` fills it
  absolutely with `object-fit: cover; object-position: top`. Pinterest-style — only the
  tall side is capped: cover crops nothing when the ratio is the image's own, so
  landscape/square/normal-portrait images show whole and only an image taller than 1:2.1
  is cropped (top kept). Never apply `object-fit: fill` here — it stretches. The grid's
  Storage-transformed rendition (`api.transformFor`) must be requested with **both**
  `width` and `height` at the true ratio and `resize: 'contain'`: a bare `width` leaves
  the height to Storage, whose default `resize=cover` reshapes the rendition (cards looked
  right on the raw `image_url`, then wrong once the rendition swapped in). Heights are
  capped at 2400 (Storage rejects sides over 2500), and `useThumbUrls`' cache key includes
  width/height because a backfill changes them without changing `thumb_path`.
  `design-backfill-dimensions` (manual-only, like `pair_internal_transfers()` — never
  runs automatically; re-run while `has_more` is true) re-parses the cached `thumb_path`
  bytes of any row with a null width, without re-hitting the source URL or re-running
  vision/embedding. The only UI trigger is `BackfillDimensionsButton` ("Fill in missing
  dimensions", inside the `⋯` overflow popover in the `DesignPage` TopBar): a dev/maintenance
  affordance that calls `api.backfillDimensions()` (under the session's own token) in a
  loop until `has_more` is false, shows a running filled/unparsed/failed count, then
  invalidates the `['design']` query cache so the grid re-renders with the new dims — safe
  to remove once every row has had a first pass (the line shows the latest run only, so a
  re-click after the sweep is done reads "0 filled"). Null for anything not yet backfilled
  or that never went through ingest (gif — no header parser — or a manual page-only
  save); such a card gets no `--item-ratio`, no `--sized` class, and stays in natural
  flow (`width: 100%; height: auto`), uncapped. URL-only — no file uploads.
- `design_item_boards` (0037) — multi-membership: `(item_id, board_id)` primary key,
  `added_at`; both FKs cascade. `design_items.board_id` is unchanged and is the item's
  **home** (the Inbox, for anything captured) — this table only records the *additional*
  boards an item appears in, and nothing requires a row here. Written by `design-capture`
  (medium routing), the Sort Inbox sweep and the per-card board picker; none of them touch
  `board_id`. A board's contents are `design_board_items(p_board_id)` — homed **or**
  cross-listed, one select, `security invoker`. So a board's `itemCount` is that union
  (tiles overlap by design and don't sum to the library), `homeCount` is items homed there
  (each item has exactly one home, so it *does* sum, and it is what deleting the board
  deletes — cross-listed items just lose that membership). Use `homeCount` for any total.
- `design_media_orphans` (0030) — logs `thumb_path` on delete for a manual sweep;
  Storage has no FK to `design_items`, so the row's own delete can't cascade the object.

**Goals**
- `goals` — type (`count`/`value`/`milestone`/`streak`), target, unit, direction
  (up/down), `source` jsonb whose `kind` is whitelisted by `goals_source_kind_check` (0033):
  `manual` | `journal_streak` | `tasks_completed` | `savings_target` (0038) — the UI only ever
  writes `manual`; `journal_streak` / `tasks_completed` are computed from `office_journal` /
  `office_tasks`, `savings_target` from `transaction_flows` (see `goal_current_value` below). Optional `module_id` tag, `milestones`
  jsonb checklist (milestone-type goals only). 0033 added `cadence`
  (`none`/`weekly`/`monthly`/`quarterly`), `parent_goal_id` (hierarchy; not self) and
  `next_task_id` (→ `office_tasks`).
- `goal_progress` — append-only ledger for `manual` goals: count/value goals log incremental rows
  (summed), streak goals log at most one row per day (enforced in `api.ts`, not a DB constraint).
- `goal_periods` (0033) — frozen per-cadence snapshots (target/actual/status fixed once a period
  closes, never recomputed), `reminders` (general-purpose; `goal_id` nullable) and `goal_reviews`
  (continue/adjust/drop check-ins, one per goal per day). All owner-all RLS.
- RPCs (plain SQL, invoker — RLS applies as the caller): `goal_current_value(goal, from, to)`
  (0034, dispatches on `source.kind`; 0038 added `savings_target` = income − spend in **rupees**
  over the range, `flow_kind = 'income'` credits whose category is in `source.income_categories`
  (default `salary` + `income`, so `money_received` never counts) minus `flow_kind = 'expense'`
  debits, `excluded_from_spend` rows dropped; an explicit `[]` counts no income, only an absent or
  non-array key takes the default) and `goal_pace(goal)` (0035 — streak: trailing 28 days;
  count/value with `cadence = 'none'`: linear over the goal's lifetime; with a cadence: per-period
  target; milestone goals are rejected).
- `savings_plan(goal)` (0039, `stable`, invoker, jsonb; `null` = no such goal, `{error}` = not a
  `savings_target` or cadence other than `monthly`) — the honest month-end projection (`goal_pace`'s
  linear expectation is wrong for a lump-sum salary): meter to `as_of` (the last transaction day
  of the month, never today) + the average meter over the same day-span of the last 3 complete
  months. Ranking pool = want-bucket debits (bucket read `coalesce(uc.bucket, sc.bucket)`, same
  shadow-row joins as `transaction_flows`) + `person_transactions` rows under ₹1,000 as ONE pooled
  line (≥ ₹1,000 is lending-shaped and never enters). Per category over complete months, empty
  months zero-filled: `avg_last3`, `floor` (lowest complete month; `data_points` shows how thin),
  `recoverable = max(0, avg_last3 − floor)`, trend (last 2 vs earlier), lever (`frequency` under
  ₹300 avg ticket); packed greedily against `projected_gap`, never below a floor. `feasible` when
  total recoverable covers it, else `infeasible` + `shortfall`; `insufficient_history` with no
  complete month. Also lists active `subscriptions` `recurring_series` rows — a list to eyeball,
  no "dead" flag exists, and `recurring_series` is only as fresh as the last manual
  `detect_recurring_series()`.

## Conventions worth knowing

- **Money** is always `*_cents` (bigint), never float.
- **User scoping**: almost every table has `user_id default auth.uid()` + a uniform
  "owner all" RLS policy — new tables should follow this pattern unless there's a
  specific reason not to (e.g. `categories`/`category_rules` allow `user_id is null`
  system rows that everyone can read).
- **`updated_at`** columns are maintained by the shared `set_updated_at()` trigger
  (defined once in 0001), not application code.
- Privileged operations (secret encrypt/decrypt, invoice numbering, ingestion) are
  Postgres RPCs marked `security definer`, not client-side logic — keep it that way for
  anything touching the Vault key or needing atomic sequence generation.
- **`design_item_boards` has no `user_id`** — a deliberate exception to the owner-all
  pattern: ownership is the item's (`exists` on `design_items`), and a write also requires
  the *board* to be the caller's so a row can never link into someone else's board.
- **Credit guard** (`classify()` in `categorize.ts`, wrapping the tiers via `pickCategory()`): a
  credit whose chosen category is in `Lists.expenseCategories` becomes `Money Received`, with the
  original tier kept as a `matched_by` suffix (`override:credit`, `brand:credit`, `qr:credit`,
  `entity:credit`…) and `confidence = 'medium'`. The set is loaded by `loadEngineLists` from
  `categories` and mirrors how `transaction_flows` derives `flow_kind` for a credit: the
  `(slug, 'credit')` row's kind, user row else system row — so a slug with no credit-side row
  (`grocery`, `alcohol`…) is not in it; the view already counts those as income. Reason:
  `getMonthSummary` adds `flow_kind = 'expense'` amounts into spend unsigned, so a credit in an
  expense category inflates spend. Because it is `medium`, guarded rows stay in the review queue,
  and pinning their payee cannot clear them (the pin also governs the payee's debits and is
  guarded again for credits).
- **Paging past the 1,000-row cap.** PostgREST returns at most `max_rows` (1,000, `config.toml`)
  per response and **truncates silently** — no error. Any read that can exceed that pages with
  `selectAll` / `eachPage` (`api.ts`): a **unique** stable order (`order('id')`, never a
  timestamp that can tie), advance by the rows actually returned, and stop on an *empty* page
  (not a short one — the server cap can be below the page size). Each page needs a fresh query
  builder.
- **Zero-row writes look like success.** A Supabase `update` / `delete` that matches no row (RLS,
  a row gone) returns no error. When the count matters, add `.select('id')` and count what came
  back.
- **Design module UI** uses the app's ground/theme like every other module — no ground
  override. The `--design-*` tokens in `tokens.css` are *aliases* onto the active preset's
  own tokens (`--surface`, `--text`, `--base`…; muted text and borders are `color-mix`es of
  `--text` into `--ground`), so it follows all 12 presets, light and dark; never hardcode
  hex there. The one deliberate fixed-colour exception is the card hover scrim
  (`.item-card-meta`): it sits over arbitrary image pixels, not the ground, so it is a fixed
  dark gradient with fixed light text. Cards have no panel: the image is the card
  (`.item-card`, 10px radius), hover scales the image and fades in a title + source-domain
  overlay; tags live only in the lightbox. Filtering is client-side in `ReferenceGrid`
  (search over caption + tags, tag popover, multi-select medium chips) until semantic search
  replaces it behind the same field. The gallery pages use `.design-wrap-wide`; Discover
  (parked, deliberately unchanged) keeps the standard `.wrap` width. The popover
  (`DesignPopover`) is hand-rolled — `@radix-ui/react-popover` is not a dependency.
  **Sort Inbox** (Inbox board only, `SortInboxDialog` + `inboxSort.ts`) is a preview-first
  sweep: a dry run groups Inbox items that have a medium by the board their medium names
  (same rule as `design-capture`'s capture-time routing — the two are kept identical by
  hand, since one is Deno; the Inbox is never a target; items with no medium are ignored;
  a medium with no board goes under a non-selectable "No matching board" group; a pair
  already in `design_item_boards` is dropped, so a re-run shows nothing new). Items never
  leave the Inbox — the sweep only ever *adds* cross-listings. It is read-only for now:
  the "Add N items" confirm is deliberately disabled until the write is wired up.
  **Board picker** (`BoardPicker`, on every `ItemCard`): right-click the image (at the cursor)
  or the hover `+` button opens an "Also show in" checklist. Ticking upserts a
  `design_item_boards` row (ignore-duplicates), unticking deletes it; the item's home board is
  shown checked + disabled and `board_id` is never written. It replaces the browser's own
  right-click menu on cards. State lives in the shared links query (`useItemBoardLinks`,
  updated optimistically by `useSetItemBoard`).
- See [`docs/MVP.md`](docs/MVP.md) for product spec and [`supabase/README.md`](supabase/README.md)
  for local setup (migrations, Vault key, turning off signups).

## Keeping this file current

This file is regenerated from the actual schema/code, not hand-maintained speculation —
keep it that way. Whenever a change in this repo would make a section above stale,
update that section in the same piece of work:

- New/changed migration → update the schema section (new table, new column, new RPC,
  a retired slug/column) and bump the "as of migration NNNN" note above.
- New module or route → add a row to the Modules table and a folder note under Layout.
- New env var, edge function, or convention → update the relevant section.
- A pattern gets violated on purpose (e.g. a table without the standard RLS policy) →
  note it under Conventions so it doesn't look like an oversight later.
- Calling a table or path "superseded" or "unread" means **no client code reads or writes it** —
  grep for `.from('<table>')` before writing that sentence. `people` / `ferrari_shops` were
  documented as unread while the tag flow still wrote them, which hid a bug where tags were saved
  but never applied.
