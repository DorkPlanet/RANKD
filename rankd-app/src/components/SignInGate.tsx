"use client";

// The front door.
//
// ── Why the app is gated at all ────────────────────────────────────────────
//
// It was not, for most of this app's life, and the reasoning was good: the
// library lives in localStorage, the ladder never touches the network, and a
// ranking app that dies in a tunnel is worse than one that asks for a login.
// All of that is still true and none of it has been removed — see the note at
// the bottom of this file.
//
// What changed is the honest accounting of what signed-out actually costs the
// person using it. An anonymous library lives in exactly one browser. Clear it,
// lose the phone, or pick up a different device and an 861-film ranking that
// took real evenings to build is gone, with no recovery and nothing the app can
// say about it afterwards. That is a bad enough outcome that the sign-in is
// worth its friction — and the friction is smaller than it looks, because the
// step immediately after it is exporting a CSV out of Letterboxd. Anyone
// willing to do that will not be stopped by a Google button.
//
// ── What this screen deliberately is not ───────────────────────────────────
//
// No feature list, no screenshots, no "why you should". Someone reaching this
// has almost always been sent by a card a friend shared, and has therefore
// already seen the output. One line about what the thing is, then the button.

import { useState } from "react";

import { signInWithGoogle } from "@/lib/account";
import { BARS } from "@/lib/brand";
import { PrimaryButton } from "./ui";

export default function SignInGate() {
  // Sign-in is a full navigation to Google, which on a slow connection leaves
  // the button sitting there looking unpressed. Nothing resets this: the page
  // is on its way out, and a button that re-arms itself would invite a second
  // tap that starts a second navigation.
  const [going, setGoing] = useState(false);

  return (
    <main
      className="relative flex h-app flex-col items-center justify-center px-8 text-center"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* The same mark the splash just showed, in the same place, so this reads
          as the splash settling rather than as a second screen arriving. */}
      <span
        className="block font-display text-[44px] leading-none text-gold"
        style={{ textShadow: "0 2px 26px rgba(231,181,62,0.28)" }}
      >
        RANKD
      </span>
      <span className="mt-2.5 flex items-center justify-center gap-1.5" aria-hidden>
        {BARS.map((c) => (
          <span key={c} className="h-[3px] w-7 rounded-full" style={{ background: c }} />
        ))}
      </span>

      <p className="mt-7 max-w-[300px] font-serif text-body italic leading-snug text-text-hi">
        Everyone has a favourite. What&rsquo;s yours?
      </p>
      {/* Says what the account is FOR. "Sign in to continue" is a demand; this
          is the reason, and it is the true one. */}
      <p className="mt-3 max-w-[290px] text-sub leading-snug text-dim">
        Sign in so your ranking is yours to keep, on every device you use.
      </p>

      <PrimaryButton
        wide
        className="mt-8 max-w-[300px]"
        disabled={going}
        onClick={() => {
          setGoing(true);
          void signInWithGoogle();
        }}
      >
        {going ? "Taking you to Google…" : "Continue with Google"}
      </PrimaryButton>

      <p className="mt-5 max-w-[280px] text-label leading-snug text-dim">
        Rankd asks Google for your name and email, nothing else.
      </p>
    </main>
  );
}

// ── For whoever removes the signed-out paths ───────────────────────────────
//
// Nothing was stripped when this gate landed, on purpose. Every signed-out
// branch still works — the library still loads, the ladder still runs, and the
// app is still fully playable with no network once you are through this screen.
// Two reasons, and the second is the one that matters:
//
//   1. Offline play must keep working, so localStorage cannot go regardless.
//   2. Lifting the gate is one line while those paths survive. Deleting them
//      makes the decision irreversible, and it is a product bet rather than a
//      technical fact.
//
// See "Remove the signed-out code paths" in POTENTIAL-FEATURES.md for what
// would actually come out, and the conditions worth waiting for first.
