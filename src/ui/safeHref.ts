/** Only https links reach the DOM. Anything else (javascript:, data:, http:) is dropped. */
export function safeHref(href: string | undefined | null): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
