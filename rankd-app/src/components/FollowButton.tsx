"use client";

// The one interactive thing on a page that is otherwise entirely static.
//
// ── Why it fetches its own state instead of being handed it ────────────────
//
// `/@handle` is server-rendered and `force-dynamic`, so the obvious move is to
// resolve the follow state up there and pass it down. That would work, and it
// would make the whole page depend on WHO IS ASKING — which means it can never
// be cached, and every visitor's view of somebody's profile becomes a private
// render rather than the same public page.
//
// Keeping the viewer-specific part in one small client component leaves the page
// itself the same for everybody. It also means the button can update after a tap
// without the page re-rendering around it.
//
// The cost is a flash of "…" on arrival, which is honest: Rankd genuinely does
// not know whether you follow this person until it has asked.

import { useEffect, useState } from "react";

interface State {
  following: boolean;
  followsMe: boolean;
  friends: boolean;
  isSelf: boolean;
  followerCount: number;
  followingCount: number;
}

export function FollowButton({ handle }: { handle: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  // `null` until asked. Distinguished from "signed out" for the same reason
  // `fetchSession` distinguishes them: a failed request is not a claim about
  // who you are, and offering a sign-in to somebody already signed in is worse
  // than offering nothing.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const [follow, me] = await Promise.all([
          fetch(`/api/follow?handle=${encodeURIComponent(handle)}`, { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        if (dead) return;
        if (follow.ok) setState((await follow.json()) as State);
        setSignedIn(me.ok);
      } catch {
        // Offline. The button stays absent rather than guessing, which is the
        // same choice the rest of the page makes: it is a profile, and none of
        // it works without the network anyway.
      }
    })();
    return () => {
      dead = true;
    };
  }, [handle]);

  const toggle = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/follow?handle=${encodeURIComponent(handle)}`, {
        method: state.following ? "DELETE" : "POST",
      });
      // The server answers with the whole state rather than a bare ok, so the
      // counts move with the button instead of waiting for a reload.
      if (res.ok) setState((await res.json()) as State);
    } catch {
      // Left as it was. A button that silently claims to have worked is worse
      // than one that visibly did nothing.
    } finally {
      setBusy(false);
    }
  };

  // Nothing at all until the first answer lands. A button that says "Follow"
  // and then flips to "Following" is a lie held for half a second, and the
  // reserved height stops the page shifting under a thumb when it arrives.
  if (!state) return <div className="mt-5 h-16" aria-hidden />;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      {/* ── Counts come first, and they are shown to EVERYBODY ───────────────
          Including a signed-out visitor. They are a fact about the person whose
          page this is, not about the viewer, and hiding them behind a sign-in
          would make a public profile look emptier than it is to precisely the
          people who have not decided to join yet.

          Rendered here rather than in the stat row above so they stay live: the
          server answers every follow and unfollow with the whole state, so the
          number moves with the button instead of waiting for a reload. */}
      <span className="text-label text-dim">
        {plural(state.followerCount, "follower")} · {state.followingCount} following
      </span>

      {/* Nothing to offer yourself. Your own counts still show, because they
          are the reason to look at your own page. */}
      {state.isSelf ? null : signedIn === false ? (
        <span className="text-sub leading-snug text-dim">Sign in to follow {handle}.</span>
      ) : (
        <>
          <button
            onClick={() => void toggle()}
            disabled={busy}
            aria-pressed={state.following}
            className="rounded-full px-6 py-2 text-sm font-extrabold tracking-wide active:scale-95 disabled:opacity-60"
            style={
              state.following
                ? { background: "rgba(255,255,255,0.07)", color: "var(--text-hi)" }
                : { background: "var(--gold)", color: "#1c1405" }
            }
          >
            {/* Three states, not two. "Friends" is the one worth naming,
                because it is the one that unlocks anything. */}
            {state.friends ? "Friends" : state.following ? "Following" : "Follow"}
          </button>

          {/* Said only when it is NEWS. "They follow you" while you already
              follow them back is a slower way of writing "Friends" above. */}
          {state.followsMe && !state.following && (
            <span className="text-label text-dim">They follow you. Follow back to compare.</span>
          )}
        </>
      )}
    </div>
  );
}
