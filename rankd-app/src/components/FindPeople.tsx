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
import { avatarOf } from "@/lib/profile";

interface Person {
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
  house: boolean;
  private: boolean;
  following: boolean | null;
}

/** Long enough that a fast typist finishes a word before anything is asked. */
const DEBOUNCE_MS = 300;

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

export function FindPeople({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Only the newest keystroke's answer may land. Same guard as `HandleGate`:
  // without it a slow response for "sam" arrives after a fast one for "samj"
  // and the list shows results for a query nobody is looking at.
  const asked = useRef(0);

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

  const toggleFollow = async (person: Person) => {
    if (busy) return;
    setBusy(person.handle);
    try {
      const res = await fetch(`/api/follow?handle=${encodeURIComponent(person.handle)}`, {
        method: person.following ? "DELETE" : "POST",
      });
      if (res.ok) {
        // Only the row that changed. Re-running the search would reorder the
        // list under a thumb that is still on it.
        setPeople((list) =>
          (list ?? []).map((p) =>
            p.handle === person.handle ? { ...p, following: !p.following } : p,
          ),
        );
      }
    } catch {
      // Left as it was. A button that claims to have worked is worse than one
      // that visibly did nothing.
    } finally {
      setBusy(null);
    }
  };

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
        <p className="text-sub leading-snug text-dim">
          Type someone&rsquo;s name to find them.
        </p>
      ) : people === null ? (
        <p className="text-sub leading-snug text-dim">Looking&hellip;</p>
      ) : people.length === 0 ? (
        <p className="text-sub leading-snug text-dim">Nobody by that name.</p>
      ) : (
        <ul className="space-y-1">
          {people.map((person) => (
            <li key={person.handle} className="flex items-center gap-3 py-2">
              <a href={`/@${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
                <Avatar person={person} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-hi">{person.handle}</span>
                  <span className="block truncate text-label leading-snug text-dim">
                    {/* What the row says, in priority order. "Private" outranks a
                        bio because it changes what the rest of the row means. */}
                    {person.house
                      ? "A Rankd house account"
                      : person.private
                        ? "This profile is private"
                        : (person.bio ?? "")}
                  </span>
                </span>
              </a>

              {/* None for a private account: a follow would be refused
                  server-side anyway, and offering one that cannot work is worse
                  than offering none. You never appear in your own results, so
                  there is no self case to handle here. */}
              {!person.private && person.following !== null && (
                <button
                  onClick={() => void toggleFollow(person)}
                  disabled={busy === person.handle}
                  aria-pressed={person.following}
                  className="shrink-0 rounded-full px-4 py-1.5 text-label font-extrabold tracking-wide active:scale-95 disabled:opacity-50"
                  style={
                    person.following
                      ? { background: "rgba(255,255,255,0.07)", color: "var(--text-hi)" }
                      : { background: "var(--gold)", color: "#1c1405" }
                  }
                >
                  {person.following ? "Following" : "Follow"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
