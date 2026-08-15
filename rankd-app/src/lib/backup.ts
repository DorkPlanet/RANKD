"use client";

// Taking your library with you.
//
// localStorage is per-origin, so a deployed Rankd opens empty even on the
// machine that has 828 films in it — different origin, different storage. Until
// there's a backend this file is the only bridge between devices, and the only
// backup that exists at all: clearing your browser data today destroys every
// duel you've ever fought.
//
// Everything the app owns goes in one file, so a restore is complete rather than
// nearly complete.

// ── Which keys each format owns, and why that has to be recorded ───────────
//
// The restore loop clears any key it OWNS that the file does not carry, because
// a restore replaces the app's state wholesale rather than merging into it.
// That is right, and it is a trap the moment a new key is added: a backup
// written before the key existed cannot mention it, so a naive `KEYS` list
// would treat its absence as "delete this" — and for `rankd-lists-v1` that is
// every saved ranking somebody made, gone, silently, on a restore they asked
// for to be SAFE.
//
// So ownership is recorded per format. A restore only clears the keys its own
// format knew about; anything introduced later is none of that file's business
// and is left exactly as it is.
const FORMAT_1 = [
  "rankd-app-v1", // the library — films, scores, placements, duels
  "rankd-log-v1", // the evidence — every duel ever settled
  "rankd-profile-v1", // name, bio, banner, pinned rankings
  "rankd-brightness",
  "rankd-strip-open",
] as const;

const FORMAT_2 = [
  ...FORMAT_1,
  "rankd-lists-v1", // saved rankings — real work, and the reason this exists
  "rankd-tour-v1", // whether the coach marks have run
  "rankd-review-dismissed-v1", // review cards you have already answered
] as const;

const KEYS_BY_FORMAT: Record<number, readonly string[]> = { 1: FORMAT_1, 2: FORMAT_2 };

const FORMAT = 2;
const KEYS = FORMAT_2;

/**
 * Deliberately NOT backed up: `rankd-run-v1`.
 *
 * A backup carries what you decided. An unfinished climb is what you had not
 * decided yet, and restoring one onto a library it no longer matches is how you
 * hand `ladder.ts` a pile with a hole in it. `loadRun` validates anyway, but the
 * honest answer is that it does not belong in the file.
 */

interface Backup {
  format: number;
  savedAt: string;
  keys: Record<string, string>;
}

export function exportBackup(): void {
  const keys: Record<string, string> = {};
  for (const k of KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) keys[k] = v;
  }
  const backup: Backup = { format: FORMAT, savedAt: new Date().toISOString(), keys };

  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `rankd-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface RestoreResult {
  films: number;
  /** How many recorded duels came back with them; 0 for a pre-log backup. */
  judgements: number;
  hadProfile: boolean;
}

// Validated before a single key is written. A half-applied restore would be
// worse than a failed one — you'd lose what you had and not gain what you meant
// to, so anything suspect throws and nothing is touched.
export function importBackup(text: string): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const backup = parsed as Partial<Backup>;
  if (!backup || typeof backup !== "object" || !backup.keys || typeof backup.keys !== "object") {
    throw new Error("That doesn't look like a Rankd backup.");
  }
  // Every format this build understands, not just the one it writes. Refusing
  // older files would strand every backup anybody has already saved.
  const owned = KEYS_BY_FORMAT[backup.format as number];
  if (!owned) {
    throw new Error(`That backup is format ${backup.format ?? "unknown"}; this version reads 1 and ${FORMAT}.`);
  }

  const raw = backup.keys["rankd-app-v1"];
  if (!raw) throw new Error("That backup has no library in it.");

  let films: unknown;
  try {
    films = JSON.parse(raw);
  } catch {
    throw new Error("The library inside that backup is corrupt.");
  }
  if (!Array.isArray(films) || films.length === 0) {
    throw new Error("The library inside that backup is empty.");
  }
  const ok = films.every(
    (f) =>
      f &&
      typeof f === "object" &&
      typeof (f as { id?: unknown }).id === "string" &&
      typeof (f as { rating?: unknown }).rating === "number" &&
      typeof (f as { score?: unknown }).score === "number",
  );
  if (!ok) throw new Error("Some films in that backup are missing an id, rating or score.");

  // The evidence log, if the backup is new enough to carry one. Checked but not
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
      throw new Error("The comparison log inside that backup is corrupt.");
    }
    // See lib/log.ts for the shape: a version, an interned film-id dictionary,
    // and tuple rows [id, aIndex, bIndex, outcome, modeCode, at].
    const log = rows as { v?: unknown; f?: unknown; r?: unknown };
    if (!log || typeof log !== "object" || log.v !== 1 || !Array.isArray(log.f) || !Array.isArray(log.r)) {
      throw new Error("The comparison log inside that backup isn't in a format this version reads.");
    }
    judgements = log.r.length;
  }

  // Only now, with everything checked, does anything get written.
  //
  // Write whatever the file carries; clear only what the file's OWN format
  // owned and did not carry. A key invented after that backup was written is
  // left alone, which is what stops restoring an old file from wiping saved
  // rankings that the file could not possibly have known about.
  for (const k of KEYS) {
    const v = backup.keys[k];
    if (v !== undefined) localStorage.setItem(k, v);
    else if (owned.includes(k)) localStorage.removeItem(k);
  }

  return { films: films.length, judgements, hadProfile: !!backup.keys["rankd-profile-v1"] };
}
