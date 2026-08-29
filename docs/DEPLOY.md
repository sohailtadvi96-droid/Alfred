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

> Never add the Supabase `service_role` key (or any other real secret) as a
> `VITE_*` variable — anything with that prefix is compiled into client code
> that ships to the browser.

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
