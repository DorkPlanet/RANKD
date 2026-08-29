"use client";

// "That's the right book, but that's not my cover."
//
// ── Why this is a different question from `FixMatch` ───────────────────────
//
// `FixMatch` asks WHICH BOOK this is, and answering it replaces the whole
// record — a different volume, different author, different everything. That is
// the wrong tool for artwork, and reaching for it does real damage: correcting a
// match sets `pinnedMeta`, which retires the record from the metadata queue
// entirely, so somebody using it to fix a cover would silently stop their book
// ever learning its page count or its categories.
//
// So a cover gets its own control, and it pins one field. See `pinnedArt` in
// lib/types.ts for the line between the two.
//
// ── Why books have this and films do not ───────────────────────────────────
//
// A film has one poster and it is canonical. A book has as many covers as it has
// had printings, and they are not interchangeable to the person who owns one —
// the edition on your shelf is the edition you picture when you think of it.
// `coverFor` picks the likeliest single answer, and likeliest is not the one you
// meant.
//
// PROVISIONAL LOOK — the behaviour is settled, the styling has had no design
// pass. A plain grid of the artwork, which is the only thing being chosen
// between.

import { useEffect, useState } from "react";
import type { Film } from "@/lib/types";
import type { Covers } from "@/app/api/covers/route";
import { lex } from "@/lib/lexicon";

export function CoverPicker({
  film,
  onPick,
  onCancel,
}: {
  film: Film;
  /** The chosen artwork. The caller pins it — see `pinnedArt`. */
  onPick: (poster: string) => void;
  onCancel: () => void;
}) {
  const [covers, setCovers] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const L = lex();

  // Searched on what the record already holds. The reader is not looking for a
  // different book — they have said this one is right — so there is no field to
  // type in. That would be `FixMatch` wearing a second hat.
  useEffect(() => {
    let live = true;
    void (async () => {
      const params = new URLSearchParams({ title: film.title });
      if (film.director) params.set("author", film.director);
      try {
        const res = await fetch(`/api/covers?${params}`);
        if (!res.ok) throw new Error("failed");
        const body = (await res.json()) as Covers;
        if (live) setCovers(body.covers ?? []);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [film.title, film.director]);

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sub font-semibold text-text-hi">Pick a {L.art}</span>
        <button onClick={onCancel} className="text-label text-dim active:scale-95">
          Cancel
        </button>
      </div>

      {failed && (
        <p className="mb-2 text-label leading-snug text-gold">
          That didn&rsquo;t work. Check your connection and try again.
        </p>
      )}

      {covers === null && !failed && <p className="text-sub text-dim">Looking…</p>}

      {covers?.length === 0 && (
        // An empty result is a real answer, not a failure: Open Library holds
        // one cover for this book and it is already on it.
        <p className="text-sub leading-snug text-dim">
          No other {L.art}s for this {L.one}.
        </p>
      )}

      {!!covers?.length && (
        <div className="grid grid-cols-4 gap-2">
          {covers.map((src) => {
            const current = src === film.poster;
            return (
              <button
                key={src}
                onClick={() => onPick(src)}
                aria-label={`Use this ${L.art}`}
                aria-pressed={current}
                className={`overflow-hidden rounded border active:scale-[0.97] ${
                  current ? "border-gold" : "border-border"
                }`}
                style={{ aspectRatio: "2 / 3" }}
              >
                {/* `object-cover` rather than `contain`: book covers run from
                    0.60 to 0.67 against the 2:3 these frames assume, so the
                    crop is a few pixels off the sides and letterboxing would
                    be far more obvious than losing them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  // A candidate that fails to load is removed rather than left
                  // as a broken frame somebody can still tap. Every URL here was
                  // verified server-side, so this is the rare case — a cover
                  // withdrawn between the check and the render — not the norm.
                  onError={(e) => {
                    e.currentTarget.closest("button")?.remove();
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
