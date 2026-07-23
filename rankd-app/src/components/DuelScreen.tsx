"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun, getPair, choose, skipToFilm, rankedFilms } from "@/lib/ladder";
import type { Film, RankState } from "@/lib/types";

const TIER = 4 as const;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

export default function DuelScreen() {
  const [state, setState] = useState<RankState | null>(null);

  // Boot: load the local library and start placing the 4★ tier.
  useEffect(() => {
    const films = loadFilms();
    try {
      setState(startRun(films, TIER));
    } catch {
      setState({ films, run: null });
    }
  }, []);

  if (!state) return null;

  const { films, run } = state;
  const pair = getPair(state);

  const decide = (winnerId: string) => {
    const next = choose(state, winnerId);
    saveFilms(next.films);
    setState(next);
  };

  // Rolodex scrub — aim the next duel at the film the player scrolled to.
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));

  // Overall ranks (best = 1).
  const order = rankedFilms(films);
  const rankOf = (id: string) => order.findIndex((f) => f.id === id) + 1;

  // Tier progress for the top bar.
  const pool = films.filter((f) => Math.abs(f.rating - TIER) <= (run?.maxDiff ?? 0));
  const placed = pool.filter((f) => f.rankLocked).length;
  const toGo = pool.length - placed;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      {/* ── Header + tier bar ── */}
      <header className="px-6 pt-4 pb-2">
        <div className="text-center">
          <span
            className="font-display text-3xl tracking-[0.06em] text-[#f8de8d]"
            style={{ textShadow: "0 2px 20px rgba(218,165,32,0.22)" }}
          >
            RANKD
          </span>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            {BARS.map((c) => (
              <span key={c} className="h-[3px] w-6 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-[330px]">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-extrabold tracking-[0.12em] text-accent">{TIER}★ TIER</span>
            <span className="text-[11px] text-text/55">{toGo} to go</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(Math.round((placed / Math.max(pool.length, 1)) * 100), 3)}%`,
                background: "linear-gradient(90deg, var(--accent-dk), var(--accent))",
              }}
            />
          </div>
        </div>
      </header>

      {pair ? (
        <Duel
          contender={pair.contender}
          opponent={pair.opponent}
          curRank={rankOf(pair.contender.id)}
          tgtRank={rankOf(pair.opponent.id)}
          pool={pool}
          order={order}
          onPick={decide}
          onScrub={scrub}
        />
      ) : (
        <TierComplete order={order} pool={pool} />
      )}
    </main>
  );
}

// ── The live duel: hero number, two posters, rolodex ──────────────────────
function Duel({
  contender,
  opponent,
  curRank,
  tgtRank,
  pool,
  order,
  onPick,
  onScrub,
}: {
  contender: Film;
  opponent: Film;
  curRank: number;
  tgtRank: number;
  pool: Film[];
  order: Film[];
  onPick: (id: string) => void;
  onScrub: (id: string) => void;
}) {
  return (
    <>
      {/* Hero number */}
      <div className="mt-3 flex flex-col items-center gap-0">
        <div className="flex items-center gap-2 font-sans">
          <span className="text-[10px] font-extrabold tracking-[0.12em] text-text/50">▲ NOW PLACING</span>
          <span className="text-[13px] font-bold text-text-hi">{contender.title}</span>
        </div>
        <div className="flex items-baseline gap-2.5 font-serif font-bold leading-none">
          <span className="text-[38px] text-text-hi">#{curRank}</span>
          <span className="text-2xl text-dim opacity-70">▸</span>
          <span className="text-[38px] text-dim">#{tgtRank}</span>
        </div>
      </div>

      {/* Two VS posters — tap to pick */}
      <div className="flex flex-1 items-center justify-center gap-3 px-4">
        <PosterCard film={contender} role="pick" onClick={() => onPick(contender.id)} />
        <PosterCard film={opponent} role="challenger" rank={tgtRank} onClick={() => onPick(opponent.id)} />
      </div>

      {/* Rolodex */}
      <Rolodex
        pool={pool}
        order={order}
        contenderId={contender.id}
        opponentId={opponent.id}
        onScrub={onScrub}
      />
    </>
  );
}

function PosterCard({
  film,
  role,
  rank,
  onClick,
}: {
  film: Film;
  role: "pick" | "challenger";
  rank?: number;
  onClick: () => void;
}) {
  const isPick = role === "pick";
  return (
    <button
      onClick={onClick}
      className="group relative flex w-[46%] max-w-[180px] flex-col items-center transition-transform active:scale-95"
    >
      <span className="mb-1.5 font-display text-lg tracking-wide text-text-hi">{film.title}</span>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: "2 / 3",
          boxShadow: isPick
            ? "0 0 0 3px var(--accent), 0 10px 30px rgba(218,165,32,0.35)"
            : "0 8px 26px rgba(0,0,0,0.55)",
          transform: isPick ? "rotate(-2deg)" : "rotate(2deg)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={film.poster} alt={film.title} className="h-full w-full object-cover" />
      </div>
      <span
        className="mt-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.07em]"
        style={
          isPick
            ? { color: "var(--bg)", background: "var(--accent)" }
            : { color: "var(--text-hi)", background: "rgba(20,15,36,0.9)", border: "1px solid rgba(255,255,255,0.2)" }
        }
      >
        {isPick ? "YOUR PICK" : `CHALLENGER · #${rank}`}
      </span>
    </button>
  );
}

