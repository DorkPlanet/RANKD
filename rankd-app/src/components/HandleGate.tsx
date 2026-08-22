"use client";

// The second door, and the last one.
//
// ── Why this is a wall and not a settings row ──────────────────────────────
//
// A handle is only worth having if everybody has one. Optional names give you a
// population where following somebody is sometimes possible, and a feature that
// sometimes works is one nobody learns to reach for. So it is asked once, here,
// and then never again.
//
// It sits immediately after `SignInGate` in `AppShell` for the same structural
// reason that one does: below every hook, so taking it cannot change hook order,
// and above nothing that clears state, so the library is intact behind it and
// arrives the moment it is passed.
//
// ── What this screen must never do ─────────────────────────────────────────
//
// Appear when Rankd could not ask. `AppShell` decides that, not this component,
// and the rule is written at the call site: only a definite server answer of
// "no handle" gets here. See `fetchMe` in lib/account.ts for why a wall in front
// of an offline reader's own library is the one outcome worth designing around.

import { useEffect, useRef, useState } from "react";

import { claimHandle, handleAvailable, saveMe, type Me } from "@/lib/account";
import { HANDLE_MAX, HANDLE_MIN, normalizeHandle, validateHandle } from "@/lib/handles";
import { takeLegacyIdentity } from "@/lib/profile";
import { BARS } from "@/lib/brand";

/**
 * Long enough that a fast typist finishes a word first, short enough that the
 * answer feels like it belongs to what is on screen. Availability is a courtesy
 * and it must never be the reason a field feels slow.
 */
const CHECK_DELAY_MS = 400;

type Step = "name" | "visibility";

/**
 * Hand this device's old name, bio and picture to the account, once.
 *
 * ── Why the local value wins, and why only sometimes ───────────────────────
 *
 * `user.display_name` was written once by `provisionUser` from whatever Google
 * had, and never touched again. A local `name` that is not the default is
 * something somebody TYPED, on this device, on purpose. Between a name a person
 * chose and one an identity provider supplied, the person wins. But only if they
 * actually chose it: `"You"` is the shipped default and means nobody decided
 * anything, so it must not be allowed to overwrite a real Google name with a
 * pronoun.
 *
 * Same shape of argument for the picture. An upload was cropped by hand in
 * `AvatarCropper`; a Google photo arrived with a sign-in. `avatarOf` has ranked
 * those two in that order since uploads existed, and this preserves that ranking
 * across the move rather than quietly reversing it.
 *
 * A failure here is deliberately silent and deliberately not retried. The fields
 * are already gone from local storage by then, so the cost is a name reverting
 * to the Google one, which Settings can fix in a sentence. Blocking the gate on
 * it would trade somebody's access to their library for a display name.
 */
async function handOverLocalIdentity(me: Me): Promise<Me> {
  const legacy = takeLegacyIdentity();

  const patch: Partial<Me> = {};
  const name = legacy.name?.trim();
  if (name && name !== "You" && name !== me.displayName) patch.displayName = name;

  const bio = legacy.bio?.trim();
  if (bio && bio !== me.bio) patch.bio = bio;

  if (legacy.avatarUrl && legacy.avatarUrl !== me.avatarUrl) patch.avatarUrl = legacy.avatarUrl;

  if (Object.keys(patch).length === 0) return me;
  const result = await saveMe(patch);
  return result.ok ? result.me : me;
}

/** What the availability check came back with. */
type Answer = { kind: "free" } | { kind: "taken"; reason: string };

/**
 * An answer, and the handle it was an answer ABOUT.
 *
 * Carrying the subject is what makes the readout safe to derive rather than
 * clear. An answer for `sam` simply stops matching the moment the field says
 * `samj`, so a stale verdict can never be shown against a name it was never
 * about, and nothing has to reach in and null it out on every keystroke.
 */
type Says = { handle: string; answer: Answer };

