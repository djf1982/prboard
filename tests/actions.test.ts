import { describe, expect, it } from 'vitest';
import prs from './fixtures/prs.json';
import type { PullRequestNode } from '../src/github/types';
import { ACTIONS, availableActions } from '../src/actions/registry';

const [auto, failing, draft] = prs as unknown as PullRequestNode[];
const ids = (pr: PullRequestNode) => availableActions(pr).map((a) => a.id);
const action = (id: string) => ACTIONS.find((a) => a.id === id)!;

describe('actions', () => {
  it('offers only what applies to each PR', () => {
    expect(ids(auto!)).toEqual(['disableAutoMerge', 'convertToDraft', 'enqueue']);
    expect(ids(failing!)).toEqual(['updateBranch', 'dequeue', 'approve']);
    expect(ids(draft!)).toEqual(['markReady']);
  });

  it('never offers actions on closed PRs (except leaving the queue)', () => {
    const closed = { ...auto!, state: 'CLOSED' as const, autoMergeRequest: null };
    expect(ids(closed)).toEqual([]);
  });

  it('offers only the merge methods the repo allows', () => {
    const pr = { ...auto!, autoMergeRequest: null };
    expect(ids(pr)).toContain('enableAutoMerge');
    expect(action('enableAutoMerge').choices!(pr).map((c) => c.id)).toEqual(['SQUASH', 'REBASE']);
  });

  it('puts values in variables and pins the head commit', () => {
    const m = action('enableAutoMerge').mutation(auto!, 'REBASE');
    expect(m.query).not.toContain(auto!.id);
    expect(m.variables).toEqual({ id: auto!.id, method: 'REBASE', oid: auto!.headRefOid });
    expect(action('enqueue').mutation(auto!).variables.oid).toBe(auto!.headRefOid);
    expect(action('updateBranch').mutation(failing!, 'MERGE').variables.oid).toBe(failing!.headRefOid);
  });

  it('asks for confirmation before anything that can merge or rewrite', () => {
    for (const id of ['enableAutoMerge', 'enqueue', 'updateBranch', 'approve']) expect(action(id).confirm, id).toBeDefined();
  });

  it('every action declares its permissions and fragment', () => {
    for (const a of ACTIONS) {
      expect(a.requires.length).toBeGreaterThan(0);
      expect(a.fragment).toBeTruthy();
    }
  });
});
