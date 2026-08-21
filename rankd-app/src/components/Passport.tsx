"use client";

// Where your films were made.
//
// ── Why this is not a map, yet ─────────────────────────────────────────────
//
// A world map is the right answer and it is what was asked for: a blank region
// is an invitation, which no ranked list can be. But an accurate one needs real
// geometry — a public-domain outline added to the project — and a hand-drawn
// approximation with the continents in roughly the wrong shape is worse than
// none at all. So this is the honest version until that asset exists, and the
// data behind it is exactly what the map will draw.
//
// ── Flags rather than codes ────────────────────────────────────────────────
//
// "JP" is a lookup. The flag is recognised without one, and it costs nothing:
// every ISO 3166-1 pair maps to a flag by offsetting its two letters into the
// regional indicator block. No image, no request, no table to maintain.
//
// ── The share, and why it divides by `known` ───────────────────────────────
//
// Country arrives with the artwork, so a fresh import has none of it. Dividing
// by the library size would tell somebody mid-sweep that most of what they watch
// came from nowhere.

import type { Film } from "@/lib/types";

/** ISO 3166-1 alpha-2 to its flag, by offsetting into the regional indicators. */
const flagOf = (code: string): string =>
  code.length === 2 && /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "🏳";

/** Enough to be worth a row of its own. The rest are counted, not listed. */
const SHOWN = 12;

export function Passport({ films }: { films: Film[] }) {
  const tally = new Map<string, number>();
  let known = 0;
  for (const f of films) {
    if (!f.countries?.length) continue;
    known += 1;
    // A co-production counts for each country on it: the question is whether
    // your viewing has touched a place, and picking one partner erases the other.
    for (const code of new Set(f.countries)) tally.set(code, (tally.get(code) ?? 0) + 1);
  }

  // Nothing to say until the sweep has been round. It walks the library on its
  // own timer, so this appears by itself rather than needing anybody to act.
  if (known < 20 || tally.size < 2) return null;

  const rows = [...tally.entries()]
    .map(([code, n]) => ({ code, n }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  const top = rows[0];

  return (
    <div>
      <p className="mb-3 text-sub leading-snug text-text">
        Films from <span className="text-gold">{rows.length} countries</span>
        {". "}
        {Math.round((top.n / known) * 100)}% of them were made in {top.code}.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {rows.slice(0, SHOWN).map((r) => (
          <span
            key={r.code}
            className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1.5 pr-2.5 text-[10.5px]"
          >
            <span className="text-sub leading-none">{flagOf(r.code)}</span>
            <span className="text-dim">{r.code}</span>
            <span className="tabular-nums text-text">{r.n}</span>
          </span>
        ))}
        {rows.length > SHOWN && (
          <span className="flex items-center rounded-full border border-border px-2.5 py-1 text-[10.5px] text-dim">
            +{rows.length - SHOWN} more
          </span>
        )}
      </div>

      {known < films.length && (
        <p className="mt-2 text-label leading-snug text-dim">
          Known for {known.toLocaleString()} of {films.length.toLocaleString()} so far. This fills in as
          the app looks each film up.
        </p>
      )}
    </div>
  );
}
