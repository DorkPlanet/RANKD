// What to do when a browser and an account disagree.
//
// Rankd assumes ONE writer at a time. That assumption is right almost always —
// you rank films on one device, in one sitting — and this module exists for the
// times it isn't. It never merges. Two libraries cannot be combined without
// inventing judgements the user never made: the library holds scores and locks
// that `ladder.ts` derived from a particular sequence of duels, and interleaving
// two sequences produces an order neither device ever showed anyone.
//
// So the only honest outcomes are "one of these is clearly newer" and "ask". The
// asking is what `conflict` is for, and it is not a failure state — it is the
// correct answer to a question the app cannot answer for you.
//
// Pure by construction: no storage, no network, no clock. Everything it needs is
// in its arguments, which is what makes every branch testable.

export interface LocalSyncState {
  /** False on a browser that has never held a library — a fresh install. */
  hasLocalLibrary: boolean;
  /** Local writes have happened since the last successful push. */
  dirty: boolean;
  /**
   * The server's `updatedAt` as of this device's last successful sync, or null
   * if it has never synced. This is the whole trick: comparing the server's
   * CURRENT stamp against the one we last saw tells us whether anyone else has
   * written since, without either side keeping a vector clock.
   */
  lastSeenServerAt: string | null;
}

export interface ServerSyncState {
  /** When the account's mirror was last written, or null if there is none. */
  updatedAt: string | null;
}

export type Reconciliation =
  /** Send local up. */
  | "push"
  /** Take the server's copy, replacing local. */
  | "pull"
  /** Both sides moved. Show the user both and let them choose. */
  | "conflict"
  /** Nothing to do. */
  | "in-sync";

export function reconcile(local: LocalSyncState, server: ServerSyncState): Reconciliation {
  // Nothing on the server yet. A first sign-in from the device that has the
  // library — the overwhelmingly common case, and it must never ask anything.
  if (!server.updatedAt) return local.hasLocalLibrary ? "push" : "in-sync";

  // Nothing here yet: a new phone, or a browser whose storage was cleared. There
  // is no local work to lose, so taking the account's copy is unambiguous. This
  // is the case the whole feature exists for.
  if (!local.hasLocalLibrary) return "pull";

  // Has anyone written to the account since this device last looked? A device
  // that has never synced (`null`) counts as "yes" — it cannot know what it
  // missed, and assuming it missed nothing is how work gets overwritten.
  const serverMoved = server.updatedAt !== local.lastSeenServerAt;

  if (!local.dirty) {
    // We have no unsent work, so the server's copy is either newer than ours or
    // identical to it. Either way, taking it costs nothing.
    return serverMoved ? "pull" : "in-sync";
  }

  // We have unsent work AND someone else has written. This is the only case that
  // cannot be decided without knowing what the person wants.
  return serverMoved ? "conflict" : "push";
}
