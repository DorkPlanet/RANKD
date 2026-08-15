// Sync bookkeeping about THIS browser: who it is, when it last synced, and
// whether it has written anything since.
//
// A leaf module on purpose — it imports nothing. `store.ts`, `log.ts`,
// `profile.ts` and `lists.ts` each call `markDirty()` after their existing
// write, and if that mark lived in `sync.ts` (which reads all four to build a
// payload) every one of them would be an import cycle.
//
// None of this is ever backed up or synced. It describes the device, not the
// person: carrying one browser's "last synced" marker to another would make the
// second believe it had already pushed work it has never seen.

const KEY = "rankd-sync-v1";

interface SyncBookkeeping {
  deviceId: string;
  /** The server's `updatedAt` as of the last successful sync. */
  lastSeenServerAt: string | null;
  /** ISO time of the first local write since that sync, or null if clean. */
  dirtyAt: string | null;
  /**
   * Content hash of the payload this browser last successfully pushed.
   *
   * The dirty flag answers "has anything been WRITTEN since the last sync",
   * which is not the same question as "is what we hold different from what the
   * server holds". Plenty of writes are re-writes: the credits sweep saves the
   * library once per batch whether or not a batch changed anything, and every
   * screen that touches `saveFilms` marks the browser dirty regardless. Each of
   * those was costing a fresh upload of the entire library.
   *
   * Null means "no idea", which is the safe answer — it forces a real push.
   */
  lastPushedHash: string | null;
}

function blank(): SyncBookkeeping {
  return { deviceId: newDeviceId(), lastSeenServerAt: null, dirtyAt: null, lastPushedHash: null };
}

function newDeviceId(): string {
  // Same shape as the ids in lib/lists.ts: sortable prefix, random tail. It only
  // has to be distinct from the user's other browsers.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readSyncState(): SyncBookkeeping {
  if (typeof window === "undefined") return blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...(JSON.parse(raw) as SyncBookkeeping) };
  } catch {
    // Unreadable bookkeeping is not worth a crash — the worst it costs is one
    // extra reconciliation, which is a question, not a loss.
  }
  return blank();
}

function write(next: SyncBookkeeping): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or disabled. Sync degrades to "asks more often than it needs
    // to", which is the right way for it to fail.
  }
}

/** This browser's id, minted and stored on first use. */
export function deviceId(): string {
  const s = readSyncState();
  if (!localStorage.getItem(KEY)) write(s);
  return s.deviceId;
}

export function isDirty(): boolean {
  return readSyncState().dirtyAt !== null;
}

/**
 * Record that something local changed.
 *
 * Called from every module that writes user data, immediately after its own
 * write succeeds. Deliberately cheap and synchronous — `saveFilms` is called
 * once per settled duel and, during the credits sweep, once per batch across an
 * 861-film library, so this may not do real work. It sets a flag and returns.
 *
 * The first mark wins: `dirtyAt` answers "how long has there been unsent work",
 * and overwriting it on every keystroke would reset that to now, forever.
 */
export function markDirty(): void {
  if (typeof window === "undefined") return;
  const s = readSyncState();
  if (s.dirtyAt !== null) return;
  write({ ...s, dirtyAt: new Date().toISOString() });
  notify();
}

/**
 * Called after a successful push or pull: clean, and up to date with `serverAt`.
 *
 * `pushedHash` is what the server now holds, and is passed only by the push
 * path. A PULL must clear it — the server's copy has just replaced ours, and
 * claiming to have pushed content we merely received would let a later genuine
 * change be skipped as "already sent". Omitting the argument is that clear.
 */
export function markSynced(serverAt: string, pushedHash: string | null = null): void {
  const s = readSyncState();
  write({ ...s, lastSeenServerAt: serverAt, dirtyAt: null, lastPushedHash: pushedHash });
  notify();
}

/** Forget everything about syncing. Used on sign-out. */
export function clearSyncState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to fall back to
  }
  notify();
}

// ── Letting the UI watch ────────────────────────────────────────────────────
//
// The settings sheet shows "last synced" and whether there is unsent work, and
// both change from outside React — a duel settling, a timer firing. A plain
// subscriber list is enough; there is exactly one screen listening.

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(): void {
  for (const fn of listeners) fn();
}
