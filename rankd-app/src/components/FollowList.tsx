"use client";

// Who follows somebody, and who they follow.
//
// Opened from the counts on a profile, which until now were a fact you could
// read and nothing you could do. Being able to walk into somebody's follows is
// the only path Rankd has for finding people you did not already know the name
// of, and it is a better one than search: search needs you to know who you are
// looking for, this needs you to know one person whose taste you trust.

import { useEffect, useState } from "react";

import { Sheet } from "./ui";
import { PersonRow, type Person } from "./PersonRow";

export type Direction = "followers" | "following";

export function FollowList({
  handle,
  direction,
  onClose,
}: {
  handle: string;
  direction: Direction;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/follow/list?handle=${encodeURIComponent(handle)}&dir=${direction}`,
          { cache: "no-store" },
        );
        if (dead) return;
        if (!res.ok) return setFailed(true);
        const body = (await res.json()) as { people: Person[] };
        setPeople(body.people);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
    };
  }, [handle, direction]);

  // Said as a fact about this person rather than as a heading. "Followers" over
  // an empty list reads as a section that failed to load.
  const title = direction === "followers" ? "Followers" : "Following";

  return (
    <Sheet title={title} onClose={onClose} scroll>
      {failed ? (
        <p className="text-sub leading-snug text-dim">Couldn&rsquo;t load that just now.</p>
      ) : people === null ? (
        <p className="text-sub leading-snug text-dim">Looking&hellip;</p>
      ) : people.length === 0 ? (
        <p className="text-sub leading-snug text-dim">
          {direction === "followers"
            ? `Nobody follows ${handle} yet.`
            : `${handle} doesn't follow anyone yet.`}
        </p>
      ) : (
        <ul className="space-y-1">
          {people.map((person) => (
            <PersonRow key={person.handle} person={person} />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
