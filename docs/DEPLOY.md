# Deploy (Vercel)

Frontend deploys to Vercel; backend is Supabase Cloud (see `../supabase/README.md`).

## Pushing `main` deploys production — by itself

A `git push` to `main` on GitHub **is** the production deploy. Two GitHub
integrations react to it within about a minute (found during the phone P2
rollout, 2026-10-10; every `main` push since at least 2026-10-02 shows both):

- **Supabase GitHub integration** (check run "Supabase Preview"): applies any
  new migrations in `supabase/migrations/` to the production database and
  deploys the Edge Functions in `supabase/functions/`. It does **not** set
  function secrets or Vault secrets.
- **Vercel Git integration**: builds a Production deployment (alias
  `alfred-murex-pi.vercel.app`) with whatever Vercel environment variables
  exist **at that moment**.

`.github/workflows/ci.yml` only runs `npm ci && npm run build`.

So, for any change that needs a new secret or variable:

1. Set Supabase function secrets (`supabase secrets set …`), Vault secrets (SQL),
   and Vercel environment variables (`vercel env add …`) **first**.
2. Then merge / push to `main`. That push is the deploy; `supabase db push`,
   `supabase functions deploy` and `vercel --prod` are not separate steps.
3. Verify (below). A branch push only makes a Vercel *Preview* — it never
   touches the production database.

## Environment variables

The app reads these variables at **build time**; all of them are embedded in
the shipped JS bundle, so none may be a real secret — the anon key is the
public key from Supabase → Project Settings → API, and the VAPID key is the
*public* half of the Web Push key pair. Vercel needs them present for every build.

| Key | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon **public** key | Production, Preview, Development |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web client ID (optional) | Production, Preview, Development |
| `VITE_VAPID_PUBLIC_KEY` | Web Push VAPID **public** key, base64url (optional — Settings → Notifications says "not configured" without it) | Production |

> Never add the Supabase `service_role` key (or any other real secret) as a
> `VITE_*` variable — anything with that prefix is compiled into client code
> that ships to the browser.

### `VITE_GOOGLE_CLIENT_ID` (optional — Work / Office-work calendar sync)

Only needed for the Google Calendar sync on the Office-work tab. Without it the
tab still works; it just shows a "not set up" note instead of a Connect button.

1. Google Cloud Console → **APIs & Services → Enable APIs** → enable **Google Calendar API**.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
3. Under **Authorised JavaScript origins** add every origin the app runs on —
   `http://localhost:5173`, the Vercel preview domain(s), and the production domain.
4. Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID`. No client secret is used
   (the browser flow is token-only) and the only scope requested is the
   read-only `https://www.googleapis.com/auth/calendar.events.readonly`.
5. While the OAuth consent screen is in "Testing", add your Google account under
   **Test users**.

## Setting them

### Option A — script (from your local `.env`)

```bash
npm i -g vercel
vercel login
vercel link            # once, from the repo root
scripts/vercel-env.sh  # pushes VITE_* from .env to prod + preview + dev
vercel --prod          # redeploy so the new values take effect
```

### Option B — Vercel dashboard

Project → Settings → Environment Variables → add each key above for
Production, Preview, and Development, then redeploy.

### Option C — one-off CLI

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
# repeat for preview / development
```

## Server-side secrets (Supabase — never in Vercel)

Set by hand per environment; nothing deploys them. Names only here — values
live in the git-ignored `supabase/functions/.env` locally.

| Where | Name | Used by |
|---|---|---|
| Function secret | `ANTHROPIC_API_KEY` | `categorise-ai` |
| Function secret | `VAPID_KEYS_JWK`, `VAPID_SUBJECT` | `push-test`, `push-dispatch` |
| Function secret | `PUSH_DISPATCH_SECRET` | `push-dispatch` (checks the caller's bearer) |
| Vault secret | `push_dispatch_url` | `_push_dispatch_tick()` (0047) — the full `https://<ref>.supabase.co/functions/v1/push-dispatch` |
| Vault secret | `push_dispatch_secret` | `_push_dispatch_tick()` — must equal `PUSH_DISPATCH_SECRET` |

Function secrets: `supabase secrets set NAME=…` (or `--env-file` with a file
holding **only** the lines you mean to set). Vault secrets: in the SQL editor,
`select vault.create_secret('<value>', '<name>');` (to change one later:
`vault.update_secret`). The every-minute cron tick returns quietly until both
Vault secrets exist, so a migration can ship before they are set.

## Build settings

Defined in `../vercel.json` — framework `vite`, build `npm run build`, output
`dist`, SPA rewrite to `/index.html`. No dashboard changes needed.

## Verify

After deploy, the login screen should load without the
`VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set` console warning
(emitted from `../src/lib/supabase.ts`).
