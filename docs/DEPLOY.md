# Deploy (Vercel)

Frontend deploys to Vercel; backend is Supabase Cloud (see `../supabase/README.md`).

## Environment variables

The app reads exactly two variables, both at **build time**, and both are
embedded in the shipped JS bundle. Neither is a true secret — the anon key is
the public key from Supabase → Project Settings → API — but Vercel still needs
them present for every build.

| Key | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon **public** key | Production, Preview, Development |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web client ID (optional) | Production, Preview, Development |

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

## Build settings

Defined in `../vercel.json` — framework `vite`, build `npm run build`, output
`dist`, SPA rewrite to `/index.html`. No dashboard changes needed.

## Verify

After deploy, the login screen should load without the
`VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set` console warning
(emitted from `../src/lib/supabase.ts`).
