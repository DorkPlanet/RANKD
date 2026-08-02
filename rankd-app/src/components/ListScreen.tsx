"use client";

// The result of every duel ever played. The duel is the mechanic; this is what
// it was for.
//
// Two rules the design follows throughout: a number here means a film was
// actually placed by a confirm (see buildList), and everything a row doesn't
// need goes to the detail card instead. A row is a poster, a title and a
// position — nothing else.

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, Header, tierCounts } from "./DuelScreen";
import { buildList, searchList, type RankedFilm } from "@/lib/list";
import { type Profile } from "@/lib/profile";
import { useVisiblePosters } from "@/lib/useVisiblePosters";
import { useDriftScroll } from "@/lib/useDriftScroll";
import { starsFor, ORDERED_TIERS, type Rating } from "@/lib/tiers";
import type { FilmMeta } from "@/lib/meta";
import type { Film } from "@/lib/types";

// Fixed row metrics. Building all 828 rows at once measured a 748ms blocked
// main thread — content-visibility skips their layout and paint but React still
// has to create every one. So sections mount only when they're near the
// viewport, and stand in as a plain spacer of exactly the right height until
// then. Ten sections to manage instead of eight hundred rows, and because the
// heights are known the scroll bar, the tier jumps and the idle drift all behave
// as if the whole list were live. These numbers must match the CSS.
const ROW_H = 96;
const HEADER_H = 56;
const DIVIDER_H = 30;
const NEAR = 900; // how far beyond the viewport a section mounts

const sectionHeight = (s: { placed: unknown[]; unplaced: unknown[] }) =>
  HEADER_H +
  s.placed.length * ROW_H +
  (s.unplaced.length ? DIVIDER_H + s.unplaced.length * ROW_H : 0);

