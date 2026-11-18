import { CURRENT_VERSION } from './schema';

/**
 * migrations[n] turns a version-n config into a version-(n+1) config.
 * Add one entry each time the schema changes in a way that breaks old files,
 * and bump CURRENT_VERSION. Shared configs outlive schema changes.
 */
export const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(raw: unknown): { value: unknown; from?: number; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: raw };
  let obj = raw as Record<string, unknown>;
  const v = obj.version;
  if (v === undefined) return { value: raw, error: 'version: missing. Add "version: 1" at the top.' };
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { value: raw, error: 'version: must be a whole number' };
  if (v > CURRENT_VERSION)
    return { value: raw, error: `version: ${v} is newer than this app supports (${CURRENT_VERSION}). Update prboard.` };
  for (let n = v; n < CURRENT_VERSION; n++) {
    const step = migrations[n];
    if (!step) return { value: raw, error: `version: no migration from ${n} to ${n + 1}` };
    obj = { ...step(obj), version: n + 1 };
  }
  return { value: obj, from: v === CURRENT_VERSION ? undefined : v };
}
