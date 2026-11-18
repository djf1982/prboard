# prboard

A GitHub pull-request dashboard where **you choose the columns**.

GitHub's pull request lists do not let you pick which fields to show, and they do not show auto-merge.
Tools such as Graphite, gh-dash and Mergeable let you choose *which* PRs appear. prboard also lets you
choose *which fields* appear for each PR: auto-merge, pending reviewers, failing check names, merge
state, merge queue position, unresolved threads and more. An optional **Actions** column lets you act
on a PR without leaving the table.

<!-- screenshots: add docs/screenshot-light.png and docs/screenshot-dark.png -->

## Your token stays with you (trust and privacy)

- **prboard has no backend.** It is a static site. Your browser sends API calls straight to GitHub.
- **The token goes only to the GitHub API.** A strict Content Security Policy lets the page connect only to `api.github.com` (or the hosts you build it for).
- **The token is kept in sessionStorage by default** and is gone when you close the tab. "Remember me" keeps it in localStorage. **Sign out** clears everything prboard stored.
- **No analytics, telemetry or third-party scripts.** No avatars or other remote images load.
- **Configs are data, never code.** A shared config cannot run anything: no `eval`, no templates, no HTML. Links must be `https:`.
- **Configs can never start an action.** Actions run only when you click them, and actions that can merge code ask first.
- The token is removed from error messages and from anything prboard copies to the clipboard.

Read the code: it is small. The places that touch the token are `src/auth` and `src/github/client.ts`.

## Use it

1. Open the hosted site (GitHub Pages), or run it yourself: `npm ci && npm run dev`.
2. Create a **fine-grained personal access token** (see below) and paste it in.
3. Edit views with the **View**, **Columns** and **Config** panels, or click column headers:
   click to sort (Shift-click to sort by more than one column), ⊞ to group, × to hide, drag to reorder, and drag the edge to resize.
   Every change is written back to the config.

### Token permissions

