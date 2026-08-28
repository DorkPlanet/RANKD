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
// blank page. That is why they get used. The line underneath is optional and
// short, and it asks what STOOD OUT rather than for a favourite scene: a scene
// needs plot to explain it, which is how a prompt becomes a spoiler.
//
// See lib/tags.ts for why this is not a review and what the tags add up to.

import { useState } from "react";

import { Eyebrow, FIELD, PrimaryButton, QuietButton, Sheet } from "./ui";
import { cleanNote, cleanTags, MAX_TAGS, NOTE_MAX, TAGS, type Tag } from "@/lib/tags";
import type { Film } from "@/lib/types";

export function TagSheet({
  film,
  onSave,
  onClose,
}: {
  film: Film;
  onSave: (tags: string[], note: string | undefined) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<Tag[]>(() => cleanTags(film.tags));
  const [note, setNote] = useState(film.note ?? "");

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

  const done = () => {
    onSave(tags, cleanNote(note));
    onClose();
  };

  const full = tags.length >= MAX_TAGS;

  return (
    <Sheet title={film.title} onClose={onClose}>
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

        <Eyebrow className="mt-6">What stood out?</Eyebrow>
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
