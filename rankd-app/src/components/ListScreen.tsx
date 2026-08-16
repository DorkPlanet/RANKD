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
import { isHard } from "@/lib/lock";
import { type Profile } from "@/lib/profile";
import { tierProgress } from "@/lib/progress";
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
  onTrophies,
  logging,
  onToggleLog,
  frozen,
}: {
  films: Film[];
  profile: Profile;
  /**
   * Hold the list absolutely still.
   *
   * Set while the coach marks are up. The drift is 20px/s after 2.5s of quiet,
   * and a tutorial holds the reader far longer than that — so the list crept
   * downward under the overlay and the spotlight, which re-measures its target,
   * faithfully followed the row it was pointing at off the screen. The mark was
   * doing its job; the page underneath was not supposed to be moving.
   *
   * The drift's own input listeners are on the scroller, which sits BEHIND the
   * overlay, so nothing the reader does can bump it back to idle either.
   */
  frozen?: boolean;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onProfile: () => void;
  onPoster: (id: string, meta: FilmMeta) => void;
  onTrophies: () => void;
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
}) {
  const [q, setQ] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  // ── The review card lived here ─────────────────────────────────────────────
  //
  // It read the evidence log, fitted beliefs, and offered the one film whose
  // position the model most disagreed with — answered by starting a Spotlight
  // over it. It went when Spotlight did: its only action was that mode, and a
  // prompt whose button leads nowhere is worse than no prompt.
  //
  // The log still records every duel, and `lib/beliefs.ts` still fits from it —
  // nothing about the evidence changed. What is gone is the app volunteering an
  // opinion about it. If this comes back it needs a mechanic to hand the answer
  // to first, and that decision is the feature, not this card.

  // Built once per library change, never inside a scroll handler — the
  // prototype re-sorted all 828 films on every scroll tick and it showed.
  const model = useMemo(() => buildList(films), [films]);
  const results = useMemo(() => searchList(model, q), [model, q]);
  const searching = q.trim().length > 0;

  useVisiblePosters(scroller, films, onPoster);
  useDriftScroll(scroller, !searching && !jumpOpen && !frozen);

  const counts = tierCounts(films);
  // How much of each tier has a position, for the Jump menu.
  //
  // This is where "where are the unranked films" gets answered — in the control
  // you already open to go somewhere, rather than as a chart above the list. A
  // bar drawn permanently at the top has to justify its space every time you
  // look at the screen; a number inside a menu is only there when you asked the
  // question it answers.
  const ranked = new Map(tierProgress(films).map((s) => [s.rating, s.ranked]));

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
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      <div className="flex-shrink-0 px-5 pb-3 pt-3" style={{ background: "var(--header-bg)" }}>
        {/* Whose list this is, tapping through to the profile — the result and
            the person it belongs to shouldn't feel like separate apps. */}
        <button onClick={onProfile} className="mb-3 flex w-full items-baseline gap-2.5 active:scale-[0.99]">
          <span className="min-w-0 flex-1 truncate text-left font-display text-xl tracking-wide text-gold">
            {profile.name}
          </span>
          {/* "ranked", not "placed" — the same count the RANKED bar reports and
              the exact inverse of the UN-RNKD pills below it. Three words for one
              idea across three components is how the bars came to look like they
              were contradicting this line. */}
          <span className="text-[11px] text-dim">
            <b className="text-text-hi">{model.placedCount}</b> ranked · {model.total} films
          </span>
        </button>

        {/* Deliberately in the header block and NOT in the scroller below: the
            section spacers and the tier-jump offsets are computed from row
            heights, so anything inserted above the sections would shift every
            section top while `jumpTo` kept using the unshifted numbers. */}
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
              data-tour="list-jump"
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
                      {/* "12/134", not "134". The count alone said how big the
                          tier is; the pair says how much of it is left, which is
                          the thing you are actually choosing on. A finished tier
                          reads as its own total on both sides and needs no
                          separate tick. */}
                      <span className="text-[11px] tabular-nums text-dim">
                        <span className="text-text-hi">{ranked.get(t) ?? 0}</span>/{counts.get(t)}
                      </span>
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
                  <div
                    className="flex items-center gap-2.5"
                    data-tour="list-unrnkd"
                    style={{ height: DIVIDER_H }}
                  >
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
        logging={logging}
        onToggleLog={onToggleLog}
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
      // Every row carries it; the tour points at whichever is first on screen.
      data-tour="list-row"
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

      {/* Three states, told by the number's weight rather than by anything that
          would change the row's height — ROW_H is load-bearing, since the
          section spacers and the tier jumps are computed from it.

          Gold and solid  = you committed to this position.
          Quiet           = the evidence placed it; it counts, but the model is
                            still free to revise it.
          UN-RNKD         = no position at all.

          The distinction has existed in the data since hard and soft locks
          landed and this is the first place a reader can see it. */}
      {rank === undefined ? (
        <span className="flex-shrink-0 text-[9px] font-extrabold tracking-[0.14em] text-dim">UN-RNKD</span>
      ) : (
        <span
          className={`rank-num flex-shrink-0 font-serif text-[26px] leading-none ${
            isHard(film) ? "font-bold text-gold" : "font-normal text-dim"
          }`}
          title={isHard(film) ? "You placed this" : "Placed by the evidence"}
        >
          {rank}
        </span>
      )}
    </button>
  );
}
