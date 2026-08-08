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
import { cardFilename, renderCard, shareCard } from "@/lib/card";
import { saveList } from "@/lib/lists";
import { starsFor } from "@/lib/tiers";
import type { Film } from "@/lib/types";

type Saving = "idle" | "working" | "saved" | "failed";

export function RunSummary({
  title,
  subtitle,
  films,
  /** Whether the climb reached the top or you called it early. */
  complete,
  onList,
  onAgain,
  onDone,
}: {
  title: string;
  subtitle?: string;
  /** The result, best first. This order is the whole output of the run. */
  films: Film[];
  complete: boolean;
  onList: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState<Saving>("idle");
  const [exported, setExported] = useState<Saving>("idle");

  const save = () => {
    setSaved("working");
    try {
      saveList(title, films, { source: subtitle });
      setSaved("saved");
    } catch {
      setSaved("failed");
    }
  };

  const exportJpg = async () => {
    setExported("working");
    try {
      const blob = await renderCard({ title, subtitle, films });
      await shareCard(blob, cardFilename(title));
      setExported("saved");
    } catch {
      setExported("failed");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="font-display text-2xl leading-none tracking-wide text-gold">{title}</div>
          <p className="mt-1.5 text-[11px] uppercase tracking-wider text-dim">
            {subtitle ? `${subtitle} · ` : ""}
            {films.length} ranked
          </p>
          {/* Honest about which it is. A run you stopped early is still an
              answer — it is just not the same claim as one that went the
              distance, and the saved list should not pretend otherwise. */}
          {!complete && (
            <p className="mt-1 font-serif text-[12px] italic text-dim">
              Called early — this is where it stood.
            </p>
          )}
        </div>

        {/* The whole order, not a top five. A director has a dozen films and the
            bottom of that list is as much of the answer as the top; SessionEnd
            shows five because a tier run has 130 and the list screen holds the
            rest. Here there is no elsewhere. */}
        <div className="mt-4 flex flex-col gap-1">
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
                <span className="block truncate text-[11px] text-dim">
                  {[f.year, f.guest ? "not seen" : starsFor(f.rating)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Stated rather than left to be discovered. A cross-tier order that
            didn't move the main list looks like a bug unless the screen says
            it is the point. */}
        <p className="mt-3 text-center text-[11px] leading-snug text-dim">
          This order crosses your star ratings, so it hasn&rsquo;t changed your list. Keep it here or
          take it with you.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={exportJpg}
            disabled={exported === "working"}
            className="w-full rounded-full py-3 text-sm font-extrabold tracking-wide active:scale-95 disabled:opacity-60"
            style={{ color: "#1c1405", background: "var(--gold)" }}
          >
            {exported === "working"
              ? "Drawing it…"
              : exported === "saved"
                ? "Saved as a picture ✓"
                : exported === "failed"
                  ? "Couldn't make the image — try again"
                  : "Export as a picture"}
          </button>
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
            <button onClick={onAgain} className="text-[11px] font-semibold text-dim active:scale-95">
              Rank them again
            </button>
            <button onClick={onList} className="text-[11px] font-semibold text-dim active:scale-95">
              Your list
            </button>
            <button onClick={onDone} className="text-[11px] font-semibold text-dim active:scale-95">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
