import { supabase } from '@/lib/supabase';
import type { NewSecret, RevealedSecret, Secret, SecretAccessRow } from './types';

const SECRET_COLS = 'id,label,username,url,tags,last_revealed_at,created_at,updated_at';

export async function listSecrets(): Promise<Secret[]> {
  const { data, error } = await supabase
    .from('secrets')
    .select(SECRET_COLS)
    .order('label', { ascending: true });
  if (error) throw error;
  return data as Secret[];
}

/** Insert or update. Encryption happens server-side in the `secret_upsert` RPC;
 *  plaintext is sent over TLS and never stored client-side. */
export async function upsertSecret(input: NewSecret): Promise<string> {
  const tags = input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const { data, error } = await supabase.rpc('secret_upsert', {
    p_id: input.id,
    p_label: input.label.trim(),
    p_username: input.username.trim() || null,
    p_url: input.url.trim() || null,
    p_tags: tags,
    p_secret: input.secret,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

/** Gated decrypt. The RPC also writes a `reveal` row to `secret_access_log`. */
export async function revealSecret(id: string): Promise<RevealedSecret> {
  const { data, error } = await supabase.rpc('secret_reveal', { p_id: id });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { secret: string; notes: string | null } | undefined;
  if (!row) throw new Error('Secret not found.');
  return { secret: row.secret, notes: row.notes };
}

export async function deleteSecret(id: string): Promise<void> {
  const { error: logErr } = await supabase.from('secret_access_log').insert({ secret_id: id, action: 'delete' });
  if (logErr) throw logErr;
  const { error } = await supabase.from('secrets').delete().eq('id', id);
  if (error) throw error;
}

/** Record a clipboard copy (reveal is logged by the RPC itself). */
export async function logCopy(id: string): Promise<void> {
  const { error } = await supabase.from('secret_access_log').insert({ secret_id: id, action: 'copy' });
  if (error) throw error;
}

export async function listAccessLog(limit = 40): Promise<SecretAccessRow[]> {
  const { data, error } = await supabase
    .from('secret_access_log')
    .select('id,secret_id,action,at')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as SecretAccessRow[];
}
