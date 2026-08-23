"use client";

// TAKES — where people's lists are moving, and whether you agree.
//
// ── Why this is not an activity feed ───────────────────────────────────────
//
// The first version was one, and it read as somebody else's: same nav slot, same
// heartbeat icon, same reverse-chronological list of things that happened. The
// deeper fault was what the cards WERE. Letterboxd's feed works because a review
// is content — something to read. State changes are not content: "Heat climbed 4
// places" is a statistic you can only nod at, and forty of them is a changelog.
//
// So the cards are PLACEMENTS, not deltas. "Sinners went in at #3" is a claim
// that is still true and still checkable a year later, where "Heat beat
// Collateral" stops meaning anything the moment both films are sorted. The duel
// is the mechanism; the position is the product.
//
// ── And the interaction is agreement, not conversation ─────────────────────
//
// A comment is expensive to write, so it is rare, so most people receive nothing
// and stop coming back. A tap costs nothing, so it happens in volume, so
// everybody gets something. That is the engine under every feed that works.
//
// Disagreement is shown to the reader ALONE — "you have it #14" — and never
// counted in public. Among a handful of people who know each other a visible
// disagree tally builds a scoreboard of who got dunked on, and then nobody posts
// the placements that make the feed exist.

import { useEffect, useRef, useState } from "react";

import { BottomNav, Header } from "./DuelScreen";
import { TalkPanel } from "./TalkPanel";
import { shortAgo, type FeedItem } from "@/lib/social/feed";
import { inShelf, pageAfterSwipe, type Dir } from "@/lib/ribbon";

/** What kind of thing happened, in the card's own small caps. */
function eyebrowFor(item: FeedItem): string {
  const meta = item.meta as { rank?: number; of?: string; at?: number; added?: number; moved?: number };
  switch (item.kind) {
    case "added":
      return `IN AT #${meta.rank}`;
    case "locked":
      return `LOCKED AT #${meta.rank}`;
    case "milestone":
      return meta.of === "duels" ? `${meta.at} DUELS` : `${meta.at} FILMS RANKED`;
    case "session":
      return "A SITTING";
    default:
      // A card written by an older version. Named rather than hidden — a feed
      // that silently drops its own history is worse than one showing a row it
      // no longer produces.
      return item.kind.toUpperCase();
  }
}

/** The line under the eyebrow. */
function titleFor(item: FeedItem): string {
  const meta = item.meta as {
    title?: string;
    of?: string;
    added?: number;
    moved?: number;
    bestTitle?: string;
  };
  if (meta.title) return meta.title;
  if (item.kind === "milestone") {
    return meta.of === "duels" ? "That is a lot of deciding" : "The list keeps growing";
  }
  if (item.kind === "session") {
    const added = meta.added ?? 0;
    const moved = meta.moved ?? 0;
    // Said as work done, because that is the part the person actually did. The
    // resulting positions are the model's — see the note in `feed.ts`.
    if (added && moved) return `${added} added, ${moved} shifted`;
    if (added) return `${added} film${added === 1 ? "" : "s"} added`;
    return `${moved} film${moved === 1 ? "" : "s"} shifted`;
  }
  return "";
}

