# CLAUDE.md — PR dashboard (working name: `prboard`)

> Working name only. Rename freely; search the repo for `prboard` when you do.

## What this is

An open-source, fully client-side dashboard for GitHub pull requests. Users define **views**: a GitHub search query plus a configurable **table** (columns, grouping, sorting). Columns can show data that GitHub's own PR pages hide — most importantly **auto-merge status**, plus pending reviewers, failing check names, merge state, and more.

Why it exists: github.com/pulls and the repo PR list don't let you choose columns, and they don't show auto-merge. Existing alternatives (Graphite, gh-dash, Mergeable) let you configure *which PRs* appear (sections/filters), but not *which fields* appear for each PR. That is the gap this fills.

## Principles (don't trade these away)

1. **No backend for data.** Static app, deployable to GitHub Pages. The only server code is the optional, stateless token exchange in `worker/` for GitHub App sign-in (see `docs/plans/oauth-signin.md`); personal access tokens need no server. All GitHub API calls go directly from the user's browser. The token never leaves the user's machine. This is the main trust argument for an OSS tool that asks for GitHub access — say so in the README.
2. **Configs are data, never code.** Configs get shared between people (links, files in repos). They must never be able to execute anything. No `eval`, no `new Function`, no user-supplied templates that compile to JS, no rendering config strings as HTML. Computed columns are **declarative only** (see below).
3. **Columns are a registry, not a switch statement.** Adding a column = adding one registry entry. This is the main way contributors will extend the project, so keep it easy.
4. **Query only what's displayed.** The GraphQL query is built from the fields that the active views actually use. Rate limits and latency depend on it.
5. **Actions are clicks, never config.** Write actions (enable auto-merge, ready for review, merge queue, approve, …) run only when the user clicks them. A config can show the `actions` column but can never start an action. Actions that can merge or rewrite code ask for confirmation.

## Stack

- TypeScript (strict), Vite, **Svelte 5** (runes). Plain Svelte, not SvelteKit: this is a single-page static app and doesn't need routing or server features.
- **TanStack Table v9** via `@tanstack/svelte-table` (the Svelte 5 adapter) for sorting, grouping, column visibility, ordering and resizing. Don't hand-roll these. v9 requires explicit feature registration (`features: ...`); register only what's used. v9 is recent (Aug 2026), so check the current docs rather than v8-era examples.
- Fetching/refresh: a small hand-written store using runes (fetch, cache by view, poll on an interval, pause when the tab is hidden). No data-fetching library needed at this size.
- `zod` for config validation; publish a generated JSON Schema so editors can autocomplete config files
- `yaml` package for YAML import/export (JSON also accepted)
- Vitest for unit tests; Playwright optional for a smoke test
- Licence: MIT

Keep dependencies few and well-known. Each one is a supply-chain risk in an app that holds a GitHub token.

## Architecture

```
src/
  auth/          token entry, storage, validation (viewer query), sign-out
  github/        GraphQL client, query builder, pagination, rate-limit tracking
  fields/        the field registry, one file per field or small group
  config/        zod schema, defaults, parse/serialise (YAML/JSON), migrations
  views/         view runtime: config + data -> TanStack Table instance
  ui/            Svelte components: table, CellView, view tabs, view editor, settings, token screen
  share/         export/import, share-by-URL encoding
```

### Field registry

Each field is defined once:

```ts
interface FieldDef<T> {
  id: string;                  // stable, used in configs: "autoMerge"
  label: string;               // default column header
  description: string;         // shown in the column picker
  fragment: string;            // GraphQL selection on PullRequest needed for this field
  get: (pr: PullRequestNode) => T;       // extract the value
  sortValue?: (v: T) => string | number; // if the natural value doesn't sort well
  groupValue?: (v: T) => string;         // bucket label when grouping by this field
  display: (v: T, pr: PullRequestNode) => Cell; // plain data, rendered by one generic <CellView> component
  cost?: "low" | "high";       // high = expensive fragment (e.g. checks); surface in UI
  requires?: string[];         // token permissions this field needs
}

// Framework-agnostic cell model. Fields never produce markup.
interface Cell {
  text: string;
  title?: string;              // hover detail, e.g. failing check names
  href?: string;               // https only
  tone?: "neutral" | "good" | "warn" | "bad" | "muted";
  icon?: string;               // id from a fixed icon set
  chips?: { text: string; tone?: Cell["tone"] }[]; // labels, reviewers
}
```

Keeping fields free of framework code means the registry is plain TypeScript: easy to unit test, easy for contributors, and it can't inject HTML.

