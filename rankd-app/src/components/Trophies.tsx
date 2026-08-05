"use client";

// The trophy in the header, on every screen — it used to be wired only on the
// profile, so tapping it anywhere else did nothing.
//
// Locked badges are shown alongside earned ones. A list you can only see once
// you've finished it is a trophy cabinet; a list you can see beforehand is a set
// of things to go and do.

import Sheet from "./Sheet";
import { achievements } from "@/lib/achievements";
import type { Film } from "@/lib/types";

export default function Trophies({ films, onClose }: { films: Film[]; onClose: () => void }) {
  const list = achievements(films);
  const got = list.filter((b) => b.got);
  return (
    <Sheet title="Badges" onClose={onClose}>
      <p className="mb-3 text-[11px] leading-snug text-dim">
        {got.length} of {list.length} earned. The rest are what&rsquo;s left to do.
      </p>
      {list.map((b) => (
        <div
          key={b.id}
          className="mb-1.5 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
          style={{ opacity: b.got ? 1 : 0.55 }}
        >
          <span className={`text-[15px] ${b.got ? "text-gold" : "text-dim"}`}>{b.got ? "★" : "☆"}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-hi">{b.name}</span>
            <span className="block text-[10px] leading-snug text-dim">{b.how}</span>
          </span>
          {b.progress && <span className="flex-shrink-0 text-[10px] text-dim tabular-nums">{b.progress}</span>}
        </div>
      ))}
    </Sheet>
  );
}
