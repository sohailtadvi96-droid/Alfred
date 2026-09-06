// Wires the extensionless-import resolve hook (see ts-resolve.mjs).
// Usage: node --import ./scripts/register-ts.mjs scripts/<file>.ts
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);
