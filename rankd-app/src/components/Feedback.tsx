"use client";

// Telling us something went wrong, without leaving the app.
//
// See `api/feedback/route.ts` for why this is a form rather than a mailto: link.
//
// ── The diagnostics are collected, not asked for ───────────────────────────
//
// Half of any bug report is the state the app was in, and no user should be
// expected to know that a browser version or a library size matters. So the
// numbers ride along automatically and the form only ever asks for the sentence
// a person can actually write: what happened.
//
// What goes is deliberately bounded: counts, a build hint, and the browser
// string. No film titles, no ratings, no ids — the library is the private half
// of this app, and a support email is not where any of it should turn up.

import { useState } from "react";

import type { Film } from "@/lib/types";
import { isPlaced } from "@/lib/lock";
import { FIELD } from "./ui";
import { lex } from "@/lib/lexicon";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * What the app can say about itself.
 *
 * Read at SEND time rather than on mount, so a report written after ten minutes
 * of play describes the library as it is now rather than as it was when the
 * settings sheet opened.
 */
function diagnosticsOf(films: Film[], duels: number): string {
  const placed = films.filter(isPlaced).length;
  const lines = [
    `Films: ${films.length}`,
    `Placed: ${placed}`,
    `Duels: ${duels}`,
    `Screen: ${typeof window === "undefined" ? "?" : `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio ?? 1}x`}`,
    // Whether they are running it from the home screen or a browser tab. This is
    // the single most useful line here: a bug that only happens in standalone
    // mode is otherwise impossible to tell apart from one that does not.
    `Standalone: ${
      typeof window === "undefined"
        ? "?"
        : window.matchMedia?.("(display-mode: standalone)").matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone
          ? "yes"
          : "no"
    }`,
    `Agent: ${typeof navigator === "undefined" ? "?" : navigator.userAgent}`,
  ];
  return lines.join("\n");
}

export function Feedback({ films, duels }: { films: Film[]; duels: number }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = message.trim();
    if (!text || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, diagnostics: diagnosticsOf(films, duels) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't be sent.");
        setStatus("error");
        return;
      }
      setMessage("");
      setStatus("sent");
    } catch {
      // Almost always offline. Said plainly, because the one thing worse than a
      // failed send is a failed send the user thinks succeeded.
      setError("No connection. Your message hasn't been sent.");
      setStatus("error");
    }
  };

  return (
    // Header and rule come from the Settings row this sits in.
    <div>
      <p className="mb-2 text-sub text-dim">Broken? Confusing? Missing something? Tell us.</p>

      {status === "sent" ? (
        // The form is replaced rather than cleared, so there is no doubt about
        // whether the thing was sent. Writing again is a deliberate second act.
        <div className="rounded-xl border border-gold/40 px-3.5 py-3">
          <p className="text-sub leading-snug text-gold">Sent. Thank you.</p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-2 text-sub font-semibold text-dim active:scale-95"
          >
            Write another
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="What happened?"
            className={`${FIELD} resize-none`}
          />
          <button
            onClick={send}
            disabled={!message.trim() || status === "sending"}
            className="mt-2 w-full rounded-full border border-border py-2.5 text-center text-sub font-bold text-text-hi active:scale-[0.98] disabled:opacity-40"
          >
            {status === "sending" ? "Sending…" : "Send"}
          </button>
          {error && <p className="mt-2 text-sub leading-snug text-danger">{error}</p>}
          <p className="mt-2 text-label leading-snug text-dim">
            Sends your library size and browser. Never {lex().one} titles or ratings.
          </p>
        </>
      )}
    </div>
  );
}
