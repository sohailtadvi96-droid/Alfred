export interface Secret {
  id: string;
  label: string;
  username: string | null;
  url: string | null;
  tags: string[];
  last_revealed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Plaintext, only ever held in memory after a gated `secret_reveal`. */
export interface RevealedSecret {
  secret: string;
  notes: string | null;
}

export interface NewSecret {
  /** null → insert, otherwise update that row */
  id: string | null;
  label: string;
  username: string;
  url: string;
  tags: string[];
  secret: string;
  notes: string;
}

export type SecretAction = 'reveal' | 'copy' | 'create' | 'update' | 'delete';

export interface SecretAccessRow {
  id: string;
  secret_id: string | null;
  action: SecretAction;
  at: string;
}
