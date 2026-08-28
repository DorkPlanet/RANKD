"use client";

// A ranking you kept, read back.
//
// `saveList` has existed since the share cards landed and `loadLists` had NO
// CALLERS: you could make a ranking, save it, and never see it again. This is
// the read half.
//
// The order is the list's own and is never re-derived — that is the whole point
// of freezing it (see the header of lib/lists.ts). Only artwork and the star
// rating refresh, so a poster that arrived later shows up and a film that has
// climbed since does not move.

import { useMemo, useState } from "react";

import { CardPicker } from "./CardPicker";
import { PrimaryButton, SecondaryButton, Sheet } from "./ui";
import { cardDataFromFilms } from "@/lib/card/data";
import { deleteList, filmsOf, hydrate, subjectOf, type SavedList } from "@/lib/lists";
import { starsFor } from "@/lib/tiers";
import type { Film } from "@/lib/types";

export default function SavedListSheet({
  list,
  films,
  pinned,
  canPin,
  onPin,
  onClose,
  onDeleted,
  startOnCard,
}: {
  list: SavedList;
  /** The live library, so rows can refresh their artwork. */
  films: Film[];
  pinned: boolean;
  /** False when the profile is already full; the control says so rather than failing. */
  canPin: boolean;
  onPin: (pin: boolean) => void;
  onClose: () => void;
  onDeleted: () => void;
  /** Opened by the shelf's card shortcut, so skip straight to the designs. */
  startOnCard?: boolean;
}) {
  // Closing the card view still lands on the list underneath, whichever way you
  // arrived — a shortcut that also became the only way out would make the list
  // unreachable for anyone who used it.
  const [showCard, setShowCard] = useState(!!startOnCard);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(() => hydrate(list, films), [list, films]);
  const { films: cardFilms, dropped } = useMemo(() => filmsOf(list, films), [list, films]);
  const subject = subjectOf(list);

  // A card needs something to be OF and at least two films to compare. A tier
  // ranking or a list saved before sources existed has no subject, so it is
  // shown without the offer rather than with a button that cannot work.
  const canCard = !!subject && cardFilms.length >= 2;
  const data = useMemo(
    () => (canCard ? cardDataFromFilms(subject!, cardFilms) : null),
    [canCard, subject, cardFilms],
  );

  const when = new Date(list.savedAt);
  const saved = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  if (showCard && data) {
    return (
      <Sheet title={list.name} onClose={() => setShowCard(false)}>
        <CardPicker data={data} />
      </Sheet>
    );
  }

  return (
    <Sheet title={list.name} onClose={onClose}>
      <p className="mb-4 text-sub text-dim">
        {list.source && <span className="uppercase tracking-[0.12em]">{list.source}</span>}
        {list.source && saved && " · "}
        {saved && `saved ${saved}`}
        {` · ${list.entries.length} films`}
      </p>

      <div className="mb-5 flex gap-2">
        {canCard && (
          <PrimaryButton className="flex-1" onClick={() => setShowCard(true)}>
            Make the card
          </PrimaryButton>
        )}
        <SecondaryButton className="flex-1" onClick={() => onPin(!pinned)} disabled={!pinned && !canPin}>
          {pinned ? "Unpin" : canPin ? "Pin to profile" : "Profile full"}
        </SecondaryButton>
      </div>

      {dropped > 0 && (
        // Said out loud rather than quietly drawn short. These are rows saved
        // before the entry carried a rating whose film has also left the
        // library, so the card genuinely cannot include them.
        <p className="mb-4 text-sub leading-snug text-dim">
          {dropped} {dropped === 1 ? "film is" : "films are"} missing from the card: they left your
          library before it recorded enough to redraw them.
        </p>
      )}

      <ol className="mb-5">
        {rows.map(({ entry, film }, i) => (
          <li key={entry.id} className="flex items-baseline gap-3 border-b border-border py-2.5">
            <span className="w-6 flex-shrink-0 text-sub tabular-nums text-dim">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sub text-text-hi">
              {film?.title ?? entry.title}
              {entry.guest && <span className="ml-1.5 text-label uppercase tracking-wider text-dim">guest</span>}
            </span>
            <span className="flex-shrink-0 text-sub text-gold">
              {/* The library's rating where there is one, so a re-rate shows;
                  the frozen one otherwise. */}
              {film ? starsFor(film.rating) : entry.rating !== undefined ? starsFor(entry.rating) : ""}
            </span>
          </li>
        ))}
      </ol>

      {confirmDelete ? (
        <div className="flex items-center justify-between">
          <span className="text-sub text-text">Delete this ranking?</span>
          <span className="flex gap-3">
            <button onClick={() => setConfirmDelete(false)} className="text-sub text-dim active:scale-95">
              No
            </button>
            <button
              onClick={() => {
                deleteList(list.id);
                onDeleted();
              }}
              className="text-sub font-bold text-gold active:scale-95"
            >
              Yes
            </button>
          </span>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-sub text-dim active:scale-95"
        >
          Delete this ranking
        </button>
      )}
    </Sheet>
  );
}
