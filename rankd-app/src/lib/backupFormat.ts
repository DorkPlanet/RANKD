// What a Rankd backup IS, and what makes one trustworthy.
//
// Split out of `backup.ts` when accounts arrived. The file path and the network
// path have to agree about the format exactly — a payload the server accepts but
// a restore rejects (or worse, the reverse) is a corrupted library nobody
// noticed. So the shape, the key set and the validation live here, once, and
// this module touches neither the DOM nor the network: `backup.ts` owns the file
// and `sync.ts` owns the wire, and both defer to this.

// Everything the app owns that belongs to the person rather than the device.
export const KEYS = [
  "rankd-app-v1", // the library — films, scores, placements, duels
  "rankd-log-v1", // the evidence — every duel ever settled
  "rankd-profile-v1", // name, bio, banner
  "rankd-brightness",
  "rankd-strip-open",
] as const;

// Deliberately absent, and each for its own reason:
//
//  · `rankd-lists-v1` — saved rankings sync as their own rows (see the schema),
//    because a list is the thing another person could one day follow. It is also
//    missing from the FILE backup, which is a real pre-existing gap; fixing that
//    needs the per-format key set described in HANDOVER.md and belongs with the
//    profile-library work, not here.
//  · `rankd-runs-v1` — an in-progress run is ephemeral device state. Nobody
//    wants a half-finished duel following them onto another phone.
//  · `rankd-synced-at` — sync bookkeeping about THIS browser. Carrying one
//    device's marker to another would make the second device believe it had
//    already pushed work it has never seen.

export const FORMAT = 1;

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
  if (backup.format !== FORMAT) {
    throw new BackupError(
      `That backup is format ${backup.format ?? "unknown"}; this version reads ${FORMAT}.`,
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