function Card({
  item,
  onFilm,
  onLike,
  onTell,
}: {
  item: FeedItem;
  onFilm: (id: string) => void;
  onLike: (on: boolean) => void;
  /** Start a conversation about this film with the person whose card it is. */
  onTell: () => void;
}) {
  const meta = item.meta as {
    title?: string;
    year?: string;
    poster?: string;
    rank?: number;
    rating?: number;
    at?: number;
    added?: number;
    bestTitle?: string;
    bestPoster?: string;
    bestRank?: number;
    bestId?: string;
  };

  // A session borrows the artwork of its best result, which is the one thing in
  // it anybody wants to look at.
  const poster = meta.poster ?? meta.bestPoster;
  const openable = meta.title ? item.subjectId : meta.bestId;

  return (
    <article className="py-3.5">
      <div className="flex items-center gap-3.5">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            aria-hidden
            className="h-[68px] w-[46px] flex-shrink-0 rounded-md object-cover"
            style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }}
          />
        ) : (
          // A card about no single film still occupies the same column, or the
          // list develops a stagger wherever one appears.
          <div
            aria-hidden
            className="flex h-[68px] w-[46px] flex-shrink-0 items-center justify-center rounded-md font-serif text-lg font-bold text-gold"
            style={{ background: "var(--surface)" }}
          >
            {(meta.at ?? meta.added ?? "·").toString()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-label font-extrabold tracking-[0.14em] text-gold">{eyebrowFor(item)}</div>
          {openable && item.yourRank !== undefined ? (
            <button
              onClick={() => onFilm(openable)}
              className="mt-1 block max-w-full truncate text-left text-body font-semibold text-text-hi active:opacity-70"
            >
              {titleFor(item)}
            </button>
          ) : (
            <div className="mt-1 truncate text-body font-semibold text-text-hi">{titleFor(item)}</div>
          )}
          <div className="mt-0.5 truncate text-sub text-dim">
            {item.mine ? (
              <span>You</span>
            ) : (
              <a href={`/@${item.handle}`} className="active:opacity-70">
                {item.handle}
              </a>
            )}
            {meta.rating !== undefined && ` · ${meta.rating}★`}
            {item.kind === "session" && meta.bestTitle && ` · best: ${meta.bestTitle} at #${meta.bestRank}`}
            <span className="ml-1">· {shortAgo(item.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 pl-[60px]">
        {/* ── Agree ────────────────────────────────────────────────────────
            One tap, and the only public interaction on a card. Your own
            placement is not something to agree with — it is yours. */}
        {!item.mine && (
          <button
            onClick={() => onLike(!item.liked)}
            aria-pressed={item.liked}
            className="text-label font-extrabold tracking-[0.12em] active:opacity-70"
            style={{ color: item.liked ? "var(--gold)" : "var(--dim)" }}
          >
            {item.liked ? "AGREED" : "AGREE"}
            {item.likes > 0 && ` · ${item.likes}`}
          </button>
        )}
        {item.mine && item.likes > 0 && (
          <span className="text-label font-extrabold tracking-[0.12em] text-dim">
            {item.likes} AGREED
          </span>
        )}

        {/* ── Where YOU have it ──────────────────────────────────────────
            Only on somebody else's card, and only when you have the film
            placed. This is the whole reason to read the feed rather than a
            statistic — and it is yours alone. */}
        {item.yourRank !== undefined &&
          (meta.rank !== undefined && item.yourRank === meta.rank ? (
            <span className="text-label tracking-[0.08em] text-gold">SAME AS YOURS</span>
          ) : (
            // ── Disagreeing is a button, not a fact ────────────────────────
            //
            // The line alone was a dead end: it tells you that you differ and
            // gives you nothing to do about it. This is the moment of maximum
            // motivation, so it is where a conversation starts — refused
            // politely by the server if the two of you are not mutual.
            <button
              onClick={onTell}
              className="text-label tracking-[0.08em] active:opacity-70"
            >
              <span className="text-dim">YOU HAVE IT </span>
              <span className="font-semibold text-text-hi">#{item.yourRank}</span>
              <span className="text-gold"> · TELL THEM</span>
            </button>
          ))}
      </div>
    </article>
  );
}

export function FeedScreen({
  onSettings,
  onTrophies,
  onList,
  onDuel,
  onProfile,
  logging,
  onToggleLog,
  onRibbon,
  onRead,
  onFilm,
  onFindPeople,
}: {
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
   * TAKES has no pages of its own yet, so every horizontal swipe here is about
   * leaving — the same situation the duel screen is in, and the same handling.
   */
  onRibbon: (dir: Dir, travelled?: number) => void;
  /** Opening the screen clears the dot on the nav. */
  onRead: () => void;
  /**
   * Open a film you own, by its `slugId`.
   *
   * The feed knows a title and an id, not a `Film` — the shell owns the library
   * and does the lookup. Only ever offered for a film the reader has.
   */
  onFilm: (id: string) => void;
  /** The way out of an empty feed. */
  onFindPeople: () => void;
}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  // Which half is showing. The same two-panel idiom the profile uses, because
  // this screen has the same shape of problem: two things that belong together
  // and do not belong on top of each other.
  const [tab, setTab] = useState<0 | 1>(0);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [tellError, setTellError] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; axis: null | "x" | "y" } | null>(null);

  const slideTo = (px: number, animate: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.3s var(--ease)" : "none";
    el.style.transform = `translateX(calc(${tab * -100}% + ${px}px))`;
  };

  /**
   * Open a conversation about this film with the person whose card it is.
   *
   * Refused politely by the server when the two of you are not mutual, which is
   * a thing the reader can act on — so it is said rather than hidden.
   */
  const tell = async (item: FeedItem) => {
    setTellError(null);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: item.handle, subjectId: item.subjectId, meta: item.meta }),
      });
      const json = (await res.json()) as { threadId?: string; error?: string };
      if (!res.ok || !json.threadId) {
        setTellError(json.error ?? "That didn't work.");
        return;
      }
      setOpenThreadId(json.threadId);
      setTab(1);
    } catch {
      setTellError("You look offline.");
    }
  };

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        // No `peek`, so arriving here is what marks everything seen.
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (dead) return;
        setItems(res.ok ? ((await res.json()) as { items: FeedItem[] }).items : []);
        onRead();
      } catch {
        // Offline. An empty list rather than an error: this is not the app, and
        // failing to reach it should read as quiet rather than as broken.
        if (!dead) setItems([]);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Agree, or take it back.
   *
   * Moved on screen before the request goes out. A tap on a feed has to feel
   * instant or nobody taps twice, and the server returns the true count so a
   * disagreement between the two resolves in the server's favour.
   */
  const like = async (item: FeedItem, on: boolean) => {
    setItems((all) =>
      (all ?? []).map((x) => (x.id === item.id ? { ...x, liked: on, likes: x.likes + (on ? 1 : -1) } : x)),
    );
    try {
      const res = await fetch(`/api/activity/${item.id}/like`, { method: on ? "POST" : "DELETE" });
      if (!res.ok) return;
      const { likes } = (await res.json()) as { likes: number };
      setItems((all) => (all ?? []).map((x) => (x.id === item.id ? { ...x, likes } : x)));
    } catch {
      // Offline. The tap stands locally and the next read corrects it, which is
      // a better outcome than a button that refuses to move.
    }
  };

  return (
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      {/* `chrome-hold` so this band stays put while the page slides under it —
          see the ribbon notes in globals.css. */}
      <div className="chrome-hold flex-shrink-0 px-5 pb-2 pt-3" style={{ background: "var(--band)" }}>
        {/* Two halves of one screen: what everybody can see, and what only the
            two of you can. Same treatment as the profile's panels, because it is
            the same idiom doing the same job. */}
        <div className="flex justify-center gap-6">
          {(["TAKES", "TALK"] as const).map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i as 0 | 1)}
              className="pb-2 text-label font-extrabold tracking-[0.14em] transition-colors"
              style={{
                color: tab === i ? "var(--gold)" : "var(--dim)",
                borderBottom: `2px solid ${tab === i ? "var(--gold)" : "transparent"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6"
        onTouchStart={(e) => {
          if (inShelf(e.target)) return (touch.current = null);
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, axis: null };
        }}
        onTouchMove={(e) => {
          const from = touch.current;
          if (!from) return;
          const dx = e.touches[0].clientX - from.x;
          // The track follows the finger; only a swipe that has run out of pages
          // moves the whole screen, and that is decided on release.
          if (from.axis === "x") return slideTo(dx, false);
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
          const landed = pageAfterSwipe(tab, 1, dx, width);
          // Ran off an end, so the screen is no longer this gesture's subject.
          if (landed === "before" || landed === "after") {
            slideTo(0, true);
            return onRibbon(landed === "after" ? 1 : -1, Math.abs(dx) / width);
          }
          slideTo(0, true);
          if (landed !== tab) setTab(landed as 0 | 1);
        }}
      >
        <div ref={trackRef} className="flex" style={{ transform: `translateX(${tab * -100}%)` }}>
        {/* The gutter lives on each panel rather than the scroller, or the track
            would be inset and the off-screen half would peek at the edge. */}
        <div className="w-full flex-shrink-0 px-5">
        {items === null ? (
          <p className="mt-16 text-center text-sub text-dim">Looking&hellip;</p>
        ) : items.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-sub leading-relaxed text-dim">
              Nothing yet. Rank a film and where it lands shows up here.
            </p>
            <p className="mt-2 text-sub leading-relaxed text-dim">
              Follow somebody and their placements will too.
            </p>
            {/* An empty state that names the way out of itself. */}
            <button
              onClick={onFindPeople}
              className="mx-auto mt-6 block rounded-full px-4 py-1.5 text-label font-extrabold tracking-[0.14em] text-dim active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              FIND PEOPLE
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {items.map((item) => (
              <Card
                key={item.id}
                item={item}
                onFilm={onFilm}
                onLike={(on) => void like(item, on)}
                onTell={() => void tell(item)}
              />
            ))}
          </div>
        )}
        {tellError && <p className="mt-3 text-center text-label text-dim">{tellError}</p>}
        </div>

        <div className="w-full flex-shrink-0">
          <TalkPanel openId={openThreadId} onOpen={setOpenThreadId} />
        </div>
        </div>
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
