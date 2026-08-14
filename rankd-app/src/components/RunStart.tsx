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
// was being asked for before anything had been offered.
//
// ── The first attempt at this screen was wrong, and how ────────────────────
//
// It was a dashboard: a WHERE YOU STAND eyebrow over a count, a bordered box,
// and a list of tiers with `0/185` right-aligned down the side. Every number on
// it was correct and the whole thing read like a settings panel. Two things were
// wrong and the user named both.
//
// **It had no presence.** This is the door into the game, and the game is about
// films, so the screen should have one on it. The artwork does the work that a
// bigger heading could not: it says what this app is before a word is read.
//
// **It spoke in labels instead of sentences.** `WHERE YOU STAND / 1 of 861` is a
// readout. "You've ranked 1 of your 861 films" is the app talking to the person
// whose library it is, which is the voice the rest of it uses.
//
// ── Why a poster here, when the profile refuses one ────────────────────────
//
// `ProfileScreen` deliberately uses a frame from a scene rather than a poster,
// because "posters are the library's currency and one more of them at the top of
// your own profile goes stale". That reasoning is about the profile, which is
// about YOU. This screen is about the films, and it is the threshold of the game
// where posters are the pieces you are about to move. The currency belongs here.
//
// It costs no request either: the poster is already on the film. `ProfileScreen`
// has to fetch a still.
//
// ── Still no chart ─────────────────────────────────────────────────────────
//
// A tier map was built for this app twice and rejected twice as "chunky". The
// counts are the readout, and they are now a quiet line of type rather than a
// column of right-aligned figures.

import { Header, BottomNav } from "./DuelScreen";
import { leastRanked, tierProgress } from "@/lib/progress";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

/** How many other tiers get named in the quiet line. */
const SHOWN = 3;

/**
 * The face of the pile you are being offered.
 *
 * The best-scoring film in it that actually has artwork, so the screen leads
 * with something you rated highly rather than whatever happens to sit first in
 * the array. Undefined until the credits sweep has been past, which is why the
 * layout below has to hold together without it.
 */
function faceOf(films: readonly Film[], tier: Rating | undefined): Film | undefined {
  if (tier === undefined) return undefined;
  return films
    .filter((f) => f.rating === tier && f.poster && !f.guest)
    .sort((a, b) => b.score - a.score)[0];
}

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

  const least = leastRanked(slices);
  const resume = resumeTier !== undefined ? withWork.find((s) => s.rating === resumeTier) : undefined;
  const lead = resume ?? least;
  const face = faceOf(films, lead?.rating);

  const rest = withWork
    .filter((s) => s.rating !== lead?.rating)
    .sort((a, b) => a.ranked / a.total - b.ranked / b.total || b.total - a.total)
    .slice(0, SHOWN);

  // Sentences, not labels. Every one of these is the app talking to the person
  // whose library it is, which is the difference the user asked for.
  const standing =
    total === 0
      ? "Nothing in your library yet."
      : ranked === 0
        ? `${total.toLocaleString()} films, and none of them ranked yet.`
        : `You've ranked ${ranked.toLocaleString()} of your ${total.toLocaleString()} films.`;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {lead ? (
          <>
            {/* The title card. Artwork behind, the offer written over the fade,
                exactly the shape `ProfileScreen`'s banner uses so the two
                screens read as one app. Tapping it starts the run: the whole
                panel is the button, because the whole panel is the offer. */}
            <button onClick={() => onStart(lead.rating)} className="relative w-full text-left active:scale-[0.99]">
              {/* 4:5, not the 16:9 the profile's banner uses. A poster is 2:3,
                  so a landscape window throws away nearly half of it and takes
                  the printed title with it. At 4:5 only about a sixth is lost,
                  off the top and bottom evenly, which is the part a poster can
                  afford. It also fills vertical space this screen had spare. */}
              <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
                {face?.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={face.poster}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="block h-full w-full" style={{ background: "var(--surface)" }} />
                )}
                <span className="poster-fade absolute inset-0" />
              </span>

              {/* Sits ON the fade, bottom-left, like a title over a frame. */}
              <span className="absolute inset-x-0 bottom-0 block px-7 pb-5">
                <span className="block font-serif text-[19px] leading-snug text-text-hi">
                  {resume ? "You were last ranking" : "A good place to start:"}{" "}
                  <span className="text-gold">{starsFor(lead.rating)}</span>
                </span>
                <span className="mt-1 block font-serif text-[14px] italic leading-snug text-dim">
                  {lead.total - lead.ranked} of {lead.total} still to place.
                </span>
              </span>
            </button>

            <div className="px-7 pt-6">
              <button
                onClick={() => onStart(lead.rating)}
                className="w-full rounded-full bg-gold py-3.5 text-center text-[13px] font-bold text-[#1c1405] active:scale-[0.99]"
              >
                {resume ? "Continue" : "Start"}
              </button>

              {/* The standing, demoted to a line of prose under the offer. It
                  was the headline in the first version, which put a statistic
                  above the only thing on the screen anyone came here to do. */}
              <p className="mt-5 text-center font-serif text-[13px] leading-relaxed text-dim">{standing}</p>

              {rest.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center">
                  {rest.map((s) => (
                    <button
                      key={s.rating}
                      onClick={() => onStart(s.rating)}
                      className="text-[12px] text-dim active:scale-95"
                    >
                      <span className="text-gold">{starsFor(s.rating)}</span>{" "}
                      <span className="tabular-nums">{s.total - s.ranked} left</span>
                    </button>
                  ))}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="px-7 pt-16">
            <p className="font-serif text-[19px] leading-relaxed text-text-hi">
              {total === 0
                ? "There is nothing in your library yet. Import a ratings file from Settings and this becomes a game."
                : "Every film you own is ranked. There is nothing left to place, which is the whole point of the exercise."}
            </p>
          </div>
        )}

        {/* Quiet on purpose: the offer above is the answer almost every time,
            and a second prominent control would turn this back into the menu
            it is explicitly not. */}
        <button
          onClick={onModes}
          className="mt-auto w-full flex-shrink-0 pt-10 pb-3 text-center text-[11px] text-dim underline underline-offset-4 active:scale-95"
        >
          Something else
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
