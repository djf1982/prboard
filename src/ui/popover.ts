/** Places a top-layer popover next to its trigger, inside the viewport. */
export function placeNear(trigger: HTMLElement, pop: HTMLElement, align: 'start' | 'end' = 'start'): { top: number; left: number } {
  const r = trigger.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const raw = align === 'end' ? r.right - w : r.left;
  const left = Math.max(8, Math.min(raw, window.innerWidth - w - 8));
  const below = r.bottom + 6;
  const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
  return { top, left };
}

let seq = 0;
export function nextPopoverId(prefix = 'pop'): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
