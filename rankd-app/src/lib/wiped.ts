// One flag, and the reason it lives alone.
//
// "Delete everything and start fresh" clears storage and reloads. But
// `location.reload()` does not stop the page — timers keep firing and in-flight
// fetches keep resolving until the navigation commits, and two of them write
// the whole library back from a closure holding the PRE-wipe copy: the credits
// sweep in `AppShell` flushes `saveFilms(pending)` when its backfill settles,
// and the duel screen's poster backfill does the same per film. The sweep's own
// stop flag is set by an effect cleanup, which a reload never runs. So the wipe
// emptied storage and something quietly refilled it a moment later.
//
// The guard has to be readable from `store.ts`, `syncState.ts` and `sync.ts`.
// `syncState.ts` imports nothing on purpose — it is read by the four modules
// that write, so anything it imported back would be a cycle. A module with no
// imports of its own is the only thing it can safely depend on, which is why
// this is four lines in its own file rather than an export from `reset.ts`.

let wiped = false;

/**
 * Has this document been wiped? One way: the only route back is the reload the
 * wipe is already performing.
 */
export function isWiped(): boolean {
  return wiped;
}

/** Called by `wipeEverything` before it touches storage. */
export function markWiped(): void {
  wiped = true;
}

/** Tests only. Nothing in the app un-wipes a document. */
export function resetWipedForTests(): void {
  wiped = false;
}
