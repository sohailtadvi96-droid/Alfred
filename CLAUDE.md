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
  categorisation), `design-search` (image search proxy for the Design module — API keys
  live server-side as Supabase secrets, never in the client `.env`).
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
  migrations/  0001 … 0016, sequential, immutable once pushed
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
| **Expenses** | `ExpensesPage`, `TransactionsPage`, `ReviewPage`, `PeoplePage` | 0002, 0006, 0007, 0012–0015 | Shipped, actively evolving |
| **Secrets** (password/vault) | `SecretsPage` | 0003 | Shipped |
| **Work** (freelance: clients/projects/invoices) | `WorkPage`, `ProjectDetailPage`, `InvoicesPage`, `InvoiceViewPage` | 0004, 0008 | Shipped |
| **Office** (tasks/calendar/journal) | `OfficeDayPage` | 0009, 0010 | Shipped |
| **Design** (inspiration boards) | `DesignPage`, `DesignBoardPage`, `DesignDiscoverPage` | 0011 | Shipped |
| **Goals** | `GoalsPage` | 0016 | Shipped, Phase 1 (manual goals only — no auto-progress from other modules yet) |
| **Home** (Board/Rail dashboard) | `HomePage` | — (reads across modules, no own tables) | Shipped |

## Database schema (as of migration 0017)

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
- `category_rules` — regex/contains/equals rules; `user_id is null` = system default,
  otherwise a per-user override, ranked by priority.
- `categories` — user-editable label/color/sort on top of the slug system; `user_id is
  null` = system row, a user row of the same `(slug, direction)` shadows it. `kind`
  (expense/income/transfer) added in 0013.
- `people` — VPA → display name mapping, `is_family` flag (0013).
- `ferrari_shops` — pinned merchant QRs, "My Ferrari" tier (0013).
- `merchant_rules` — learned exact-match category pins (vpa/counterparty), distinct
  from the regex `category_rules` (0013).
- `gmail_sync_state` — one row per user, Gmail history-id checkpoint.
- Key RPCs: `categorize(merchant, direction)` (SQL fallback categoriser),
  `ingest_transactions(source_type, rows jsonb)` (dedupe + insert + categorise),
  `recategorize_all()`, `upsert_category` / `delete_category`.
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
- `design_boards`, `design_items` (image_url + optional link_url, tags via `text[]` +
  GIN index). URL-only — no file uploads.

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
