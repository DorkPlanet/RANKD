"use client";

// Choosing one film out of hundreds.
//
// Searching by director and actor as well as title is what makes a large library
// navigable — "that Villeneuve one" is far more often how a film is remembered
// than its exact name. Rows are built a page at a time because mounting eight
// hundred of them at once blocked the main thread for most of a second.

import { useRef, useState } from "react";

import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import type { Person } from "@/lib/people";
import type { Film } from "@/lib/types";
import { IconToggle, Sheet } from "./ui";

// How many rows the picker builds per pass.
const PICKER_PAGE = 60;

// What the picker's search box is asking about.
type SearchMode = "film" | "director" | "actor";

const tierCounts = (films: Film[]): Map<Rating, number> => {
  const m = new Map<Rating, number>();
  for (const f of films) m.set(f.rating, (m.get(f.rating) ?? 0) + 1);
  return m;
};

export function SpotlightPicker({
  films,
  onClose,
  onPick,
  title = "Spotlight",
  blurb = "Pick any film to test. It starts where it currently sits and moves as far as its results take it.",
  onPerson,
}: {
  films: Film[];
  onClose: () => void;
  onPick: (id: string) => void;
  /** Open a whole filmography instead of one film. */
  onPerson?: (person: Person) => void;
  title?: string;
  blurb?: string;
}) {
  const [q, setQ] = useState("");
  // "All" by default: a search that only covers one tier can't find the film
  // you're thinking of unless you already know its rating.
  const [filter, setFilter] = useState<Rating | "all">("all");
  const [tierOpen, setTierOpen] = useState(false);
  // What the search box is asking about. A film you want to re-place is often
  // easier to reach through who made it than through its own name.
  const [mode, setMode] = useState<SearchMode>("film");
  const listRef = useRef<HTMLDivElement | null>(null);

  const counts = tierCounts(films);
  const query = q.trim().toLowerCase();

  // Credits arrive with artwork, so they cover the tiers you've played and
  // whatever the list has scrolled past — never the whole library at once. The
  // count is shown rather than hidden, so an empty result reads as "not fetched
  // yet" instead of "not in your library".
  const withCredits = films.filter((f) => f.director || f.cast?.length).length;

  const matches = (f: Film) => {
    if (query === "") return true;
    if (mode === "film") return f.title.toLowerCase().includes(query);
    if (mode === "director") return !!f.director?.toLowerCase().includes(query);
    return !!f.cast?.some((c) => c.toLowerCase().includes(query));
  };

  // Whose name the query actually landed on. The search matches a substring, so
  // "villen" has to become "Denis Villeneuve" before anything can be looked up
  // by it — and taking it from a matching film means it is always a name the
  // library really holds, spelled the way the library spells it.
  const matchedName: string | null = (() => {
    if (mode === "film" || query === "") return null;
    for (const f of films) {
      if (mode === "director" && f.director?.toLowerCase().includes(query)) return f.director;
      if (mode === "actor") {
        const hit = f.cast?.find((c) => c.toLowerCase().includes(query));
        if (hit) return hit;
      }
    }
    return null;
  })();

  const shown = films
    .filter((f) => (filter === "all" ? true : f.rating === filter))
    .filter(matches)
    // Highest tier first, then position within the tier — the same order the
    // list strip shows, so a film sits where you'd expect to find it.
    .sort((a, b) => b.rating - a.rating || b.score - a.score);

  // Committing all 828 rows at once cost a measured 508ms of blocked main
  // thread — the sheet appeared to hang before it opened. Only a screenful is
  // built up front; scrolling near the end extends it.
  const [limit, setLimit] = useState(PICKER_PAGE);
  // A new result set starts fresh. Adjusted during render rather than in an
  // effect, so the first paint of a search is never the previous list's length.
  const sig = `${filter}|${query}|${mode}`;
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setLimit(PICKER_PAGE);
  }
  const visible = shown.slice(0, limit);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || limit >= shown.length) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
      setLimit((l) => Math.min(shown.length, l + PICKER_PAGE));
    }
  };

  const jump = (to: "top" | "bottom") => {
    if (to === "top") {
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // The end of the list has to exist before it can be scrolled to, so jumping
    // down materialises the rest first and moves once they've laid out.
    setLimit(shown.length);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
      ),
    );
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="mb-3 text-[11px] leading-snug text-dim">{blurb}</p>

      {/* Three ways in. The search box below changes what it asks about rather
          than sitting beside three separate fields. */}
      <div className="mb-2 flex gap-1">
        {(["film", "director", "actor"] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg border py-1.5 text-[11px] capitalize active:scale-95 ${
              mode === m ? "border-gold text-gold" : "border-border text-dim"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={
          mode === "film" ? "Search all films" : mode === "director" ? "Search directors" : "Search actors"
        }
        className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
      />

      {/* Searching a director and then tapping one of their films re-places that
          ONE film inside its own tier, which is what this picker has always been
          for. It is not what searching a director makes you want to do: you came
          here holding a question about their whole body of work, and every row
          answers a different, smaller one.
          So a people search offers the bigger action directly. */}
      {onPerson && mode !== "film" && query !== "" && matchedName && (
        <button
          onClick={() => onPerson({ name: matchedName, role: mode, count: 0 })}
          className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left active:scale-[0.99]"
          style={{ color: "#1c1405", background: "var(--gold)" }}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold">Rank {matchedName}</span>
            <span className="block truncate text-[11px] opacity-75">
              All {shown.length} against each other, across tiers
            </span>
          </span>
          <span className="flex-shrink-0 text-lg leading-none">›</span>
        </button>
      )}

      {/* One toolbar rather than a chip rail and a count line: the filter says
          what you're looking at and how many, and everything else is an icon.
          Shuffle is one bit of state — a full labelled row overstated it next to
          the list it's a footnote to. */}
      <div className="relative mb-2 flex items-center gap-1.5">
        <button
          onClick={() => setTierOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] active:scale-95 ${
            filter === "all" ? "border-border text-dim" : "border-gold text-gold"
          }`}
        >
          <span className={filter === "all" ? "" : "text-sm"}>
            {filter === "all" ? "All tiers" : starsFor(filter)}
          </span>
          <span className="opacity-60">{shown.length}</span>
          <span className="opacity-60">▾</span>
        </button>

        <span className="flex-1" />

        <IconToggle label="Jump to top" onClick={() => jump("top")} icon={<span className="text-xs">↑</span>} />
        <IconToggle label="Jump to bottom" onClick={() => jump("bottom")} icon={<span className="text-xs">↓</span>} />

        {/* Anchored to the control it belongs to, so the tier list appears where
            you asked for it instead of pushing the film list down the screen. */}
        {tierOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setTierOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
              <TierOption
                label="All tiers"
                count={films.length}
                active={filter === "all"}
                onClick={() => {
                  setFilter("all");
                  setTierOpen(false);
                }}
              />
              {/* Tiers holding nothing would only be dead rows. */}
              {ORDERED_TIERS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
                <TierOption
                  key={t}
                  label={starsFor(t)}
                  count={counts.get(t) ?? 0}
                  active={filter === t}
                  onClick={() => {
                    setFilter(t);
                    setTierOpen(false);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* The list scrolls inside the sheet rather than with it, so search, the
          filter and the jump controls stay reachable however far down you are —
          the whole library is in here, not a truncated first page. */}
      <div ref={listRef} onScroll={onScroll} className="max-h-[54vh] overflow-y-auto rounded-xl">
        {visible.map((f) => {
          // A spotlight needs someone to face: a film alone in its tier has
          // nobody, so it's shown but inert rather than silently doing nothing.
          const peers = (counts.get(f.rating) ?? 0) - 1;
          return (
            <button
              key={f.id}
              disabled={peers < 1}
              onClick={() => onPick(f.id)}
              className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99] disabled:opacity-30"
            >
              {/* Most of the library has no artwork yet — backfill only covers
                  the tier being played — so an empty <img> would just be a
                  broken icon 600 times over. */}
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.poster}
                  alt=""
                  loading="lazy"
                  style={{ width: 26, aspectRatio: "2/3", objectFit: "cover", borderRadius: 3 }}
                />
              ) : (
                <span
                  className="shrink-0 bg-border"
                  style={{ width: 26, aspectRatio: "2/3", borderRadius: 3 }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-hi">{f.title}</span>
                {/* In a people search, show who matched — otherwise the row gives
                    no clue why it's in the results. */}
                {mode !== "film" && query !== "" && (
                  <span className="block truncate text-[10px] text-dim">
                    {mode === "director" ? f.director : f.cast?.find((c) => c.toLowerCase().includes(query))}
                  </span>
                )}
              </span>
              {f.year && <span className="text-[11px] text-dim">{f.year}</span>}
              <span className="text-[11px] text-gold">{starsFor(f.rating)}</span>
            </button>
          );
        })}
        {shown.length === 0 &&
          (mode === "film" ? (
            <p className="text-[11px] text-dim">Nothing matches.</p>
          ) : (
            // Never imply a person isn't in the library when the truth is that
            // most of it hasn't been looked up yet.
            <p className="text-[11px] leading-snug text-dim">
              No match among the{" "}
              <span className="text-text-hi">
                {withCredits} of {films.length}
              </span>{" "}
              films that know their credits. They fill in as artwork loads — play a tier or scroll
              your list to gather more.
            </p>
          ))}
      </div>
    </Sheet>
  );
}

function TierOption({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left active:scale-[0.98] ${
        active ? "bg-border/40" : ""
      }`}
    >
      <span className={active ? "text-sm text-gold" : "text-sm text-text-hi"}>{label}</span>
      <span className="text-[11px] text-dim">{count}</span>
    </button>
  );
}

// A square icon button that can carry an on/off state — gold when it's on.
// The point of a spotlight isn't the number it lands on, it's what moved and
// what decided it — so ending one shows the before, the after, and the films
// responsible, before anything is committed.