The query builder merges the `fragment`s of all fields that are used in any column, `groupBy` or `sort` across the active views. Fragments must be safe to merge, so use aliases where two fields need different arguments on the same connection.

### Initial fields (v1)

Core: `number`, `title`, `url`, `repository`, `author`, `isDraft`, `state`, `createdAt`, `updatedAt`, `age` (derived), `labels`, `assignees`, `milestone`, `baseRef`, `headRef`, `additions`, `deletions`, `changedFiles`, `size` (derived bucket), `comments`.

The differentiators:
- `autoMerge` — `autoMergeRequest { enabledAt enabledBy { login } mergeMethod }` → off / on (SQUASH/MERGE/REBASE), with who enabled it and when on hover
- `reviewDecision` — APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED / none
- `pendingReviewers` — `reviewRequests { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }`
- `latestReviews` — who approved and who requested changes
- `checks` — (built from `PullRequest.statusCheckRollup` directly, with `checkRunCountsByState`/`statusContextCountsByState` for exact counts) originally specified as `commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(...) { ... on CheckRun { name status conclusion } ... on StatusContext { context state } } } } } }` → "23/24", failing names on hover. **High cost.**
- `mergeState` — `mergeStateStatus` (BLOCKED / BEHIND / CLEAN / DIRTY / UNSTABLE / HAS_HOOKS / DRAFT / UNKNOWN). Verified 2026-11-18: no preview header is needed.
- `mergeable` — MERGEABLE / CONFLICTING / UNKNOWN
- `mergeQueue` — `isInMergeQueue`, `mergeQueueEntry { position state }`
- `unresolvedThreads` — count of `reviewThreads` where `isResolved == false` (paginate or cap; say which)

Verify every fragment against the live schema (GraphQL Explorer or introspection) before relying on it. Don't trust this list blindly.

### Declarative computed columns

Allowed in config, and nothing else:

```yaml
- { id: ticket, from: title, regex: "ACME-\\d+" }                     # first match, or empty
- { id: ticketLink, from: title, regex: "(ACME-\\d+)", link: "https://linear.app/acme/issue/$1" }
- { id: area, from: labels, prefix: "area/" }                        # labels starting with prefix, prefix stripped
```

