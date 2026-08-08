"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveFilms } from "@/lib/store";
import {
  startRun,
  startSpotlight,
  abandonSpotlight,
  getPair,
  choose,
  skipPair,
  confirm,
  pendingConfirm,
  flickToTop,
  flickToBottom,
  skipToFilm,
  stepBackFromConfirm,
  promotionTarget,
  startPromotionDuel,
  promoteDirect,
  promotionWon,
  completePromotion,
  spotlightSummary,
  searchWindow,
  type SpotlightSummary,
} from "@/lib/ladder";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import { backfillPosters, withMeta, needsMeta } from "@/lib/meta";
import { appendJudgements, retractJudgements } from "@/lib/log";
import { poolFor } from "@/lib/matchmaker";
import { isPlaced } from "@/lib/lock";
import ShuffleDuel, { type ShuffleOptions } from "./ShuffleDuel";
import { LOSER, LastResult, PosterCard, fadeLoserOut, flyPosterAcross } from "./PosterCard";
import { Rolodex } from "./Rolodex";
import { SpotlightPicker } from "./SpotlightPicker";
import { SessionEnd } from "./SessionEnd";
import {
  BackRow,
  RangeSlider,
  ScopeTab,
  Sheet,
  ShuffleRow,
  StartButton,
} from "./ui";
import {
  ActivityIcon,
  ClimbArrow,
  GearIcon,
  Hairline,
  ListIcon,
  PersonIcon,
  RankdMark,
  StopIcon,
  TrophyIcon,
} from "./Icons";
import type { Film, RankState } from "@/lib/types";

const DEFAULT_TIER = 4 as const;

// Which game the setup panel is configuring; null while it is still asking.
type ChosenMode = "koth" | "shuffle" | null;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

