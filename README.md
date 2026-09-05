# ALFRED

A personal butler for one. Modules: **Expenses · Secrets · Work · Design** (more later).

- Spec: [`docs/MVP.md`](docs/MVP.md)
- Design system: published Artifact (dark/light "technical dossier", 12 owner-swappable backgrounds)

## Stack

React 18 · Vite · TypeScript · Tailwind (tokens via CSS custom properties) · Radix ·
TanStack Query · React Router · Supabase (Postgres + Auth + RLS + Edge Functions).

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase URL + anon key
npm run dev
```

Then set up the database — see [`supabase/README.md`](supabase/README.md): run the
migrations in `supabase/migrations/`, set the Vault key, create your account, and turn
signups off.

Without `.env`, the app still runs and shows the login screen with a "not configured" note.

## Scripts

| | |
| --- | --- |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | typecheck + production build |
| `npm run typecheck` | `tsc` only |
| `npm run preview` | serve the built app |

## What's in this build (Phase 1)

- App shell: collapsible pill sidebar (numbered index), top bar with wallet chip, routing
- **Login** + session gate; sign-out
- **12 background presets** + live picker in Settings; choice persisted to `localStorage`
  and the Supabase `profiles` row; painted pre-hydration (no flash)
- Tooltip system (`data-tip` attribute + a Radix `<Tooltip>` primitive)
- Load choreography: hero → submerge → dashboard, once per session, replayable, respects
  `prefers-reduced-motion`
- **Full schema migrations** for all three modules + RPCs

Module screens are placeholders — built next, Expenses first.

## Layout

```
src/
  auth/        AuthProvider, RequireAuth, LoginPage
  theme/       grounds.ts (the 12 presets), ThemeProvider
  components/  AppShell, Sidebar, TopBar, GroundPicker, IntroChoreography, Tooltip, Icon
  routes/      router.tsx + one file per module screen
  lib/         supabase client, query client
  styles/      tokens.css (grounds), base.css (shell + components)
supabase/
  migrations/  0001_init … 0005_seed_category_rules
```
