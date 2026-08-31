// Set tiers — one continuous list, and the reader says where each tier ends.
//
// ── Why this is its own screen and not a mode inside ListScreen ────────────
//
// ListScreen is already three pages, a search, a jump menu, a drag-to-reorder,
// an idle drift and two windowing strategies, all sharing one set of state. This
// asks for a different list (the whole library in belief order, unplaced films
// included), different rows (no drag, no lock menu, no pin), a different
// overlay, and an apply step. Threading a fourth mode through that would have
// meant touching every one of those interactions to make it stand down.
//
// ── What the order under the cuts actually is ──────────────────────────────
//
// Belief means, which is the only scale in the app that spans the whole library
// (lib/bayes.ts). Every belief is anchored to a prior of `rating * 2`
// (lib/beliefs.ts), so a film with few duels comes back sitting exactly on its
// star seed. The honest description of this list is "your stars, reordered
// inside each star by the duels you fought, plus the boundary crossings the
// evidence earned" — NOT a ranking built from nothing. Unplaced films are marked
// for exactly that reason: their position is their old rating and nothing else,
// and the reader deserves to see which rows those are before cutting on them.
//
// ── Nothing is written until Apply ─────────────────────────────────────────
//
// The cut set lives in this component and in localStorage. `applyCuts` is the
// only thing that touches the library, it runs once, behind a confirm that says
// how many films it will move.

import { useEffect, useMemo, useRef, useState } from "react";

import { beliefsFor } from "@/lib/beliefs";
import {
  applyCuts,
  boundaries,
  cutAt,
  evenCuts,
  loadCuts,
  normalise,
  saveCuts,
  tiersFor,
} from "@/lib/cuts";
import { lex } from "@/lib/lexicon";
import { buildContinuousOrder } from "@/lib/list";
import type { Judgement } from "@/lib/log";
import { currentMedium } from "@/lib/medium";
import { isPlaced } from "@/lib/lock";
import { starsFor } from "@/lib/tiers";
import type { Film } from "@/lib/types";
import { BackRow, PrimaryButton, SecondaryButton, Sheet } from "./ui";

// Must match `contain-intrinsic-size` on `.list-row` and ROW_H in ListScreen —
// the marker overlay positions itself from this and nothing else.
const ROW_H = 108;
const CHUNK = 25;
const NEAR = 900;
const HOLD_MS = 380;

/**
 * The rows.
 *
 * Windowed the same way `FlatRows` in ListScreen is, for the same measured
 * reason: mounting 828 rows at once blocks the main thread for most of a second.
 * Chunks of a fixed size, spacers of exactly the right height in between, so
 * the scrollbar and every offset behave as if the whole list were live.
 *
 * The cut markers are deliberately NOT rows. `top = i * CHUNK * ROW_H` only
 * holds while every row is exactly `ROW_H` tall, so a marker spliced into the
 * list would put every chunk below it at the wrong offset and the overlay would
 * drift further out of place the further down you scrolled. Since the height is
 * fixed and known, a boundary at index `n` is at exactly `n * ROW_H` — so the
 * markers are an absolutely-positioned overlay and the arithmetic never changes.
 */
