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

const KEYS = [
  "rankd-app-v1", // the library — films, scores, placements, duels
  "rankd-profile-v1", // name, bio, banner
  "rankd-session-v1", // a run in progress
  "rankd-brightness",
  "rankd-strip-open",
] as const;

const FORMAT = 1;

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
  if (backup.format !== FORMAT) {
    throw new Error(`That backup is format ${backup.format ?? "unknown"}; this version reads ${FORMAT}.`);
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

  // Only now, with everything checked, does anything get written.
  for (const k of KEYS) {
    const v = backup.keys[k];
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }

  return { films: films.length, hadProfile: !!backup.keys["rankd-profile-v1"] };
}
