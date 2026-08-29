export interface GenOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_GEN: GenOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
};

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz', // no l
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // no I, O
  digits: '23456789', // no 0, 1
  symbols: '!@#$%^&*-_=+?',
} as const;

/** Cryptographically-random integer in [0, max). Rejection-sampled so the
 *  distribution stays uniform (no modulo bias). */
function randomInt(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return n % max;
}

export function generatePassword(opts: GenOptions): string {
  const pools: string[] = [];
  if (opts.lower) pools.push(SETS.lower);
  if (opts.upper) pools.push(SETS.upper);
  if (opts.digits) pools.push(SETS.digits);
  if (opts.symbols) pools.push(SETS.symbols);
  if (pools.length === 0) return '';

  const length = Math.max(pools.length, Math.min(opts.length, 128));
  const all = pools.join('');

  // guarantee at least one char from each selected class …
  const chars: string[] = pools.map((p) => p[randomInt(p.length)]);
  // … then fill the rest from the combined pool
  while (chars.length < length) chars.push(all[randomInt(all.length)]);

  // Fisher–Yates shuffle so the guaranteed chars aren't stuck at the front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** 0–4 rough strength score for the meter. */
export function strength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 20) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}
