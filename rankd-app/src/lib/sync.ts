"use client";

// Keeping the account's copy up to date with this browser's.
//
// ── Why this is a mirror and not a source of truth ──────────────────────────
//
// localStorage stays the thing the app reads and writes. Every screen, the
// ladder, the duel loop — none of them know this file exists, and the app works
// exactly as it always has with no account and no network. That is the whole
// design constraint, and it is what keeps sync out of `ladder.ts` and off the
// duel path, where a failed request must never cost somebody a judgement they
// already made.
//
// So writes go local-first and are pushed later, on a timer. `saveFilms` stays
// synchronous — it is called once per settled duel and, during the credits
// sweep, once per batch over an 861-film library, and making it await a network
// round trip would ripple through every caller in `DuelScreen`. Instead each
// writer marks the browser dirty (`syncState.ts`, one line each) and this file
// notices.
//
// Failures here are quiet by design. The local write already succeeded, so a
// push that fails is retried on the next tick and nothing is lost meanwhile.

import { collectBackup, applyBackup } from "./backup";
import { hasRealLibrary } from "./store";
import { SYNC_KEYS, validateBackup, type Backup, type BackupSummary } from "./backupFormat";
import { loadLists, replaceLists, type SavedList } from "./lists";
import { reconcile, type Reconciliation } from "./reconcile";
import {
  deviceId,
  isDirty,
  markSynced,
  readSyncState,
  notify,
  subscribeSync,
} from "./syncState";

// Long enough that a run of duels is one request rather than twenty; short
// enough that closing the tab shortly after finishing loses nothing. The
// visibility flush below is what actually covers the "closed the tab" case.
const DEBOUNCE_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let enabled = false;

/** Whether there is a signed-in account to sync with. Set by `startSync`. */
export function syncEnabled(): boolean {
  return enabled;
}

// ── Pushing ─────────────────────────────────────────────────────────────────

async function push(): Promise<void> {
  if (!enabled || pushing) return;
  pushing = true;
  try {
    const res = await fetch("/api/library", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: collectBackup(SYNC_KEYS), deviceId: deviceId() }),
    });
    if (!res.ok) return; // retried on the next tick
    const { updatedAt } = (await res.json()) as { updatedAt: string };

    // Lists ride along on the same trigger but as their own request, because
    // they are their own rows. A failure here leaves the library synced and the
    // lists behind, which is the right way round: the library is what someone
    // would mourn.
    await pushLists();

    markSynced(updatedAt);
  } catch {
    // Offline. The dirty flag stays set, so the next tick tries again.
  } finally {
    pushing = false;
  }
}

async function pushLists(): Promise<void> {
  const lists = loadLists();
  if (lists.length === 0) return;
  try {
    await fetch("/api/lists", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lists }),
    });
  } catch {
    // Same reasoning as the library push.
  }
}

/** Push now, ignoring the timer. What the "Sync now" button calls. */
export async function syncNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  await push();
}

function schedule(): void {
  if (!enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push();
  }, DEBOUNCE_MS);
}

// ── Pulling ─────────────────────────────────────────────────────────────────

interface ServerCopy {
  payload: Backup | null;
  updatedAt?: string;
}

async function fetchServer(): Promise<ServerCopy | null> {
  try {
    const res = await fetch("/api/library", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ServerCopy;
  } catch {
    return null;
  }
}

/**
 * Replace everything local with the account's copy, then reload.
 *
 * The reload is not laziness. `AppShell` reads the library once, into React
 * state, and every screen below it is holding films from that read — swapping
 * storage underneath them would leave the app showing a library that no longer
 * exists. `importBackup` takes the same approach for the same reason.
 */
export async function pull(): Promise<void> {
  const server = await fetchServer();
  if (!server?.payload || !server.updatedAt) return;
  const { backup } = validateBackup(server.payload);
  // SYNC_KEYS, never the file set: the blob does not carry saved rankings
  // (they sync as their own rows), so clearing anything outside this set would
  // delete them on every pull.
  applyBackup(backup, SYNC_KEYS);
  await pullLists();
  markSynced(server.updatedAt);
  window.location.reload();
}

async function pullLists(): Promise<void> {
  try {
    const res = await fetch("/api/lists", { cache: "no-store" });
    if (!res.ok) return;
    const { lists } = (await res.json()) as { lists: SavedList[] };
    if (Array.isArray(lists)) replaceLists(lists);
  } catch {
    // A library without its lists is still the library. Next sync catches up.
  }
}

/** Send this browser's copy up, overwriting the account's. Resolves a conflict. */
export async function pushOverServer(): Promise<void> {
  await push();
  notify();
}

// ── Sign-in reconciliation ──────────────────────────────────────────────────

export interface ConflictSides {
  local: BackupSummary;
  server: BackupSummary;
  serverUpdatedAt: string;
}

export type SyncOutcome =
  | { kind: "in-sync" | "pushed" | "pulled" }
  | { kind: "conflict"; sides: ConflictSides }
  | { kind: "offline" };

/**
 * Work out what this browser and the account should do about each other, and do
 * it — unless the answer is "ask", which is returned for the UI to put to the
 * user. See `reconcile.ts` for why merging is not on the list.
 */
export async function reconcileWithAccount(): Promise<SyncOutcome> {
  const server = await fetchServer();
  if (!server) return { kind: "offline" };

  const decision: Reconciliation = reconcile(
    {
      // Not "does the key exist". A fresh install writes the starter set within
      // seconds of opening, so the key is always there by the time anyone signs
      // in — and treating that as a real library asks a new phone to choose
      // between 10 seed films and the account it just connected to.
      hasLocalLibrary: hasRealLibrary(),
      dirty: isDirty(),
      lastSeenServerAt: readSyncState().lastSeenServerAt,
    },
    { updatedAt: server.updatedAt ?? null },
  );

  switch (decision) {
    case "push":
      await push();
      return { kind: "pushed" };
    case "pull":
      await pull();
      return { kind: "pulled" };
    case "conflict": {
      // Both summaries come from the same validator the routes use, so the two
      // numbers the user is shown are counted the same way on both sides.
      const local = validateBackup(collectBackup(SYNC_KEYS)).summary;
      const remote = validateBackup(server.payload).summary;
      return {
        kind: "conflict",
        sides: { local, server: remote, serverUpdatedAt: server.updatedAt! },
      };
    }
    case "in-sync":
      return { kind: "in-sync" };
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

let detach: (() => void) | null = null;

/**
 * Begin syncing for a signed-in visitor. Idempotent, and a no-op when signed
 * out — which is the state the app is in by default and must keep working in.
 */
export function startSync(): void {
  if (enabled) return;
  enabled = true;

  // A dirty browser that was closed mid-debounce still has work to send.
  if (isDirty()) schedule();

  const onDirty = () => {
    if (isDirty()) schedule();
  };
  // Backgrounding a tab on a phone is how most sessions END, so this is the
  // flush that matters — `beforeunload` never fires reliably on mobile.
  const onHide = () => {
    if (document.visibilityState === "hidden" && isDirty()) void push();
  };

  const unsub = subscribeSync(onDirty);
  document.addEventListener("visibilitychange", onHide);
  detach = () => {
    unsub();
    document.removeEventListener("visibilitychange", onHide);
  };
}

export function stopSync(): void {
  enabled = false;
  if (timer) clearTimeout(timer);
  timer = null;
  detach?.();
  detach = null;
}