// The library and the app-wide chrome now live in AppShell — this screen owns
// only the duel. Everything it still holds is setup state for the next run.
export default function DuelScreen({
  state,
  setState,
  spotlightRequest,
  onSpotlightHandled,
  onInfo,
  onSettings,
  onList,
  onProfile,
  onTrophies,
}: {
  state: RankState | null;
  setState: React.Dispatch<React.SetStateAction<RankState | null>>;
  /** A film the review card asked to have re-placed; starts a spotlight on arrival. */
  spotlightRequest?: Film | null;
  onSpotlightHandled?: () => void;
  onInfo: (film: Film) => void;
  onSettings: () => void;
  onList: () => void;
  onProfile: () => void;
  onTrophies: () => void;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [spotlightFor, setSpotlightFor] = useState<Rating | null>(null);
  // A tier chosen for the NEXT run but not started. Without it the only way to
  // change the tier on screen was to start a game, which is exactly why picking
  // one used to drop you straight into a duel.
  const [pickedTier, setPickedTier] = useState<Rating | null>(null);
  // Which mode the setup panel is showing. Held here, not inside the panel, so
  // stepping out to the tier sheet and back doesn't reset you to the mode list.
  const [chosenMode, setChosenMode] = useState<ChosenMode>(null);
  // Fast Shuffle deliberately does NOT live in RankState.session: it places
  // nothing and confirms nothing, so giving it a PlacementSession would mean
  // teaching ladder.ts about a mode that never places a film.
  const [shuffleRun, setShuffleRun] = useState<ShuffleOptions | null>(null);
  const [summary, setSummary] = useState<SpotlightSummary | null>(null);
  const [shuffle, setShuffle] = useState(false);
  // How far either side of the chosen tier to pull films in from, set
  // independently so a 1★ run can reach down to 0.5★ and up to 1.5★.
  const [below, setBelow] = useState(0);
  const [above, setAbove] = useState(0);

  // One step back: the state as it was before the last judgement, and the ids
  // that judgement wrote to the log. Held here rather than in RankState because
  // it is screen memory, not game state — it must not survive a reload, a mode
  // change or a backup, and `ladder.ts` must never learn that undo exists.
  const [undoStep, setUndo] = useState<{ state: RankState; judgements: string[] } | null>(null);

  // The strip is a map, not a control — folding it away buys the duel ~110px
  // when you just want to play. Remembered, since it's a working preference.
  //
  // Read during the first render, not in an effect. Defaulting to open and then
  // correcting afterwards meant the strip flashed open and slammed shut every
  // time you came back to the duel — a jarring swap for a preference we already
  // knew. AppShell renders nothing until the library loads, so this only ever
  // runs on the client.
  const [stripOpen, setStripOpen] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STRIP_KEY) === "open",
  );
  const toggleStrip = () =>
    setStripOpen((v) => {
      localStorage.setItem(STRIP_KEY, v ? "closed" : "open");
      return !v;
    });
  // The review card's answer arrives as a film to re-place. Handled here rather
  // than by the list, because starting a spotlight means replacing the run on
  // this screen — which is this screen's business, not the list's.
  useEffect(() => {
    if (!spotlightRequest) return;
    setState((s) => {
      if (!s) return s;
      try {
        return { ...startSpotlight(s.films, spotlightRequest.id, { shuffle: false }), journal: s.journal };
      } catch {
        return s; // nothing to place it against — leave whatever was running alone
      }
    });
    onSpotlightHandled?.();
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightRequest]);

  // Fill in artwork for the tier being played. Scoped to the active pile rather
  // than the whole library — an import can be hundreds of films, and only these
  // are ever on screen. Persists as each one lands so progress survives a reload.
  const pileKey = state?.session?.unconfirmed.join(",") ?? "";
  useEffect(() => {
    if (!state?.session) return;
    const { unconfirmed, contenderId } = state.session;
    // Fetch in the order they'll be SEEN, not pile order. The contender sits at
    // the bottom of the pile and climbs upward, so plain pile order fetches the
    // whole tier before reaching the two films actually on screen — a 130-film
    // tier left them blank for half a minute.
    const ci = unconfirmed.indexOf(contenderId);
    const byWhenSeen = [
      unconfirmed[ci], // the contender itself
      ...unconfirmed.slice(0, ci).reverse(), // then upward: its next opponents
      ...unconfirmed.slice(ci + 1), // then everything already passed
    ].filter(Boolean);

    const need = byWhenSeen
      .map((id) => state.films.find((f) => f.id === id))
      .filter((f): f is Film => !!f && needsMeta(f));
    if (need.length === 0) return;

    let stopped = false;
    backfillPosters(
      need,
      (id, meta) =>
        setState((s) => {
          if (!s) return s;
          const films = s.films.map((f) => (f.id === id ? withMeta(f, meta) : f));
          saveFilms(films);
          return { ...s, films };
        }),
      () => stopped,
    );
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pileKey]);

  if (!state) return null;
  const { session } = state;

  // The one way a state from the engine reaches the screen.
  //
  // The engine is pure, so it cannot write; it hands settled duels up on
  // `state.journal` and they are drained HERE, at the moment the judgement was
  // made, rather than watched for in an effect. Draining on arrival is what
  // keeps the journal near-empty — a marathon session would otherwise copy an
  // ever-growing array on every single tap — and it means a duel is evidence the
  // instant it is answered, whatever happens to the run afterwards.
  const commit = (next: RankState, persist = true) => {
    if (persist) saveFilms(next.films);
    if (next.journal.length === 0) {
      // Nothing was judged, so this is a confirm, a flick, or a new run — and
      // the step held from the last judgement now points into a game that no
      // longer exists. Dropping it here rather than at each call site means a
      // transition added later cannot forget to, which is the failure that
      // would hand someone a stale library and look like data loss.
      setUndo(null);
      setState(next);
      return;
    }
    void appendJudgements(next.journal);
    setState({ ...next, journal: [] });
  };

  // Undo, in the only place it can be cheap: the engine is immutable in and out,
  // so the previous state is simply the value `commit` was about to replace.
  // Nothing has to be inverted, and no operation needs a matching un-operation —
  // which is why this is three lines here and would have been a subsystem inside
  // ladder.ts.
  //
  // One step deep on purpose. A full history invites treating the climb as a
  // document to edit rather than a set of calls to make, and the mis-tap this
  // exists for is always the one you just made.
  const commitUndoable = (next: RankState) => {
    // The journal is drained by `commit`, so capture the ids first — after that
    // they are gone from state and there would be nothing left to retract.
    setUndo({ state, judgements: next.journal.map((j) => j.id) });
    commit(next);
  };
  const undo = () => {
    if (!undoStep) return;
    // Retract before restoring, so a mis-tap leaves nothing behind in either
    // place. The placement and the evidence for it move together or the list
    // and the model disagree about a duel that never happened.
    void retractJudgements(undoStep.judgements);
    saveFilms(undoStep.state.films);
    setState(undoStep.state);
    setUndo(null);
  };

  // A duel result is written straight away. Placements still only commit on
  // confirm — what's saved here is the record that the comparison happened,
  // which is the one thing an abandoned run should still leave behind.
  const decide = (winnerId: string) => commitUndoable(choose(state, winnerId));
  // Same shape as a decision, because that is what it is — a recorded answer of
  // "neither". A spotlight settles here; a climb steps the contender in below.
  const declineToCall = () => commitUndoable(skipPair(state));
  // Assertions, not judgements: they reorder the pile and record nothing, so
  // there is never a journal to drain and nothing to persist until a confirm.
  const flick = (filmId: string) => commit(flickToTop(state, filmId), false);
  const sink = (filmId: string) => commit(flickToBottom(state, filmId), false);
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  const lockIn = () => {
    // Winning the promotion duels banks a new star rating instead of a position.
    commit(promotionWon(state) ? completePromotion(state) : confirm(state));
  };
  const backOut = () => commit(stepBackFromConfirm(state), false);

  // Returns whether a run actually started, so the setup panel can stay open and
  // say why instead of dropping you on a "tier complete" screen that was really
  // "your range holds fewer than two films".
  const beginRun = (tier: Rating, films = state.films): boolean => {
    // startRun/startSpotlight build a state from films alone, so any duels not yet
    // drained to the log are carried across by hand rather than dropped.
    try {
      commit({ ...startRun(films, tier, { shuffle, below, above }), journal: state.journal }, false);
      return true;
    } catch {
      commit({ films, session: null, journal: state.journal }, false);
      return false;
    }
  };

  // The tier the setup panel is talking about: what you picked if you picked
  // one, otherwise whatever is running.
  const setupTier = pickedTier ?? session?.tier ?? DEFAULT_TIER;

  // Leaving setup entirely clears the choice; stepping between its own screens
  // does not.
  const closeSetup = () => {
    setModeOpen(false);
    setChosenMode(null);
    setPickedTier(null);
  };

  const beginSpotlight = (filmId: string) => {
    try {
      commit({ ...startSpotlight(state.films, filmId, { shuffle }), journal: state.journal }, false);
    } catch {
      setState(state); // no peers to place against — leave the run alone
    }
  };

  // Ending a spotlight that fought nobody just restores the film; ending one
  // that did show what it established before committing anything.
  const endRun = () => {
    if (session?.mode === "spotlight") {
      const fought =
        (session.spotWins?.length ?? 0) +
        (session.spotLosses?.length ?? 0) +
        (session.spotDraws?.length ?? 0);
      if (fought > 0) {
        setSummary(spotlightSummary(state));
        return;
      }
      commit(abandonSpotlight(state));
      return;
    }
    commit({ ...state, session: null }, false);
  };

  // Keep the result, or throw the session away and leave the film where it was.
  const keepSpotlight = () => {
    commit(confirm(state));
    setSummary(null);
  };
  const discardSpotlight = () => {
    commit(abandonSpotlight(state));
    setSummary(null);
  };

  const promoteTo = promotionTarget(state);
  const takeOnTierAbove = () => commit(startPromotionDuel(state), false);
  const assertPromotion = () => commit(promoteDirect(state));

  const pair = getPair(state);
  const champion = pendingConfirm(state);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />
      {/* Hidden during Fast Shuffle: it reports a tier, a placed count and a
          to-go count, and that run has none of those. Left visible it read as
          "KING OF THE HILL · 0 placed · 50 to go" over a completely different
          game. ShuffleDuel carries its own status line instead. */}
      {!shuffleRun && (
        <TierProgress
          tier={session?.tier ?? DEFAULT_TIER}
          mode={session?.mode ?? "koth"}
          placed={session?.confirmed.length ?? 0}
          toGo={session?.unconfirmed.length ?? 0}
          onPickTier={() => setTierOpen(true)}
        />
      )}

      {/* Fast Shuffle owns the whole surface while it runs: it has no pile, no
          climb and no confirm, so none of the branches below apply to it. */}
      {shuffleRun ? (
        <ShuffleDuel
          films={state.films}
          onFilms={(films) => {
            saveFilms(films);
            setState((s) => (s ? { ...s, films } : s));
          }}
          // Applied as a functional update, so artwork arriving mid-streak folds
          // into whatever the library is NOW rather than into a stale snapshot
          // taken when the request went out.
          onMeta={(id, meta) =>
            setState((s) => {
              if (!s) return s;
              const films = s.films.map((f) => (f.id === id ? withMeta(f, meta) : f));
              saveFilms(films);
              return { ...s, films };
            })
          }
          options={shuffleRun}
          onInfo={onInfo}
          onExit={() => setShuffleRun(null)}
          onList={onList}
        />
      ) : /* A spotlight that has settled reports what it established rather than
          asking for a bare number — the before/after is the whole point. */
      champion && session?.mode === "spotlight" ? (
        <SpotlightReport
          summary={spotlightSummary(state)!}
          promoteTo={promoteTo}
          onTakeOn={takeOnTierAbove}
          onAssertPromotion={assertPromotion}
          onKeep={keepSpotlight}
          onDiscard={discardSpotlight}
          inline
        />
      ) : champion ? (
        <ConfirmView
          champion={champion}
          // A spotlight settles wherever it stopped climbing, so its number is
          // its position in the tier — not the next slot on the shelf.
          rank={
            session?.mode === "spotlight"
              ? session.unconfirmed.indexOf(session.contenderId) + 1
              : (session?.confirmed.length ?? 0) + 1
          }
          onConfirm={lockIn}
          onBack={(session?.unconfirmed.length ?? 0) > 1 ? backOut : undefined}
          spotlight={session?.mode === "spotlight"}
          promoteTo={promoteTo}
          onTakeOn={takeOnTierAbove}
          onAssertPromotion={assertPromotion}
          justPromoted={promotionWon(state)}
        />
      ) : pair && session ? (
        <Duel
          contender={pair.contender}
          challenger={pair.opponent}
          pile={session.unconfirmed}
          confirmed={session.confirmed}
          films={state.films}
          tier={session.tier}
          onPick={decide}
          onDraw={declineToCall}
          onDone={endRun}
          onUndo={undo}
          canUndo={!!undoStep}
          onFlick={flick}
          onSink={sink}
          onScrub={scrub}
          onInfo={onInfo}
          stripOpen={stripOpen}
          onToggleStrip={toggleStrip}
          spotlight={session.mode === "spotlight"}
          inPlay={searchWindow(state)}
        />
      ) : (
        <TierComplete films={state.films} tier={session?.tier ?? DEFAULT_TIER} onPickTier={() => setTierOpen(true)} onList={onList} />
      )}

      <BottomNav
        screen="duel"
        onSettings={onSettings}
        onModes={() => setModeOpen(true)}
        onEnd={endRun}
        onList={onList}
        onProfile={onProfile}
      />

      {summary && <SpotlightReport summary={summary} onKeep={keepSpotlight} onDiscard={discardSpotlight} />}

      {modeOpen && (
        <ModePanel
          films={state.films}
          tier={setupTier}
          chosen={chosenMode}
          onChoose={setChosenMode}
          shuffle={shuffle}
          onShuffle={setShuffle}
          below={below}
          above={above}
          onBelow={setBelow}
          onAbove={setAbove}
          onClose={closeSetup}
          onKoth={(t) => {
            if (beginRun(t)) closeSetup(); // a run that couldn't start leaves you in setup
          }}
          onSpotlight={(t) => {
            setSpotlightFor(t);
            closeSetup();
          }}
          onFastShuffle={(opts) => {
            setShuffleRun(opts);
            closeSetup();
          }}
          onPickTier={() => {
            setModeOpen(false);
            setTierOpen(true);
          }}
        />
      )}

      {tierOpen && (
        <TierPicker
          films={state.films}
          current={setupTier}
          onClose={() => {
            setTierOpen(false);
            setModeOpen(true); // back where you came from, nothing started
          }}
          onPick={(t) => {
            // Choosing a tier is a setting, not a start. It hands you back to the
            // panel with the range still there to adjust; only Start plays.
            setPickedTier(t);
            setBelow(0);
            setAbove(0); // a new tier's reach is its own question
            setTierOpen(false);
            setModeOpen(true);
          }}
        />
      )}

      {spotlightFor !== null && (
        <SpotlightPicker
          films={state.films}
          onClose={() => setSpotlightFor(null)}
          onPick={(id) => {
            beginSpotlight(id);
            setSpotlightFor(null);
          }}
        />
      )}

    </main>
  );
}

