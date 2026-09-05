/** "UI, typography ,  Grid" -> ["ui", "typography", "grid"] — trimmed,
 *  lower-cased, de-duped, order preserved. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function tagsToInput(tags: string[]): string {
  return tags.join(', ');
}

/** hostname without a leading www., for the source chip */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
