import type { FieldDef } from './types';
import { coreFields } from './core';
import { reviewFields } from './review';
import { checksFields } from './checks';
import { mergeFields } from './merge';

/**
 * Every field the app knows. To add a column, add one entry to one of the
 * lists above (or a new file), then a test and a line in the README table.
 */
export const ALL_FIELDS: FieldDef[] = [...coreFields, ...mergeFields, ...reviewFields, ...checksFields];

export const FIELDS: ReadonlyMap<string, FieldDef> = (() => {
  const map = new Map<string, FieldDef>();
  for (const f of ALL_FIELDS) {
    if (map.has(f.id)) throw new Error(`Duplicate field id: ${f.id}`);
    if (!/^[a-z][A-Za-z0-9]*$/.test(f.id)) throw new Error(`Bad field id: ${f.id}`);
    map.set(f.id, f);
  }
  return map;
})();

/** Reserved column id for the row-actions column (see src/actions). */
export const ACTIONS_COLUMN_ID = 'actions';

export function getField(id: string): FieldDef | undefined {
  return FIELDS.get(id);
}
