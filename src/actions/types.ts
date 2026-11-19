import type { PullRequestNode } from '../github/types';
import type { IconId, Permission } from '../fields/types';

export interface ActionChoice {
  id: string;
  label: string;
}

export interface ActionDef {
  id: string;
  label: string;
  /** Shown in the menu, before the label. */
  icon?: IconId;
  description: string;
  /** GraphQL selection needed to decide whether the action applies. */
  fragment: string;
  /** True when the action makes sense for this PR and the viewer may run it. */
  available: (pr: PullRequestNode) => boolean;
  /** Optional choices, for example merge methods. The first is the default. */
  choices?: (pr: PullRequestNode) => ActionChoice[];
  /** Text for a confirmation prompt. Actions that can merge code must confirm. */
  confirm?: (pr: PullRequestNode, choice?: string) => string;
  /** Builds the mutation. Values go in variables, never into the query text. */
  mutation: (pr: PullRequestNode, choice?: string) => { query: string; variables: Record<string, unknown> };
  requires: Permission[];
}
