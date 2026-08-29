/** Pull a human message out of whatever Supabase / fetch throws.
 *  PostgrestError is a plain object ({ message, details, hint, code }),
 *  not an Error instance, so `err instanceof Error` misses it. */
export function errMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.hint].filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (parts.length) return parts.join(' — ');
    if (typeof e.code === 'string') return `Error ${e.code}`;
  }
  return fallback;
}