// Open on a tier that can actually be played, preferring the default when it
// works and otherwise the fullest — a real import may have nothing at 4★.
export function pickOpeningTier(films: Film[]): Rating {
  const counts = new Map<Rating, number>();
  for (const f of films) counts.set(f.rating, (counts.get(f.rating) ?? 0) + 1);
  if ((counts.get(DEFAULT_TIER) ?? 0) >= 2) return DEFAULT_TIER;
  let best: Rating = DEFAULT_TIER;
  let most = 0;
  for (const t of ORDERED_TIERS) {
    const n = counts.get(t) ?? 0;
    if (n > most) {
      most = n;
      best = t;
    }
  }
  return best;
}

// Bottom nav — bookends the black header, so the play area sits between two
// dark bands. Sized to its final height now, so adding List/Stats later slots
// in without re-flowing the duel.
export function BottomNav({
  screen,
  onSettings,
  onModes,
  onEnd,
  onList,
  onProfile,
}: {
  screen: "duel" | "list" | "profile";
  onSettings: () => void;
  onModes?: () => void;
  onEnd?: () => void;
  onList: () => void;
  onProfile?: () => void;
}) {
  return (
    <nav
      className="flex flex-shrink-0 items-stretch border-t"
      // Pad into the home-indicator strip so the bar's black reaches the
      // physical bottom edge instead of cutting off into the page background.
      style={{ background: "var(--header-bg)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Five equal cells so RNK sits dead centre — it's the core loop. Ending
          the session sits beside it, since that's the duel's own control.
          Add-film and Search live inside List, not out here. */}
      <NavItem label="Your list" active={screen === "list"} onClick={onList} icon={<ListIcon />} />
      {/* Ending a session only means something mid-duel, so it's inert on the
          list — the cell stays for the nav's fixed five-column rhythm. */}
      <NavItem label="End session" onClick={onEnd} icon={<StopIcon />} />
      <NavItem label="Rank" active={screen === "duel"} onClick={onModes} icon={<RankdMark />} />
      <NavItem label="Activity" icon={<ActivityIcon />} />
      {/* Account owns the profile; Settings moved to the gear on its cover, so
          this slot leads somewhere rather than opening a sheet over the duel. */}
      <NavItem
        label="You"
        active={screen === "profile"}
        onClick={onProfile ?? onSettings}
        icon={<PersonIcon />}
      />
    </nav>
  );
}

// Icon-only: labels cost vertical space the duel needs more than the nav does.
function NavItem({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 items-center justify-center py-4 transition-colors active:scale-95"
      style={{ color: active ? "var(--gold)" : "var(--dim)" }}
    >
      {icon}
    </button>
  );
}

export const tierCounts = (films: Film[]): Map<Rating, number> => {
  const m = new Map<Rating, number>();
  for (const f of films) m.set(f.rating, (m.get(f.rating) ?? 0) + 1);
  return m;
};

function ModePanel({
  films,
  tier,
  chosen,
  onChoose,
  shuffle,
  onShuffle,
  below,
  above,
  onBelow,
  onAbove,
  onClose,
  onKoth,
  onSpotlight,
  onFastShuffle,
  onPickTier,
}: {
  films: Film[];
  tier: Rating;
  chosen: ChosenMode;
  onChoose: (v: ChosenMode) => void;
  shuffle: boolean;
  onShuffle: (v: boolean) => void;
  below: number;
  above: number;
  onBelow: (v: number) => void;
  onAbove: (v: number) => void;
  onClose: () => void;
  onKoth: (t: Rating) => void;
  onSpotlight: (t: Rating) => void;
  onFastShuffle: (opts: ShuffleOptions) => void;
  onPickTier: () => void;
}) {
  // Pick the game first, then set it up. A flat list asked you to read a tier
  // and a range before knowing what they were for — and showed a range control
  // to Spotlight, which is always single-tier and ignores it entirely.
  const setChosen = onChoose;

  const lowEdge = tier - below;
  const highEdge = tier + above;
  // The range pulls films in from either side, so the count has to reflect the
  // whole span, not just the chosen tier.
  const count = films.filter((f) => f.rating >= lowEdge && f.rating <= highEdge).length;
  const playable = count >= 2;

  if (chosen === null) {
    return (
      <Sheet title="Play" onClose={onClose}>
        <ModeRow
          title="King of the Hill"
          blurb="Rank a whole tier. Each winner keeps climbing until something beats it."
          onClick={() => setChosen("koth")}
        />
        {/* Spotlight is about one film, so choosing it goes straight to the
            film. Tier and shuffle live in the picker — they're a way to narrow
            the list, not a setup step to complete before seeing it. */}
        <ModeRow
          title="Spotlight"
          blurb="Pick one film and find where it really belongs — it can push into the tier above."
          onClick={() => onSpotlight(tier)}
        />
        {/* The one mode with no pile and no confirm. It asks whichever question
            it can least predict the answer to, and stops when you do. */}
        <ModeRow
          title="Fast Shuffle"
          blurb="No climbing, no confirming. It picks whatever teaches it the most and keeps going."
          onClick={() => setChosen("shuffle")}
        />
      </Sheet>
    );
  }

  if (chosen === "shuffle") {
    return (
      <ShuffleSetup
        films={films}
        tier={tier}
        below={below}
        above={above}
        onBelow={onBelow}
        onAbove={onAbove}
        onClose={onClose}
        onPickTier={onPickTier}
        onBack={() => setChosen(null)}
        onStart={onFastShuffle}
      />
    );
  }

  return (
    <Sheet title="King of the Hill" onClose={onClose}>
      <button
        onClick={onPickTier}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
      >
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">TIER</span>
        <span className="flex items-baseline gap-2">
          <span className="text-base text-gold">{starsFor(tier)}</span>
          <span className="text-[11px] text-dim">
            {count} film{count === 1 ? "" : "s"} ›
          </span>
        </span>
      </button>

      {/* Reach set independently either side — a 1★ run might want 0.5★ below
          and 1.5★ above, which a single symmetric figure can't express.
          Cross-tier duels are the ones the overall order most needs: they're the
          only comparisons that say anything about how two star bands relate. */}
      <div className="mt-4 rounded-xl border border-border px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-text-hi">Range</span>
          <span className="text-[11px] text-gold">
            {starsFor(lowEdge)} – {starsFor(highEdge)}
          </span>
        </div>

        {/* Both handles are clamped past the chosen tier, so the range always
            contains the tier the run is anchored to. */}
        <RangeSlider
          tier={tier}
          low={lowEdge}
          high={highEdge}
          onLow={(v) => onBelow(tier - v)}
          onHigh={(v) => onAbove(v - tier)}
        />
        <div className="flex justify-between text-[10px] text-dim">
          <span>½</span>
          <span>★★★★★</span>
        </div>

        {(below > 0 || above > 0) && (
          <p className="mt-2 text-[11px] leading-snug text-dim">
            {count} films in range. Every film keeps its own star rating — this only decides which
            films meet each other.
          </p>
        )}
      </div>

      <div className="mt-2">
        <ShuffleRow shuffle={shuffle} onShuffle={onShuffle} />
      </div>

      <StartButton label={`Start · ${count} films`} onClick={() => onKoth(tier)} disabled={!playable} />
      {!playable && (
        <p className="mt-2 text-center text-[11px] text-gold">
          Only {count} film{count === 1 ? "" : "s"} in range — widen it or pick another tier.
        </p>
      )}
      <BackRow onClick={() => setChosen(null)} />
    </Sheet>
  );
}

// Fast Shuffle's only setup. Two questions, because they change what the run
// means rather than merely tuning it: what it may draw from, and whether it may
// touch work you already did.
//
// PROVISIONAL LOOK — assembled from the panel's existing controls so it doesn't
// invent a competing language, but it has had no design pass.
function ShuffleSetup({
  films,
  tier,
  below,
  above,
  onBelow,
  onAbove,
  onClose,
  onPickTier,
  onBack,
  onStart,
}: {
  films: Film[];
  tier: Rating;
  below: number;
  above: number;
  onBelow: (v: number) => void;
  onAbove: (v: number) => void;
  onClose: () => void;
  onPickTier: () => void;
  onBack: () => void;
  onStart: (opts: ShuffleOptions) => void;
}) {
  const [kind, setKind] = useState<"all" | "tier" | "range">("all");
  const [includeConfirmed, setIncludeConfirmed] = useState(false);

  const scope: ShuffleOptions["scope"] =
    kind === "all"
      ? { kind: "all" }
      : kind === "tier"
        ? { kind: "tier", tier }
        : { kind: "range", tier, below, above };

  // The count the run will actually use, from the run's own function — a second
  // filter computed here would drift from it the first time either changed.
  const count = poolFor(films, { scope, includeConfirmed }).length;
  const playable = count >= 2;

  return (
    <Sheet title="Fast Shuffle" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        <ScopeTab label="All films" active={kind === "all"} onClick={() => setKind("all")} />
        <ScopeTab label="This tier" active={kind === "tier"} onClick={() => setKind("tier")} />
        <ScopeTab label="Range" active={kind === "range"} onClick={() => setKind("range")} />
      </div>

      {kind !== "all" && (
        <button
          onClick={onPickTier}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
        >
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">TIER</span>
          <span className="text-base text-gold">{starsFor(tier)} ›</span>
        </button>
      )}

      {kind === "range" && (
        <div className="mb-3 rounded-xl border border-border px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-text-hi">Range</span>
            <span className="text-[11px] text-gold">
              {starsFor(tier - below)} – {starsFor(tier + above)}
            </span>
          </div>
          <RangeSlider
            tier={tier}
            low={tier - below}
            high={tier + above}
            onLow={(v) => onBelow(tier - v)}
            onHigh={(v) => onAbove(v - tier)}
          />
        </div>
      )}

      {/* Off, this ranks the films with no position yet. On, it is allowed to
          re-order the ones you placed — which is why it is a deliberate tick
          rather than a default. */}
      <label className="mb-1 flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <span className="min-w-0 pr-3">
          <span className="block text-sm text-text-hi">Include films I&apos;ve already placed</span>
          <span className="block text-[11px] leading-snug text-dim">
            {includeConfirmed
              ? "Placed films can move within their star rating."
              : "Placed films stay exactly where you put them."}
          </span>
        </span>
        <input
          type="checkbox"
          checked={includeConfirmed}
          onChange={(e) => setIncludeConfirmed(e.target.checked)}
          className="tickbox"
        />
      </label>

      <StartButton label={`Start · ${count} films`} onClick={() => onStart({ scope, includeConfirmed })} disabled={!playable} />
      {!playable && (
        <p className="mt-2 text-center text-[11px] text-gold">
          Only {count} film{count === 1 ? "" : "s"} in range — widen it or pick another tier.
        </p>
      )}
      <BackRow onClick={onBack} />
    </Sheet>
  );
}

function ModeRow({
  title,
  blurb,
  disabled,
  onClick,
}: {
  title: string;
  blurb: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mb-2 w-full rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-40"
    >
      <span className="block font-display text-lg tracking-wide text-text-hi">{title}</span>
      <span className="block text-[11px] leading-snug text-dim">{blurb}</span>
    </button>
  );
}

// Every tier with its count. Tiers you can't play are shown but inert — seeing
// that 4.5★ holds one film explains why it isn't offered.
function TierPicker({
  films,
  current,
  onClose,
  onPick,
}: {
  films: Film[];
  current: Rating;
  onClose: () => void;
  onPick: (t: Rating) => void;
}) {
  const counts = tierCounts(films);
  return (
    <Sheet title="Choose a tier" onClose={onClose}>
      {ORDERED_TIERS.map((t) => {
        const n = counts.get(t) ?? 0;
        const playable = n >= 2;
        return (
          <button
            key={t}
            disabled={!playable}
            onClick={() => onPick(t)}
            className="mb-1.5 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-30"
          >
            <span className="text-base text-gold">{starsFor(t)}</span>
            <span className="flex items-center gap-2 text-[11px] text-dim">
              {n === 0 ? "none" : `${n} film${n === 1 ? "" : "s"}`}
              {n === 1 && " — needs 2"}
              {t === current && <span className="text-gold">✓</span>}
            </span>
          </button>
        );
      })}
    </Sheet>
  );
}

// Choosing the film IS the mode setup for Spotlight, so this screen carries
// everything: the whole library to scroll, a tier filter to narrow it, and
// shuffle. A spotlight's tier comes from the film you pick, never from a
// setting made beforehand — so the filter here only decides what you see.
// Exported because picking a film out of the library is not a Spotlight idea —
// the profile needs the same searchable, windowed list to choose a banner, an
// avatar or a favourite. Only the words at the top change.
function SpotlightReport({
  summary,
  onKeep,
  onDiscard,
  promoteTo,
  onTakeOn,
  onAssertPromotion,
  inline,
}: {
  summary: SpotlightSummary;
  onKeep: () => void;
  onDiscard: () => void;
  promoteTo?: Rating;
  onTakeOn?: () => void;
  onAssertPromotion?: () => void;
  inline?: boolean;
}) {
  const { film, fromIndex, toIndex, total, beat, lostTo, drewWith } = summary;
  const moved = fromIndex - toIndex; // positive = climbed

  const body = (
    <>
      <div className="mb-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={film.poster} alt="" style={{ width: 54, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6 }} />
        <div className="min-w-0">
          <div className="font-display text-xl leading-none tracking-wide text-text-hi">{film.title}</div>
          <div className="mt-1.5 flex items-baseline gap-2 text-sm">
            <span className="text-dim">#{fromIndex + 1}</span>
            <span className="text-dim">→</span>
            <span className="font-bold text-gold">#{toIndex + 1}</span>
            <span className="text-[11px] text-dim">of {total}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-dim">
            {moved > 0
              ? `Climbed ${moved} place${moved === 1 ? "" : "s"}`
              : moved < 0
                ? `Dropped ${-moved} place${moved === -1 ? "" : "s"}`
                : "Held its place"}
          </div>
        </div>
      </div>

      {beat.length > 0 && <ReportList label="BEAT" films={beat} tone="var(--gold)" />}
      {lostTo.length > 0 && <ReportList label="LOST TO" films={lostTo} tone={LOSER} />}
      {drewWith.length > 0 && <ReportList label="TOO CLOSE TO CALL" films={drewWith} tone="var(--dim)" />}

      {promoteTo !== undefined && (
        <div className="mb-3 flex flex-col items-center gap-2 border-t border-border pt-3">
          <button
            onClick={onTakeOn}
            className="rounded-full border px-6 py-2.5 text-xs font-bold tracking-wide active:scale-95"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            Take on {starsFor(promoteTo)}
          </button>
          <button onClick={onAssertPromotion} className="text-[11px] font-semibold text-dim active:scale-95">
            or move it up without dueling
          </button>
        </div>
      )}

      <StartButton label={`Keep it at #${toIndex + 1}`} onClick={onKeep} />
      <button onClick={onDiscard} className="mt-3 w-full text-center text-xs font-semibold text-dim active:scale-95">
        Discard — leave it where it was
      </button>
    </>
  );

  // Shown in place when the run settles, or as a sheet when ended by hand.
  if (inline) {
    return (
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-8 py-4">
        <div className="mx-auto w-full max-w-sm">{body}</div>
      </div>
    );
  }

  return (
    <Sheet title="Spotlight" onClose={onDiscard}>
      {body}
    </Sheet>
  );
}

function ReportList({ label, films, tone }: { label: string; films: Film[]; tone: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[10px] font-extrabold tracking-[0.12em]" style={{ color: tone }}>
        {label}
      </div>
      <div className="text-[12px] leading-relaxed text-text">{films.map((f) => f.title).join(", ")}</div>
    </div>
  );
}

// A label wrapping a hidden file input — a styled <button> can't open a picker.
export function Header({ onSettings, onTrophies }: { onSettings?: () => void; onTrophies?: () => void }) {
  return (
    <header
      className="relative flex-shrink-0 px-6 pb-3"
      style={{ background: "var(--header-bg)", paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      {/* Settings lives here rather than on the nav, so the account slot can
          lead to the profile instead of opening a sheet over whatever you were
          doing. */}
      {onSettings && (
        <button
          onClick={onSettings}
          aria-label="Settings"
          className="absolute left-5 text-dim transition-colors active:scale-95"
          style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        >
          <GearIcon />
        </button>
      )}
      <button
        onClick={onTrophies}
        aria-label="Achievements"
        className="absolute right-5 text-dim transition-colors active:scale-95"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <TrophyIcon />
      </button>
      <div className="text-center">
        <span className="font-display text-[28px] leading-none tracking-[0.06em] text-gold" style={{ textShadow: "0 2px 20px rgba(231,181,62,0.22)" }}>
          RANKD
        </span>
        <div className="mt-1 flex items-center justify-center gap-1">
          {BARS.map((c) => (
            <span key={c} className="h-[3px] w-5 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      {/* Short feather below the solid header — ported from rankd.html .lh-header::after */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-11"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--header-bg) 92%, transparent), color-mix(in srgb, var(--header-bg) 50%, transparent) 40%, transparent)",
        }}
      />
    </header>
  );
}

// Right-hand status. It's held to its own half of the row so it can never push
// the centre label off true; if the text doesn't fit, the edge nearest the
// middle is feathered away and the text drifts across to reveal the rest.
function RowStatus({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowBy, setOverflowBy] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const over = el.scrollWidth - el.clientWidth;
    setOverflowBy(over > 1 ? over : 0);
  });

  return (
    <span
      ref={ref}
      className="ml-auto overflow-hidden whitespace-nowrap text-right text-[11px] text-text/55"
      style={{
        maxWidth: "42%",
        // Feather only the inner edge, and only when something is actually cut.
        maskImage: overflowBy ? "linear-gradient(to right, transparent, #000 14px)" : undefined,
      }}
    >
      <span
        className={overflowBy ? "row-reveal inline-block" : undefined}
        style={overflowBy ? ({ "--reveal-x": `-${overflowBy}px` } as React.CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  );
}

// The tier + progress strip, sitting on the body just under the header feather.
function TierProgress({
  tier,
  mode,
  placed,
  toGo,
  onPickTier,
}: {
  tier: Rating;
  mode: string;
  placed: number;
  toGo: number;
  onPickTier: () => void;
}) {
  return (
    <div className="px-6">
      {/* mt-11 clears the header's 44px feather so the progress bar doesn't sit
          inside the fade. */}
      <div className="mx-auto mt-11 max-w-[330px]">
        {/* Each part is anchored rather than flowed, so the middle label sits on
            the true centre no matter how long the status beside it grows. */}
        <div className="relative mb-1.5 flex items-baseline">
          {/* The tier reads as its stars, and doubles as the quickest way to
              switch — the label you're looking at is the control. */}
          <button onClick={onPickTier} className="flex shrink-0 items-baseline gap-1.5 active:scale-95">
            <span className="text-base leading-none text-gold">{starsFor(tier)}</span>
            <span className="text-[10px] leading-none text-dim">▾</span>
          </button>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold tracking-[0.1em] text-dim">
            {mode === "spotlight" ? "SPOTLIGHT" : "KING OF THE HILL"}
          </span>
          <RowStatus>
            {mode === "spotlight" ? (
              <b className="text-text-hi">1 film</b>
            ) : (
              <>
                <b className="text-text-hi">{placed}</b> placed · {toGo} to go
              </>
            )}
          </RowStatus>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.round((placed / Math.max(placed + toGo, 1)) * 100)}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── The climb: contender vs the film above, both UN-RNKD ───────────────────
function Duel({
  contender,
  challenger,
  pile,
  confirmed,
  films,
  tier,
  onPick,
  onDraw,
  onDone,
  onUndo,
  canUndo,
  onFlick,
  onSink,
  onScrub,
  onInfo,
  stripOpen,
  onToggleStrip,
  spotlight,
  inPlay,
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  confirmed: string[]; // locked shelf, index 0 = #1
  films: Film[];
  tier: Rating;
  spotlight?: boolean;
  onPick: (id: string) => void;
  onDraw: () => void;
  /** End the run — the same action as the nav's End session. */
  onDone: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onFlick: (id: string) => void;
  onSink: (id: string) => void;
  onScrub: (id: string) => void;
  onInfo: (film: Film) => void;
  stripOpen: boolean;
  onToggleStrip: () => void;
  inPlay?: Set<string> | null;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  // Newest first, capped at two — the one before last is context, anything older
  // is clutter.
  const [results, setResults] = useState<{ won: string; lost: string; at: number; drew?: boolean }[]>([]);

  // The controls are revealed by answering, not by arriving — and once revealed
  // they stay for the rest of the run.
  //
  // They used to time out after 2.5s and hand the slot back to the question,
  // which was wrong for the one control that matters most: Done is how you stop,
  // and you reach for it exactly when you have put the phone down and looked
  // away — the moment a timer has already taken it. A control that is present
  // only while you are mid-flow is missing whenever you actually want it.
  //
  // Sticky rather than always-on because arriving at a fresh duel with three
  // buttons under it puts a decision in front of you before you have made the
  // only one that matters. One tap teaches them, then they are furniture.
  const [played, setPlayed] = useState(false);

  // A draw has to leave the same trace a pick does. Without it the pair changes
  // under you while the recents line still reports the duel before — which reads
  // as the tap having missed.
  const declineToCall = () => {
    setResults((prev) =>
      [{ won: contender.title, lost: challenger.title, at: Date.now(), drew: true }, ...prev].slice(0, 2),
    );
    setPlayed(true);
    onDraw();
  };

  // Intercept a win by the right-hand card so it slides into the climbing seat
  // before the state swap paints. Picking the left card needs none of this — it
  // is already where it is going to be.
  const pick = (id: string) => {
    // Record the result before state moves on — the screen otherwise gives no
    // acknowledgement that a tap landed at all.
    const won = id === contender.id ? contender : challenger;
    const lost = id === contender.id ? challenger : contender;
    setResults((prev) => [{ won: won.title, lost: lost.title, at: Date.now() }, ...prev].slice(0, 2));
    setPlayed(true);

    const arena = arenaRef.current;
    const cards = arena?.querySelectorAll<HTMLElement>("button");
    const climbImg = cards?.[0]?.querySelector("img");
    const challImg = cards?.[1]?.querySelector("img");

    // Only in King of the Hill does a winning challenger become the climber, so
    // only there should it fly into the climbing seat. In a spotlight the
    // spotlit film stays put and simply stops here — showing its opponent take
    // its place would say the opposite of what happened.
    if (id === challenger.id && climbImg && challImg && !spotlight) {
      flyPosterAcross(challImg, climbImg, challenger.poster ?? "");
      setTimeout(() => onPick(id), 200); // commit mid-flight, under the clone
      return;
    }
    if (id === contender.id && challImg) {
      // The climber stays put; only the beaten challenger needs to leave.
      fadeLoserOut(challImg, challenger.poster ?? "");
      onPick(id); // commit at once so the replacement fades up underneath
      return;
    }
    onPick(id);
  };

  // Where a film currently stands in its tier. Locked films hold the top slots,
  // so the pile's own index picks up from the end of the confirmed shelf.
  const rankOf = (id: string) => {
    const i = pile.indexOf(id);
    return i < 0 ? null : confirmed.length + i + 1;
  };
  const total = confirmed.length + pile.length;

  // Low → high for the rolodex (bottom of pile first).
  const lowToHigh = useMemo(
    () => [...pile].reverse().map((id) => films.find((f) => f.id === id)!).filter(Boolean),
    [pile, films],
  );

  // Locked films sit above the whole pile, so they tail the strip. confirmed[0]
  // is #1, so reversing puts the weakest lock nearest the pile and #1 furthest.
  const locked = useMemo(
    () =>
      [...confirmed]
        .reverse()
        .map((id, j) => ({ film: films.find((f) => f.id === id)!, rank: confirmed.length - j }))
        .filter((x) => x.film),
    [confirmed, films],
  );

  return (
    <>
      {/* The tip stands down when the strip is up. Open, the strip takes ~110px
          and on a phone the rank numbers were landing on top of the hint — two
          things fighting for the same line, one of which is live game state and
          one of which is a rotating suggestion. The suggestion yields.

          It yields on the STRIP'S clock, not instantly. The first version simply
          unmounted, which is the same mistake the controls slot below already
          carries a comment about: the strip animates its height over 0.3s while
          an unmount lands in a single frame, so the column snapped up ~36px and
          then the drawer smoothed in behind it. One toggle, two clocks, and the
          jump reads as the tip's fault because the tip is what disappears.

          Collapsing 1fr → 0fr on the strip's own duration and easing means the
          height leaves at exactly the rate the strip claims it, and the fade
          runs ahead so no text is caught mid-squeeze. */}
      <div
        aria-hidden={stripOpen}
        className="grid"
        style={{
          gridTemplateRows: stripOpen ? "0fr" : "1fr",
          transition: "grid-template-rows 0.3s var(--ease)",
        }}
      >
        <div className="overflow-hidden">
          <div
            className="mt-3 flex flex-col items-center"
            style={{ opacity: stripOpen ? 0 : 1, transition: "opacity 0.18s var(--ease)" }}
          >
            <Tips />
          </div>
        </div>
      </div>

      {/* The question belongs to the duel, so it lives inside the arena and
          travels with the posters. Left outside it, folding the strip away
          stranded it in the middle of the freed space. */}
      {/* min-h-0 is load-bearing: a flex child defaults to min-height:auto, so
          without it the arena refuses to shrink below the posters' natural size.
          Opening the strip then pushed the whole column past the bottom of the
          h-dvh main and the nav was clipped off the screen — it was never the
          nav shrinking, it was this refusing to. */}
      <div ref={arenaRef} className="flex min-h-0 flex-1 flex-col px-4">
        {/* A fixed gap above the posters, and every flexible space below them.
            Centring them in the arena meant folding the strip away resized the
            arena and shifted the posters with it; anchoring them here means the
            freed height all lands underneath and they never move. Sized to sit
            them where centring used to, and allowed to shrink so a short screen
            reclaims it rather than overflowing. */}
        {/* The gap above the posters, carrying each film's current standing.
            Shrinks far more eagerly than the posters do (weighting is factor ×
            size, so 12 against the row's 1 means this gap gives up roughly four
            times as much height). Opening the drawer therefore tightens this
            space instead of resizing the artwork. */}
        <div
          className="flex min-h-0 items-center justify-center overflow-hidden"
          style={{ height: 110, flexShrink: 12 }}
        >
          <RankFace from={rankOf(contender.id)} to={rankOf(challenger.id)} total={total} />
        </div>
        {/* A definite height the cards can fill, and one that yields under
            pressure. 356px = the original 270px poster plus the two-line title
            box above it, so a full-height phone looks exactly as it did; flex
            shrink hands the space back on anything shorter. */}
        <div
          className="relative flex items-stretch justify-center gap-3"
          style={{ height: 356, flexShrink: 1, minHeight: 0 }}
        >
        <PosterCard film={contender} badge="CLIMBING" pick onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        <PosterCard film={challenger} badge="UN-RNKD" onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        </div>
        {/* Stays in the layout flow so it can never overlap anything at any
            screen height. It only needs to look right with the strip folded
            away, so rather than pinning it, the fade-in simply WAITS for the
            drawer to finish moving — invisible while the layout shifts, so it
            never appears to slide. Fading out has no delay. */}
        <div style={{ flexGrow: 1.6 }} />
        {/* Two rows, each owning its own line, rather than one slot cycling
            through three things.

            The slot used to alternate: the question, then the controls, then the
            last result. Which meant the feed — the only running account of what
            you have actually done — appeared in the gaps between the other two
            and was gone again before it read as anything. Three tenants, one
            line, and the one with no fixed home is the one that gets lost.

            So the feed keeps the line under the posters permanently, and the
            controls take a line of their own beneath it. That costs the arena
            ~34px, which is the space the on-demand version was built to reclaim
            — spent back deliberately, because a Done you cannot see when you
            have stopped playing is not a Done.

            Both rows stay in the layout whether or not they are visible.
            Unmounting either saved height and cost a jump: the mount lands in
            one frame while the drawer is still animating, and the posters dip
            and spring back. Toggling the strip must change exactly one thing:
            the strip. */}
        <div
          aria-hidden={stripOpen}
          className="flex flex-shrink-0 flex-col items-center"
          style={{
            opacity: stripOpen ? 0 : 1,
            transition: "opacity 0.25s var(--ease)",
            transitionDelay: stripOpen ? "0s" : "0.3s",
          }}
        >
          <div className="pointer-events-none">
            <LastResult results={results} />
          </div>
          {/* Undo sits between the two it mediates: it takes back the answer
              Draw would give and Done would end on. Disabled rather than absent
              once there is nothing to take back, so the row never changes width
              under your thumb. */}
          <div
            className="flex items-center gap-2 px-6 pb-6 pt-2"
            style={{
              opacity: played ? 1 : 0,
              pointerEvents: played ? "auto" : "none",
              transition: "opacity 0.25s var(--ease)",
            }}
          >
            <button
              onClick={declineToCall}
              className="rounded-full border border-border px-4 py-1.5 text-[11px] font-bold tracking-wide text-dim active:scale-95"
            >
              Draw
            </button>
            <button
              onClick={() => {
                // The feed is this component's own memory of the run, so the
                // parent's undo cannot reach it. Left alone it would keep
                // reporting a duel that has just been taken back — the one
                // thing on screen still insisting it happened.
                setResults((r) => r.slice(1));
                onUndo();
              }}
              disabled={!canUndo}
              className="rounded-full border border-border px-4 py-1.5 text-[11px] font-bold tracking-wide text-dim active:scale-95 disabled:opacity-35 disabled:active:scale-100"
            >
              Undo
            </button>
            <button
              onClick={onDone}
              className="rounded-full border border-border px-4 py-1.5 text-[11px] font-bold tracking-wide text-dim active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
        <div style={{ flexGrow: 1 }} />
      </div>

      <Rolodex
        lowToHigh={lowToHigh}
        locked={locked}
        tier={tier}
        contenderId={contender.id}
        challengerId={challenger.id}
        onScrub={onScrub}
        open={stripOpen}
        onToggle={onToggleStrip}
        inPlay={inPlay}
      />
    </>
  );
}

// Every mechanic the duel screen understands, cycled one at a time — the screen
// carries no chrome explaining itself, so this is where the game gets taught.
const TIPS = [
  // "Tap the one you like more" is gone — the question under the posters now
  // says that, and a tip repeating it wastes a turn of the cycle.
  "Whichever film wins keeps climbing",
  "Can't separate two? Say so — it counts",
  "Flick a film up to send it straight to the top",
  "Flick a film down to send it to the bottom",
  "Hold a film to see who's in it and what it's about",
  "Swipe the row below to choose who you face next",
  "Pull the handle down to hide the row",
  "Nothing's saved until you lock a film into place",
];
const STRIP_KEY = "rankd-strip-open";

const TIP_MS = 9500; // dwell
const TIP_FADE_MS = 550; // matches the .tip opacity transition

function Tips() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    // Fade the old tip out, swap the text while it's invisible, fade back in —
    // a crossfade rather than a cut. Opacity lives in CSS so the shine keeps
    // running underneath instead of restarting on every change.
    const cycle = setInterval(() => {
      setShown(false);
      setTimeout(() => {
        setI((n) => (n + 1) % TIPS.length);
        setShown(true);
      }, TIP_FADE_MS);
    }, TIP_MS);
    return () => clearInterval(cycle);
  }, []);

  return (
    <span className="tip px-6 text-center text-[11px] leading-snug" style={{ opacity: shown ? 1 : 0 }}>
      {TIPS[i]}
    </span>
  );
}

