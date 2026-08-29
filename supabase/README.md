# Supabase setup

Single-user app. Every table is RLS-scoped to `auth.uid()`.

## 1. Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL** and **anon public key** (Project Settings → API) into the app's `.env`
   (see `../.env.example`).

## 2. Run the migrations

**Option A — SQL editor (simplest):** open each file in `migrations/` in order
(`0001` → `0005`) and run it in the Supabase SQL editor.

**Option B — CLI:**

```bash
npm i -g supabase
supabase link --project-ref <your-ref>
supabase db push        # applies everything in migrations/
```

## 3. Set the Secrets encryption key (once)

After `0003_secrets.sql`, run this in the SQL editor with your own long random string:

```sql
select vault.create_secret('REPLACE-WITH-64+-RANDOM-CHARS', 'alfred_secret_key');
```

`secret_upsert()` / `secret_reveal()` read this key. Losing it makes stored secrets
unrecoverable — keep a copy in your own password manager.

## 4. Create your account, then lock signups

1. Authentication → Users → **Add user** (email + password), or sign up once from the app.
2. Authentication → Providers → Email → turn **Allow new users to sign up** **off**.
   ALFRED is for one person.

## 5. (Phase 2) Gmail ingestion

Not needed yet. When building Expenses ingestion:

- Google Cloud project + OAuth client; consent screen in **Testing** with your account as the
  only test user; obtain a refresh token.
- Store it via `vault.create_secret(...)`; an Edge Function `ingest-gmail` parses bank-alert
  emails into `NormalizedTxn[]` and calls `select ingest_transactions('gmail', $1)`.
- Schedule it with `pg_cron` (every 15 min) or Supabase scheduled functions.

## Schema map

| Module | Tables |
| --- | --- |
| Core | `profiles` |
| Expenses | `accounts`, `ingestion_sources`, `category_rules`, `transactions`, `gmail_sync_state` |
| Secrets | `secrets`, `webauthn_credentials`, `secret_access_log` |
| Work | `clients`, `projects`, `project_assets`, `deliverables`, `time_entries`, `invoices`, `invoice_line_items`, `invoice_counters` |

RPCs: `ingest_transactions(text, jsonb)`, `categorize(text, text)`, `secret_upsert(...)`,
`secret_reveal(uuid)`, `next_invoice_number()`.
