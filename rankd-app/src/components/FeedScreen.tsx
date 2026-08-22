"use client";

// Activity — what the people you follow have been doing to their rankings, and
// what anybody had to say about it.
//
// ── Familiar in shape, unfamiliar in substance ─────────────────────────────
//
// Every other film app's feed is built on WATCHING: X watched a film, X rated a
// film. Rankd's unit is a judgement and its consequence is movement — a film
// climbing, a film crossing a tier. That is what these cards are, and no
// competitor can show it because none of them holds an ordered list as its
// primary object.
//
// ── The line that makes it a place rather than a ticker ────────────────────
//
// "Heat climbed to #1" is true and there is nothing to say back to it. Under it,
// this screen prints where YOU have the same film — "they have it #1, you have
// it #14" — and that is a disagreement with a name on it. It reads differently
// for every person who opens the card, and it is the reason the comment box
// underneath has something to be about.
//
// That comparison needs two people's complete ordered lists. An app built on
// star ratings does not have them; this one already stores both.
//
// ── Threads open inline, and that is not a style choice ────────────────────
//
// `AppShell` and `PeoplePanel` both record the trap: `BottomNav` is `relative
// z-40`, which makes it a stacking context, so a sheet rendered from INSIDE a
// screen is z-ordered within that screen and the nav paints over it. A thread
// that expands in place sidesteps the whole problem and reads better in a feed
// anyway — the card you are arguing with stays on screen while you argue.

import { useEffect, useRef, useState } from "react";

import { BottomNav, Header } from "./DuelScreen";
import { COMMENT_MAX, shortAgo, type CommentItem, type FeedItem } from "@/lib/social/feed";
import { splitMentions } from "@/lib/social/mentions";
import { dragScreen, inShelf, TURN_AT, type Dir } from "@/lib/ribbon";

/** What kind of thing happened, in the card's own small caps. */
function eyebrowFor(item: FeedItem): string {
  const meta = item.meta as { to?: number; places?: number; count?: number; of?: string; at?: number };
  switch (item.kind) {
    case "climb":
      return `UP ${meta.places} PLACES`;
    case "promotion":
      return `NOW A ${meta.to}`;
    case "arrival":
      return "NEW IN THE TOP TEN";
    case "milestone":
      return meta.of === "duels" ? `${meta.at} DUELS` : `${meta.at} FILMS RANKED`;
    default:
      return `${meta.count} MORE RANKED`;
  }
}

/** The line under the eyebrow — a title, or what the milestone actually means. */
function titleFor(item: FeedItem): string {
  const meta = item.meta as { title?: string; of?: string; at?: number };
  if (meta.title) return meta.title;
  if (item.kind === "milestone") {
    // Said as a sentence rather than repeated as a number. The eyebrow already
    // carried the figure; this says why anybody should care about it.
    return meta.of === "duels" ? "That is a lot of deciding" : "The list keeps growing";
  }
  return "Films placed";
}

/**
 * A comment's text, with every `@handle` turned into a way to go there.
 *
 * Real anchors to `/@handle`, the same address `PersonRow` uses. A profile is a
 * page rather than a panel, so a mention is a link rather than a handler — which
 * also means it opens in a new tab if somebody wants it to.
 */
function Body({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((piece, i) =>
        piece.kind === "text" ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <a key={i} href={`/@${piece.handle}`} className="font-semibold text-gold active:opacity-70">
            @{piece.handle}
          </a>
        ),
      )}
    </>
  );
}

function Thread({ item, onCount }: { item: FeedItem; onCount: (n: number) => void }) {
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch(`/api/activity/${item.id}/comment`, { cache: "no-store" });
        if (dead) return;
        setComments(res.ok ? ((await res.json()) as { comments: CommentItem[] }).comments : []);
      } catch {
        if (!dead) setComments([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [item.id]);

  const say = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/activity/${item.id}/comment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as { comment?: CommentItem; error?: string };
      if (!res.ok || !json.comment) {
        setError(json.error ?? "That didn't send.");
        return;
      }
      setComments((c) => [...(c ?? []), json.comment!]);
      onCount((comments?.length ?? 0) + 1);
      setDraft("");
    } catch {
      setError("You look offline.");
    } finally {
      setBusy(false);
    }
  };

  const drop = async (id: string) => {
    setComments((c) => (c ?? []).filter((x) => x.id !== id));
    onCount(Math.max(0, (comments?.length ?? 1) - 1));
    try {
      await fetch(`/api/activity/comment/${id}`, { method: "DELETE" });
    } catch {
      // It is gone from the screen either way; a failed delete resurfaces on the
      // next read, which is a better outcome than blocking the tap on a network.
    }
  };

  const left = COMMENT_MAX - draft.trim().length;

  return (
    <div className="mt-1 pb-2 pl-[60px]">
      {comments === null ? (
        <p className="py-2 text-sub text-dim">Looking&hellip;</p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="py-1.5">
            <div className="text-sub leading-snug text-text">
              <a href={`/@${c.handle}`} className="font-semibold text-text-hi active:opacity-70">
                {c.handle}
              </a>{" "}
              <Body text={c.body} />
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-label text-dim">
              <span>{shortAgo(c.createdAt)}</span>
              {/* Only ever your own line. The owner of a card cannot delete
                  comments on it — that is moderation, and handing it to whoever
                  owns the post turns every disagreement into a race to delete. */}
              {c.mine && (
                <button onClick={() => void drop(c.id)} className="tracking-[0.1em] active:opacity-70">
                  DELETE
                </button>
              )}
            </div>
          </div>
        ))
      )}

      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          placeholder="Say something"
          className="min-h-[38px] w-full flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sub text-text-hi outline-none placeholder:text-dim"
        />
        <button
          onClick={() => void say()}
          disabled={busy || draft.trim().length === 0 || left < 0}
          className="mb-[3px] flex-shrink-0 rounded-full px-3 py-1.5 text-label font-extrabold tracking-[0.14em] text-gold disabled:opacity-35"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          SEND
        </button>
      </div>
      {/* The count only appears once it is worth knowing about, so the box is
          not permanently wearing a number nobody is near. */}
      {(left < 40 || error) && (
        <div className="mt-1 text-label text-dim">
          {error ?? `${left} left`}
        </div>
      )}
    </div>
  );
}

