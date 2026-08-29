/* Reveal gate — an in-app re-auth that sits on top of the already-authenticated
 * Supabase session and must pass before any secret is decrypted or copied.
 *
 * MVP scope (this slice):
 *   - Touch ID / platform authenticator via WebAuthn when the device has one,
 *     used as a local user-presence + user-verification check.
 *   - Master-PIN fallback, hashed (PBKDF2-SHA256) and stored per-device.
 *   - A short in-memory unlock window so a burst of reveals doesn't re-prompt.
 *
 * Deferred to Phase 3b (needs an Edge Function):
 *   - Server-generated WebAuthn challenges + assertion verification against
 *     `webauthn_credentials`, producing a real short-lived token that the
 *     decrypt function checks. Today `secret_reveal` is guarded only by
 *     `auth.uid()`, so this gate is a client-side ceremony, not a server one.
 */

const PIN_KEY = 'alfred.secretGate.pin.v1'; // { salt, hash, iterations }
const WEBAUTHN_KEY = 'alfred.secretGate.webauthn.v1'; // base64url credential id
const UNLOCK_MS = 2 * 60_000;

let unlockedUntil = 0;

export function isUnlocked(): boolean {
  return Date.now() < unlockedUntil;
}
export function lockNow(): void {
  unlockedUntil = 0;
}
function markUnlocked(): void {
  unlockedUntil = Date.now() + UNLOCK_MS;
}

// ---------- capability ----------

export async function platformAuthAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export function webauthnEnrolled(): boolean {
  return safeGet(WEBAUTHN_KEY) != null;
}
export function pinEnrolled(): boolean {
  return safeGet(PIN_KEY) != null;
}
export function gateConfigured(): boolean {
  return webauthnEnrolled() || pinEnrolled();
}

// ---------- WebAuthn ----------

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function enrollWebAuthn(): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'ALFRED', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'alfred-owner',
        displayName: 'ALFRED owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Enrollment was cancelled.');
  safeSet(WEBAUTHN_KEY, bufToB64url(cred.rawId));
}

async function verifyWebAuthn(): Promise<boolean> {
  const id = safeGet(WEBAUTHN_KEY);
  if (!id) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64urlToBuf(id) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return assertion != null;
}

// ---------- PIN ----------

const ITERATIONS = 210_000;

async function hashPin(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return bufToB64url(bits);
}

export async function enrollPin(pin: string): Promise<void> {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('PIN must be 4–12 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt);
  safeSet(PIN_KEY, JSON.stringify({ salt: bufToB64url(salt), hash, iterations: ITERATIONS }));
}

export function clearGate(): void {
  safeRemove(PIN_KEY);
  safeRemove(WEBAUTHN_KEY);
  lockNow();
}

async function verifyPin(pin: string): Promise<boolean> {
  const raw = safeGet(PIN_KEY);
  if (!raw) return false;
  try {
    const { salt, hash } = JSON.parse(raw) as { salt: string; hash: string };
    const got = await hashPin(pin, b64urlToBuf(salt));
    return timingSafeEqual(got, hash);
  } catch {
    return false;
  }
}

// ---------- the gate ----------

export type UnlockInput = { method: 'webauthn' } | { method: 'pin'; pin: string };

/** Throws with a user-facing message on failure. Resolves + opens the unlock
 *  window on success. */
export async function unlock(input: UnlockInput): Promise<void> {
  if (input.method === 'webauthn') {
    if (!(await verifyWebAuthn())) throw new Error('Touch ID check did not pass.');
    markUnlocked();
    return;
  }
  if (!(await verifyPin(input.pin))) throw new Error('That PIN is not right.');
  markUnlocked();
}

// ---------- helpers ----------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode / storage disabled — gate simply won't persist */
  }
}
function safeRemove(k: string): void {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
