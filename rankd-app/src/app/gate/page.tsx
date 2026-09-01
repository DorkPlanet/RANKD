"use client";

// The wall.
//
// One field and a button. No Google button, no sign-in, no explanation of what
// Rankd is and nothing about accounts: somebody standing here has been handed a
// word by the person who built this, and the only question on the screen is
// whether they have it. Everything about who they are happens after, unchanged.
//
// It borrows `SignInGate`'s layout — the mark, the bars, the centring, the type
// scale — so the wall reads as the same app rather than as an error page some
// proxy put in front of it. It borrows none of its copy.
//
// Reached by REWRITE, so the address bar still shows wherever they were trying
// to go. That is why success reloads the current URL instead of pushing "/":
// after the cookie is set, the very same address renders the real page.

import { useState } from "react";

import { BARS } from "@/lib/brand";
import { FIELD, PrimaryButton } from "@/components/ui";

export default function GatePage() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = value.trim().length > 0 && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
      if (res.ok) {
        // A full reload, not a router refresh. The cookie has to be presented to
        // the MIDDLEWARE to have any effect, and a client-side navigation inside
        // an app that was never rendered does not go through it.
        window.location.reload();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "That didn't work. Try again.");
    } catch {
      // The one failure that is not about the password. Saying so matters:
      // otherwise a phone on a dead connection tells somebody their correct
      // word is wrong, and they stop trying it.
      setError("Couldn't reach Rankd. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="relative flex h-app flex-col items-center justify-center px-8 text-center"
      style={{
        background: "var(--bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <span
        className="block font-display text-[44px] leading-none text-gold"
        style={{ textShadow: "0 2px 26px var(--glow)" }}
      >
        RANKD
      </span>
      <span className="mt-2.5 flex items-center justify-center gap-1.5" aria-hidden>
        {BARS.map((c) => (
          <span key={c} className="h-[3px] w-7 rounded-full" style={{ background: c }} />
        ))}
      </span>

      <p className="mt-7 max-w-[300px] font-serif text-body italic leading-snug text-text-hi">
        Not open yet.
      </p>

      <form
        className="mt-7 w-full max-w-[300px]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* A real password input inside a real form, so phone keyboards offer to
            fill it and Enter submits without a keydown handler of our own. */}
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="current-password"
          spellCheck={false}
          aria-label="Password"
          placeholder="Password"
          className={`${FIELD} text-center`}
        />

        {/* One line, held whether or not it has anything in it, so the button
            never moves under a thumb already on its way down. */}
        <p
          className="mt-2.5 h-4 text-label leading-snug"
          style={{ color: error ? "var(--danger)" : "var(--dim)" }}
        >
          {error ?? ""}
        </p>

        {/* No `type="submit"` — `ButtonProps` deliberately doesn't take one, and
            a button inside a form already submits it by default. */}
        <PrimaryButton wide className="mt-4" disabled={!ready}>
          {busy ? "Checking…" : "Enter"}
        </PrimaryButton>
      </form>
    </main>
  );
}