export default function HandleGate({
  me,
  onDone,
}: {
  me: Me;
  /** The claimed identity. `AppShell` swaps this screen for the app on it. */
  onDone: (me: Me) => void;
}) {
  const [step, setStep] = useState<Step>("name");
  const [claimed, setClaimed] = useState<Me | null>(null);
  const [value, setValue] = useState("");
  const [says, setSays] = useState<Says | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── The field starts empty on purpose ────────────────────────────────────
  //
  // A suggestion derived from a Google display name is right often enough to be
  // tempting and wrong often enough to be a chore: "Jarrad Bishop" becomes
  // `jarradbishop`, which almost nobody would have chosen, and now it has to be
  // deleted before anything can be typed. `suggestHandle` exists for the places
  // where a seed is actually good, and a first-run wall is not one of them.
  //
  // VOICE.md rule 7: the reader already holds this question. Asking it and
  // getting out of the way beats answering it for them.

  // Only the newest keystroke's answer may land. Without this, a slow response
  // for "sam" arrives after a fast one for "samj" and marks a free name taken.
  const asked = useRef(0);

  useEffect(() => {
    // Nothing is asked, and nothing is CLEARED, while it isn't a handle yet.
    // Clearing here would be a setState in an effect body, and it isn't needed:
    // the readout below only shows an answer that still matches what's typed.
    const check = validateHandle(value);
    if (!check.ok) return;

    const mine = ++asked.current;
    const timer = setTimeout(() => {
      void handleAvailable(check.handle).then((answer) => {
        if (mine !== asked.current) return;
        // `null` is "could not ask", which leaves the readout alone. A red
        // "taken" on a dropped request would be a lie about somebody else's
        // name, and this is the one field where that is somebody's identity.
        if (!answer) return;
        setSays({
          handle: check.handle,
          answer: answer.available
            ? { kind: "free" }
            : { kind: "taken", reason: answer.reason ?? "That one's taken." },
        });
      });
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);

  // Derived, not stored: an answer counts only while it is still about the name
  // in the field. This is what lets the effect above never clear anything.
  const answer = says && says.handle === value ? says.answer : null;

  const submitName = async () => {
    const check = validateHandle(value);
    if (!check.ok) return setError(check.reason);
    setBusy(true);
    setError(null);
    const result = await claimHandle(check.handle);
    setBusy(false);
    if (!result.ok) {
      // Including the lost race. `isHandleAvailable` is advisory and the index
      // is the authority, so "that one just went" is a normal thing to be told.
      setSays(null);
      return setError(result.error);
    }
    setClaimed(await handOverLocalIdentity(result.me));
    setStep("visibility");
  };

  const choose = async (visible: boolean) => {
    const base = claimed ?? me;
    // Private is already the stored default, so choosing it costs no request.
    // Nobody becomes public without a tap, and nobody waits for a write that
    // would change nothing.
    if (!visible) return onDone(base);
    setBusy(true);
    const result = await saveMe({ profileVisibility: "public" });
    setBusy(false);
    // A failed write still lets them through, still private. Being stuck behind
    // a wall because a preference did not save would be a worse outcome than
    // being private for another few minutes, and Settings can set it later.
    onDone(result.ok ? result.me : base);
  };

  const check = validateHandle(value);
  const ready = check.ok;

  // ── What the line under the field says ─────────────────────────────────────
  //
  // In priority order, and the middle case is the one that was missing.
  //
  // A dim button with no explanation is the worst version of this screen:
  // somebody types "sam jones!", the button refuses, and the only guidance is a
  // standing hint they have already read. Saying WHY costs a line that is
  // already reserved.
  //
  // It waits for `HANDLE_MIN` characters rather than reacting to the first one,
  // so nobody is told their name is too short while they are still typing it.
  // Past that length an invalid value is a real attempt at a name, and a real
  // attempt deserves an answer.
  const hint: { text: string; bad: boolean } = error
    ? { text: error, bad: true }
    : !ready
      ? value.length >= HANDLE_MIN
        ? { text: check.ok ? "" : check.reason, bad: true }
        : { text: "", bad: false }
      : answer?.kind === "taken"
        ? { text: answer.reason, bad: true }
        : answer?.kind === "free"
          ? { text: "That one's free.", bad: false }
          : { text: "", bad: false };

  return (
    <main
      className="relative flex h-app flex-col items-center justify-center px-8 text-center"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* The same mark in the same place as the splash and the sign-in, so this
          reads as one more beat of arriving rather than a new screen. */}
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

      {step === "name" ? (
        <>
          <p className="mt-7 max-w-[300px] font-serif text-body italic leading-snug text-text-hi">
            What should people call you?
          </p>
          <p className="mt-3 max-w-[290px] text-sub leading-snug text-dim">
            This is how friends find you. Pick one you&rsquo;ll still want later, because it&rsquo;s
            yours for good.
          </p>

          <div
            className="mt-7 flex w-full max-w-[300px] items-center gap-1.5 rounded-full px-4 py-3"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <span aria-hidden className="text-body font-bold text-dim">
              @
            </span>
            <input
              value={value}
              onChange={(e) => {
                // Normalised as they type, so the field shows what will actually
                // be stored. Somebody typing capitals should watch them settle,
                // not find out at the end that their name isn't what they wrote.
                setValue(normalizeHandle(e.target.value));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && ready) void submitName();
              }}
              maxLength={HANDLE_MAX}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-label="Your name on Rankd"
              placeholder="yourname"
              className="min-w-0 flex-1 bg-transparent text-body font-bold text-text-hi outline-none"
            />
          </div>

          {/* One line, held whether or not it has anything in it, so the button
              never moves under a thumb already on its way down. */}
          <p
            className="mt-2.5 h-4 text-label leading-snug"
            style={{ color: hint.bad ? "#e0705a" : "var(--dim)" }}
          >
            {hint.text}
          </p>

          <button
            onClick={() => void submitName()}
            disabled={busy || !ready}
            className="mt-4 w-full max-w-[300px] rounded-full py-3.5 text-sm font-extrabold tracking-wide active:scale-95 disabled:opacity-40"
            style={{ color: "#1c1405", background: "var(--gold)" }}
          >
            {busy ? "Claiming…" : "That's me"}
          </button>

          {/* The standing rule, and it stands DOWN the moment the line above has
              something specific to say. Both were on screen at once and said
              nearly the same sentence twice, which is VOICE.md rule 5: cut the
              line that justifies the line before it. The field explains itself
              when it can; this is only here when nothing else is. */}
          {!hint.text && (
            <p className="mt-5 max-w-[280px] text-label leading-snug text-dim">
              Letters, numbers and underscore.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-7 max-w-[300px] font-serif text-body italic leading-snug text-text-hi">
            Who gets to see it?
          </p>
          {/* Says what each choice MEANS, in the order somebody decides it. A
              visibility toggle with no consequence attached is a coin flip. */}
          <p className="mt-3 max-w-[290px] text-sub leading-snug text-dim">
            Private keeps your ranking to yourself. Public lets anyone who knows your name see what
            you&rsquo;ve ranked. Either way, you can change your mind in Settings.
          </p>

          <button
            onClick={() => void choose(true)}
            disabled={busy}
            className="mt-8 w-full max-w-[300px] rounded-full py-3.5 text-sm font-extrabold tracking-wide active:scale-95 disabled:opacity-60"
            style={{ color: "#1c1405", background: "var(--gold)" }}
          >
            {busy ? "Saving…" : "Make it public"}
          </button>
          <button
            onClick={() => void choose(false)}
            disabled={busy}
            className="mt-3 w-full max-w-[300px] rounded-full py-3.5 text-sm font-extrabold tracking-wide text-text-hi active:scale-95 disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            Keep it private
          </button>

          <p className="mt-5 max-w-[280px] text-label leading-snug text-dim">
            You&rsquo;re @{(claimed ?? me).handle}.
          </p>
        </>
      )}
    </main>
  );
}
