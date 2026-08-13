"use client";

// Taking your library with you — as a file.
//
// This was once the ONLY bridge between devices and the only backup that existed
// at all. Signing in now mirrors the same payload to a server (`sync.ts`), but
// this stays, and stays first-class: it is the path that works with no account,
// no network and no trust in anyone else's uptime, and it is how you leave.
//
// The format itself lives in `backupFormat.ts` so the file and the wire cannot
// drift apart.

import { KEYS, FORMAT, parseBackup, type Backup, type BackupSummary } from "./backupFormat";

export type { BackupSummary };

/** Collect everything the app owns into one payload. Shared with `sync.ts`. */
export function collectBackup(): Backup {
  const keys: Record<string, string> = {};
  for (const k of KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) keys[k] = v;
  }
  return { format: FORMAT, savedAt: new Date().toISOString(), keys };
}

/** Write a validated payload into storage, replacing what is there. */
export function applyBackup(backup: Backup): void {
  for (const k of KEYS) {
    const v = backup.keys[k];
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
}

export function exportBackup(): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(collectBackup())], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `rankd-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export type RestoreResult = BackupSummary;

// Validated before a single key is written. A half-applied restore would be
// worse than a failed one — you'd lose what you had and not gain what you meant
// to, so anything suspect throws and nothing is touched.
export function importBackup(text: string): RestoreResult {
  const { backup, summary } = parseBackup(text);
  // Only now, with everything checked, does anything get written.
  applyBackup(backup);
  return summary;
}