function CutRows({
  rows,
  view,
  onHold,
}: {
  rows: { film: Film; rank: number }[];
  view: { top: number; height: number };
  onHold: (index: number) => void;
}) {
  const chunks: { film: Film; rank: number }[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));

  return (
    <>
      {chunks.map((chunk, c) => {
        const top = c * CHUNK * ROW_H;
        const height = chunk.length * ROW_H;
        const near = top < view.top + view.height + NEAR && top + height > view.top - NEAR;
        if (!near) return <div key={c} style={{ height }} />;
        return (
          <div key={c} style={{ height }}>
            {chunk.map((r, i) => (
              <CutRow key={r.film.id} film={r.film} rank={r.rank} onHold={() => onHold(c * CHUNK + i)} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * One film.
 *
 * No stars, which is the point of the screen — the reader is judging where this
 * film sits relative to the one above it, and a star beside it invites the
 * wrong comparison. No drag and no pin either: this screen changes ratings in
 * one action at the end, and a second way to move a film would be two mechanisms
 * writing the same field.
 *
 * `.list-row` and `.list-poster` are the list's own classes, so a row here and a
 * row on the list are the same object at the same height. That height is what
 * the marker overlay is computed from.
 */
function CutRow({ film, rank, onHold }: { film: Film; rank: number; onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  return (
    <div
      onTouchStart={() => {
        clear();
        timer.current = setTimeout(onHold, HOLD_MS);
      }}
      onTouchEnd={clear}
      onTouchMove={clear}
      onTouchCancel={clear}
      // ── The height is set here, not by the class ────────────────────────
      //
      // `.list-row` carries `contain-intrinsic-size: 0 108px`, which is the
      // height only while content-visibility is SKIPPING the row. A rendered
      // row is as tall as its content, and this one's tallest thing is a 76px
      // poster — so without this the rows were 76 while every marker was drawn
      // at `index * 108`, and the boundary line sat further from its row the
      // further down the list you scrolled. The list's own Row sets it inline
      // for exactly this reason, and globals.css says so on `.list-row`.
      style={{ height: ROW_H }}
      className="list-row flex w-full items-center gap-3.5 text-left"
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
          {/* ── Why an unplaced film is marked here ────────────────────────
              Its belief never moved, so its position in this list is its old
              star rating and nothing else. Everywhere else that is fine; here
              the reader is about to draw a line through these rows, and a row
              whose position is a guess should say so before it is cut on. */}
          {!isPlaced(film) && (
            <span className="ml-2 text-label font-bold tracking-[0.14em] text-dim">UN-RNKD</span>
          )}
        </span>
      </span>
      <span className="flex-shrink-0 text-sub tabular-nums text-dim">{rank}</span>
    </div>
  );
}

export function TierCut({
  films,
  log,
  onFilms,
  onClose,
}: {
  films: Film[];
  log: Judgement[];
  onFilms: (films: Film[]) => void;
  onClose: () => void;
}) {
  const L = lex();
  const tiers = useMemo(() => tiersFor(currentMedium()), []);

  // Fitted ONCE, on the way in, and held. The cuts are placed on this order and
  // applied to this order — refitting underneath a reader mid-decision would
  // move rows they had already cut around.
  const order = useMemo(() => buildContinuousOrder(films, beliefsFor(films, log)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [counts, setCounts] = useState<number[]>(() => loadCuts(order.length, tiers.length));
  const [panel, setPanel] = useState(false);
  const [holdAt, setHoldAt] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [view, setView] = useState({ top: 0, height: 0 });
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => saveCuts(counts), [counts]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setView({ top: el.scrollTop, height: el.clientHeight });
    read();
    el.addEventListener("scroll", read, { passive: true });
    return () => el.removeEventListener("scroll", read);
  }, []);

  const starts = useMemo(() => boundaries(counts), [counts]);
  const plan = useMemo(() => applyCuts(order.map((r) => r.film), counts, tiers), [order, counts, tiers]);

  const set = (i: number, n: number) =>
    setCounts((cur) => {
      const next = [...cur];
      next[i] = n;
      return normalise(next, order.length, tiers.length);
    });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="flex-shrink-0 px-4 pt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-label font-bold uppercase tracking-[0.14em] text-dim">Set tiers</span>
          <button onClick={() => setPanel(true)} className="text-label font-bold uppercase tracking-[0.14em] text-gold active:scale-95">
            Counts
          </button>
        </div>
        {/* Said plainly and once, because it is the thing a reader would
            otherwise have to infer from a list that looks more decided than it
            is. See the note at the top of this file. */}
        <p className="mb-3 text-sub leading-snug text-dim">
          Your whole library in one order. Hold a {L.one} to start a tier there, or set the counts.
          Rows marked UN-RNKD sit where their old stars put them.
        </p>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-4">
        <div className="relative">
          <CutRows rows={order} view={view} onHold={setHoldAt} />
          {/* ── The markers ────────────────────────────────────────────────
              An overlay, not rows — see the note on CutRows. `pointer-events-none`
              on the layer so a marker sitting over a row never swallows the
              hold that row is listening for; the label itself is inert. */}
          <div className="pointer-events-none absolute inset-x-0 top-0">
            {starts.map((at, i) =>
              // The first tier starts where the list starts, so it needs no
              // line — and counts of zero would stack several markers on one
              // row, each claiming the same boundary.
              i === 0 || counts[i] === 0 ? null : (
                <div
                  key={i}
                  className="absolute inset-x-0 flex items-center gap-2"
                  style={{ top: at * ROW_H, transform: "translateY(-50%)" }}
                >
                  <span className="rounded-lg bg-surface px-2 py-0.5 text-label font-bold tracking-[0.14em] text-gold">
                    {starsFor(tiers[i])}
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--gold)" }} />
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        {plan.overflow.length > 0 && (
          // A band holds 1000 distinct scores. Past that two films collide and
          // the list breaks the tie by title, which reads as the cut being
          // ignored — so it is refused rather than half-applied.
          <p className="mb-2 text-center text-sub text-danger">
            {starsFor(plan.overflow[0].tier)} has {plan.overflow[0].count} — a tier holds 1000. Split it.
          </p>
        )}
        <PrimaryButton wide disabled={plan.overflow.length > 0} onClick={() => setConfirm(true)}>
          Apply
        </PrimaryButton>
        <BackRow onClick={onClose} />
      </div>

      {panel && (
        <Sheet title="How many in each" onClose={() => setPanel(false)}>
          {tiers.map((t, i) => {
            // The film the tier ENDS on. This is the line that earns the panel:
            // a count is an abstraction, and the title on the boundary is what
            // a reader can actually judge the cut by.
            const last = counts[i] > 0 ? order[starts[i] + counts[i] - 1]?.film : undefined;
            return (
              <div key={t} className="mb-2 flex items-center gap-3">
                <span className="w-16 flex-shrink-0 text-sub text-gold">{starsFor(t)}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={counts[i]}
                  onChange={(e) => set(i, Number(e.target.value))}
                  className="w-20 flex-shrink-0 rounded-xl border border-border bg-transparent px-3 py-2 text-body tabular-nums text-text-hi"
                />
                <span className="min-w-0 flex-1 truncate text-sub text-dim">
                  {last ? `ends at ${last.title}` : "empty"}
                </span>
              </div>
            );
          })}
          <p className="mb-3 mt-3 text-center text-sub text-dim">
            {counts.reduce((a, b) => a + b, 0)} of {order.length} {L.many}
          </p>
          <SecondaryButton wide onClick={() => setCounts(evenCuts(order.length, tiers.length))}>
            Even split
          </SecondaryButton>
        </Sheet>
      )}

      {holdAt !== null && (
        <Sheet title="Start a tier here" onClose={() => setHoldAt(null)}>
          <p className="mb-3 text-sub leading-snug text-dim">
            {order[holdAt]?.film.title} becomes the first of whichever tier you pick. Only that
            boundary moves.
          </p>
          {tiers.map((t, i) =>
            // Index 0 has no boundary above it to move.
            i === 0 ? null : (
              <SecondaryButton
                key={t}
                wide
                className="mb-2"
                onClick={() => {
                  setCounts(cutAt(counts, holdAt, i, order.length));
                  setHoldAt(null);
                }}
              >
                {starsFor(t)} starts here
              </SecondaryButton>
            ),
          )}
          <BackRow onClick={() => setHoldAt(null)} />
        </Sheet>
      )}

      {confirm && (
        <Sheet title="Apply these tiers" onClose={() => setConfirm(false)}>
          <p className="mb-3 text-sub leading-snug text-dim">
            {plan.moved === 0
              ? `No ${L.one} changes rating — the cuts match what you already had.`
              : `${plan.moved} of ${order.length} ${L.many} get a different star rating. Your locks, notes and duel history are untouched.`}
          </p>
          <PrimaryButton
            wide
            onClick={() => {
              onFilms(plan.films);
              setConfirm(false);
              onClose();
            }}
          >
            Apply
          </PrimaryButton>
          <BackRow onClick={() => setConfirm(false)} />
        </Sheet>
      )}
    </div>
  );
}