Rules: regexes run with a length cap and a timeout guard (or use a linear-time engine such as `re2-wasm` if it's light enough) to avoid ReDoS from shared configs. Links must be `https:` and are built by substitution only. Never allow `javascript:` URLs.

## Config format

```yaml
version: 1
refreshSeconds: 120
views:
  - name: My PRs
    query: "is:open is:pr author:@me org:acme"
    groupBy: repository
    sort:
      - { field: updatedAt, dir: desc }
    columns:
      - title
      - autoMerge
      - reviewDecision
      - pendingReviewers
      - checks
      - mergeState
      - age
      - { id: ticket, from: title, regex: "ACME-\\d+" }
  - name: Needs my review
    query: "is:open is:pr review-requested:@me archived:false"
    sort:
      - { field: createdAt, dir: asc }
    columns: [title, author, repository, checks, age]
```

- A column entry is either a field id string or an object (`{ id, label?, width?, hidden? }` for a registry field, or a computed column).
- `version` + `config/migrations` from day one. Shared configs will outlive schema changes.
- Sources of config: built-in default → localStorage → imported file → URL (`#config=` + compressed base64) → optional "load from repo" (`.github/prboard.yml` fetched with the user's token). Show clearly where the active config came from.
- Changes made in the UI (sort, resize, hide, reorder, group) write back to the config, so the file and the UI never disagree.
- Validation errors must name the path and say what's wrong ("views[1].columns[3]: unknown field 'automerge' — did you mean 'autoMerge'?").

## GitHub API notes

- Use GraphQL `search(query:, type: ISSUE, first: 100, after:)` and filter for `... on PullRequest`.
- **Search returns at most 1,000 results per query.** Detect when results are truncated and tell the user; don't silently cut them off.
- Rate limit: GraphQL is points-based (5,000/hour for a user token). Request `rateLimit { cost remaining resetAt }` with every query and show it somewhere unobtrusive. `checks` and `unresolvedThreads` are the expensive fields; warn when a view combines them with a large result set.
- Refresh: configurable interval, pause when the tab is hidden, and a manual refresh button. Deduplicate PRs that appear in several views and fetch each view's query once per cycle.
- GitHub Enterprise Server: make the API base URL configurable. It is a local setting stored with the token, **not** part of the shared config: a shared config must never be able to send the token to another host (`https://HOST/api/graphql`). It's cheap to support now and painful to add later.

## Actions (write)

The `actions` column is a registry in `src/actions/registry.ts`, the same shape as fields: `fragment` (data needed to decide availability), `available(pr)`, optional `choices` and `confirm`, `mutation(pr, choice)` and `requires`.

- Values go in GraphQL variables, never in the query text.
- Pass `expectedHeadOid` (from `headRefOid`) when the mutation accepts it.
- Gate on `viewerCan…` fields where GitHub has one. `enqueue` has none, so it uses `viewerCanUpdate` as an approximation.
- v1 actions: enable/disable auto-merge, mark ready, convert to draft, update branch, enqueue/dequeue, approve.
- The token can stay read-only. Then the actions fail with a banner that names the missing permission.

## Auth

- v1: **fine-grained personal access token**. Read-only works for the dashboard; the Actions column needs Pull requests: read and write (and Contents: write for update branch). Work out and document the minimal permission set; at least Pull requests: read and Metadata: read, and probably Checks/Commit statuses: read for the `checks` field. Test each field with a minimal token and record which permission it needs in the registry (`requires?: string[]`), so the UI can explain any missing data.
- Document org gotchas: orgs can require approval for fine-grained tokens, and classic tokens need SSO authorisation in SAML orgs.
- Token storage: user's choice of sessionStorage (default) or localStorage ("remember me"). Wrap storage access in try/catch. Provide a sign-out that clears everything.
- Validate the token on entry with a `viewer { login }` query and show who you're signed in as.
- Fine-grained tokens have **no Checks permission** (confirmed 2026-11-18: not in the token UI, and the check-runs endpoints are not listed for fine-grained tokens). The `checks` column therefore needs a classic `repo` token or GitHub App sign-in to see GitHub Actions check runs.
- **GitHub App sign-in is live (2026-11-18):** app `prboard-17things` (owner djf1982), token exchange Worker at `https://prboard-auth.17things.co.uk` on the 17 Things Cloudflare account, installed on Scoutstuff. Checks column verified on scoutworks PRs.
- Later (not v1): optional OAuth via a tiny self-hostable token-exchange function. GitHub's OAuth token endpoint doesn't allow calls from the browser (no CORS), so it can't be done purely client-side.

## Security checklist

- Strict Content Security Policy in `index.html`: `connect-src` limited to the GitHub API host(s); no inline scripts.
- No analytics, telemetry or third-party scripts.
- All GitHub-sourced and config-sourced strings are rendered as text. Markdown PR titles are rendered plain.
- Never log the token; scrub it from error reports and from anything copied to the clipboard.
- Dependabot and `npm audit` in CI.

## UI

- View tabs across the top; table below; a column picker that lists every registry field with its description and cost.
- Grouped rows collapsible, with counts per group.
- Every row links to the PR. Keyboard navigation is a nice extra, not a requirement for v1.
- Light and dark mode following the system setting.
- Empty, loading, error and "token lacks permission for this field" states for every column.

## Milestones

1. **Skeleton:** Vite + Svelte 5 + TS, token screen, `viewer` check, one hard-coded view rendering `title`, `autoMerge`, `checks` from a real search query.
2. **Registry + query builder:** all v1 fields, built query, pagination, the 1,000-result warning, rate-limit display.
3. **Config:** zod schema, defaults, YAML/JSON import/export, validation errors, localStorage persistence, migrations scaffold.
4. **Table features:** sorting (multi-column), grouping, hiding/reordering/resizing, all written back to config.
5. **Sharing:** export file, share-by-URL, load from `.github/prboard.yml`.
6. **OSS release:** README (with screenshots and the trust/privacy section), CONTRIBUTING (how to add a field), LICENSE, CI (lint, typecheck, test, build), GitHub Pages deploy workflow, issue templates.

## Testing

- Unit tests for: each field's `get`/`sortValue`/`groupValue`/`display`, the query builder (fragment merging, only-used-fields), config parsing/validation/migrations, computed columns (including hostile regexes and `javascript:` links).
- Record real GraphQL responses as fixtures, **scrubbed** of private repo names, logins and titles before committing.
- Before calling a milestone done: run the app against a real account and check every column renders correctly for at least one PR with auto-merge on, one with a failing check, and one draft.

## Conventions

- Conventional commits (`feat(fields): add mergeQueue`).
- Small PRs per milestone.
- When adding a field: registry entry + test + one line in the README field table.