// The stake of the duel, stated as a move: the place the climber holds now and
// the place it takes by winning. Centred in its own space rather than tagged to
// the posters, because it belongs to the match, not to either film.
//
// No VS mark — that was cut from the prototype and isn't coming back. The arrow
// carries the same meaning and says which way the climb runs.
function RankFace({ from, to, total }: { from: number | null; to: number | null; total: number }) {
  if (from === null || to === null) return null;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-4">
        <Hairline />
        {/* Both numbers the same size so the arrow sits dead centre and the
            group balances — the gold is what says which one is climbing, not
            the scale. Keyed on its own value so it re-plays the lift each time
            the climber takes a place. */}
        {/* Equal width on both sides, or the arrow drifts. `140 → 9` puts three
            digits of mass on the left and one on the right, so a plain centred
            row centres the GROUP while the arrow sits well off the screen's
            middle. Fixed width plus tabular-nums pins it regardless of how many
            digits each side happens to have. */}
        <span
          key={from}
          className="rank-pop min-w-[3ch] text-right font-display text-[32px] leading-none tracking-wide text-gold tabular-nums"
          style={{ textShadow: "0 2px 16px color-mix(in srgb, var(--gold) 50%, transparent)" }}
        >
          {from}
        </span>
        {/* Points the way the pile is climbed — up the order, toward #1. */}
        <ClimbArrow />
        <span className="min-w-[3ch] text-left font-display text-[32px] leading-none tracking-wide text-text/45 tabular-nums">
          {to}
        </span>
        <Hairline flip />
      </div>
      {/* Underneath and centred, so it can't pull the numbers off true. */}
      <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-dim">
        of {total}
      </span>
    </div>
  );
}

