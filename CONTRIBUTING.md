# Contributing

Thank you for helping. Most contributions add a **field** (a column) or an **action**.

## Add a field

1. Pick the file in `src/fields/` that fits (`core`, `review`, `checks`, `merge`), or make a new one and add it to `src/fields/registry.ts`.
2. Add one `defineField` entry:

   ```ts
   defineField<number | undefined>({
     id: 'commits',                       // stable: configs use it
     label: 'Commits',
     description: 'Number of commits.',   // shown in the column picker
     fragment: 'commits { totalCount }',  // GraphQL selection on PullRequest
     get: (pr) => pr.commits?.totalCount,
     display: (v) => (v === undefined ? EMPTY : { text: String(v) }),
     requires: ['Pull requests: read'],
   }),
   ```

   - `display` returns a plain `Cell` (text, title, https href, tone, icon id, chips). **Never return markup.**
   - Add `sortValue` and `groupValue` when the raw value does not sort or group well.
   - Set `cost: 'high'` for fragments that fetch many nodes (connections with large `first:`).
   - If two fields need the same connection with different arguments, use an alias (`approvedReviews: reviews(states: APPROVED, first: 10)`).
   - Add the new property to `PullRequestNode` in `src/github/types.ts`.
3. Check the fragment against the live schema (GraphQL Explorer, or `gh api graphql`).
4. Test it with a fine-grained token that has the minimum permissions, and set `requires`.
5. Add a test in `tests/fields.test.ts` and one line to the field table in the README.

## Add an action

Add an entry to `src/actions/registry.ts`. Rules:

- Put every value in GraphQL **variables**, never in the query text.
- Pass `expectedHeadOid` when the mutation accepts it, so the action applies only to the commit the user saw.
- Add `confirm` for anything that can merge, rewrite history, or speak for the user.
- Gate `available` on a `viewerCan…` field when GitHub has one.

## Rules that do not change

- No backend. The token never leaves the browser except to the GitHub API.
- Configs are data. No `eval`, `new Function`, templates, or HTML from config or GitHub strings. No `{@html}`.
- Configs can never trigger an action.
- Query only what is displayed.
- Keep dependencies few. Each one is a supply-chain risk in an app that holds a token.

## Fixtures

Fixtures in `tests/fixtures` must be scrubbed: no private repository names, logins or titles.

## Commits

Conventional commits (`feat(fields): add commits`). Small PRs.
Before you open a PR: `npm run check && npm test && npm run build`.
