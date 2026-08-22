"use client";

// How many people, and who.
//
// ── Why this is its own component ──────────────────────────────────────────
//
// It lived inside `FollowButton`, which meant it only existed on somebody
// ELSE'S profile. Your own profile had no counts at all, which is the first
// place anybody looks for them: reported from the phone, and obviously right.
//
// A follow button is about a relationship between two people and belongs only
// where there are two. A count is a fact about one person and belongs on any
// profile, including your own. Splitting them is what lets the same numbers,
// the same lists and the same rows appear in both places.

import { useEffect, useState } from "react";

import { FollowList, type Direction } from "./FollowList";

export interface Counts {
  followerCount: number;
  followingCount: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function FollowCounts({
  handle,
  counts,
}: {
  handle: string;
  /**
   * Given when the caller already has them, fetched when it does not.
   *
   * `FollowButton` asks the same endpoint for the relationship anyway, so it
   * hands them down rather than making a second identical request. Your own
   * profile has nobody to be in a relationship with, so it asks for itself.
   */
  counts?: Counts;
}) {
  const [own, setOwn] = useState<Counts | null>(counts ?? null);
  const [list, setList] = useState<Direction | null>(null);

  useEffect(() => {
    if (counts) return setOwn(counts);
    let dead = false;
    void (async () => {
      try {
        const res = await fetch(`/api/follow?handle=${encodeURIComponent(handle)}`, {
          cache: "no-store",
        });
        if (dead || !res.ok) return;
        setOwn((await res.json()) as Counts);
      } catch {
        // Offline. Nothing is drawn rather than a zero, because zero is a claim
        // and "could not ask" is not.
      }
    })();
    return () => {
      dead = true;
    };
  }, [handle, counts]);

  // The height is held either way, so the page does not shift when the answer
  // lands under a thumb already on its way down.
  if (!own) return <div className="h-4" aria-hidden />;

  return (
    <>
      {/* Tappable, because a count you cannot walk into is a dead end. This is
          the only path Rankd has to somebody whose name you did not already
          know: search needs a name, this needs one person you trust. */}
      <span className="text-label text-dim">
        <button onClick={() => setList("followers")} className="active:opacity-70">
          {plural(own.followerCount, "follower")}
        </button>
        {" · "}
        <button onClick={() => setList("following")} className="active:opacity-70">
          {own.followingCount} following
        </button>
      </span>

      {list && <FollowList handle={handle} direction={list} onClose={() => setList(null)} />}
    </>
  );
}
