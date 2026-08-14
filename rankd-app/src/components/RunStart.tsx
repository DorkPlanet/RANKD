"use client";

// Arriving at RNK, before anything is running.
//
// ── What was wrong with landing straight in a duel ─────────────────────────
//
// The app opened a King of the Hill run on a tier `pickOpeningTier` chose, so
// the first thing you ever saw was two films you had not asked to compare, in a
// game already in progress. The user's words: "it feels awkward sometimes to
// just load into an already selected game."
//
// The awkwardness is not that a tier was chosen badly. It is that a judgement
// was being asked for before anything had been offered. Ranking is work you opt
// into, and the app was starting the clock for you.
//
// ── What this is NOT ───────────────────────────────────────────────────────
//
// Not a menu, and explicitly not a video-game title screen. There is no art, no
// logo treatment beyond the header the app already wears, and nothing here
// exists to be impressive. It answers two questions and then gets out of the
// way: where do I stand, and what is left.
//
// It also draws no chart. A tier map was built for this app twice and rejected
// twice — ten rounded columns, then a 2px segmented hairline — as "chunky", on a
// screen that is otherwise eloquent type. The counts are the readout. `77 of 185`
// says everything a bar would and costs no new furniture.
//
// ── Why the standing line is allowed to be static ──────────────────────────
//
// `RunStatus` had to drop its library bars because a quarter-pixel of movement
// per duel is furniture pretending to be feedback. The same number is fine here
// for the opposite reason: nothing is happening yet. This screen is where you
// decide what to do, so a standing that holds still is exactly right — it is a
// position, not a progress bar.

import { Header, BottomNav } from "./DuelScreen";
import { leastRanked, tierProgress } from "@/lib/progress";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

/** How many tiers with work left get listed under the resume offer. */
const SHOWN = 3;

export default function RunStart({
  films,
  /** The tier you were last judging in, read off the log. Absent on a fresh library. */
  resumeTier,
  onStart,
  onModes,
  onSettings,
  onTrophies,
  onList,
  onProfile,
  onAddFilm,
}: {
  films: Film[];
  resumeTier?: Rating;
  onStart: (tier: Rating) => void;
  onModes: () => void;
  onSettings: () => void;
  onTrophies: () => void;
  onList: () => void;
  onProfile: () => void;
  onAddFilm: (film: Film) => void;
}) {
  const slices = tierProgress(films);
  const withWork = slices.filter((s) => s.total > 0 && s.ranked < s.total);
  const total = slices.reduce((n, s) => n + s.total, 0);
  const ranked = slices.reduce((n, s) => n + s.ranked, 0);

  // The offer, in order of preference: the tier you were in, then the one that
  // has had the least attention. `leastRanked` returns undefined only when there
  // is no work anywhere, which the empty state below handles.
  const least = leastRanked(slices);
  const resume = resumeTier !== undefined ? withWork.find((s) => s.rating === resumeTier) : undefined;
  const lead = resume ?? least;

  // Everything else worth offering, least-attended first, with the lead removed
  // so it is never listed twice.
  const rest = withWork
    .filter((s) => s.rating !== lead?.rating)
    .sort((a, b) => a.ranked / a.total - b.ranked / b.total || b.total - a.total)
    .slice(0, SHOWN);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      {/* A column, so `All modes` can be pushed to the foot of the screen rather
          than trailing the content. On a library with two unfinished tiers the
          offers end halfway up and a centred button left floating under them
          read as unfinished layout rather than as a quiet alternative. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-8 pt-10">
        <span className="block text-[9px] font-extrabold tracking-[0.2em] text-dim">WHERE YOU STAND</span>
        <p className="mt-2 font-serif text-[26px] leading-none text-text-hi tabular-nums">
          {ranked.toLocaleString()}{" "}
          <span className="text-[15px] text-dim">of {total.toLocaleString()} ranked</span>
        </p>

        <div className="card-rule mt-6" />

        {lead ? (
          <>
            <span className="mt-7 block text-[9px] font-extrabold tracking-[0.2em] text-dim">
              {resume ? "PICK UP WHERE YOU LEFT OFF" : "A GOOD PLACE TO START"}
            </span>
            <button
              onClick={() => onStart(lead.rating)}
              className="mt-3 flex w-full items-baseline gap-3 rounded-2xl border border-gold/50 px-4 py-4 text-left active:scale-[0.99]"
            >
              <span className="flex-shrink-0 font-display text-[22px] leading-none tracking-wide text-gold">
                {starsFor(lead.rating)}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-dim tabular-nums">
                {lead.total - lead.ranked} of {lead.total} still to rank
              </span>
              <span className="flex-shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gold">
                {resume ? "Resume" : "Start"}
              </span>
            </button>

            {rest.length > 0 && (
              <>
                <span className="mt-8 block text-[9px] font-extrabold tracking-[0.2em] text-dim">
                  WHAT&rsquo;S LEFT
                </span>
                <div className="mt-2.5">
                  {rest.map((s) => (
                    <button
                      key={s.rating}
                      onClick={() => onStart(s.rating)}
                      className="flex w-full items-baseline gap-3 border-b border-border py-3 text-left active:scale-[0.99]"
                    >
                      <span className="w-[52px] flex-shrink-0 text-[13px] text-gold">
                        {starsFor(s.rating)}
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] text-dim tabular-nums">
                        {s.total - s.ranked} left
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-dim tabular-nums">
                        {s.ranked}/{s.total}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          // Nothing left anywhere. Rare, earned, and it must not read as an error.
          <p className="mt-8 text-[13px] leading-relaxed text-text">
            Every tier is ranked. There is nothing left to place, which is the whole
            point of the exercise.
          </p>
        )}

        {/* The full setup, for anyone who wants a mode rather than a tier. Quiet
            on purpose: the offers above are the answer almost every time, and a
            second prominent button would turn this into the menu it is not. */}
        <button
          onClick={onModes}
          className="mt-auto w-full flex-shrink-0 pt-10 pb-1 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95"
        >
          All modes
        </button>
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
