"use client";

// Finding somebody, without leaving what you were doing.
//
// ── A sheet, not a screen ──────────────────────────────────────────────────
//
// The plan had this arriving with a tagged `Screen` union and real URL sync,
// on the reasoning that a profile needs an address. It does, and it has one:
// `/@handle` is a real page. But SEARCH is not a place you go, it is a thing you
// do for ten seconds and then stop, and it belongs in the overlay slot beside
// Settings and the trophy case rather than in the navigation.
//
// The consequence worth naming: following happens INLINE, on the row, so the
// common case never leaves the app at all. Tapping a name opens their profile as
// a real navigation, which runs already survive (`lib/runs.ts` restores a climb,
// a curated run and a Rough Cut pass).

import { useEffect, useRef, useState } from "react";

import Sheet from "./Sheet";
import { MIN_QUERY } from "@/lib/social/searchRules";
import { PersonRow, type Person } from "./PersonRow";

/** Long enough that a fast typist finishes a word before anything is asked. */
const DEBOUNCE_MS = 300;

export function FindPeople({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  // The house account, fetched rather than hand-written, so its row carries a
  // real follow state and a real button. A hard-coded row would have no way to
  // know whether you already follow it, and a button that cannot say is worse
  // than none.
  const [suggested, setSuggested] = useState<Person[] | null>(null);

  // Only the newest keystroke's answer may land. Same guard as `HandleGate`:
  // without it a slow response for "sam" arrives after a fast one for "samj"
  // and the list shows results for a query nobody is looking at.
  const asked = useRef(0);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch("/api/people?q=rankd", { cache: "no-store" });
        if (dead || !res.ok) return;
        const body = (await res.json()) as { people: Person[] };
        setSuggested(body.people.filter((x) => x.house));
      } catch {
        // The empty state simply stays a sentence. Nothing is broken by there
        // being nothing to suggest.
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;

    const mine = ++asked.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/people?q=${encodeURIComponent(q)}`, { cache: "no-store" });
          if (mine !== asked.current || !res.ok) return;
          const body = (await res.json()) as { people: Person[] };
          setPeople(body.people);
        } catch {
          // Offline. The list keeps whatever it had rather than emptying, which
          // would read as "nobody by that name" and be a lie.
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const short = query.trim().length < MIN_QUERY;

  return (
    <Sheet title="Find people" onClose={onClose}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Search by name"
        placeholder="Search by name"
        className="mb-4 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
      />

      {/* Three states, and the empty one is only reachable after a real search.
          A list that says "nobody by that name" while somebody has typed one
          letter is answering a question they have not finished asking. */}
      {short ? (
        // ── The emptiest screen introduces the canon ────────────────────────
        //
        // It used to say "type someone's name" and sit blank, which is the least
        // useful state any screen can be in. Today you have to already KNOW the
        // house account exists to reach it, so the one place somebody arrives
        // wanting to find people is exactly where it should be offered.
        //
        // A single suggested row, not a list of strangers. Suggesting people is
        // discovery and discovery is its own decision; this is one account that
        // everybody has a reason to see.
        <>
          <p className="mb-4 text-sub leading-snug text-dim">
            Type someone&rsquo;s name to find them.
            {suggested?.length ? " Or start here." : ""}
          </p>
          {suggested?.length ? (
            <ul className="space-y-1">
              {suggested.map((person) => (
                <PersonRow key={person.handle} person={person} />
              ))}
            </ul>
          ) : null}
        </>
      ) : people === null ? (
        <p className="text-sub leading-snug text-dim">Looking&hellip;</p>
      ) : people.length === 0 ? (
        <p className="text-sub leading-snug text-dim">Nobody by that name.</p>
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
