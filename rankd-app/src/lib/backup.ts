"use client";

// Taking your library with you — as a file.
//
// This was once the ONLY bridge between devices and the only backup that existed
// at all. Signing in now mirrors the library to a server (`sync.ts`), but this
// stays, and stays first-class: it is the path that works with no account, no
// network and no trust in anyone else's uptime, and it is how you leave.
//
// The format lives in `backupFormat.ts` so the file and the wire cannot drift
// apart — including which keys each carries, which is NOT the same list.

import {
  FILE_KEYS,
  FILE_KEYS_BY_FORMAT,
  FORMAT,
  parseBackup,
  type Backup,
  type BackupSummary,
} from "./backupFormat";

export type { BackupSummary };

/**
 * Collect a payload from the given keys. `sync.ts` passes `SYNC_KEYS`, because
 * the wire carries the library blob and nothing else.
 */
export function collectBackup(keys: readonly string[] = FILE_KEYS): Backup {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return { format: FORMAT, savedAt: new Date().toISOString(), keys: out };
}

/**
 * Write a validated payload into storage, replacing what is there.
 *
 * `owned` is what this call may CLEAR, and it is destructive in both directions
 * if it is wrong:
 *
 *  · A pull passes `SYNC_KEYS`, so it can never remove saved rankings. The blob
 *    deliberately does not carry them, and absence would otherwise read as
 *    "delete these".
 *  · A restore passes the set the FILE'S OWN format owned, so a backup written
 *    before a key existed cannot delete it.
 *
 * Everything the payload carries is written regardless, so a newer file restored
 * by a build that understands it still lands in full.
 */
export function applyBackup(backup: Backup, owned: readonly string[]): void {
  for (const [k, v] of Object.entries(backup.keys)) localStorage.setItem(k, v);
  for (const k of owned) {
    if (backup.keys[k] === undefined) localStorage.removeItem(k);
  }
}

export function exportBackup(): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(collectBackup(FILE_KEYS))], { type: "application/json" }),
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
  // What may be CLEARED is what this file's own format owned.
  applyBackup(backup, FILE_KEYS_BY_FORMAT[backup.format] ?? FILE_KEYS);
  return summary;
}
