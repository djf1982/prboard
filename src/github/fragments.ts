/**
 * Returns the response keys (alias, or field name) at the top level of a
 * GraphQL selection, for example "a b: c { d }" -> ["a", "b"].
 * Used to map partial-data errors back to the fields that need them.
 */
export function topLevelKeys(selection: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;
  const s = selection;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '{' || ch === '(') { depth++; i++; continue; }
    if (ch === '}' || ch === ')') { depth--; i++; continue; }
    if (ch === '"') { i++; while (i < s.length && s[i] !== '"') { if (s[i] === '\\') i++; i++; } i++; continue; }
    if (depth === 0 && /[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j]!)) j++;
      const name = s.slice(i, j);
      let k = j;
      while (k < s.length && /\s/.test(s[k]!)) k++;
      if (s[k] === ':') {
        keys.push(name); // alias
        k++;
        while (k < s.length && /\s/.test(s[k]!)) k++;
        while (k < s.length && /[A-Za-z0-9_]/.test(s[k]!)) k++;
        i = k;
      } else {
        keys.push(name);
        i = j;
      }
      continue;
    }
    i++;
  }
  return [...new Set(keys)];
}

/** Collapses whitespace so equal fragments compare equal. */
export function normaliseFragment(fragment: string): string {
  return fragment.replace(/\s+/g, ' ').replace(/\s*([{}():,])\s*/g, '$1').trim();
}
