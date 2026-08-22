// A public address for a person.
//
// ── Why this is stricter than it needs to be ───────────────────────────────
//
// A handle is the one string in Rankd that other people type, read aloud and
// mistake for somebody else's. Every character class allowed here is one that
// can be used to impersonate: `rn` for `m`, a trailing dot, a Cyrillic `а`. So
// the set is deliberately small, and it can always be widened later. It can
// never be narrowed, because by then people own names that would stop being
// valid.
//
// Hyphens are out for a smaller reason and a real one: `VOICE.md` rule 2 bans
// em dashes in copy, and a handle full of hyphens reads as punctuation wherever
// it is quoted in a sentence. Underscore carries the same job without that.
//
// ── This module knows nothing about the database ───────────────────────────
//
// Availability is not a property of a string, it is a property of a moment, and
// the unique index on `lower(handle)` is the only thing entitled to answer it.
// Everything here is pure so it can be tested without a connection, and so the
// same rules run on the client (to tell you early) and the server (to decide).

import { handleIsClean } from "./profanity";

/** Three is short enough to be worth wanting and long enough to type. */
export const HANDLE_MIN = 3;
/** Twenty fits a nav row and a share card without wrapping. */
export const HANDLE_MAX = 20;

/**
 * Lowercase letters, digits and underscore, starting and ending alphanumeric.
 *
 * The start/end rule is what stops `_sam` and `sam_` being different people at
 * a glance, and it keeps a handle from looking like a broken template when it
 * lands mid sentence.
 */
const SHAPE = /^[a-z0-9][a-z0-9_]*[a-z0-9]$/;

/**
 * Names nobody may take.
 *
 * Two different dangers, kept in one set because the answer is the same.
 *
 * ROUTES: these collide with real paths. `/@:handle` rewrites to `/u/:handle`,
 * so a handle that matches a top-level segment would either shadow a page or be
 * shadowed by one, and which of those happens is a Next.js implementation
 * detail rather than a decision anybody made. MUST be kept in step with
 * `src/app/` by hand.
 *
 * IMPERSONATION: these read as Rankd itself, or as somebody with authority over
 * you. `@support` asking for your password is a handle, not a hack.
 */
export const RESERVED: ReadonlySet<string> = new Set([
  // Routes.
  "api", "u", "s", "list", "lists", "feed", "vs", "settings", "signin", "signout",
  "login", "logout", "auth", "_next", "static", "public", "assets", "favicon",
  "icon", "icons", "manifest", "robots", "sitemap", "sw", "opengraph-image",
  "images", "img", "fonts", "discover", "search", "report",
  // Impersonation.
  "rankd", "rnkd", "rnk", "admin", "administrator", "root", "official", "staff",
  // System accounts. The house account IS Rankd (handle `rankd`, already above),
  // so nothing else needs holding for it. These two read as Rankd machinery to
  // anybody scanning a follower list, which is the impersonation this set is for.
  //
  // `faulkner` and `canon` were briefly reserved here for a named house account
  // that is not being built. Released, because reserving a real surname for a
  // thing nobody is going to use refuses somebody their own name for nothing.
  "house", "bot",
  "team", "mod", "mods", "moderator", "support", "help", "contact", "about",
  "terms", "privacy", "legal", "security", "abuse", "billing", "system",
  "me", "you", "null", "undefined", "none", "anonymous", "deleted", "unknown",
  "everyone", "here", "all", "new", "edit", "delete",
]);

/**
 * What someone typed, as the database would store it.
 *
 * Strips a leading `@` because that is how people say a handle out loud and how
 * every other surface prints it, so refusing it would be pedantry. Does NOT
 * substitute characters: turning a space into an underscore would hand somebody
 * a name they did not choose and would then have to live with.
 */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; reason: string };

/**
 * Is this a handle at all?
 *
 * The reasons are the sentences shown to the reader, so they are written to be
 * read rather than logged. One rule per message: "3 to 20 characters, letters,
 * numbers and underscore" is technically complete and tells somebody who typed
 * `sam!` nothing about which half they got wrong.
 */
export function validateHandle(raw: string): HandleCheck {
  const handle = normalizeHandle(raw);

  if (handle.length === 0) return { ok: false, reason: "Pick a name people can find you by." };
  if (handle.length < HANDLE_MIN) {
    return { ok: false, reason: `That's too short. ${HANDLE_MIN} characters is the minimum.` };
  }
  if (handle.length > HANDLE_MAX) {
    return { ok: false, reason: `That's too long. ${HANDLE_MAX} characters is the maximum.` };
  }
  // Checked before SHAPE so the commonest mistake gets the clearest sentence.
  // SHAPE would reject a space too, with a message about where names may start.
  if (/[^a-z0-9_]/.test(handle)) {
    return { ok: false, reason: "Letters, numbers and underscore only." };
  }
  if (!SHAPE.test(handle)) {
    return { ok: false, reason: "Start and end with a letter or a number." };
  }
  if (RESERVED.has(handle)) {
    return { ok: false, reason: "That one's spoken for. Try another." };
  }
  // Last, because it is the only check that can be wrong about an innocent name,
  // and running it after the cheap structural ones means a typo gets a useful
  // sentence rather than this one.
  const clean = handleIsClean(handle);
  if (!clean.clean) return { ok: false, reason: clean.reason };
  return { ok: true, handle };
}

/**
 * A name to offer somebody who has not thought about it yet.
 *
 * Seeds are tried in the order given, so the caller decides what it would
 * rather suggest. Each is reduced to the allowed set rather than rejected: a
 * seed is a hint, not a submission, and "Jarrad Bishop" should become
 * `jarradbishop` instead of being dropped for having a space in it. That is the
 * opposite of `normalizeHandle`'s rule, and deliberately so. Nothing is claimed
 * here, and whatever comes back lands in a field the reader can still change.
 *
 * Returns `""` when nothing survives, which is a fine answer. An empty field
 * asks the question; a bad guess makes the reader delete something first.
 */
export function suggestHandle(seeds: readonly (string | null | undefined)[]): string {
  for (const seed of seeds) {
    if (!seed) continue;
    const candidate = seed
      .trim()
      .toLowerCase()
      // Anything that is not allowed becomes nothing, rather than an underscore.
      // A person is `jarradbishop`, not `jarrad_bishop_`, and the latter is what
      // substitution produces once a trailing full stop is involved.
      .replace(/[^a-z0-9_]/g, "")
      .replace(/^_+|_+$/g, "")
      .slice(0, HANDLE_MAX);
    if (validateHandle(candidate).ok) return candidate;
  }
  return "";
}
