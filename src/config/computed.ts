import type { Cell } from '../fields/types';

/** Guards against ReDoS from shared configs. Patterns also run in a worker with a timeout (see regexRunner.ts). */
export const MAX_PATTERN_LENGTH = 200;
export const MAX_INPUT_LENGTH = 1000;
const MAX_REPEAT = 100;

/**
 * Rejects regex features that make backtracking blow up, or that we do not need:
 * backreferences, lookaround, nested quantifiers (such as (a+)+), quantified
 * alternation (such as (a|ab)*) and large counted repeats.
 * Returns an error message, or null when the pattern is allowed.
 */
export function checkRegex(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return `regex is longer than ${MAX_PATTERN_LENGTH} characters`;
  try {
    new RegExp(pattern, 'u');
  } catch (e) {
    return `regex is not valid: ${(e as Error).message}`;
  }
  if (/\\[1-9]|\\k</.test(pattern)) return 'regex: backreferences are not allowed';
  if (/\(\?<?[=!]/.test(pattern)) return 'regex: lookahead and lookbehind are not allowed';

  // Walk the pattern. For each group, remember if it holds a quantifier or "|".
  const stack: { quant: boolean; alt: boolean }[] = [{ quant: false, alt: false }];
  let lastAtomWasGroup: { quant: boolean; alt: boolean } | null = null;
  let i = 0;
  const p = pattern;
  const isQuant = (at: number): { len: number; max: number } | null => {
    const ch = p[at];
    if (ch === '*' || ch === '+') return { len: 1, max: Infinity };
    if (ch === '?') return { len: 1, max: 1 };
    if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(at));
      if (!m) return null;
      const max = m[2] === undefined ? Number(m[1]) : m[3] === '' ? Infinity : Number(m[3]);
      return { len: m[0].length, max };
    }
    return null;
  };
  while (i < p.length) {
    const ch = p[i]!;
    if (ch === '\\') { i += 2; lastAtomWasGroup = null; }
    else if (ch === '[') {
      i++;
      if (p[i] === '^') i++;
      if (p[i] === ']') i++;
      while (i < p.length && p[i] !== ']') i += p[i] === '\\' ? 2 : 1;
      i++;
      lastAtomWasGroup = null;
    } else if (ch === '(') {
      stack.push({ quant: false, alt: false });
      i++;
      if (p[i] === '?') { // (?: or (?<name>
        i++;
        if (p[i] === '<') { while (i < p.length && p[i] !== '>') i++; }
        i++;
      }
      lastAtomWasGroup = null;
      continue;
    } else if (ch === ')') {
      const g = stack.pop()!;
      const parent = stack[stack.length - 1]!;
      if (g.quant) parent.quant = true;
      lastAtomWasGroup = g;
      i++;
    } else if (ch === '|') { stack[stack.length - 1]!.alt = true; i++; lastAtomWasGroup = null; continue; }
    else { i++; lastAtomWasGroup = null; }

    const q = isQuant(i);
    if (q) {
      if (q.max !== Infinity && q.max > MAX_REPEAT) return `regex: repeat counts above ${MAX_REPEAT} are not allowed`;
      if (lastAtomWasGroup && q.max > 1) {
        if (lastAtomWasGroup.quant) return 'regex: nested quantifiers such as (a+)+ are not allowed';
        if (lastAtomWasGroup.alt) return 'regex: a repeated group with "|" such as (a|b)+ is not allowed; use a character class';
      }
      stack[stack.length - 1]!.quant = true;
      i += q.len;
      if (p[i] === '?') i++; // lazy
      lastAtomWasGroup = null;
    }
  }
  return null;
}

/**
 * A link template must be https, and its host must be literal text, so a PR
 * title can never pick where the link goes.
 */
export function checkLinkTemplate(template: string): string | null {
  if (!template.startsWith('https://')) return 'link must start with https://';
  const rest = template.slice('https://'.length);
  const host = rest.split(/[/?#]/)[0] ?? '';
  if (!host || host.includes('$')) return 'link: the host must be fixed text (no $ before the first /)';
  try {
    new URL(template.replace(/\$\d/g, 'x'));
  } catch {
    return 'link is not a valid URL';
  }
  return null;
}

export function buildLink(template: string, match: readonly (string | undefined)[]): string | undefined {
  if (checkLinkTemplate(template)) return undefined;
  const url = template.replace(/\$(\d)/g, (_, d: string) => encodeURIComponent(match[Number(d)] ?? ''));
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export interface ComputedSpec {
  id: string;
  from: string;
  regex?: string;
  link?: string;
  prefix?: string;
}

/** The text and list items read from the source field. */
export interface ComputedSource {
  text: string;
  items: string[];
}

/** Runs a checked regex on capped input. Only call with patterns that passed checkRegex. */
export function firstMatch(pattern: string, input: string): string[] | null {
  const m = new RegExp(pattern, 'u').exec(input.slice(0, MAX_INPUT_LENGTH));
  return m ? Array.from(m, (s) => s ?? '') : null;
}

/** Turns a match (or prefix items) into a cell. Pure, so it is easy to test. */
export function regexCell(spec: ComputedSpec, match: string[] | null): Cell {
  if (!match) return { text: '', tone: 'muted' };
  const text = match[0] ?? '';
  return spec.link ? { text, href: buildLink(spec.link, match) } : { text };
}

export function prefixCell(prefix: string, src: ComputedSource): Cell {
  const items = src.items.filter((s) => s.startsWith(prefix)).map((s) => s.slice(prefix.length)).filter(Boolean);
  return { text: items.join(', '), chips: items.map((t) => ({ text: t })) };
}
