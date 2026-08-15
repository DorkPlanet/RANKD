// What a Rankd backup IS, and what makes one trustworthy.
//
// Split out of `backup.ts` when accounts arrived. The file path and the network
// path have to agree about the format exactly — a payload the server accepts but
// a restore rejects (or worse, the reverse) is a corrupted library nobody
// noticed. So the shape, the key set and the validation live here, once, and
// this module touches neither the DOM nor the network: `backup.ts` owns the file
// and `sync.ts` owns the wire, and both defer to this.

// ── Two key sets, because the file and the wire carry different things ─────
//
// The FILE is everything that is yours. The WIRE is the library blob only,
// because saved rankings sync as their own rows (see `savedList` in the schema):
// a list is the thing another person could one day follow, so it needs a stable
// row to point at rather than being sealed inside an opaque blob.
//
// Keeping these apart is load-bearing rather than tidy. `applyBackup` clears any
// key in the set it is given that the payload does not carry — so if the wire
// used the file's set, **every pull would delete your saved rankings**, since
// the blob deliberately does not contain them.

/** What goes on the wire, and the only thing the server's library blob holds. */
export const SYNC_KEYS = [
  "rankd-app-v1", // the library — films, scores, placements, duels
  "rankd-log-v1", // the evidence — every duel ever settled
  "rankd-profile-v1", // name, bio, banner, pinned rankings
  "rankd-brightness",
  "rankd-strip-open",
] as const;

// ── Which keys each FILE format owns ───────────────────────────────────────
//
// A restore clears any key it owns that the file does not carry, because a
// restore replaces state wholesale. That turns destructive the moment a key is
// added: a backup written earlier cannot mention it, and its absence would read
// as "delete this" — for `rankd-lists-v1`, every saved ranking, gone silently on
// a restore somebody asked for to be SAFE.
//
// So ownership is recorded per format. A restore clears only what its own format
// knew about; anything introduced later is none of that file's business.
const FILE_1 = SYNC_KEYS;

const FILE_2 = [
  ...SYNC_KEYS,
  "rankd-lists-v1", // saved rankings — real work, and the reason this exists
  "rankd-tour-v1", // whether the coach marks have run
  "rankd-review-dismissed-v1", // review cards already answered
] as const;

export const FILE_KEYS_BY_FORMAT: Record<number, readonly string[]> = { 1: FILE_1, 2: FILE_2 };

export const FORMAT = 2;
/** What a file written today carries. */
export const FILE_KEYS = FILE_2;

// Deliberately in NEITHER set:
//
//  · `rankd-run-v1` — an in-progress climb is ephemeral device state, and a
//    backup carries what you decided rather than what you had not decided yet.
//    Nobody wants a half-finished duel following them onto another phone.
//  · `rankd-synced-at` — sync bookkeeping about THIS browser. Carrying one
//    device's marker to another would make the second believe it had already
//    pushed work it has never seen.

export interface Backup {
  format: number;
  savedAt: string;
  keys: Record<string, string>;
}

export interface BackupSummary {
  films: number;
  /** How many recorded duels came back with them; 0 for a pre-log backup. */
  judgements: number;
  hadProfile: boolean;
}

/** Thrown for every rejection, so callers can show the message as-is. */
export class BackupError extends Error {}

/**
 * Check a parsed value all the way through and describe what is in it, or throw
 * explaining why it cannot be trusted.
 *
 * Nothing is written and nothing is mutated — the caller decides what to do with
 * a payload that passed. That separation is the point: a half-applied restore
 * would be worse than a failed one (you'd lose what you had and not gain what
 * you meant to), and a half-accepted upload would put a corrupt library on the
 * server where every future device would pull it.
 */
export function validateBackup(parsed: unknown): { backup: Backup; summary: BackupSummary } {
  const backup = parsed as Partial<Backup> | null;
  if (!backup || typeof backup !== "object" || !backup.keys || typeof backup.keys !== "object") {
    throw new BackupError("That doesn't look like a Rankd backup.");
  }
  // Every format this build understands, not only the one it writes. Refusing
  // older files would strand every backup anybody has already saved.
  if (!FILE_KEYS_BY_FORMAT[backup.format as number]) {
    throw new BackupError(
      `That backup is format ${backup.format ?? "unknown"}; this version reads 1 and ${FORMAT}.`,
    );
  }

  const raw = backup.keys["rankd-app-v1"];
  if (!raw) throw new BackupError("That backup has no library in it.");

  let films: unknown;
  try {
    films = JSON.parse(raw);
  } catch {
    throw new BackupError("The library inside that backup is corrupt.");
  }
  if (!Array.isArray(films) || films.length === 0) {
    throw new BackupError("The library inside that backup is empty.");
  }
  const ok = films.every(
    (f) =>
      f &&
      typeof f === "object" &&
      typeof (f as { id?: unknown }).id === "string" &&
      typeof (f as { rating?: unknown }).rating === "number" &&
      typeof (f as { score?: unknown }).score === "number",
  );
  if (!ok) throw new BackupError("Some films in that backup are missing an id, rating or score.");

  // The evidence log, if the payload is new enough to carry one. Checked but not
  // required: a backup written before the log existed is still a perfectly good
  // backup, and refusing it would strand every file saved up to now. Note that
  // restoring such a file DOES clear the log — a restore replaces the app's
  // state wholesale, and a half-restore would be worse than none.
  const rawLog = backup.keys["rankd-log-v1"];
  let judgements = 0;
  if (rawLog !== undefined) {
    let rows: unknown;
    try {
      rows = JSON.parse(rawLog);
    } catch {
      throw new BackupError("The comparison log inside that backup is corrupt.");
    }
    // See lib/log.ts for the shape: a version, an interned film-id dictionary,
    // and tuple rows [id, aIndex, bIndex, outcome, modeCode, at].
    const log = rows as { v?: unknown; f?: unknown; r?: unknown };
    if (!log || typeof log !== "object" || log.v !== 1 || !Array.isArray(log.f) || !Array.isArray(log.r)) {
      throw new BackupError("The comparison log inside that backup isn't in a format this version reads.");
    }
    judgements = log.r.length;
  }

  return {
    backup: backup as Backup,
    summary: {
      films: films.length,
      judgements,
      hadProfile: !!backup.keys["rankd-profile-v1"],
    },
  };
}

/** The same check, starting from text. The file path's entry point. */
export function parseBackup(text: string): { backup: Backup; summary: BackupSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }
  return validateBackup(parsed);
}
