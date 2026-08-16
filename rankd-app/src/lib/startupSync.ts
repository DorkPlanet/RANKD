"use client";

// Catching up with your account when the app opens.
//
// Reconciliation used to live only in `Account`, which mounts inside the
// settings sheet — so a signed-in visitor on a new phone saw an empty app until
// they happened to go looking in settings. That is the opposite of the point:
// the database exists so the library follows you.
//
// ── What this will and will not do on its own ──────────────────────────────
//
// It acts only on the outcomes that have one right answer:
//
//  · `pull` — nothing here worth keeping, so take the account's copy.
//  · `push` — nothing on the account yet, so send this one up.
//  · `in-sync` — nothing to do.
//
// A `conflict` means both sides hold unsent work, which `reconcile.ts` refuses
// to decide and so does this. It is left for the chooser in settings, because a
// question that destroys one of two libraries should be asked on a screen the
// user opened deliberately, not thrown at them while the app is still loading.
//
// ── Why it does not start the sync watcher ─────────────────────────────────
//
// `reconcileWithAccount` is a read followed by at most one write. The watcher
// that pushes on every change is a separate thing, started by `Account`, and
// starting it here would put the app back in the state that caused real data
// loss: uploading a device's copy before anyone had agreed it was the one to
// keep. Opening the app should be able to FETCH your library without also
// volunteering to overwrite it.

import { fetchAccount } from "./account";
import { reconcileWithAccount, type SyncOutcome } from "./sync";

let inFlight: Promise<SyncOutcome | null> | null = null;

/**
 * Reconcile once per page load, for a signed-in visitor.
 *
 * Guarded rather than idempotent-by-luck: React mounts effects twice in
 * development, and two reconciliations racing each other is exactly how a pull
 * and a push get interleaved.
 *
 * ── Why it CACHES rather than returning null on a second call ──────────────
 *
 * `Account` used to run its own `reconcileWithAccount` on mount, and `Account`
 * mounts every time the settings sheet is opened. So opening settings asked the
 * question again, on a browser the credits sweep had since marked dirty — and
 * the answer arrived a beat after the panel had already drawn, replacing the
 * sign-out button with the TWO LIBRARIES chooser in front of somebody who had
 * come to look at their account.
 *
 * Reconciliation is a page-load concern, not a panel concern: it is a read plus
 * at most one write, and asking twice cannot produce a better answer. So the
 * promise is kept and handed to every later caller, and `Account` reads this
 * instead of asking again. One question per load, one answer, shared.
 *
 * Never throws. A visitor who is signed out, offline, or whose account cannot
 * be reached gets the app precisely as it has always worked, which is the
 * promise this whole feature was built around.
 */
export function syncOnOpen(): Promise<SyncOutcome | null> {
  inFlight ??= (async () => {
    try {
      const who = await fetchAccount();
      if (!who) return null;
      return await reconcileWithAccount();
    } catch {
      return null;
    }
  })();
  return inFlight;
}
