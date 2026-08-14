"use client";

// Arriving at RNK, before anything is running.
//
// ── Four versions. What each got wrong, so nobody rebuilds one ─────────────
//
// The app used to open a King of the Hill run on a tier `pickOpeningTier` chose,
// so the first thing anybody saw was two films they had not asked to compare, in
// a game already in progress. The user: "it feels awkward sometimes to just load
// into an already selected game."
//
// v1, a dashboard: `WHERE YOU STAND` over a count, a bordered box, tiers with
//     `0/185` right-aligned. Every number correct; read like a settings panel.
// v2, a title card: poster behind, serif prose over the fade. The artwork was
//     "more in the way than anything".
// v3, a goals list: two sections, ten tier rows, a sentence under each. Too
//     long, and the "About you" heading was "silly for one".
//
// The through-line in all three: they were made of TEXT ROWS, and the reference
// the user supplied twice is made of CARDS AND STRIPS. So:
//
//   · The information takes the top and the centre, as value-and-label cards.
//     That is the shoe app's Price / Colour / Size row, which is three facts in
//     the space this app was spending on one sentence.
//   · All ten tiers are ONE horizontal strip, not ten rows. That is the project
//     app's date row. It is the whole reason the list stopped being too long:
//     ten choices now cost 44px instead of 400.
//   · The personal rankings are one quiet line, not a section with a heading.
//
// ── What is still Rankd's and not the reference's ──────────────────────────
//
// No photography, no gradients, no coloured surfaces, no shadow. The cards are
// hairline borders and type. A tier map was built for this app twice and
// rejected twice as "chunky": the strip is not that map, because it is a control
// you pick from rather than a chart drawn at you, and it says its numbers in
// words underneath rather than in bar lengths.

import { useState } from "react";

import { Header, BottomNav } from "./DuelScreen";
import { byUrgency, type Goal, type Goals } from "@/lib/goals";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

