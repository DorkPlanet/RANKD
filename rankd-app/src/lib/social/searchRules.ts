// The one rule about searching that BOTH sides have to agree on.
//
// ── Why a whole module for a single number ─────────────────────────────────
//
// It lived in `people.ts`, which is the obvious home and the wrong one:
// `people.ts` imports the database, so a client component importing this
// constant from it pulled the entire postgres driver into the browser bundle.
// The build caught it as `Can't resolve 'fs'`, which is a long way from the
// actual mistake.
//
// So the value sits on its own, importing nothing. The server refuses to search
// below it and the field declines to ask below it, and those two have to be the
// same number or one of them is lying about what the other will do.

/** Enough to be worth searching for. One letter matches most of the world. */
export const MIN_QUERY = 2;
