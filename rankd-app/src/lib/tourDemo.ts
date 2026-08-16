// Which tutorial demonstration is running, if any.
//
// ── Why this exists rather than a prop ─────────────────────────────────────
//
// `Coach` draws over whatever screen is beneath it and knows nothing about that
// screen — it is handed steps and a target name, and it finds the target in the
// DOM. That independence is the reason one component serves three tours.
//
// A demo has to break the other way: the SCREEN performs it, because only the
// screen knows what its own controls do. Passing the active step down would mean
// threading tour state from AppShell through DuelScreen into RoughCut, and every
// future screen that wants a demo would add another prop to that chain.
//
// So this is the seam, and it is deliberately one string. Coach publishes the
// name on the active step; a screen subscribes and decides for itself what that
// name means. Neither module imports the other.
//
// A leaf module, importing nothing, for the same reason `syncState.ts` is one.

let active: string | null = null;
const listeners = new Set<() => void>();

/** Coach calls this on every step change, and with null when the tour ends. */
export function setDemo(name: string | null): void {
  if (active === name) return;
  active = name;
  for (const fn of listeners) fn();
}

export function activeDemo(): string | null {
  return active;
}

export function subscribeDemo(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