// Exported for ShuffleDuel, which needs the poster interaction exactly as it is
// but none of the pile machinery around it. (DuelScreen is due a split — see the
// plan's Phase 3 — at which point this and LastResult get their own file.)
// ── The confirm moment: the champion tops the pile, take a real number ─────
function ConfirmView({
  champion,
  rank,
  onConfirm,
  onBack,
  spotlight,
  promoteTo,
  onTakeOn,
  onAssertPromotion,
  justPromoted,
}: {
  champion: Film;
  rank: number;
  onConfirm: () => void;
  onBack?: () => void;
  spotlight?: boolean;
  promoteTo?: Rating;
  onTakeOn?: () => void;
  onAssertPromotion?: () => void;
  justPromoted?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.14em] text-gold">
        {justPromoted
          ? `⭐ EARNED ${starsFor(champion.rating)}`
          : spotlight && rank > 1
            ? "🎯 FOUND ITS PLACE"
            : "🏆 TOPS THE PILE"}
      </span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--gold), 0 12px 36px color-mix(in srgb, var(--gold) 45%, transparent)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        {justPromoted ? (
          <div className="mt-1 text-base text-gold">{starsFor(champion.rating)}</div>
        ) : (
          <div className="mt-1 font-serif text-5xl font-bold text-gold">#{rank}</div>
        )}
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sm font-extrabold tracking-wide active:scale-95"
        style={{ color: "#1c1405", background: "var(--gold)", boxShadow: "0 4px 20px color-mix(in srgb, var(--gold) 40%, transparent)" }}
      >
        {justPromoted
          ? `Lock in at ${starsFor(champion.rating)}`
          : spotlight
            ? `Lock in at #${rank}`
            : `Lock in as #${rank}`}
      </button>

      {/* Topping a tier in Spotlight is the one moment a star rating can change:
          earn it against the tier above, or assert it outright. */}
      {promoteTo !== undefined && !justPromoted && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onTakeOn}
            className="rounded-full border px-6 py-2.5 text-xs font-bold tracking-wide active:scale-95"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            Take on {starsFor(promoteTo)}
          </button>
          <button onClick={onAssertPromotion} className="text-[11px] font-semibold text-dim active:scale-95">
            or move it up without dueling
          </button>
        </div>
      )}

      {onBack && !justPromoted && (
        <button onClick={onBack} className="-mt-1 text-xs font-semibold text-dim active:scale-95">
          Not yet — keep playing
        </button>
      )}
    </div>
  );
}

