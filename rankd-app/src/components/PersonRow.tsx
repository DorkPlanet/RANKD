"use client";

// One person, in a list.
//
// ── The same row everywhere, and that is the network-growth feature ────────
//
// Search renders this, the follower list renders this, and the following list
// renders this. Not for tidiness: a list you can only READ is a dead end, and
// the whole point of being able to see who somebody follows is that you can
// follow them too, from where you are, without losing your place.
//
// So the row carries its own follow button and its own optimistic state, and any
// list that shows people gets that for free rather than reimplementing it and
// getting one of the cases wrong.

import { useState } from "react";

import { avatarOf } from "@/lib/profile";

export interface Person {
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
  house: boolean;
  private: boolean;
  /** `null` when the viewer is signed out. No button, rather than a dead one. */
  following: boolean | null;
}

function Avatar({ person }: { person: Person }) {
  const avatar = avatarOf({
    handle: person.handle,
    displayName: null,
    avatarUrl: person.avatarUrl,
  });
  return avatar.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar.url}
      alt=""
      className="h-11 w-11 shrink-0 rounded-full object-cover"
      style={{ border: "1px solid var(--border)" }}
    />
  ) : (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg text-gold"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {avatar.letter}
    </span>
  );
}

export function PersonRow({ person }: { person: Person }) {
  // Held here rather than by the list, so following somebody never re-renders or
  // reorders the rows around them. A list that reshuffles under a thumb that is
  // still on it is worse than one that updates slowly.
  const [following, setFollowing] = useState(person.following);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/follow?handle=${encodeURIComponent(person.handle)}`, {
        method: following ? "DELETE" : "POST",
      });
      if (res.ok) setFollowing(!following);
    } catch {
      // Left as it was. A button that claims to have worked is worse than one
      // that visibly did nothing.
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <a
        href={`/@${person.handle}`}
        className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70"
      >
        <Avatar person={person} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text-hi">{person.handle}</span>
          <span className="block truncate text-label leading-snug text-dim">
            {/* In priority order. "Private" outranks a bio because it changes
                what the rest of the row means. */}
            {person.house
              ? "A Rankd house account"
              : person.private
                ? "This profile is private"
                : (person.bio ?? "")}
          </span>
        </span>
      </a>

      {/* None for a private account: the follow would be refused server-side
          anyway, and offering one that cannot work is worse than offering none.
          You never appear in your own lists, so there is no self case here. */}
      {!person.private && following !== null && (
        <button
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={following}
          className="shrink-0 rounded-full px-4 py-1.5 text-label font-extrabold tracking-wide active:scale-95 disabled:opacity-50"
          style={
            following
              ? { background: "rgba(255,255,255,0.07)", color: "var(--text-hi)" }
              : { background: "var(--gold)", color: "#1c1405" }
          }
        >
          {following ? "Following" : "Follow"}
        </button>
      )}
    </li>
  );
}
