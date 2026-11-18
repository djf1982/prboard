/** Storage access that never throws (private mode, blocked storage, quota). */
export const KEYS = {
  token: 'prboard.token',
  /** GitHub App sign-in: access token, expiry and refresh token (JSON). */
  session: 'prboard.session',
  apiUrl: 'prboard.apiUrl',
  config: 'prboard.config',
} as const;

function store(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function read(key: string): { value: string; where: 'local' | 'session' } | null {
  for (const where of ['session', 'local'] as const) {
    try {
      const v = store(where)?.getItem(key);
      if (v) return { value: v, where };
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function writeTo(where: 'local' | 'session', key: string, value: string): boolean {
  try {
    store(where)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  for (const where of ['session', 'local'] as const) {
    try {
      store(where)?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Sign-out: removes every prboard key from both storages. */
export function clearAll(): void {
  for (const where of ['session', 'local'] as const) {
    try {
      const s = store(where);
      if (!s) continue;
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith('prboard.')) keys.push(k); }
      keys.forEach((k) => s.removeItem(k));
    } catch {
      /* ignore */
    }
  }
}
