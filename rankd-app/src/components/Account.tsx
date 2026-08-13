"use client";

// Signing in, and what it does for you.
//
// Deliberately the smallest possible surface: this whole feature is a mirror of
// storage that already works, so the panel's job is to say plainly what is
// backed up, when, and to whom — and otherwise stay out of the way. Signed out,
// it is one button and one sentence, and the app behaves exactly as it did
// before accounts existed.
//
// The one screen that is allowed to be demanding is the conflict chooser. It
// appears when two devices both have unsent work, which cannot be resolved
// without asking (see lib/reconcile.ts), and it names what each side holds
// rather than saying "a conflict occurred" and making the user guess.

import { useCallback, useEffect, useState } from "react";

import { fetchAccount, signInWithGoogle, signOutOfAccount, type AccountInfo } from "@/lib/account";
import {
  pull,
  pushOverServer,
  reconcileWithAccount,
  startSync,
  syncNow,
  type ConflictSides,
} from "@/lib/sync";
import { isDirty, readSyncState, subscribeSync, clearSyncState } from "@/lib/syncState";

const BUTTON = "rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]";

/** "3 minutes ago" — precise enough to trust, vague enough not to nag. */
function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function Account() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [conflict, setConflict] = useState<ConflictSides | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Bumped by the sync layer so "last synced" and the unsent-work line stay
  // honest while a duel is being fought behind this sheet.
  const [, bump] = useState(0);

  useEffect(() => subscribeSync(() => bump((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const who = await fetchAccount();
      if (cancelled) return;
      setAccount(who);
      setChecked(true);
      if (!who) return;

      startSync();
      const outcome = await reconcileWithAccount();
      if (cancelled) return;
      if (outcome.kind === "conflict") setConflict(outcome.sides);
      else if (outcome.kind === "offline") setNote("Can't reach your account right now.");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useCallback(async (keep: "device" | "cloud") => {
    setBusy(true);
    try {
      // `pull` reloads the page on success, so nothing after it runs.
      if (keep === "cloud") await pull();
      else await pushOverServer();
      setConflict(null);
      setNote("Kept this device's library.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Nothing at all until the session answer is in. A "Sign in" button that
  // flashes for half a second on every settings open — on a screen whose whole
  // point is that the app works without one — reads as a demand.
  if (!checked) return null;

  if (conflict) {
    return (
      <div className="mt-7 border-t border-border pt-5">
        <span className="text-xs font-extrabold tracking-[0.12em] text-gold">TWO LIBRARIES</span>
        <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
          This browser and your account have both been used since they last agreed. Nothing is
          merged — combining two rankings would invent judgements you never made — so pick the one
          to keep. The other is replaced.
        </p>
        <div className="mb-3 space-y-1.5 text-[11px] leading-snug">
          <p className="text-dim">
            <span className="text-text-hi">This device</span> · {conflict.local.films} films,{" "}
            {conflict.local.judgements.toLocaleString()} duels
          </p>
          <p className="text-dim">
            <span className="text-text-hi">Your account</span> · {conflict.server.films} films,{" "}
            {conflict.server.judgements.toLocaleString()} duels · saved{" "}
            {ago(conflict.serverUpdatedAt)}
          </p>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-dim">
          Not sure? Save a backup first — the button below writes a file neither choice can touch.
        </p>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => void resolve("device")} className={`flex-1 ${BUTTON}`}>
            Keep this device
          </button>
          <button disabled={busy} onClick={() => void resolve("cloud")} className={`flex-1 ${BUTTON}`}>
            Keep the account
          </button>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mt-7 border-t border-border pt-5">
        <span className="text-xs font-extrabold tracking-[0.12em] text-dim">YOUR ACCOUNT</span>
        <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
          Sign in and your library backs itself up — films, placements, duels and your profile —
          so clearing this browser stops being the end of it. The app works fully without one.
        </p>
        <button onClick={() => void signInWithGoogle()} className={`w-full ${BUTTON}`}>
          Continue with Google
        </button>
        {note && <p className="mt-3 text-[11px] leading-snug text-gold">{note}</p>}
      </div>
    );
  }

  const state = readSyncState();
  return (
    <div className="mt-7 border-t border-border pt-5">
      <span className="text-xs font-extrabold tracking-[0.12em] text-dim">YOUR ACCOUNT</span>
      <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
        <span className="text-text-hi">{account.email}</span>
        <br />
        Backed up {ago(state.lastSeenServerAt)}
        {isDirty() ? " · unsent changes" : ""}
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await syncNow();
              setNote(isDirty() ? "Couldn't reach your account — it'll retry." : "Backed up.");
            } finally {
              setBusy(false);
            }
          }}
          className={`flex-1 ${BUTTON}`}
        >
          Back up now
        </button>
        <button
          onClick={() => {
            // The library stays exactly where it is — signing out ends the
            // mirroring, it does not take anything away.
            clearSyncState();
            void signOutOfAccount();
          }}
          className={`flex-1 ${BUTTON}`}
        >
          Sign out
        </button>
      </div>
      {note && <p className="mt-3 text-[11px] leading-snug text-gold">{note}</p>}
    </div>
  );
}