export default function ListScreen({
  films,
  profile,
  onInfo,
  onSettings,
  onDuel,
  onProfile,
  onPoster,
}: {
  films: Film[];
  profile: Profile;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onProfile: () => void;
  onPoster: (id: string, meta: FilmMeta) => void;
}) {
  const [q, setQ] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  // Built once per library change, never inside a scroll handler — the
  // prototype re-sorted all 828 films on every scroll tick and it showed.
  const model = useMemo(() => buildList(films), [films]);
  const results = useMemo(() => searchList(model, q), [model, q]);
  const searching = q.trim().length > 0;

  useVisiblePosters(scroller, films, onPoster);
  useDriftScroll(scroller, !searching && !jumpOpen);

  const counts = tierCounts(films);

  // Where each section starts, and how tall it is. Derived from the model, never
  // measured from the DOM — the whole point is that it's known before the rows
  // exist.
  const offsets = useMemo(() => {
    const out: { tier: Rating; top: number; height: number }[] = [];
    let top = 0;
    for (const s of model.sections) {
      const height = sectionHeight(s);
      out.push({ tier: s.tier, top, height });
      top += height;
    }
    return out;
  }, [model]);

  const [view, setView] = useState({ top: 0, height: 900 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setView({ top: el.scrollTop, height: el.clientHeight });
    read();
    el.addEventListener("scroll", read, { passive: true });
    return () => el.removeEventListener("scroll", read);
  }, []);

  const jumpTo = (tier: Rating) => {
    setJumpOpen(false);
    const target = offsets.find((o) => o.tier === tier);
    if (target && scroller.current) scroller.current.scrollTo({ top: target.top, behavior: "smooth" });
  };

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} />

      <div className="flex-shrink-0 px-5 pb-3 pt-3" style={{ background: "var(--header-bg)" }}>
        {/* Whose list this is, tapping through to the profile — the result and
            the person it belongs to shouldn't feel like separate apps. */}
        <button onClick={onProfile} className="mb-3 flex w-full items-baseline gap-2.5 active:scale-[0.99]">
          <span className="min-w-0 flex-1 truncate text-left font-display text-xl tracking-wide text-gold">
            {profile.name}
          </span>
          <span className="text-[11px] text-dim">
            <b className="text-text-hi">{model.placedCount}</b> placed · {model.total} films
          </span>
        </button>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your films"
            className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text-hi outline-none placeholder:text-dim"
          />
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setJumpOpen((v) => !v)}
              className="rounded-lg border border-border px-2.5 py-2 text-[11px] text-dim active:scale-95"
            >
              Jump ▾
            </button>
            {jumpOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setJumpOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-40 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
                  {ORDERED_TIERS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
                    <button
                      key={t}
                      onClick={() => jumpTo(t)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left active:scale-[0.98]"
                    >
                      <span className="text-sm text-gold">{starsFor(t)}</span>
                      <span className="text-[11px] text-dim">{counts.get(t)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {model.total === 0 && (
          <p className="mt-16 text-center text-[13px] leading-relaxed text-dim">
            Nothing here yet.
            <br />
            Import a Letterboxd ratings.csv from Settings to begin.
          </p>
        )}

        {searching ? (
          results.length === 0 ? (
            <p className="mt-10 text-center text-[13px] text-dim">Nothing matches.</p>
          ) : (
            <div className="pt-3">
              {results.map((r) =>
                "rank" in r ? (
                  <Row key={r.film.id} film={r.film} rank={r.rank} onInfo={onInfo} showStars />
                ) : (
                  <Row key={r.id} film={r} onInfo={onInfo} showStars />
                ),
              )}
            </div>
          )
        ) : (
          model.sections.map((s, i) => {
            const o = offsets[i];
            const near = o.top < view.top + view.height + NEAR && o.top + o.height > view.top - NEAR;
            if (!near) return <div key={s.tier} style={{ height: o.height }} />;
            return (
              <section key={s.tier} data-tier={s.tier} style={{ height: o.height }}>
                <TierRule stars={starsFor(s.tier)} count={s.total} />
                {s.placed.map((r: RankedFilm) => (
                  <Row key={r.film.id} film={r.film} rank={r.rank} onInfo={onInfo} />
                ))}
                {s.unplaced.length > 0 && (
                  <div className="flex items-center gap-2.5" style={{ height: DIVIDER_H }}>
                    <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                    <span className="text-[9px] font-extrabold tracking-[0.18em] text-dim">UN-RNKD</span>
                    <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                  </div>
                )}
                {s.unplaced.map((f) => (
                  <Row key={f.id} film={f} onInfo={onInfo} />
                ))}
              </section>
            );
          })
        )}
      </div>

      <BottomNav
        screen="list"
        onSettings={onSettings}
        onModes={onDuel}
        onList={() => {}}
        onProfile={onProfile}
      />
    </main>
  );
}

// Two gradient rules fading out either side of the stars, rather than a solid
// bar — a tier boundary should read as a seam in the list, not a lid on it.
function TierRule({ stars, count }: { stars: string; count: number }) {
  return (
    <div className="flex items-center gap-3" style={{ height: HEADER_H }}>
      <span
        className="h-px flex-1"
        style={{ background: "linear-gradient(to right, transparent, var(--border))" }}
      />
      <span className="text-base tracking-[0.08em] text-gold">{stars}</span>
      <span className="text-[10px] text-dim">{count}</span>
      <span
        className="h-px flex-1"
        style={{ background: "linear-gradient(to left, transparent, var(--border))" }}
      />
    </div>
  );
}

function Row({
  film,
  rank,
  onInfo,
  showStars,
}: {
  film: Film;
  rank?: number;
  onInfo: (f: Film) => void;
  showStars?: boolean;
}) {
  return (
    <button
      data-film-id={film.id}
      onClick={() => onInfo(film)}
      // A fixed height is load-bearing: the section spacers are computed from it,
      // so a row that measured differently would drift the scroll positions.
      style={{ height: ROW_H }}
      className="list-row flex w-full items-center gap-3.5 text-left active:scale-[0.99]"
    >
      {film.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={film.poster} alt="" loading="lazy" className="list-poster" />
      ) : (
        <span className="list-poster" style={{ background: "var(--border)" }} />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text-hi">{film.title}</span>
        <span className="block text-[11px] text-dim">
          {film.year}
          {showStars && <span className="ml-2 text-gold">{starsFor(film.rating)}</span>}
        </span>
      </span>

      {rank === undefined ? (
        <span className="flex-shrink-0 text-[9px] font-extrabold tracking-[0.14em] text-dim">UN-RNKD</span>
      ) : (
        <span className="rank-num flex-shrink-0 font-serif text-[26px] font-bold leading-none text-gold">
          {rank}
        </span>
      )}
    </button>
  );
}
