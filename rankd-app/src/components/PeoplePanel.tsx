"use client";

// Your people, as a page of the profile.
//
// ── Why this is a panel and not the sheet it started as ────────────────────
//
// The counts opened a bottom sheet, which works on a public profile and does
// not work here. `AppShell`'s overlay comment records exactly why: the bottom
// nav is `relative z-40`, which makes it a stacking context, so a sheet rendered
// from INSIDE a screen is z-ordered within that screen and the nav paints over
// it. Overlays have to be siblings of the screens, never inside them.
//
// It could have been lifted into the shell's overlay slot. A panel is better,
// and the user said so first: the profile already turns pages between what you
// made and what Rankd worked out about you, and who you know is a third thing of
// the same kind. A sheet is for something you do and dismiss; this is somewhere
// you go.
//
// The third tab was cut once before, and `PANELS` says why: "Three was one too
// many" because the third held a chart that restated the counts above it. That
// reasoning does not apply to content the page does not otherwise carry.

import { useEffect, useRef, useState } from "react";

import { PersonRow, type Person } from "./PersonRow";
import { SecondaryButton, Tabs } from "./ui";

function List({
  people,
  empty,
}: {
  people: Person[] | null;
  /** Said plainly. An empty list with no sentence reads as a failure to load. */
  empty: string;
}) {
  if (people === null) return <p className="text-sub leading-snug text-dim">Looking&hellip;</p>;
  if (people.length === 0) return <p className="text-sub leading-snug text-dim">{empty}</p>;
  return (
    <ul className="space-y-1">
      {people.map((person) => (
        <PersonRow key={person.handle} person={person} />
      ))}
    </ul>
  );
}

export function PeoplePanel({
  handle,
  onFindPeople,
}: {
  /** `null` before the account has claimed one. Nothing to count yet. */
  handle: string | null;
  onFindPeople: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Which half is showing. Driven by the scroll position rather than by the
  // buttons, so a flick and a tap agree without either telling the other.
  const [at, setAt] = useState(0);
  const [followers, setFollowers] = useState<Person[] | null>(null);
  const [following, setFollowing] = useState<Person[] | null>(null);

  useEffect(() => {
    if (!handle) return;
    let dead = false;
    void (async () => {
      // Both at once. They are two reads of the same table and waiting for the
      // first before asking for the second would double the time this is empty.
      const [a, b] = await Promise.all(
        (["followers", "following"] as const).map(async (dir) => {
          try {
            const res = await fetch(
              `/api/follow/list?handle=${encodeURIComponent(handle)}&dir=${dir}`,
              { cache: "no-store" },
            );
            if (!res.ok) return [];
            return ((await res.json()) as { people: Person[] }).people;
          } catch {
            return [];
          }
        }),
      );
      if (dead) return;
      setFollowers(a);
      setFollowing(b);
    })();
    return () => {
      dead = true;
    };
  }, [handle]);

  if (!handle) {
    return (
      <div className="px-6 pt-8">
        <p className="text-sub leading-snug text-dim">Pick a name first, and people can find you.</p>
      </div>
    );
  }

  const sides = [
    { key: "following" as const, label: "Following", people: following, empty: "You don't follow anyone yet." },
    { key: "followers" as const, label: "Followers", people: followers, empty: "Nobody follows you yet." },
  ];

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="pb-4">
      {/* The two labels, which are also the position. Same treatment as the
          page tabs above, one level down and quieter, so it reads as a division
          WITHIN this page rather than as a second row of pages. */}
      <Tabs
        nested
        labels={sides.map((s) => s.label)}
        at={at}
        onPick={goTo}
        className="px-6 pt-6"
      />

      {/* ── A native scroll-snap track, not a second gesture handler ──────────
          The page this sits on already swipes sideways, so a hand-rolled drag in
          here would be two listeners fighting over the same finger.
          `ProfileScreen`'s own touch handler ignores anything starting inside
          `.overflow-x-auto` — that guard exists for the shelves on the results
          page — so a real scroller is invisible to it by construction.

          Scroll snap does the rest with no JavaScript: it flicks, it rubber-bands
          at the ends for free, and it cannot get out of step with the outer page
          because it is not pretending to be a page. */}
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="mt-4 flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {sides.map((side) => (
          <div key={side.key} className="w-full shrink-0 snap-center px-6">
            <List people={side.people} empty={side.empty} />
          </div>
        ))}
      </div>

      {/* The way out of an empty page. Both lists start empty for everybody, so
          this is the state most people see first, and it should offer something
          rather than only report a fact. */}
      <div className="mt-8 px-6">
        <div className="rule-fade mb-6" />
        {/* Same control, same look, as the one on the empty Takes feed. Both
            were 10px caps in `--dim` on a wash, which is the recipe this app
            uses to mark something as the QUIETEST thing on screen — on the one
            offer an empty page has to make. */}
        <SecondaryButton onClick={onFindPeople} className="mx-auto block">
          Find people
        </SecondaryButton>
      </div>
    </div>
  );
}
