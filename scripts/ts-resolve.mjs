// Test-only Node resolve hook: let extensionless relative imports in src/
// (which Vite/tsc resolve at build time) load under `node scripts/*.ts`.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      const base = context.parentURL ?? import.meta.url;
      const asTs = new URL(specifier + '.ts', base);
      if (existsSync(fileURLToPath(asTs))) return nextResolve(specifier + '.ts', context);
    } catch {
      /* fall through */
    }
  }
  return nextResolve(specifier, context);
}