// Rolodex — the tier's ranked films low→high with the contender as a gold YOU
// marker riding immediately left of the centred challenger. Finger-scroll it to
// aim the next duel at a different film (the tactile jump-ahead).
function Rolodex({
  pool,
  order,
  contenderId,
  opponentId,
  onScrub,
}: {
  pool: Film[];
  order: Film[];
  contenderId: string;
  opponentId: string;
  onScrub: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cells = useMemo(() => {
    const poolIds = new Set(pool.map((f) => f.id));
    const lowToHigh = order.filter((f) => poolIds.has(f.id)).reverse(); // worst → best
    const rankOf = (id: string) => order.findIndex((f) => f.id === id) + 1;
    const others = lowToHigh.filter((f) => f.id !== contenderId);
    const you = order.find((f) => f.id === contenderId)!;
    const chIdx = others.findIndex((f) => f.id === opponentId);
    const list: { film: Film; you: boolean; rank: number; challenger: boolean }[] = others.map((f) => ({
      film: f,
      you: false,
      rank: rankOf(f.id),
      challenger: f.id === opponentId,
    }));
    // Insert the YOU marker immediately left of the challenger.
    list.splice(Math.max(chIdx, 0), 0, { film: you, you: true, rank: rankOf(you.id), challenger: false });
    return list;
  }, [pool, order, contenderId, opponentId]);

  // Centre the challenger cell whenever it changes.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const el = track.querySelector<HTMLElement>("[data-challenger='1']");
    if (el) track.scrollLeft = el.offsetLeft - track.clientWidth / 2 + el.clientWidth / 2;
  }, [cells]);

  // On scroll settle, aim the duel at whichever film cell is nearest centre.
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
      let bestId: string | null = null;
      let bestD = Infinity;
      track.querySelectorAll<HTMLElement>("[data-fid]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) {
          bestD = d;
          bestId = el.dataset.fid ?? null;
        }
      });
      if (bestId && bestId !== opponentId) onScrub(bestId);
    }, 90);
  };

  return (
    <div className="w-full pb-5 pt-2">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex items-end gap-2.5 overflow-x-auto px-[calc(50%-33px)] [scrollbar-width:none] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden"
      >
        {cells.map((c, i) => (
          <div
            key={c.you ? "you" : c.film.id + i}
            data-fid={c.you ? undefined : c.film.id}
            data-challenger={c.challenger ? "1" : "0"}
            className="flex flex-shrink-0 flex-col items-center gap-1 [scroll-snap-align:center]"
            style={{
              width: c.challenger ? 66 : 54,
              opacity: c.challenger || c.you ? 1 : 0.55,
              transform: c.challenger ? "scale(1.05)" : "none",
            }}
          >
            <div
              className="w-full overflow-hidden rounded-md bg-card"
              style={{
                aspectRatio: "2 / 3",
                boxShadow: c.you
                  ? "0 0 0 2px var(--accent), 0 0 16px rgba(218,165,32,0.75)"
                  : c.challenger
                    ? "0 0 0 2px var(--accent), 0 8px 22px rgba(218,165,32,0.45)"
                    : "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.film.poster} alt="" className="h-full w-full object-cover" />
            </div>
            <span
              className="font-serif text-xs font-bold"
              style={{ color: c.you ? "var(--accent)" : c.challenger ? "var(--text-hi)" : "var(--dim)" }}
            >
              {c.you ? "YOU" : `#${c.rank}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TierComplete({ order, pool }: { order: Film[]; pool: Film[] }) {
  const poolIds = new Set(pool.map((f) => f.id));
  const ranked = order.filter((f) => poolIds.has(f.id));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="font-display text-2xl tracking-wide text-accent">🏆 Tier placed</div>
      <p className="font-serif italic text-dim">Every film in this tier has found its spot.</p>
      <ol className="mt-2 w-full max-w-xs space-y-1 text-left">
        {ranked.map((f, i) => (
          <li key={f.id} className="flex gap-3 text-sm text-text">
            <span className="w-6 text-right font-serif font-bold text-accent">{i + 1}</span>
            <span>{f.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
