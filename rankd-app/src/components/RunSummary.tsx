"use client";

// What a cross-tier climb produced, and the two things you can do with it.
//
// The ordinary SessionEnd is a door: it shows five posters and points you at the
// list, because that is where a tier run's result now lives. A person run has
// nowhere like that to point. Its order is stored in no film's `score` and shows
// up in no tier — by design, since a filmography ordering must not rewrite the
// main list (see lib/people.ts). So if this screen doesn't hand the answer over,
// the answer is gone the moment the run ends.
//
// Hence the two actions, and hence they shipped together with the climb rather
// than after it. Save keeps it inside the app, frozen as you left it. Export
// makes it a JPG — a thing you can put in a message, which is the form most of
// these answers actually want to take.
//
// PROVISIONAL LOOK — the shape is settled, the styling has had no design pass.

import { useState } from "react";
import { CardPicker } from "./CardPicker";
import { cardDataFromFilms } from "@/lib/card/data";
import { saveList } from "@/lib/lists";
import { subjectEyebrow, subjectTitle, type RankSubject } from "@/lib/subject";
import { starsFor } from "@/lib/tiers";
import type { Film } from "@/lib/types";

type Saving = "idle" | "working" | "saved" | "failed";

export function RunSummary({
  subject,
  films,
  /** Whether the climb reached the top or you called it early. */
  complete,
  onList,
  onAgain,
  onDone,
}: {
  /** What the ranking is of — a director, an actor, a genre. */
  subject: RankSubject;
  /** The result, best first. This order is the whole output of the run. */
  films: Film[];
  complete: boolean;
  onList: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState<Saving>("idle");

  const title = subjectTitle(subject);
  const subtitle = subjectEyebrow(subject);

  const save = () => {
    setSaved("working");
    try {
      saveList(title, films, { source: subtitle });
      setSaved("saved");
    } catch {
      setSaved("failed");
    }
  };

  // Built once and handed to the picker, so all three designs draw from exactly
  // the same snapshot — same entries, same stats, same insight line.
  const card = cardDataFromFilms(subject, films);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="font-display text-2xl leading-none tracking-wide text-gold">{title}</div>
          <p className="mt-1.5 text-label uppercase tracking-wider text-dim">
            {subtitle ? `${subtitle} · ` : ""}
            {films.length} ranked
          </p>
          {/* Honest about which it is. A run you stopped early is still an
              answer — it is just not the same claim as one that went the
              distance, and the saved list should not pretend otherwise. */}
          {!complete && (
            <p className="mt-1 font-serif text-sub italic text-dim">
              Called early — this is where it stood.
            </p>
          )}
        </div>

        {/* The cards come FIRST, above the list.
            The list is what you just made and you have been staring at it for
            twenty duels; the cards are the thing you did not know you were
            getting. Putting the ranking first would bury them under a scroll. */}
        <div className="mt-4">
          <CardPicker data={card} />
        </div>

        {/* The whole order, not a top five. A director has a dozen films and the
            bottom of that list is as much of the answer as the top; SessionEnd
            shows five because a tier run has 130 and the list screen holds the
            rest. Here there is no elsewhere. */}
        <div className="mt-5 flex flex-col gap-1">
          {films.map((f, i) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-xl border px-3 py-2"
              style={{ borderColor: i === 0 ? "var(--gold)" : "var(--border)" }}
            >
              <span
                className={`w-6 flex-shrink-0 text-center font-serif ${i === 0 ? "text-lg font-bold text-gold" : "text-sm text-dim"}`}
              >
                {i + 1}
              </span>
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.poster} alt="" className="w-9 flex-shrink-0 rounded" style={{ aspectRatio: "2/3" }} />
              ) : (
                <span className="w-9 flex-shrink-0 rounded bg-border" style={{ aspectRatio: "2/3" }} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-hi">{f.title}</span>
                <span className="block truncate text-sub text-dim">
                  {[f.year, f.guest ? "not seen" : starsFor(f.rating)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Stated rather than left to be discovered. A cross-tier order that
            didn't move the main list looks like a bug unless the screen says
            it is the point. */}
        <p className="mt-3 text-center text-sub leading-snug text-dim">
          This order crosses your star ratings, so it hasn&rsquo;t changed your list. Keep it here or
          take it with you.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={save}
            disabled={saved !== "idle"}
            className="w-full rounded-full border border-border py-2.5 text-xs font-bold tracking-wide text-text-hi active:scale-95 disabled:opacity-60"
          >
            {saved === "saved"
              ? "Saved to your lists ✓"
              : saved === "failed"
                ? "Couldn't save it"
                : "Save as a list"}
          </button>
          <div className="mt-1 flex items-center justify-center gap-5">
            <button onClick={onAgain} className="text-sub font-semibold text-dim active:scale-95">
              Rank them again
            </button>
            <button onClick={onList} className="text-sub font-semibold text-dim active:scale-95">
              Your list
            </button>
            <button onClick={onDone} className="text-sub font-semibold text-dim active:scale-95">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