function Card({
  item,
  open,
  onToggle,
  onCount,
  onFilm,
}: {
  item: FeedItem;
  open: boolean;
  onToggle: () => void;
  onCount: (n: number) => void;
  onFilm: (id: string) => void;
}) {
  const meta = item.meta as {
    title?: string;
    year?: string;
    poster?: string;
    rank?: number;
    from?: number;
    count?: number;
    at?: number;
  };

  return (
    <article className="py-3.5">
      <div className="flex items-center gap-3.5">
        {/* The artwork is the card. A feed of text is a log, and the posters are
            why this reads as somebody's taste rather than an audit trail. */}
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
          // A card about no single film still occupies the same column, or the
          // list develops a stagger wherever one appears.
          <div
            aria-hidden
            className="flex h-[68px] w-[46px] flex-shrink-0 items-center justify-center rounded-md font-serif text-lg font-bold text-gold"
            style={{ background: "var(--surface)" }}
          >
            {(meta.at ?? meta.count ?? "·").toString()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-label font-extrabold tracking-[0.14em] text-gold">{eyebrowFor(item)}</div>
          {/* Tappable only when the reader OWNS the film. Offering to open
              something that is not in your library is a promise the app cannot
              keep, and the same check already decides the rank line below. */}
          {meta.title && item.yourRank !== undefined ? (
            <button
              onClick={() => onFilm(item.subjectId)}
              className="mt-1 block max-w-full truncate text-left text-body font-semibold text-text-hi active:opacity-70"
            >
              {titleFor(item)}
            </button>
          ) : (
            <div className="mt-1 truncate text-body font-semibold text-text-hi">{titleFor(item)}</div>
          )}
          <div className="mt-0.5 truncate text-sub text-dim">
            {/* Your own cards say "You", because "@donnie climbed" reads as a
                stranger when the stranger is you. */}
            {item.mine ? (
              <span>You</span>
            ) : (
              <a href={`/@${item.handle}`} className="active:opacity-70">
                {item.handle}
              </a>
            )}
            {meta.rank !== undefined && ` · now #${meta.rank}`}
            <span className="ml-1">· {shortAgo(item.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ── Where YOU have it, which is the whole point ────────────────────
          Only on somebody else's card, and only when you have the film placed.
          A blank where a disagreement would be is worse than no line at all. */}
      {item.yourRank !== undefined && (
        <div className="mt-2 pl-[60px]">
          <span
            className="inline-block rounded-full px-2.5 py-1 text-label tracking-[0.08em]"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            {meta.rank !== undefined && item.yourRank === meta.rank ? (
              <span className="text-gold">You have it there too</span>
            ) : (
              <>
                <span className="text-dim">You have it </span>
                <span className="font-semibold text-text-hi">#{item.yourRank}</span>
              </>
            )}
          </span>
        </div>
      )}

      <div className="mt-2 pl-[60px]">
        <button
          onClick={onToggle}
          className="text-label font-extrabold tracking-[0.12em] text-dim active:opacity-70"
        >
          {item.comments === 0
            ? open
              ? "CLOSE"
              : "SAY SOMETHING"
            : `${item.comments} ${item.comments === 1 ? "REPLY" : "REPLIES"}`}
        </button>
      </div>

      {open && <Thread item={item} onCount={onCount} />}
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
   * The feed has no pages of its own, so every horizontal swipe here is about
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
}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number; axis: null | "x" | "y" } | null>(null);

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
        // Offline. An empty list rather than an error: the feed is not the app,
        // and failing to reach it should read as quiet rather than as broken.
        if (!dead) setItems([]);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          // A gesture that starts in the compose box belongs to the compose box.
          if (inShelf(e.target) || (e.target as HTMLElement).closest?.("textarea")) {
            return (touch.current = null);
          }
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
          // someone" to a person looking at an empty screen is the same broken
          // promise this cell used to make.
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
              <Card
                key={item.id}
                item={item}
                open={open === item.id}
                onToggle={() => setOpen((o) => (o === item.id ? null : item.id))}
                onFilm={onFilm}
                onCount={(n) =>
                  setItems((all) => (all ?? []).map((x) => (x.id === item.id ? { ...x, comments: n } : x)))
                }
              />
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
