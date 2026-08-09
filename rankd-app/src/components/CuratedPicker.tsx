"use client";

// One way in to every curated list: a director, an actor, or a genre.
//
// Until this existed the only route to a person run was opening a film and
// tapping its director — so the feature was reachable only by someone who
// already knew it was there. Three kinds of curated list belong on the same
// footing as the scoring modes, so they get one entry beside them.
//
// Directors and actors hand straight over to `PersonSheet`, which already knows
// how to show a filmography, offer the films you haven't seen, and start the
// run. Only genre needs anything new here, because a genre run has no borrowed
// films to offer (see the header of lib/genres.ts) and does need a size.
//
// PROVISIONAL LOOK — assembled from the panel's existing controls so it doesn't
// invent a competing language, but it has had no design pass.

import { useMemo, useState } from "react";
import { genresIn, MIN_GENRE_RUN, type GenreTally } from "@/lib/genres";
import { peopleIn, type Person } from "@/lib/people";
import { ScopeTab, Sheet, StartButton } from "./ui";
import type { Film } from "@/lib/types";

type Tab = "director" | "actor" | "genre";

// Offered sizes, largest first. The default is ALL of it — a big list to work
// through is the point, and someone who wants a shorter one can say so. Sizes
// above the genre's own count are dropped rather than shown as dead options.
const SIZES = [50, 25, 10] as const;

export function CuratedPicker({
  films,
  onClose,
  onPerson,
  onGenre,
}: {
  films: Film[];
  onClose: () => void;
  /** Hands over to PersonSheet, which owns the filmography and the run. */
  onPerson: (person: Person) => void;
  /** `limit` is how many of the genre's films to take, best first. */
  onGenre: (genre: string, limit: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("director");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(null); // null = all of them

  const people = useMemo(() => peopleIn(films), [films]);
  const genres = useMemo(() => genresIn(films), [films]);

  const q = query.trim().toLowerCase();
  const rows =
    tab === "genre"
      ? genres.filter((g) => !q || g.name.toLowerCase().includes(q))
      : people.filter((p) => p.role === tab && (!q || p.name.toLowerCase().includes(q)));

  const chosen = genre ? genres.find((g) => g.name === genre) : undefined;

  return (
    <Sheet title="Rank a list" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        <ScopeTab label="Directors" active={tab === "director"} onClick={() => { setTab("director"); setGenre(null); }} />
        <ScopeTab label="Actors" active={tab === "actor"} onClick={() => { setTab("actor"); setGenre(null); }} />
        <ScopeTab label="Genres" active={tab === "genre"} onClick={() => { setTab("genre"); setGenre(null); }} />
      </div>

      {/* A real library has hundreds of people in it, so the list is unusable
          without this — the tabs narrow by kind, the box narrows by name. */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === "genre" ? "Search genres" : "Search names"}
        className="mb-3 w-full rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
      />

      {/* Once a genre is chosen the list gives way to its one remaining
          question. Anything else on screen at that point is noise. */}
      {tab === "genre" && chosen ? (
        <div>
          <button
            onClick={() => setGenre(null)}
            className="mb-3 text-[11px] font-semibold text-dim active:scale-95"
          >
            ‹ All genres
          </button>
          <div className="mb-3 rounded-xl border border-border px-4 py-3">
            <div className="text-sm text-text-hi">{chosen.name}</div>
            <div className="mt-0.5 text-[11px] text-dim">
              {chosen.count} film{chosen.count === 1 ? "" : "s"} in your library
            </div>
          </div>

          <div className="mb-1 text-[10px] font-extrabold tracking-[0.12em] text-dim">HOW MANY</div>
          <div className="mb-3 flex gap-2">
            <SizeChip label="All" active={limit === null} onClick={() => setLimit(null)} />
            {SIZES.filter((n) => n < chosen.count).map((n) => (
              <SizeChip key={n} label={`Top ${n}`} active={limit === n} onClick={() => setLimit(n)} />
            ))}
          </div>
          <p className="mb-3 text-[11px] leading-snug text-dim">
            Ranked highest-first to start with, so a shorter list is the part you care most
            about. Nothing here changes your star ratings.
          </p>

          <StartButton
            label={`Rank ${limit === null ? `all ${chosen.count}` : `the top ${limit}`}`}
            onClick={() => onGenre(chosen.name, limit ?? chosen.count)}
            disabled={chosen.count < MIN_GENRE_RUN}
          />
          {chosen.count < MIN_GENRE_RUN && (
            <p className="mt-2 text-center text-[11px] text-gold">
              Only {chosen.count} film in this genre — there is nothing to compare it to.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.length === 0 && (
            <p className="px-1 py-6 text-center text-[11px] leading-snug text-dim">
              {q
                ? "Nothing by that name."
                : // The honest empty state: genres and credits arrive with a
                  // film's artwork, so a young library genuinely knows little.
                  "Nothing here yet — this fills in as your library learns who made each film."}
            </p>
          )}
          {/* Split on the tab rather than sniffing a property off the row: the
              two lists genuinely are different types, and `"role" in row` gives
              TypeScript a union it narrows badly. */}
          {tab === "genre"
            ? (rows as GenreTally[]).map((g) => (
                <Row key={g.name} name={g.name} count={g.count} onClick={() => setGenre(g.name)} />
              ))
            : (rows as Person[]).map((p) => (
                <Row
                  key={`${p.role}:${p.name}`}
                  name={p.name}
                  count={p.count}
                  onClick={() => onPerson(p)}
                />
              ))}
        </div>
      )}
    </Sheet>
  );
}

function Row({ name, count, onClick }: { name: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5 text-left active:scale-[0.99]"
    >
      <span className="min-w-0 truncate text-sm text-text-hi">{name}</span>
      <span className="ml-3 flex-shrink-0 text-[11px] text-dim">{count}</span>
    </button>
  );
}

function SizeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl border px-3 py-2 text-[12px] font-bold active:scale-95"
      style={{
        borderColor: active ? "var(--gold)" : "var(--border)",
        color: active ? "var(--gold)" : "var(--dim)",
      }}
    >
      {label}
    </button>
  );
}