Make a [fine-grained token](https://github.com/settings/personal-access-tokens/new) for the owner and repositories you want to see.

| Use | Repository permissions |
| --- | --- |
| Read-only dashboard | Pull requests: **read**, Commit statuses: **read** (Metadata: read is automatic) |
| Actions column | Pull requests: **read and write** |
| "Update branch" action | also Contents: **read and write** |
| "Load from repo" config | also Contents: **read** |

**The `checks` column and fine-grained tokens.** Fine-grained tokens have no "Checks" permission, and GitHub does not list the check-runs endpoints for them. So a fine-grained token may see only legacy commit statuses, and the column shows **no access** for GitHub Actions checks. A classic token with the `repo` scope can read check runs, but that scope also grants write access to every repository you can reach. A GitHub App or OAuth sign-in is the long-term fix (see "Later" in `claude.md`).

When the token cannot read a field, the cell shows **no access** and names the permission it needs.
When an action fails because the token cannot write, a banner says which permission to add.

**Organisation gotchas**

- An organisation can require approval for fine-grained tokens. The token sees nothing in that organisation until an owner approves it.
- In SAML SSO organisations, a classic token needs SSO authorisation (Settings → Tokens → Configure SSO).
- Search returns at most 1,000 results per query. prboard tells you when it hits this limit. Narrow the query to see the rest.

## Fields

| id | Shows | Cost | Needs |
| --- | --- | --- | --- |
| `number` | PR number | low | Pull requests: read |
| `title` | Title, as plain text | low | Pull requests: read |
| `url` | Link to the PR | low | Pull requests: read |
| `repository` | owner/name | low | Pull requests: read |
| `author` | Who opened it | low | Pull requests: read |
| `isDraft` | Draft or ready | low | Pull requests: read |
| `state` | Open, closed or merged | low | Pull requests: read |
| `createdAt` | When it was opened | low | Pull requests: read |
| `updatedAt` | When it last changed | low | Pull requests: read |
| `age` | Time since it was opened | low | Pull requests: read |
| `labels` | Labels (first 20) | low | Pull requests: read |
| `assignees` | Assignees (first 10) | low | Pull requests: read |
| `milestone` | Milestone | low | Pull requests: read |
| `baseRef` | Target branch | low | Pull requests: read |
| `headRef` | Source branch | low | Pull requests: read |
| `additions` | Lines added | low | Pull requests: read |
| `deletions` | Lines deleted | low | Pull requests: read |
| `changedFiles` | Files changed | low | Pull requests: read |
| `size` | XS–XL from lines changed | low | Pull requests: read |
| `comments` | Conversation comments | low | Pull requests: read |
| `autoMerge` | **Auto-merge on/off and method**; who enabled it on hover | low | Pull requests: read |
| `reviewDecision` | Approved / changes requested / review required | low | Pull requests: read |
| `pendingReviewers` | People and teams still asked to review | low | Pull requests: read; Members: read for team names (unverified) |
| `latestReviews` | Who approved and who asked for changes | low | Pull requests: read |
| `checks` | Passing/total checks; failing names on hover | **high** | Pull requests and Commit statuses: read. Check runs (GitHub Actions) need a classic token; see above |
| `mergeState` | Clean / blocked / behind / dirty / unstable / draft | low | Pull requests: read |
| `mergeable` | Mergeable / conflicting / unknown | low | Pull requests: read |
| `mergeQueue` | Position and state in the merge queue | low | Pull requests: read |
| `unresolvedThreads` | Unresolved review threads (first 100 counted) | **high** | Pull requests: read |
| `actions` | Buttons: enable/disable auto-merge, ready for review, convert to draft, update branch, add to/remove from merge queue, approve | low | Pull requests: read and write |

"High cost" fields use more of the GraphQL rate limit (5,000 points per hour). The footer shows what is left.
Permissions marked "unverified" are our best reading of GitHub's docs. Please open an issue if you test them with a minimal token.

## Config

Configs are YAML or JSON. The [JSON Schema](public/prboard.schema.json) gives autocomplete in editors.

```yaml
# yaml-language-server: $schema=https://djf1982.github.io/prboard/prboard.schema.json
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
      - actions
      - { id: ticket, from: title, regex: "ACME-\\d+", link: "https://linear.app/acme/issue/$0" }
      - { id: area, from: labels, prefix: "area/" }
      - { id: checks, width: 120, hidden: true }
```

- A column is a field id, or `{ id, label?, width?, hidden? }`.
- **Computed columns** are declarative only:
  - `{ id, from, regex }`: the first match of `regex` in field `from`.
  - add `link`: an `https://` link template. `$0`–`$9` insert match groups. The host must be fixed text.
  - `{ id, from, prefix }`: list items (for example labels) that start with `prefix`, with the prefix removed.
  - To prevent ReDoS from shared configs, regexes cannot use backreferences, lookaround, nested quantifiers such as `(a+)+`, or repeated groups with `|`. Input is capped at 1,000 characters, and patterns run in a Web Worker that is stopped after 750 ms.
- **Where configs come from:** the built-in default, this browser (localStorage), an imported file, a shared link (`#config=…`), or a repository file (`.github/prboard.yml`, read with your token). The footer shows the active source. A config from a link, file or repo is not saved until you click **Keep this config**.
- Errors name the path, for example `views[1].columns[3]: unknown field 'automerge' — did you mean 'autoMerge'?`

## GitHub Enterprise Server

Set the GraphQL API URL on the sign-in screen (`https://HOST/api/graphql`). Build with your host in the CSP:

```sh
PRBOARD_API_HOSTS="https://api.github.com https://ghe.example.com" npm run build
```

## Develop

```sh
npm ci
npm run dev      # dev server (no CSP in dev mode)
npm test         # unit tests (Vitest)
npm run check    # type check (svelte-check)
npm run build    # production build in dist/, with the CSP
npm run schema   # regenerate public/prboard.schema.json
```

Stack: TypeScript, Svelte 5, Vite, TanStack Table v9, zod, yaml. See [CONTRIBUTING.md](CONTRIBUTING.md) to add a field or an action.

## Licence

MIT. See [LICENSE](LICENSE).
