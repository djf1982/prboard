import { defineField, EMPTY, type FieldDef } from './types';
import { isoTime, plural, relativeAge, shortDate, titleCase } from './format';

const PR_READ = ['Pull requests: read', 'Metadata: read'] as const;

export const coreFields: FieldDef[] = [
  defineField<number | undefined>({
    id: 'number', label: '#', description: 'Pull request number.', fragment: 'number', width: 70,
    get: (pr) => pr.number,
    display: (v, pr) => (v === undefined ? EMPTY : { text: `#${v}`, href: pr.url }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'title', label: 'Title', description: 'Pull request title, as plain text.', fragment: 'title', width: 380,
    get: (pr) => pr.title ?? '',
    sortValue: (v) => v.toLowerCase(),
    display: (v, pr) => ({ text: v, href: pr.url, title: v }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'url', label: 'URL', description: 'Link to the pull request.', fragment: 'url', width: 120,
    get: (pr) => pr.url,
    display: (v) => ({ text: v.replace(/^https:\/\/[^/]+\//, ''), href: v, title: v }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'repository', label: 'Repository', description: 'owner/name of the repository.', fragment: 'repository { nameWithOwner url }', width: 200,
    get: (pr) => pr.repository?.nameWithOwner ?? '',
    sortValue: (v) => v.toLowerCase(),
    groupValue: (v) => v || 'Unknown repository',
    display: (v, pr) => ({ text: v, href: pr.repository?.url }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'author', label: 'Author', description: 'Login of the person who opened the pull request.', fragment: 'author { login url }', width: 130,
    get: (pr) => pr.author?.login ?? '',
    sortValue: (v) => v.toLowerCase(),
    groupValue: (v) => v || 'Ghost',
    display: (v, pr) => (v ? { text: v, href: pr.author?.url } : { text: 'ghost', tone: 'muted' }),
    requires: [...PR_READ],
  }),
  defineField<boolean | undefined>({
    id: 'isDraft', label: 'Draft', description: 'Whether the pull request is a draft.', fragment: 'isDraft', width: 80,
    get: (pr) => pr.isDraft,
    sortValue: (v) => (v ? 1 : 0),
    groupValue: (v) => (v ? 'Draft' : 'Ready'),
    display: (v) => (v ? { text: 'draft', icon: 'draft', tone: 'muted' } : { text: 'ready', tone: 'neutral' }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'state', label: 'State', description: 'OPEN, CLOSED or MERGED.', fragment: 'state', width: 90,
    get: (pr) => pr.state ?? '',
    groupValue: (v) => (v ? titleCase(v) : 'Unknown'),
    display: (v) => ({ text: v ? titleCase(v) : '', tone: v === 'OPEN' ? 'good' : v === 'MERGED' ? 'neutral' : 'muted', icon: v === 'MERGED' ? 'merge' : undefined }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'createdAt', label: 'Created', description: 'When the pull request was opened.', fragment: 'createdAt', width: 110,
    get: (pr) => isoTime(pr.createdAt),
    display: (v) => (v === undefined ? EMPTY : { text: shortDate(new Date(v).toISOString()), title: new Date(v).toISOString() }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'updatedAt', label: 'Updated', description: 'When the pull request last changed.', fragment: 'updatedAt', width: 110,
    get: (pr) => isoTime(pr.updatedAt),
    display: (v) => (v === undefined ? EMPTY : { text: relativeAge(Date.now() - v) + ' ago', title: new Date(v).toISOString() }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'age', label: 'Age', description: 'Time since the pull request was opened.', fragment: 'createdAt', width: 70,
    get: (pr) => { const t = isoTime(pr.createdAt); return t === undefined ? undefined : Date.now() - t; },
    groupValue: (v) => (v === undefined ? 'Unknown' : v < 86_400_000 ? 'Under a day' : v < 7 * 86_400_000 ? 'Under a week' : v < 30 * 86_400_000 ? 'Under a month' : 'Older'),
    display: (v) => (v === undefined ? EMPTY : { text: relativeAge(v), tone: v > 14 * 86_400_000 ? 'warn' : 'neutral' }),
    requires: [...PR_READ],
  }),
  defineField<string[]>({
    id: 'labels', label: 'Labels', description: 'Labels on the pull request (first 20).', fragment: 'labels(first: 20) { nodes { name } }', width: 180,
    get: (pr) => pr.labels?.nodes.map((l) => l.name) ?? [],
    sortValue: (v) => v.join(',').toLowerCase(),
    groupValue: (v) => (v.length ? v.join(', ') : 'No labels'),
    display: (v) => ({ text: v.join(', '), chips: v.map((name) => ({ text: name })) }),
    requires: [...PR_READ],
  }),
  defineField<string[]>({
    id: 'assignees', label: 'Assignees', description: 'Assigned people (first 10).', fragment: 'assignees(first: 10) { nodes { login } }', width: 150,
    get: (pr) => pr.assignees?.nodes.map((a) => a.login) ?? [],
    sortValue: (v) => v.join(',').toLowerCase(),
    groupValue: (v) => (v.length ? v.join(', ') : 'Unassigned'),
    display: (v) => ({ text: v.join(', '), chips: v.map((login) => ({ text: login })) }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'milestone', label: 'Milestone', description: 'Milestone title.', fragment: 'milestone { title url }', width: 140,
    get: (pr) => pr.milestone?.title ?? '',
    groupValue: (v) => v || 'No milestone',
    display: (v, pr) => ({ text: v, href: pr.milestone?.url }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'baseRef', label: 'Base', description: 'Target branch.', fragment: 'baseRefName', width: 120,
    get: (pr) => pr.baseRefName ?? '',
    groupValue: (v) => v || 'Unknown',
    display: (v) => ({ text: v, icon: 'branch' }),
    requires: [...PR_READ],
  }),
  defineField<string>({
    id: 'headRef', label: 'Head', description: 'Source branch.', fragment: 'headRefName', width: 180,
    get: (pr) => pr.headRefName ?? '',
    display: (v) => ({ text: v, icon: 'branch', title: v }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'additions', label: '+', description: 'Lines added.', fragment: 'additions', width: 70,
    get: (pr) => pr.additions,
    display: (v) => (v === undefined ? EMPTY : { text: `+${v}`, tone: 'good' }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'deletions', label: '−', description: 'Lines deleted.', fragment: 'deletions', width: 70,
    get: (pr) => pr.deletions,
    display: (v) => (v === undefined ? EMPTY : { text: `−${v}`, tone: 'bad' }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'changedFiles', label: 'Files', description: 'Number of changed files.', fragment: 'changedFiles', width: 70,
    get: (pr) => pr.changedFiles,
    display: (v) => (v === undefined ? EMPTY : { text: String(v) }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'size', label: 'Size', description: 'XS–XL bucket from lines added plus deleted.', fragment: 'additions deletions', width: 70,
    get: (pr) => (pr.additions === undefined || pr.deletions === undefined ? undefined : pr.additions + pr.deletions),
    groupValue: (v) => sizeBucket(v),
    display: (v) => (v === undefined ? EMPTY : { text: sizeBucket(v), title: `${v} lines changed`, tone: v >= 1000 ? 'warn' : 'neutral' }),
    requires: [...PR_READ],
  }),
  defineField<number | undefined>({
    id: 'comments', label: 'Comments', description: 'Number of conversation comments.', fragment: 'comments { totalCount }', width: 90,
    get: (pr) => pr.comments?.totalCount,
    display: (v) => (v === undefined ? EMPTY : { text: String(v), icon: 'comment', title: plural(v, 'comment'), tone: v ? 'neutral' : 'muted' }),
    requires: [...PR_READ],
  }),
];

export function sizeBucket(lines: number | undefined): string {
  if (lines === undefined) return 'Unknown';
  if (lines < 10) return 'XS';
  if (lines < 50) return 'S';
  if (lines < 250) return 'M';
  if (lines < 1000) return 'L';
  return 'XL';
}
