"use client";

// Activity — what the people you follow have been doing to their rankings.
//
// ── Familiar in shape, unfamiliar in substance ─────────────────────────────
//
// Every other film app's feed is built on WATCHING: X watched a film, X rated a
// film. Rankd's unit is a judgement, and its consequence is movement — a film
// climbing, a film crossing a tier. That is what these cards are, and it is the
// one thing no competitor can show because no competitor holds an ordered list
// as its primary object.
//
// ── Read-only, deliberately ────────────────────────────────────────────────
//
// No reactions and no replies in this version. The user's call, and the right
// one: with a handful of accounts an empty reaction row is worse than no
// reaction row, and free text on somebody else's card is a moderation
// commitment to take on once the cards have proved they are worth reacting to.
//
// ── Nothing here is asserted by a client ───────────────────────────────────
//
// Cards are derived on the server when a snapshot lands, by diffing it against
// the stored one. See `lib/social/feed.ts`.

import { useEffect, useRef, useState } from "react";

import { BottomNav, Header } from "./DuelScreen";
import { dragScreen, inShelf, TURN_AT, type Dir } from "@/lib/ribbon";
import type { FeedItem } from "@/lib/social/activity";

/** How the card says what kind of thing happened. */
function eyebrowFor(item: FeedItem): string {
  const meta = item.meta as { to?: number; places?: number; count?: number };
  switch (item.kind) {
    case "climb":
      return `UP ${meta.places} PLACES`;
    case "promotion":
      return `NOW A ${meta.to}`;
    case "arrival":
      return "NEW IN THE TOP TEN";
    default:
      return `${meta.count} MORE RANKED`;
  }
}

function Card({ item, mine }: { item: FeedItem; mine: boolean }) {
  const meta = item.meta as {
    title?: string;
    year?: string;
    poster?: string;
    rank?: number;
    from?: number;
    count?: number;
  };

  return (
    <article className="flex items-center gap-3.5 py-3.5">
      {/* The artwork is the card. A feed of text is a log, and the posters are
          the reason this reads as somebody's taste rather than an audit trail. */}
      {meta.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.poster}
          alt=""
          aria-hidden
          className="h-[68px] w-[46px] flex-shrink-0 rounded-md object-cover"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }}
        />
      ) : (
        // A card about no single film still needs to occupy the same column, or
        // the list develops a stagger wherever one appears.
        <div
          aria-hidden
          className="flex h-[68px] w-[46px] flex-shrink-0 items-center justify-center rounded-md font-serif text-lg font-bold text-gold"
          style={{ background: "var(--surface)" }}
        >
          {meta.count ?? "·"}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="text-label font-extrabold tracking-[0.14em] text-gold">{eyebrowFor(item)}</div>
        <div className="mt-1 truncate text-body font-semibold text-text-hi">
          {meta.title ?? "Films placed"}
        </div>
        <div className="mt-0.5 text-sub text-dim">
          {/* Your own cards say "You", because "@donnie climbed" reads as a
              stranger when the stranger is you. */}
          {mine ? "You" : item.handle}
          {meta.rank !== undefined && ` · now #${meta.rank}`}
          {item.kind === "climb" && meta.from !== undefined && ` · was #${meta.from}`}
        </div>
      </div>
    </article>
  );
}

export function FeedScreen({
  handle,
  onSettings,
  onTrophies,
  onList,
  onDuel,
  onProfile,
  logging,
  onToggleLog,
  onRibbon,
}: {
  /** The reader's own handle, so their cards can say "You". */
  handle: string | null;
  onSettings: () => void;
  onTrophies: () => void;
  onList: () => void;
  onDuel: () => void;
  onProfile: () => void;
  logging?: boolean;
  onToggleLog?: () => void;
  /**
   * A swipe off this screen.
   *
   * The feed has no pages of its own, so every horizontal swipe here is about
   * leaving — the same situation the duel screen is in, and the same handling.
   */
  onRibbon: (dir: Dir, travelled?: number) => void;
}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const touch = useRef<{ x: number; y: number; axis: null | "x" | "y" } | null>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (dead) return;
        setItems(res.ok ? ((await res.json()) as { items: FeedItem[] }).items : []);
      } catch {
        // Offline. An empty list rather than an error: the feed is not the app,
        // and a failure to reach it should read as quiet, not as broken.
        if (!dead) setItems([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  return (
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      {/* `chrome-hold` so this band stays put while the page slides under it —
          see the ribbon notes in globals.css. */}
      <div className="chrome-hold flex-shrink-0 px-5 pb-3 pt-3" style={{ background: "var(--band)" }}>
        <div className="text-label font-extrabold tracking-[0.18em] text-dim">ACTIVITY</div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6"
        onTouchStart={(e) => {
          if (inShelf(e.target)) return (touch.current = null);
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, axis: null };
        }}
        onTouchMove={(e) => {
          const from = touch.current;
          if (!from) return;
          const dx = e.touches[0].clientX - from.x;
          if (from.axis === "x") return dragScreen(dx);
          if (from.axis) return;
          const dy = e.touches[0].clientY - from.y;
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          from.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }}
        onTouchEnd={(e) => {
          const from = touch.current;
          touch.current = null;
          if (!from || from.axis !== "x") return;
          const dx = e.changedTouches[0].clientX - from.x;
          const width = e.currentTarget.clientWidth;
          if (Math.abs(dx) <= width * TURN_AT) return dragScreen(null);
          onRibbon(dx < 0 ? 1 : -1, Math.abs(dx) / width);
        }}
      >
        {items === null ? (
          <p className="mt-16 text-center text-sub text-dim">Looking&hellip;</p>
        ) : items.length === 0 ? (
          // ── The empty state offers something ────────────────────────────
          //
          // The feed already includes your OWN cards, so this only shows when
          // nobody — including you — has moved anything yet. Saying "go follow
          // someone" to a person with an empty screen is the same broken promise
          // this cell used to make.
          <div className="mt-16 text-center">
            <p className="text-sub leading-relaxed text-dim">
              Nothing yet. Rank a few films and what moves shows up here.
            </p>
            <p className="mt-2 text-sub leading-relaxed text-dim">
              Follow somebody and theirs will too.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((item) => (
              <Card key={item.id} item={item} mine={item.handle === handle} />
            ))}
          </div>
        )}
      </div>

      <BottomNav
        screen="activity"
        onSettings={onSettings}
        onModes={onDuel}
        onList={onList}
        onProfile={onProfile}
        logging={logging}
        onToggleLog={onToggleLog}
      />
    </main>
  );
}
