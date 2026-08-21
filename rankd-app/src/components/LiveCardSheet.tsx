"use client";

// A view over the master list, read back and made shareable.
//
// The sibling of `SavedListSheet`, and the differences are the whole point:
// that one reads a FROZEN order and offers to pin or delete it, because it is a
// thing you made and kept. This reads a LIVE one and offers neither, because
// there is nothing here to keep — the order is the master list's own, computed
// when you opened this and correct again the next time you do.
//
// So there is deliberately no save control. Saving would freeze a copy at
// today, and the next duel would leave it asserting a top ten that is no longer
// yours while looking exactly like one that is. `lib/card/live.ts` explains the
// rest; `isLiveSubject` is where the rule is enforced.

import { useMemo, useState } from "react";

import { CardPicker } from "./CardPicker";
import { Sheet } from "./ui";
import { liveCard, liveFilms } from "@/lib/card/live";
import { subjectEyebrow, subjectTitle, type RankSubject } from "@/lib/subject";
import type { Film } from "@/lib/types";

export default function LiveCardSheet({
  subject,
  films,
  onInfo,
  onClose,
}: {
  subject: RankSubject;
  films: Film[];
  onInfo: (film: Film) => void;
  onClose: () => void;
}) {
  const [showCard, setShowCard] = useState(false);

  const rows = useMemo(() => liveFilms(films, subject), [films, subject]);
  const data = useMemo(() => liveCard(films, subject), [films, subject]);

  if (showCard && data) {
    return (
      <Sheet title={subjectTitle(subject)} onClose={() => setShowCard(false)}>
        <CardPicker data={data} />
      </Sheet>
    );
  }

  return (
    <Sheet title={subjectTitle(subject)} onClose={onClose}>
      <p className="mb-4 text-sub text-dim">
        <span className="uppercase tracking-[0.12em]">{subjectEyebrow(subject)}</span>
        <span className="mx-1.5">·</span>
        {/* Says out loud that this is not a saved thing. Without the line, a
            reader has no way to tell this shelf tile from the one beside it
            that IS saved, and would reasonably wonder where the save button
            went. */}
        Live from your ranking, always current
      </p>

      <ol className="mb-2 flex flex-col gap-1.5">
        {rows.map((f, i) => (
          <li key={f.id}>
            <button
              onClick={() => onInfo(f)}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
            >
              <span className="w-5 shrink-0 text-right font-display text-body tabular-nums text-gold">
                {i + 1}
              </span>
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.poster} alt="" aria-hidden className="h-11 w-8 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-11 w-8 shrink-0 rounded border border-border" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sub text-text-hi">{f.title}</span>
                {f.year && <span className="block text-label text-dim">{f.year}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {data && (
        <button
          onClick={() => setShowCard(true)}
          className="mt-3 w-full rounded-xl border border-gold/50 py-2.5 text-center text-xs font-bold text-gold active:scale-[0.98]"
        >
          Make the card
        </button>
      )}
    </Sheet>
  );
}
