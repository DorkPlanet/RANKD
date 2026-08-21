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
import { isHard, isPlaced } from "@/lib/lock";
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
  // Pressing the list cell while already ON the list has never done anything.
  // It now opens the keyboard on the search field, which is the user's ask and
  // is the one thing a second press of a tab you are already on can usefully
  // mean: you are here, and you are looking for something.
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  // ── Filtering by state ──────────────────────────────────────────────────
  //
  // The three counts in the band are already the three states, already in their
  // own colours, and already the thing you read to decide what to do next. So
  // they ARE the filter — tap LOCKED to see only those, tap again to clear.
  // No tab strip, no new row, nothing added to the screen at all.
  //
  // The alternative in the register (P14) bundled year and genre in with these.
  // Those are GROUPINGS, not filters: every row stays and the sections change,
  // which rebuilds the geometry `ROW_H` drives. This half is free because it
  // only changes which films exist.
  //
  // Filtered on the way IN, not on the way out. `buildList` computes the
  // sections, the spacers and the tier-jump offsets together, so handing it a
  // smaller library keeps all three consistent — filtering its OUTPUT would
  // leave the offsets describing rows that are no longer there.
  const [only, setOnly] = useState<null | "locked" | "shuffled" | "unrnkd">(null);
  const shown = useMemo(() => {
    if (!only) return films;
    return films.filter((f) =>
      only === "locked" ? isHard(f) : only === "shuffled" ? isPlaced(f) && !isHard(f) : !isPlaced(f),
    );
  }, [films, only]);

  // Built once per library change, never inside a scroll handler — the
  // prototype re-sorted all 828 films on every scroll tick and it showed.
  const model = useMemo(() => buildList(shown), [shown]);
  // The band's counts come from the WHOLE library, never the filtered view.
  // They are a key to the list, and a key that changed every time you used it
  // would be describing itself rather than the library.
  const all = useMemo(() => buildList(films), [films]);
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

      {/* ── The band ──────────────────────────────────────────────────────
          Three tones, top to bottom: black chrome, this, then the list. It was
          `--header-bg` once (a second, silent header) and then briefly the
          page's own colour (page that happened to be at the top). `--band` sits
          deliberately between, so the block reads as a thing with a job rather
          than as either of its neighbours.

          It slides with brightness where the header does not. The header is
          chrome; this is surface you read.

          ── The name is gone ──
          It was the largest thing here and did the least: a heading telling you
          whose list you are looking at, on the only list there is. Its one real
          function was reaching the profile, and the nav's You cell does that
          from every screen. Removing it hands the top of the band to the counts,
          which is what people come here to read. */}
      <div className="flex-shrink-0 px-5 pb-3 pt-3" style={{ background: "var(--band)" }}>

        {/* ── The key to the numbers below ──────────────────────────────
            "shuffled", not "Rankd placed". The user's call, and it is checkable
            rather than a matter of taste: `placeSettled` is called from exactly
            one component in the app — `ShuffleDuel` — so a soft lock can only
            ever have come from Fast Shuffle. Naming the mode says where the
            number came from AND where to go to change it, which "Rankd placed"
            did not.

            ── Three states, three colours ──
            It said three things in two colours: hard was gold and BOTH soft and
            un-rnkd were `--dim`. So the distinction this key exists to explain
            was carried by a colour two of its three states shared, which is a
            strange way to build a key.

            Gold for locked, `--accent` for shuffled, `--dim` for un-rnkd. The
            accent is not a new colour — it is the token the profile already
            uses for its RANKD marker, which is the same idea (this came from
            the model, not from you) wearing the same paint.

            Centred, because it is a caption for the whole list rather than a
            label on the name above it, and it sits over the search bar it
            shares a width with.

            Number ABOVE its label, in three columns rather than one running
            line. Inline, the eye had to parse "21 LOCKED · 77 SHUFFLED · 767
            UN-RNKD" as a sentence before it could compare the figures, and the
            middle dots were doing work that whitespace does better. Stacked,
            the three numbers sit on one baseline and can be read against each
            other at a glance — which is the only reason to put them together.

            Deliberately the profile stats band's treatment (`Stat` in
            `ProfileScreen`): serif numeral over 9px small caps. Same idea, same
            shape, and the profile is the screen whose type the rest of the app
            is being brought toward.

            The row numerals below use the same three, or this is a key to
            nothing.

            If another mode is ever given the right to place films, this label
            stops being true and has to go back to something generic. That is a
            real constraint, so it is written down rather than left to be
            discovered.
            Gold-and-bold against dim has drawn the hard/soft distinction in the
            rows since locks landed, and nothing on any screen said what the two
            weights MEANT. The explanation was a `title` attribute — a hover
            tooltip, on a phone. So the one idea a reader could not work out for
            themselves was the one idea the app never spoke.

            This is a legend rather than a per-row label because a label on 861
            rows repeats itself 861 times, and because a row may not grow:
            ROW_H is load-bearing for the spacers and the tier jumps.

            It carries the row's two treatments — gold and bold against plain
            and dim — so it reads as a key and not as two more statistics.
            Change one and change both, or it stops being a key.

            The SIZE deliberately does not match: the rows set their numerals at
            26px and a key does not need to shout. What it does need is internal
            contrast, which is the whole reason the first attempt looked wrong
            on a phone. It was a flat 10px line sitting directly under another
            flat 11px line, so two dim greys of near-identical size stacked into
            mush and the longer one read as a runt paragraph. The numbers are in
            the display face at 13px now and the words are 9px small caps, which
            is the same label treatment the profile band uses.

            Hidden unless both states are actually present. A library with no
            soft locks would otherwise be taught a distinction it cannot see. */}
        {all.total > 0 && (
          <p className="mb-3 flex items-start justify-center gap-5 text-dim">
            {[
              // The total sits WITH the three states rather than above them.
              // It used to be its own line — "865 films" beside the name — and
              // the three below already sum to it, so the two lines were the
              // same fact twice. As a fourth column it is the thing the other
              // three are parts of, which is what it actually is.
              //
              // `--text-hi` because it is not a fourth STATE. Gold, accent and
              // dim are the three states and a fourth hue beside them would
              // read as one; the near-white is the app's colour for "the thing
              // itself" and says total without joining the set.
              { n: all.total, label: "films", tone: "text-text-hi", key: null },
              { n: all.settledCount, label: "locked", tone: "text-gold", key: "locked" as const },
              {
                n: all.placedCount - all.settledCount,
                label: "shuffled",
                tone: "text-accent",
                key: "shuffled" as const,
              },
              { n: all.total - all.placedCount, label: "un-rnkd", tone: "text-dim", key: "unrnkd" as const },
            ]
              // A segment reading zero is not information, it is a state you are
              // not in. Dropping them is also what lets this line work on day
              // one, when everything is un-rnkd and the other two would be 0.
              .filter((seg) => seg.n > 0)
              .map((seg) => {
                const active = only === seg.key;
                return (
                  <button
                    key={seg.label}
                    onClick={() => setOnly(active ? null : seg.key)}
                    aria-pressed={active}
                    className={`block text-center active:scale-95 ${seg.tone} ${
                      only && !active ? "opacity-35" : ""
                    }`}
                  >
                    <span className="block font-serif text-lg font-bold leading-none tabular-nums">
                      {seg.n}
                    </span>
                    <span className="mt-1 block text-label font-extrabold uppercase tracking-[0.14em]">
                      {seg.label}
                    </span>
                    {/* The active column is underlined in its own colour. The
                        dimming of the others carries most of the signal, but a
                        filtered list that looks like an unfiltered one is how
                        somebody concludes their films have gone. */}
                    <span
                      className="mx-auto mt-1 block h-[2px] w-6 rounded-full"
                      style={{ background: active ? "currentColor" : "transparent" }}
                    />
                  </button>
                );
              })}
          </p>
        )}

        {/* Deliberately in the header block and NOT in the scroller below: the
            section spacers and the tier-jump offsets are computed from row
            heights, so anything inserted above the sections would shift every
            section top while `jumpTo` kept using the unshifted numbers. */}
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // Names what it will actually match now. A bar that silently
            // searches three fields is a bar nobody knows searches three
            // fields — and the alternative the user ruled out, separate
            // buttons per field, makes you declare what you are looking for
            // before you look.
            placeholder="Film, director or actor"
            className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text-hi outline-none placeholder:text-dim"
          />
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setJumpOpen((v) => !v)}
              data-tour="list-jump"
              className="rounded-lg border border-border px-2.5 py-2 text-sub text-dim active:scale-95"
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
                      <span className="text-sub tabular-nums text-dim">
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
          <p className="mt-16 text-center text-sub leading-relaxed text-dim">
            Nothing here yet.
            <br />
            Import a Letterboxd ratings.csv from Settings to begin.
          </p>
        )}

        {searching ? (
          results.length === 0 ? (
            <p className="mt-10 text-center text-sub text-dim">Nothing matches.</p>
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
                    <span className="text-label font-extrabold tracking-[0.18em] text-dim">UN-RNKD</span>
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
        onList={() => {
          // `select` as well as `focus`: arriving here with a stale query
          // already in the box means the first thing you type should replace
          // it, not append to it.
          searchRef.current?.focus();
          searchRef.current?.select();
        }}
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
      <span className="text-label text-dim">{count}</span>
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
        <span className="block truncate text-body text-text-hi">{film.title}</span>
        <span className="block text-sub text-dim">
          {film.year}
          {showStars && <span className="ml-2 text-gold">{starsFor(film.rating)}</span>}
        </span>
      </span>

      {/* Three states, told by the number's weight rather than by anything that
          would change the row's height — ROW_H is load-bearing, since the
          section spacers and the tier jumps are computed from it.

          Gold and solid  = LOCKED. You committed to this position.
          Accent blue     = SHUFFLED. Fast Shuffle placed it; it counts, but the
                            model is still free to revise it.
          Dim UN-RNKD     = no position at all.

          These three match the legend in the header exactly. Change one and
          change both — a key whose colours differ from the thing it keys is
          worse than no key.

          The distinction has existed in the data since hard and soft locks
          landed. This is where it is DRAWN; the legend in the header block is
          where it is NAMED. It was drawn without ever being named for several
          sessions, which is the whole of N2. */}
      {rank === undefined ? (
        <span className="flex-shrink-0 text-label font-extrabold tracking-[0.14em] text-dim">UN-RNKD</span>
      ) : (
        /* `title` is kept as a desktop pointer, but it is no longer where the
           distinction LIVES — the legend in the header says it out loud. The
           wording matches the legend on purpose. */
        <span
          className={`rank-num flex-shrink-0 font-serif text-[26px] leading-none ${
            isHard(film) ? "font-bold text-gold" : "font-normal text-accent"
          }`}
          title={isHard(film) ? "You locked this" : "Fast Shuffle placed this, and it can still move"}
        >
          {rank}
        </span>
      )}
    </button>
  );
}