export default function RunStart({
  films,
  goals,
  /** The tier you were last judging in, read off the log. Absent on a fresh library. */
  resumeTier,
  onStart,
  onRoughCut,
  onPerson,
  onGenre,
  onModes,
  onSettings,
  onTrophies,
  onList,
  onProfile,
  onAddFilm,
}: {
  films: Film[];
  goals: Goals;
  resumeTier?: Rating;
  onStart: (tier: Rating) => void;
  onRoughCut: (tier: Rating) => void;
  onPerson: (name: string, role: "director" | "actor", count: number) => void;
  onGenre: (name: string, limit: number) => void;
  onModes: () => void;
  onSettings: () => void;
  onTrophies: () => void;
  onList: () => void;
  onProfile: () => void;
  onAddFilm: (film: Film) => void;
}) {
  // Low to high, like a scale you read left to right. `ORDERED_TIERS` runs the
  // other way because every LIST in this app is best-first; a strip is not a
  // list, and a rating axis that starts at five reads backwards.
  const strip = [...goals.library].reverse();

  const [picked, setPicked] = useState<Rating | null>(null);

  // Derived, never an effect. `resumeTier` arrives late because the log loads
  // asynchronously, so a value captured at mount would be stale forever, and
  // correcting it in an effect is the cascading render the linter objects to.
  const fallback = strip.find((g) => !g.complete)?.subject;
  const selectedRating: Rating | undefined =
    picked ??
    resumeTier ??
    (fallback?.kind === "tier" ? fallback.rating : undefined);

  const selected = strip.find(
    (g) => g.subject.kind === "tier" && g.subject.rating === selectedRating,
  );

  const total = goals.library.reduce((n, g) => n + g.total, 0);
  const placed = goals.library.reduce((n, g) => n + g.done, 0);
  const settled = goals.library.filter((g) => g.complete).length;

  const personal = byUrgency(goals.personal);

  const startPersonal = (g: Goal) => {
    const s = g.subject;
    if (s.kind === "genre") return onGenre(s.name, g.total);
    if (s.kind === "director" || s.kind === "actor") return onPerson(s.name, s.kind, g.total);
  };

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-4 pt-7">
        <h1 className="flex-shrink-0 font-display text-[30px] leading-none tracking-wide text-text-hi">
          {total === 0
            ? "Nothing to rank yet"
            : placed === 0
              ? "Ready when you are"
              : "Pick up the thread"}
        </h1>

        {/* The three facts, given the room the old version gave one sentence. */}
        <div className="mt-5 flex flex-shrink-0 gap-2.5">
          <Stat value={total.toLocaleString()} label="Films" />
          <Stat value={placed.toLocaleString()} label="Placed" lead />
          <Stat value={`${settled}/${goals.library.length}`} label="Tiers" />
        </div>

        {/* Flows from the top. Centring this in the leftover space was tried and
            was worse: it opened a void above the picker AND below it, so the
            screen read as two islands. One gap, at the foot, above a footer
            that is meant to sit there anyway. */}
        <div className="pt-2">
        {strip.length > 0 && (
          <>
            <div className="mt-8 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim">
              Pick a tier
            </div>

            {/* Ten choices, one row. `-mx-6 px-6` lets it bleed to both edges so
                the last chip is visibly cut rather than sitting in a margin,
                which is what tells you it scrolls. */}
            {/* The scrollbar is hidden (see `.no-scrollbar`): it rendered as a
                grey rule under the chips and read as a divider. The last chip
                being cut off at the edge is what says the strip scrolls. */}
            <div className="no-scrollbar -mx-6 mt-2.5 flex gap-2 overflow-x-auto px-6">
              {strip.map((g) => {
                const rating = (g.subject as { kind: "tier"; rating: Rating }).rating;
                const on = rating === selectedRating;
                return (
                  <button
                    key={g.key}
                    onClick={() => setPicked(rating)}
                    className={`flex-shrink-0 rounded-xl px-3 py-2 text-[12px] tabular-nums transition-colors active:scale-95 ${
                      on
                        ? "bg-gold font-bold text-[#1c1405]"
                        : g.complete
                          ? "border border-border text-dim opacity-50"
                          : "border border-border text-gold"
                    }`}
                  >
                    {starsFor(rating)}
                  </button>
                );
              })}
            </div>

            {selected && (
              <>
                <p className="mt-3 text-[12px] text-dim">
                  <span className="text-text-hi">{selected.note}</span>
                  {selected.roughCutFirst && " · too big to duel cold"}
                </p>

                {/* Two verbs. Which one leads is the advice: on a big uncut tier
                    the cheap pass goes first, because climbing it cold is
                    several thousand comparisons. No sentence needed. */}
                <div className="mt-3.5 flex gap-2.5">
                  {selected.complete ? (
                    <p className="py-3 text-[12px] italic text-dim">
                      Every film in here has found its place.
                    </p>
                  ) : selected.roughCutFirst ? (
                    <>
                      <Action label="Split it" primary onClick={() => onRoughCut(selectedRating!)} />
                      <Action label="Rank it" onClick={() => onStart(selectedRating!)} />
                    </>
                  ) : (
                    <>
                      <Action label="Rank it" primary onClick={() => onStart(selectedRating!)} />
                      <Action label="Split it" onClick={() => onRoughCut(selectedRating!)} />
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {personal.length > 0 && (
          <p className="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1.5 text-[12px] text-dim">
            <span className="italic">Also worth ranking:</span>
            {personal.map((g, i) => (
              <button
                key={g.key}
                onClick={() => startPersonal(g)}
                className={`active:scale-95 ${g.complete ? "text-dim line-through opacity-60" : "text-gold"}`}
              >
                {g.title}
                {i < personal.length - 1 && <span className="text-dim"> ·</span>}
              </button>
            ))}
          </p>
        )}
        </div>

        <div className="mt-auto flex-shrink-0 pt-6">
          {resumeTier !== undefined && (
            <button
              onClick={() => onStart(resumeTier)}
              className="flex w-full items-baseline justify-center gap-2 py-2 text-[12px] text-dim active:scale-95"
            >
              Continue <span className="text-gold">{starsFor(resumeTier)}</span>
              <span className="text-dim">&rarr;</span>
            </button>
          )}
          <button
            onClick={onModes}
            className="mt-1 w-full py-2 text-center text-[11px] text-dim underline underline-offset-4 active:scale-95"
          >
            Something else
          </button>
        </div>
      </div>

      <BottomNav
        screen="duel"
        onSettings={onSettings}
        onModes={onModes}
        onList={onList}
        onProfile={onProfile}
        films={films}
        onAddFilm={onAddFilm}
      />
    </main>
  );
}

/**
 * One fact, given room. Value large, label small underneath, and a dot at the
 * top so the three read as a set rather than as three loose numbers.
 *
 * `lead` fills one of them, which is what stops a row of equals looking like a
 * table. It goes on Placed because that is the only one of the three that moves.
 */
function Stat({ value, label, lead }: { value: string; label: string; lead?: boolean }) {
  return (
    // Given real height. These are what the user asked to hold the top and the
    // centre, and at 90px tall they were a caption strip under the heading.
    <div
      className={`flex-1 rounded-2xl px-4 py-5 ${lead ? "" : "border border-border"}`}
      style={lead ? { background: "var(--surface)" } : undefined}
    >
      <span
        className="block h-1.5 w-1.5 rounded-full"
        style={{ background: lead ? "var(--gold)" : "var(--border)" }}
      />
      <span className="mt-6 block font-serif text-[26px] font-bold leading-none text-text-hi tabular-nums">
        {value}
      </span>
      <span className="mt-1.5 block text-[10px] text-dim">{label}</span>
    </div>
  );
}

function Action({
  label,
  primary,
  onClick,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-3 text-center text-[12px] font-bold active:scale-[0.98] ${
        primary ? "bg-gold text-[#1c1405]" : "border border-border text-text-hi"
      }`}
    >
      {label}
    </button>
  );
}
