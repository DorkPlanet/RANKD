"use client";

// The trophy in the header, on every screen — it used to be wired only on the
// profile, so tapping it anywhere else did nothing.
//
// Locked badges are shown alongside earned ones. A list you can only see once
// you've finished it is a trophy cabinet; a list you can see beforehand is a set
// of things to go and do.

import { Sheet } from "./ui";
import { StarIcon } from "./Icons";
import { achievements } from "@/lib/achievements";
import type { Film } from "@/lib/types";

export default function Trophies({ films, onClose }: { films: Film[]; onClose: () => void }) {
  const list = achievements(films);
  const got = list.filter((b) => b.got);
  return (
    <Sheet title="Badges" onClose={onClose} scroll>
      <p className="mb-3 text-sub leading-snug text-dim">
        {got.length} of {list.length} earned. The rest are what&rsquo;s left to do.
      </p>
      {/* ── An unearned badge is DIMMER, not fainter ──────────────────────
          The whole row used to carry `opacity: 0.55`, which faded the border and
          the star along with the words — so a locked badge read as a rendering
          glitch rather than as a thing still to do. The star and the text colour
          already draw that distinction, and they are the two elements whose job
          it is; the box is the same box either way.

          The description was `text-label` — 10px — which was the only place in
          the app a full explanatory sentence was set at the eyebrow size. It is
          the line that tells you how to EARN the badge, so it is the one line on
          this row worth reading. */}
      {list.map((b) => (
        <div
          key={b.id}
          className="mb-1.5 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
        >
          <span className={b.got ? "text-gold" : "text-dim"}>
            <StarIcon filled={b.got} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-body ${b.got ? "text-text-hi" : "text-dim"}`}>
              {b.name}
            </span>
            <span className="block text-sub leading-snug text-dim">{b.how}</span>
          </span>
          {b.progress && <span className="flex-shrink-0 text-label text-dim tabular-nums">{b.progress}</span>}
        </div>
      ))}
    </Sheet>
  );
}
