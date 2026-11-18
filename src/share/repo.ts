import type { Client } from '../github/client';
import { parseConfigText, type ParseResult } from '../config/parse';

export const DEFAULT_REPO_PATH = '.github/prboard.yml';

export interface RepoRef {
  owner: string;
  name: string;
  ref: string;
  path: string;
}

/** Reads "owner/name", "owner/name@ref" or "owner/name@ref:path/to/file.yml". */
export function parseRepoRef(input: string): RepoRef | null {
  const m = /^\s*([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:@([^:\s]+))?(?::(\S+))?\s*$/.exec(input);
  if (!m) return null;
  return { owner: m[1]!, name: m[2]!, ref: m[3] ?? 'HEAD', path: m[4] ?? DEFAULT_REPO_PATH };
}

/** Fetches the config file through GraphQL, so the app only ever talks to the API host. */
export async function loadRepoConfig(client: Client, ref: RepoRef): Promise<ParseResult> {
  const res = await client.query<{ repository: { object: { text: string | null; isTruncated: boolean } | null } | null }>(
    'query($o: String!, $n: String!, $e: String!) { repository(owner: $o, name: $n) { object(expression: $e) { ... on Blob { text isTruncated } } } }',
    { o: ref.owner, n: ref.name, e: `${ref.ref}:${ref.path}` },
  );
  const where = `${ref.owner}/${ref.name}@${ref.ref}:${ref.path}`;
  if (!res.data?.repository) return { ok: false, errors: [{ path: '(repo)', message: res.errors[0]?.message ?? `cannot read ${ref.owner}/${ref.name}` }] };
  const obj = res.data.repository.object;
  if (!obj || obj.text == null) return { ok: false, errors: [{ path: '(repo)', message: `no file at ${where} (the token needs Contents: read)` }] };
  if (obj.isTruncated) return { ok: false, errors: [{ path: '(repo)', message: `${where} is too large` }] };
  return parseConfigText(obj.text);
}
