"use client";

// Which library you are in, and how to leave it.
//
// ── Why this is the wordmark and not a nav cell ────────────────────────────
//
// The ribbon is three screens wide and every one of them is a PLACE. A medium is
// not a place — it is which library all three of those places are about — so a
// fourth cell would have said "Books" sits beside "Your list" and "You", which
// is a different kind of thing wearing the same clothes. It would also have cost
// a swipe position, and `RIBBON`'s own header explains what adding one costs.
//
// The wordmark is the one piece of chrome on every screen, it already sits at
// the top of the app, and "tap the logo to change what the app is about" is a
// pattern people arrive knowing. The user asked for it there.
//
// ── Why the current medium is shown as an icon, not a word ─────────────────
//
// A word under the bars would have been clearer and would have pushed every
// screen in the app down by a line. The icon sits on the wordmark's own
// baseline, so the header is exactly as tall as it was — and the popover spells
// the medium out in words the moment anybody asks.
//
// PROVISIONAL LOOK — the behaviour is settled, the styling has had no design
// pass. It deliberately borrows the header's existing colours and nothing else.

import { useEffect, useRef, useState } from "react";
import { BookIcon, FilmIcon, TickIcon } from "./Icons";
import { currentMedium, setMedium, MEDIA, type Medium } from "@/lib/medium";
import { lexOf } from "@/lib/lexicon";

const ICON: Record<Medium, () => React.ReactElement> = {
  film: FilmIcon,
  book: BookIcon,
};

export function MediumSwitch() {
  const [open, setOpen] = useState(false);
  // ── Read straight, not through an effect ─────────────────────────────────
  //
  // `currentMedium` answers with the default on the server and with the truth
  // in the browser, which normally means reading it during render tears
  // hydration. It cannot here: `AppShell` returns nothing but the splash until
  // its library lands in an effect, so this component has never appeared in a
  // server-rendered frame and never will.
  //
  // Deferring it to an effect anyway was worse than useless. It would paint the
  // FILM icon for one frame on every single screen before correcting itself — a
  // visible flicker in the app's most permanent piece of chrome — in exchange
  // for guarding against a mismatch that cannot happen.
  const medium = currentMedium();

  // Closing on a tap anywhere else. A scrim element would have been simpler and
  // would have sat over the header's own buttons, so the gear and the trophy
  // would need two taps to reach while this is open.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture, so a tap lands here before whatever it was on gets it. Without
    // it, tapping the gear would open Settings AND leave this menu behind it.
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  const Current = ICON[medium];

  return (
    <div ref={box} className="relative inline-flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        // Named for what it DOES, not what it says. A screen reader announcing
        // "RANKD" tells somebody the name of the app they already opened.
        aria-label={`Ranking ${lexOf(medium).many}. Change medium`}
        className="inline-flex items-baseline gap-1.5 active:scale-95"
      >
        <span
          className="font-display text-[28px] leading-none tracking-[0.06em] text-gold"
          style={{ textShadow: "0 2px 20px var(--glow)" }}
        >
          RANKD
        </span>
        {/* Self-baseline so the glyph sits level with the letterforms rather
            than on the text baseline, where it would hang below them. */}
        <span aria-hidden className="self-center text-dim">
          <Current />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-border shadow-lg"
          style={{ background: "var(--header-bg)" }}
        >
          {MEDIA.map((m) => {
            const Icon = ICON[m];
            const l = lexOf(m);
            return (
              <button
                key={m}
                role="menuitemradio"
                aria-checked={m === medium}
                onClick={() => {
                  // Reloads, unless it is already the active one — in which case
                  // this is only a dismissal. See `setMedium`.
                  setOpen(false);
                  setMedium(m);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:scale-[0.99]"
              >
                <span className={m === medium ? "text-gold" : "text-dim"}>
                  <Icon />
                </span>
                <span className={`flex-1 text-sub ${m === medium ? "text-text-hi" : "text-dim"}`}>
                  {l.Many}
                </span>
                {m === medium && (
                  <span className="text-gold">
                    <TickIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
