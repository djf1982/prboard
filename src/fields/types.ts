import type { PullRequestNode } from '../github/types';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'muted';

/** Ids from the fixed icon set in ui/Icon.svelte. */
export type IconId = 'check' | 'x' | 'dot' | 'clock' | 'merge' | 'draft' | 'comment' | 'alert' | 'branch' | 'queue' | 'eye';

/** Framework-agnostic cell model. Fields never produce markup. */
export interface Cell {
  text: string;
  /** Hover detail, for example failing check names. */
  title?: string;
  /** https only. CellView drops any other scheme. */
  href?: string;
  tone?: Tone;
  icon?: IconId;
  chips?: { text: string; tone?: Tone; title?: string }[];
}

/** Fine-grained token permissions, as GitHub names them in the token settings. */
export type Permission =
  | 'Pull requests: read'
  | 'Pull requests: write'
  | 'Metadata: read'
  | 'Commit statuses: read'
  | 'Checks: read'
  | 'Contents: read'
  | 'Contents: write'
  | 'Members: read';

export type Cost = 'low' | 'high';

export interface FieldDef<T = unknown> {
  /** Stable id, used in configs. */
  id: string;
  /** Default column header. */
  label: string;
  /** Shown in the column picker. */
  description: string;
  /** GraphQL selection on PullRequest that this field needs. */
  fragment: string;
  get: (pr: PullRequestNode) => T;
  sortValue?: (v: T) => string | number | undefined;
  groupValue?: (v: T) => string;
  display: (v: T, pr: PullRequestNode) => Cell;
  cost?: Cost;
  requires?: Permission[];
  /** Default column width in pixels. */
  width?: number;
}

/** Helper that keeps the value type of a field in step between get and display. */
export function defineField<T>(def: FieldDef<T>): FieldDef<unknown> {
  return def as unknown as FieldDef<unknown>;
}

export const EMPTY: Cell = { text: '', tone: 'muted' };
