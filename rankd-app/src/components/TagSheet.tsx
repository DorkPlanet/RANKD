"use client";

// Why this film is where it is.
//
// ── Offered at the lock, and only there ────────────────────────────────────
//
// Locking is already a deliberate pause: you stopped, looked at a position and
// committed to it. "Why?" is a natural thing to be asked at that moment and a
// terrible thing to be asked during Fast Shuffle, which exists to be fast. So
// this appears once, when somebody has already chosen to slow down, and never
// interrupts the loop.
//
// ── Taps, not prose ────────────────────────────────────────────────────────
//
// The model is Uber's driver ratings — a handful of chips, one tap each, no
// blank page. That is why they get used.
//
// ── The scene, and the objection this file used to make ────────────────────
//
// This header argued against asking for a favourite scene, and the argument was
// a good one: "a scene needs plot to explain it, which is how a prompt becomes a
// spoiler." It is answered rather than overruled. The film carries a `spoiler`
// flag, so a scene can be NAMED and still sit behind a tap for anybody who has
// not seen it. The user's call, 28 Aug 2026.
//
// Asking for a scene rather than a review is the point. A blank box asking for
// prose gets nothing from a normal person; a concrete question gets a sentence
// out of almost anyone, and `SCENE_MAX` is short enough that it has to name a
// moment rather than recount one.
//
// ── Saving is not publishing ───────────────────────────────────────────────
//
// Everything here has always been private and stays that way by default. See
// lib/social/takes.ts: the tags and the line were written under that promise, so
// publishing is a separate switch rather than a consequence of typing.
//
// See lib/tags.ts for why this is not a review and what the tags add up to.

import { useState } from "react";

import { Eyebrow, FIELD, PrimaryButton, QuietButton, Sheet } from "./ui";
import {
  cleanNote,
  cleanScene,
  cleanTags,
  MAX_TAGS,
  NOTE_MAX,
  SCENE_MAX,
  TAGS,
  type Tag,
} from "@/lib/tags";
import type { Film } from "@/lib/types";

/** What the sheet hands back. One object, because it is one decision. */
export interface TagDraft {
  tags: string[];
  note: string | undefined;
  scene: string | undefined;
  spoiler: boolean;
}

export function TagSheet({
  film,
  onSave,
  onClose,
}: {
  film: Film;
  onSave: (draft: TagDraft) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<Tag[]>(() => cleanTags(film.tags));
  const [note, setNote] = useState(film.note ?? "");
  const [scene, setScene] = useState(film.scene ?? "");

  const toggle = (tag: Tag) => {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : // Silently refusing the fourth would read as a broken button. The cap
          // is shown in the counter above instead, so the limit is visible
          // before it is hit.
          current.length >= MAX_TAGS
          ? current
          : [...current, tag],
    );
  };

  const cleanedNote = cleanNote(note);
  const cleanedScene = cleanScene(scene);

  const done = () => {
    onSave({
      tags,
      note: cleanedNote,
      scene: cleanedScene,
      // Carried through untouched rather than dropped. Nothing on this sheet can
      // change it while sharing is withdrawn, and destroying a flag somebody set
      // before it was withdrawn would be a data loss nobody asked for. It is
      // still what marks a scene on the film card.
      spoiler: film.spoiler === true && (cleanedNote !== undefined || cleanedScene !== undefined),
    });
    onClose();
  };

  const full = tags.length >= MAX_TAGS;

  // `scroll`, because this is now the tallest sheet in the app: ten chips, two
  // fields and two switch rows. Without it the whole panel is the scroller, so
  // the title and Done scroll away with everything else — and on a phone, with
  // the keyboard up over a sheet whose height is capped in viewport units, there
  // is not enough room left to reach the bottom at all. Reported from a phone,
  // 28 Aug 2026: "I can't scroll the card when trying to describe."
  return (
    <Sheet title={film.title} onClose={onClose} scroll>
      {/* No gutter of its own. `Sheet` already pads `px-6 pb-6`, so this had
          been sitting on 48px of inset — the narrowest content column in the
          app, and the reason the chips wrapped a row earlier than they needed
          to. */}
      <div>
        <p className="text-sub leading-snug text-dim">
          What puts it there? Pick up to {MAX_TAGS}.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                aria-pressed={on}
                // An unpicked chip dims once the cap is reached, so the limit is
                // something you can see rather than something you discover by
                // tapping and getting nothing.
                className={`rounded-full px-3 py-1.5 text-sub transition-colors active:scale-95 ${
                  !on && full ? "opacity-35" : ""
                }`}
                style={{
                  background: on ? "var(--gold)" : "var(--wash)",
                  color: on ? "var(--gold-ink)" : "var(--text)",
                  fontWeight: on ? 700 : 400,
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* A single line, so it is an input rather than a textarea. The shape of
            the box is half the instruction: a two-row field asks for a paragraph
            however short the cap on it is. */}
        <Eyebrow className="mt-6">The scene</Eyebrow>
        <input
          value={scene}
          onChange={(e) => setScene(e.target.value.slice(0, SCENE_MAX))}
          placeholder="Optional"
          aria-label="Your favourite scene"
          className={`${FIELD} mt-2`}
        />

        <Eyebrow className="mt-5">What stood out?</Eyebrow>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          rows={2}
          placeholder="Optional"
          aria-label="What stood out?"
          className={`${FIELD} mt-2 resize-none`}
        />
        {/* Only once it is worth knowing about, so the box is not permanently
            wearing a number nobody is near. */}
        {note.length > NOTE_MAX - 40 && (
          <div className="mt-1 text-label text-dim">{NOTE_MAX - note.length} left</div>
        )}

        {/* ── Sharing and the spoiler switch are WITHDRAWN, together ──────────
            Both shipped here, and both came straight back out on 28 Aug 2026
            with the Activity screen (see `RIBBON` in lib/ribbon.ts).

            "Share this" said "It goes on your profile, where people can read it
            and reply", and not one clause of that was true: there is no takes
            shelf on a profile, comments were never wired up, and the feed is
            gone. The switch's only effect was invisible. That is precisely the
            pattern being retired, so it is not shipping while it is a promise.

            The spoiler switch went with it rather than staying behind, because
            it only means anything once somebody else can read the words. Hiding
            your own scene from yourself is not a feature, and leaving it would
            be the same half-promise one layer down.

            NOTHING BELOW THEM WAS TOUCHED. `Film.take`, `takesFrom`,
            `syncTakes`, the `take` table and its migration are all still here
            and still correct, so restoring this is these two rows plus the
            `take` line in `AppShell`'s `onSave` — once there is a shelf for a
            take to land on. */}

        {/* `text-bg` navy was the ink here — the only gold button in the app not
            using `--gold-ink`, so this one read a shade colder than every other
            primary. And `rounded-xl` where the rest are pills. */}
        <PrimaryButton wide className="mt-6" onClick={done}>
          Save
        </PrimaryButton>
        {/* Skipping has to be as easy as answering, or the prompt becomes a toll
            on locking and people stop locking. */}
        <QuietButton wide className="mt-2" onClick={onClose}>
          Not now
        </QuietButton>
      </div>
    </Sheet>
  );
}