function TierComplete({
  films,
  tier,
  onPickTier,
  onList,
}: {
  films: Film[];
  tier: Rating;
  onPickTier: () => void;
  onList: () => void;
}) {
  const inTier = films.filter((f) => f.rating === tier);
  const ranked = inTier.filter(isPlaced).sort((a, b) => b.score - a.score);
  const duels = inTier.reduce((n, f) => n + (f.duels ?? 0), 0);
  // This screen is reached two ways — the tier ran out of films, or you pressed
  // Done — and it used to say the same thing either way. Stopping after two
  // duels was congratulated with "Every film in this tier has found its spot"
  // above a count of zero, which is both false and, at the exact moment you
  // chose to stop, faintly insulting. The distinction costs one subtraction.
  const left = inTier.length - ranked.length;
  const finished = left === 0 && ranked.length > 0;
  return (
    <SessionEnd
      title={finished ? `${starsFor(tier)} ranked` : "Session done"}
      blurb={
        finished
          ? "Every film in this tier has found its spot."
          : "Every answer is kept. Pick this tier back up whenever you like."
      }
      films={ranked}
      stats={[
        { label: "placed", value: String(ranked.length) },
        ...(left > 0 ? [{ label: "still to place", value: String(left) }] : []),
        ...(duels > 0 ? [{ label: "duels", value: String(duels) }] : []),
      ]}
      onList={onList}
      onAgain={onPickTier}
      againLabel={finished ? "Rank another tier" : "Keep ranking"}
    />
  );
}

// ── Rolodex — the unconfirmed pile, contender pinned as a gold YOU marker ──
