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

import { useEffect, useState } from "react";

import { PersonRow, type Person } from "./PersonRow";

/** Matches `Section` on the rest of the profile: a faded rule, then a label. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="rule-fade mb-6" />
      <div className="mb-2.5 text-label font-extrabold tracking-[0.18em] text-dim">
        {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}

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

  return (
    <div className="px-6 pb-4">
      <Group title="Following">
        <List people={following} empty="You don't follow anyone yet." />
      </Group>

      <Group title="Followers">
        <List people={followers} empty="Nobody follows you yet." />
      </Group>

      {/* The way out of an empty page. Both lists start empty for everybody, so
          this is the state most people see first and it should offer something
          rather than just report a fact. */}
      <div className="mt-8">
        <div className="rule-fade mb-6" />
        <button
          onClick={onFindPeople}
          className="mx-auto block rounded-full px-4 py-1.5 text-label font-extrabold tracking-[0.14em] text-dim active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          FIND PEOPLE
        </button>
      </div>
    </div>
  );
}
