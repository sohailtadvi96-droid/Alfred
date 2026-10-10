/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** OAuth 2.0 web client ID from Google Cloud — enables the Office-work
   *  Google Calendar sync. Optional; the tab degrades gracefully without it. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** VAPID public key (base64url) — the applicationServerKey for Web Push.
   *  Optional; Settings → Notifications says "not configured" without it. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
