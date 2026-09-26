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
- **Edge Functions** (`supabase/functions/`): `categorise-ai` (LLM-assisted expense
  categorisation); for the Design module, `design-search` (image search proxy),
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
  migrations/  0001 … 0028, sequential, immutable once pushed
  functions/   categorise-ai, design-search (+ _shared/cors.ts)
docs/          MVP.md (spec), DEPLOY.md
```

Each feature module under `src/features/<name>/` follows the same shape: `api.ts`
(Supabase queries/RPC calls), `hooks.ts` (TanStack Query wrappers), `types.ts`, plus
presentational components. Routes in `src/routes/` are thin — they compose feature
components, not business logic.

## Modules (status)

| Module | Route(s) | Migration(s) | Status |
|---|---|---|---|
| **Expenses** | `ExpensesPage`, `TransactionsPage`, `ReviewPage`, `PeoplePage`, `InsightsPage` | 0002, 0006, 0007, 0012–0015, 0017–0028 | Shipped, actively evolving |
| **Secrets** (password/vault) | `SecretsPage` | 0003 | Shipped |
| **Work** (freelance: clients/projects/invoices) | `WorkPage`, `ProjectDetailPage`, `InvoicesPage`, `InvoiceViewPage` | 0004, 0008 | Shipped |
| **Office** (tasks/calendar/journal) | `OfficeDayPage` | 0009, 0010 | Shipped |
| **Design** (inspiration boards) | `DesignPage`, `DesignBoardPage`, `DesignDiscoverPage` | 0011, 0029–0032, 0036, 0037 | Shipped; Discover is parked (route and `DiscoverView` kept, no nav link to it) |
| **Goals** | `GoalsPage` | 0016 | Shipped, Phase 1 (manual goals only — no auto-progress from other modules yet) |
| **Home** (Board/Rail dashboard) | `HomePage` | — (reads across modules, no own tables) | Shipped |

## Database schema (as of migration 0028)

All tables live in `public`, have RLS enabled, and (unless noted) use the same
per-row policy: `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`.
`user_id` defaults to `auth.uid()` and cascades on delete from `auth.users`.

**Core / auth**
- `profiles` (1:1 with `auth.users`) — `ground` (active background preset), `custom_ground`,
  `sidebar_collapsed`. Auto-created on signup via `handle_new_user()` trigger.

**Expenses**
- `accounts` — name, type (bank/credit/cash/wallet), last4, `opening_balance_cents`.
- `account_balances` (view) — live balance = opening + sum(credits) − sum(debits).
- `ingestion_sources` — adapter registry (gmail/statement/aa/sms), config as jsonb.
- `transactions` — the core ledger: `amount_cents`, `direction` (debit/credit),
  `merchant_display/normalized`, `category` (text slug, FK-less), `account_id`, `source_type`
  + `source_ref` (unique per user, used for de-dupe on ingest). Engine columns added in
  0013: `channel`, `counterparty`, `vpa_prefix`, `remark`, `matched_by`, `confidence`.
  Three-column merchant contract (0017): `raw_snippet` is the complete untransformed
  source narration (ground truth, never sliced or aliased); `counterparty` is the
  extracted payee segment pre-alias; `merchant_display` is the classified/display label
  after `merchant_rules` overrides — it's what the UI shows, not raw data. `vpa_prefix`
  is capped at 14 chars by ICICI in the statement PDF itself (a bank-side limit, not a
  parser bug) — treat it as a prefix, not a resolvable full VPA; `people.vpa` /
  `ferrari_shops.vpa` / `merchant_rules.match_value` still hold the same truncated
  values under the old, unrenamed name.
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
  computed from; joins `categories` (user row shadows system row) to derive `flow_kind`
  (expense/income/transfer, falling back to direction when uncategorized) and
  `excluded_from_spend` (`is_internal` or `kind = 'transfer'`, wrapped in `is true` per
  0019 so a null-kind category can't leak a SQL-null through). `security_invoker = on`
  like `account_balances` — no RLS bypass. No query outside this view should read
  `transactions.direction` for a total.
- `people` — VPA → display name mapping, `is_family` flag (0013). **Superseded by
  `entities`/`entity_keys` (0023) for identity resolution** — left in place and
  populated, no longer read by the client. `people.vpa` still holds the old truncated
  (and unrenamed) prefix.
- `ferrari_shops` — pinned merchant QRs, "My Ferrari" tier (0013). Same status as
  `people`: superseded by `entities` (`is_ferrari` flag), left in place, unread.
- `entities` / `entity_keys` (0023) — counterparty identity, replacing the one-row-
  per-vpa model above (the data is many-to-many: a truncated `vpa_prefix` can cover
  more than one real payee, and one payee can appear under more than one prefix).
  `entities`: `display_name`, `entity_type` (person/merchant/self), `default_category`,
  `is_family`, `is_ferrari`, `notes`, `resolved_at`. The engine reads `default_category`
  as tier 3b in `classify()` (after family/ferrari, before the brand RULES; `merchant_rules`
  pins in tier 0 still win): `loadEngineLists` builds `entityCategoryByVpa` /
  `entityCategoryByName` from keys of entities that have one, skipping keys whose
  `ambiguity_state` is `needs_review` or `separated` (`buildEntityCategoryMaps`). It
  applies at any amount, so a `my_ferrari` default would bypass the ferrari amount pattern
  that the `is_ferrari` flag enforces — the resolve and separate dialogs therefore don't
  offer it (`entityCategories.ts`); tag the payee as a Ferrari shop instead. `entity_keys`: `entity_id`,
  `key_type` (vpa_prefix/merchant_name/counterparty), `key_value`, `confidence`
  (exact/prefix) — unique on `(user_id, key_type, key_value)`, so a key is claimed by at
  most one entity. `confidence = 'exact'` means "not a truncated prefix, cannot silently
  collide" — it does **not** mean the key uniquely identifies the entity; one entity can
  legitimately hold several exact keys. Migrated from `people`/`ferrari_shops` by
  grouping on `display_name` (not row-per-row — the source tables already contained
  duplicate rows for the same person/shop under different vpas), plus identities found
  in `merchant_rules` with a category pin but no `people`/`ferrari_shops` row at all.
  Deliberately does not yet cover the lending/receivable ledger (planned separately,
  not before this queue has been used for a while). `entity_keys.ambiguity_state`
  (0024: `unknown`/`same_entity`/`separated`/`needs_review`) is a stored decision, not
  a recomputed inference — a key stays `needs_review` (surfaced in the resolution
  queue's AMBIGUOUS section) until explicitly resolved, even if its entity is
  otherwise pinned; `separated` nulls `entity_id` permanently (tombstoned, never
  reattached) once the distinct payees under a colliding prefix are split into their
  own entities via `merchant_name`-keyed keys.
- `merchant_rules` — learned exact-match category pins (vpa/counterparty), distinct
  from the regex `category_rules` (0013). Orthogonal to identity — unaffected by the
  `entities` migration.
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
- Key RPCs: `categorize(merchant, direction)` (SQL fallback categoriser),
  `ingest_transactions(source_type, rows jsonb)` (dedupe + insert + categorise),
  `recategorize_all()`, `upsert_category` (accepts `bucket` since 0021) /
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
  (up/down), `source` jsonb (`{"kind":"manual"}` for now — designed to later hold
  auto-tracked sources from other modules), optional `module_id` tag, `milestones` jsonb
  checklist (for milestone-type goals only).
- `goal_progress` — append-only ledger: count/value goals log incremental rows (summed),
  streak goals log at most one row per day (enforced in `api.ts`, not a DB constraint).

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
