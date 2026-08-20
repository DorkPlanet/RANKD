"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveFilms } from "@/lib/store";
import { markDirty } from "@/lib/syncState";
import {
  startRun,
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
} from "@/lib/ladder";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import { backfillPosters, withMeta, needsMeta } from "@/lib/meta";
import { appendJudgements, loadLog, retractJudgements, type Judgement } from "@/lib/log";
import { poolFor } from "@/lib/matchmaker";
import { isPlaced } from "@/lib/lock";
import ShuffleDuel, { type ShuffleOptions } from "./ShuffleDuel";
import { PosterCard, fadeLoserOut, flyPosterAcross } from "./PosterCard";
import { Rolodex } from "./Rolodex";
import { SessionEnd } from "./SessionEnd";
import { RunSummary } from "./RunSummary";
import RoughCut from "./RoughCut";
import { bandsOf, BUCKETS, roughCutPool, type Bucket } from "@/lib/roughCut";
import { loadRoughCut } from "@/lib/roughCutRun";
import { cardDataFromFilms } from "@/lib/card/data";
import { CardPicker } from "./CardPicker";
import { ImportGuide } from "./ImportGuide";
import { ImportButton } from "./ui";
import { RunStatus } from "./RunStatus";
import ResumeOverlay from "./ResumeOverlay";
import { clearRun, saveRun } from "@/lib/runs";
import {
  BackRow,
  RangeSlider,
  ScopeTab,
  SCRIM_ARM_MS,
  Sheet,
  SHEET_EXIT_MS,
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
  AddFilmIcon,
  TrophyIcon,
} from "./Icons";
import { BARS } from "@/lib/brand";
import { type Person } from "@/lib/people";
import { subjectTitle, type RankSubject } from "@/lib/subject";
import { MIN_GENRE_RUN } from "@/lib/genres";
import { pileFor, type RunRequest } from "@/lib/curated";

/** Stable, so `guests` is not a fresh array every render. */
const EMPTY_GUESTS: readonly Film[] = [];
/** Two films is the floor for a climb: one has nothing to be ranked against. */
const MIN_CURATED_RUN = 2;
import { CuratedPicker } from "./CuratedPicker";
import type { Film, RankState } from "@/lib/types";

const DEFAULT_TIER = 4 as const;

// Which game the setup panel is configuring; null while it is still asking.
type ChosenMode = "koth" | "shuffle" | "roughcut" | null;

// The library and the app-wide chrome now live in AppShell — this screen owns
// only the duel. Everything it still holds is setup state for the next run.
export default function DuelScreen({
  state,
  setState,
  onInfo,
  onSettings,
  onList,
  onProfile,
  onTrophies,
  logging,
  onToggleLog,
  onImportFile,
  runRequest,
  onRunRequestHandled,
  onRunBegan,
  onRoughCutBegan,
  onPerson,
  greet = 0,
}: {
  state: RankState | null;
  setState: React.Dispatch<React.SetStateAction<RankState | null>>;
  onInfo: (film: Film) => void;
  onSettings: () => void;
  onList: () => void;
  onProfile: () => void;
  onTrophies: () => void;
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
  /** A picked ratings file, from the empty screen own import control. */
  onImportFile?: (file: File) => void;
  /** A run just started, so the duel's posters and strip are about to exist. */
  onRunBegan?: () => void;
  /** Same contract as onRunBegan, for the mode that has no session. */
  onRoughCutBegan?: () => void;
  /**
   * A curated run somebody asked for — a director, an actor, a genre.
   *
   * ONE prop, where there were three (`personRun`, `personGuests`,
   * `personPortrait`) plus a fourth path for genre that bypassed them entirely.
   * Two pending requests are now unrepresentable rather than merely unlikely.
   * See `lib/curated.ts`.
   */
  runRequest?: RunRequest | null;
  onRunRequestHandled?: () => void;
  /** Open a filmography from the curated picker. */
  onPerson?: (person: Person) => void;
  /**
   * Bumped every time the user ARRIVES at this screen from another tab.
   *
   * A counter rather than a boolean, because arriving twice has to greet you
   * twice and a boolean already true is indistinguishable from one nobody reset.
   */
  greet?: number;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  // Playing the Play sheet's exit before it unmounts, when the nav closes it.
  const [modeClosing, setModeClosing] = useState(false);
  const modeOpenedAt = useRef(0);
  // The tier of the run that just ended, held so `TierComplete` can be about it.
  // `endRun` nulls the session, so without this the summary has no idea which
  // tier it is summarising. Cleared on the way back to `RunStart`.
  const [endedTier, setEndedTier] = useState<Rating | null>(null);
  // Which films the run that just ended actually worked through. `endRun` nulls
  // the session and takes the pile with it, exactly as it takes the tier — so
  // this is remembered for the same reason `endedTier` is, and at the same
  // moment. Null means the whole tier.
  const [endedIds, setEndedIds] = useState<string[] | null>(null);
  const [tierOpen, setTierOpen] = useState(false);
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

  // The evidence log, for the two library-wide progress bars.
  //
  // Kept in state and appended to locally rather than re-read after every duel:
  // the bars must move on the tap that moved them, and a re-read would be a
  // storage round trip per judgement to learn something this screen already
  // knows — it is the thing that just wrote it.
  const [log, setLog] = useState<Judgement[]>([]);
  useEffect(() => {
    void loadLog().then(setLog);
  }, []);

  // ── The greeting ───────────────────────────────────────────────────────────
  //
  // `greet` counts arrivals at this screen from elsewhere; AppShell bumps it.
  // Comparing it against the last one dismissed is a DERIVED flag rather than an
  // effect that mirrors a prop into state, which would be the cascading render
  // the linter objects to — and would also fight the counter every time.
  // Starts at 0, and AppShell passes 0 while the splash is still up, so the two
  // layers can never stack. A greeting under an opening animation is a dialog
  // nobody asked for arriving before the app has finished saying hello.
  const [dismissedGreet, setDismissedGreet] = useState(0);
  const greeting = greet > dismissedGreet;
  const dismissGreeting = () => setDismissedGreet(greet);
  // Where the tier picker was opened from, which decides what picking one means.
  // A ref rather than state: nothing renders differently because of it, and it
  // is read inside the handler that consumes it rather than during a render.
  const fromOverlay = useRef(false);

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
      // In `SYNC_KEYS`, so it marks — same reasoning as brightness and prefs.
      markDirty();
      return !v;
    });
  // Fast Shuffle is now the only thing that takes this screen over. A person run
  // used to arrive here as a shuffle scope — which asked the right films the
  // right questions and then had nowhere to put the answer, because a shuffle
  // has no pile, no order and no end. It is a climb now; see `personRun` below.
  const activeRun: ShuffleOptions | null = shuffleRun;

  // What the run on screen is about, when it isn't a tier.
  //
  // A request that arrived as a PROP is read straight back off it — it stays
  // "handed over" until its summary is dismissed, so mirroring it into local
  // state would be a second copy of one fact plus a setState inside an effect,
  // which is the cascading render the linter is right to object to.
  //
  // A run started from INSIDE this screen (the Curator's genre option) has no
  // prop to read, so it keeps its subject here. The two can no longer disagree:
  // `startCurated` clears the prop request on its way in, and there is only one
  // of it now rather than three.
  const [localSubject, setLocalSubject] = useState<RankSubject | null>(null);
  const [curatedOpen, setCuratedOpen] = useState(false);
  // A Rough Cut pass owns the whole surface while it runs, like Fast Shuffle:
  // it has no pile, no climb and no confirm, so none of the duel branches apply.
  const [roughCutTier, setRoughCutTier] = useState<Rating | null>(null);
  // The reach the pass was started with. Held separately from the setup panel's
  // `below`/`above`, which keep changing as the panel is reopened — a running
  // pass must not silently re-scope itself underneath the reader.
  const [roughCutRange, setRoughCutRange] = useState<{ below: number; above: number }>({
    below: 0,
    above: 0,
  });

  const runSubject: RankSubject | null = runRequest?.subject ?? localSubject;
  // Borrowed films, if this run has any. Read off the request rather than held
  // separately — a guest list with no run to belong to was one of the three
  // props this collapse removed.
  const guests = runRequest?.guests ?? EMPTY_GUESTS;
  // A finished cross-tier order, waiting to be kept or exported. This is the one
  // result the app cannot recover once it is gone: it lives in no film's score
  // and in no tier, so the summary holds it until the user decides.
  const [runResult, setRunResult] = useState<{
    subject: RankSubject;
    films: Film[];
    complete: boolean;
  } | null>(null);

  // A curated pile, handed over to be ranked against itself — as a KING OF THE
  // HILL climb, cross-tier, over an explicit `only` list.
  //
  // Three things make it different from every other run, and all three are the
  // reason it needed `only` and `crossTier` in ladder.ts:
  //   · the pile is a person's work or a genre, which is not a tier and cannot
  //     be selected by one;
  //   · it starts in BELIEF order, the only ordering in the app that spans star
  //     ratings, so the climb begins from the best guess rather than from stars;
  //   · confirming writes no score and no lock, so ranking Mann against Mann
  //     cannot quietly rewrite your main list.
  // Borrowed films are merged in by `pileFor` and never leave: `saveFilms`
  // strips them.
  //
  // The pile-building moved to `lib/curated.ts` so this effect and `beginGenre`
  // stopped being two implementations of the same three steps.
  useEffect(() => {
    if (!runRequest) return;
    const request = runRequest;
    setState((s) => {
      if (!s) return s;
      const { all, order } = pileFor(s.films, request, log);
      if (order.length < MIN_CURATED_RUN) return s; // nothing to duel — leave the run alone
      try {
        return {
          ...startRun(all, order[0].rating, {
            only: order.map((f) => f.id),
            crossTier: true,
          }),
          journal: s.journal,
        };
      } catch {
        return s;
      }
    });
    // Deliberately NOT handing the request back here. The run needs to know
    // what these films are for as long as it is on screen — including the
    // summary at the end, which is the only place the answer exists. It is
    // released when that summary is dismissed.
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRequest]);

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

  // ── The same artwork fetch, for Rough Cut ─────────────────────────────────
  //
  // The effect above is gated on `state.session`, and Rough Cut deliberately has
  // no session — it has no pile, no climb and no confirm. So it was the one mode
  // in the app with NO artwork fetch of its own, left waiting on the credits
  // sweep, which walks the whole library at one film per 400ms. On a library
  // that has not been swept yet that means every card is a placeholder, on the
  // single screen most exposed to it: it shows one film at a time and asks you
  // to judge it.
  //
  // Widening the range made it obvious rather than causing it — a range reaches
  // into tiers the sweep is even less likely to have reached.
  //
  // Fetched in queue order, which is the order they will be seen, for the same
  // reason the duel's version sorts by when-seen.
  const rcKey = roughCutTier === null ? "" : `${roughCutTier} ${roughCutRange.below} ${roughCutRange.above}`;
  useEffect(() => {
    if (roughCutTier === null || !state) return;
    const need = roughCutPool(
      state.films,
      roughCutTier,
      roughCutRange.below,
      roughCutRange.above,
    ).filter(needsMeta);
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
  }, [rcKey]);

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
    // ── Catching the end of a run wherever it happens ────────────────────────
    //
    // A run ends two ways: you press Done, or `confirm` empties the pile and
    // returns a null session on its own. Both drop the tier on the floor, and
    // `TierComplete` needs it to be about anything. Noticing the transition here
    // rather than at each call site means the natural completion — the case that
    // most deserves a summary — cannot be the one that forgets.
    //
    // Cross-tier runs are excluded: they have `RunSummary`, which holds an order
    // that exists nowhere else and must not be pre-empted by a tier report.
    if (state.session && !next.session && !state.session.crossTier) {
      setEndedTier(state.session.tier);
      // The whole pile, settled and unsettled — `confirmed` alone would drop
      // everything the run never reached, and "still to place" is precisely a
      // count of those.
      setEndedIds([...state.session.confirmed, ...state.session.unconfirmed]);
    }
    // A new run supersedes any summary still standing, and answers the greeting:
    // starting something IS the choice it was asking for, whichever sheet it was
    // started from. Doing it here rather than at each entry point means a mode
    // added later cannot leave the overlay hanging over its own run.
    if (next.session) {
      setEndedTier(null);
      setEndedIds(null);
      setDismissedGreet(greet);
    }

    // Keep the climb across closing the app. One call, on the single path every
    // change to a session goes through, so no future transition can forget to
    // save one — and `saveRun` CLEARS for anything it cannot resume, so ending a
    // run or starting a curated one cannot leave a stale climb behind to be
    // offered later. See lib/runs.ts for why tier climbs only.
    saveRun(next.session);
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
    // The bars read from this, so it has to move on the same tap the duel did.
    setLog((l) => [...l, ...next.journal]);
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
    const step = { state, judgements: next.journal.map((j) => j.id) };
    // Set AFTER committing, not before. `commit` reads an empty journal as "no
    // judgement happened — this was a confirm or a flick" and drops the undo
    // step, which was true until a cross-tier run started answering duels
    // without logging them. A person run would otherwise have lost undo
    // entirely: every duel would arrive here with nothing to drain and clear the
    // step it had just set. The pile still moved, so there is still something to
    // take back; the retraction list is simply empty.
    commit(next);
    setUndo(step);
  };
  const undo = () => {
    if (!undoStep) return;
    // Retract before restoring, so a mis-tap leaves nothing behind in either
    // place. The placement and the evidence for it move together or the list
    // and the model disagree about a duel that never happened.
    void retractJudgements(undoStep.judgements);
    const dropped = new Set(undoStep.judgements);
    setLog((l) => l.filter((j) => !dropped.has(j.id)));
    saveFilms(undoStep.state.films);
    setState(undoStep.state);
    setUndo(null);
  };

  // A duel result is written straight away. Placements still only commit on
  // confirm — what's saved here is the record that the comparison happened,
  // which is the one thing an abandoned run should still leave behind.
  const decide = (winnerId: string) => commitUndoable(choose(state, winnerId));
  // Same shape as a decision, because that is what it is — a recorded answer of
  // "neither". The climb steps the contender in below the challenger.
  const declineToCall = () => commitUndoable(skipPair(state));
  // Assertions, not judgements: they reorder the pile and record nothing, so
  // there is never a journal to drain and nothing to persist until a confirm.
  const flick = (filmId: string) => commit(flickToTop(state, filmId), false);
  const sink = (filmId: string) => commit(flickToBottom(state, filmId), false);
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  // The films behind an id list, in that order. Read from the run's own films
  // rather than the library, because a person run's pile can hold borrowed ones
  // the library has never heard of.
  const filmsOf = (ids: string[]): Film[] =>
    ids.map((id) => state.films.find((f) => f.id === id)).filter((f): f is Film => !!f);

  // Catch a cross-tier order on its way out of existence.
  //
  // `confirm` returns a null session once the pile empties, and for a cross-tier
  // run that session was the ONLY place the order lived — nothing was written to
  // any film. So it is captured at the moment of the last confirm, when
  // `confirmed` holds everything already placed and the contender is the film
  // about to join them.
  const endCrossTier = (order: string[], complete: boolean) => {
    if (!runSubject) return;
    setRunResult({ subject: runSubject, films: filmsOf(order), complete });
  };

  // Borrowed films go home when the run that borrowed them ends. `saveFilms`
  // already stops them being written, but they would otherwise sit in the live
  // library that the list, the profile and the trophies all read from — visible
  // everywhere, saved nowhere, which is the worst of both. The summary holds its
  // own copy of them, so the picture and the saved list keep every film.
  const dropGuests = (st: RankState): RankState =>
    st.films.some((f) => f.guest) ? { ...st, films: st.films.filter((f) => !f.guest) } : st;

  const lockIn = () => {
    // Winning the promotion duels banks a new star rating instead of a position.
    const next = promotionWon(state) ? completePromotion(state) : confirm(state);
    if (session?.crossTier && !next.session) {
      endCrossTier([...session.confirmed, session.contenderId], true);
      commit(dropGuests(next));
      return;
    }
    commit(next);
  };
  const backOut = () => commit(stepBackFromConfirm(state), false);

  // Returns whether a run actually started, so the setup panel can stay open and
  // say why instead of dropping you on a "tier complete" screen that was really
  // "your range holds fewer than two films".
  const beginRun = (tier: Rating, films = state.films): boolean => {
    // startRun builds a state from films alone, so any duels not yet drained to
    // the log are carried across by hand rather than dropped.
    try {
      commit({ ...startRun(films, tier, { shuffle, below, above }), journal: state.journal }, false);
      onRunBegan?.();
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
    setModeClosing(false);
    setChosenMode(null);
    setPickedTier(null);
  };

  // RNK opens the Play sheet and RNK closes it. Ghost-click guarded — see
  // `toggleLog` in `BottomNav` for what that is and why the window is 400ms.
  const toggleModes = () => {
    if (modeOpen) {
      if (modeClosing || Date.now() - modeOpenedAt.current < SCRIM_ARM_MS) return;
      setModeClosing(true);
      setTimeout(closeSetup, SHEET_EXIT_MS);
      return;
    }
    modeOpenedAt.current = Date.now();
    setModeOpen(true);
  };

  // ── Done ───────────────────────────────────────────────────────────────────
  //
  // Stopping a climb lands you back on the empty screen, not on a report.
  //
  // `TierComplete` still exists and is still the right answer when a run ENDS BY
  // ITSELF — the pile empties, the tier is finished, and the acknowledgement is
  // earned. It was wrong for Done. Pressing Done is not finishing a tier, it is
  // deciding to stop, and the app answering that with a summary of what you
  // achieved is congratulating you on the thing you just chose to walk away
  // from. It also stood between you and the one screen you actually wanted,
  // which is the one that lets you start something else.
  //
  // So the two endings are told apart HERE rather than in `commit`. `commit`
  // still records the tier — it cannot know which kind of ending this is, and
  // the natural completion path depends on it doing so — and this clears it
  // immediately afterwards. Batched inside one handler, so the clear wins and
  // the summary never renders for a frame. Same mechanism, and for the same
  // reason, as `onAbandon` on the resume overlay.
  const endRun = () => {
    // "One climbing till I decide what's at the top" — so stopping is a real
    // ending here, not an abandonment. The pile as it stands IS the answer: the
    // films you settled are above the ones you haven't got to, which is exactly
    // what the order means. It just says so on the summary.
    if (session?.crossTier) {
      endCrossTier([...session.confirmed, ...session.unconfirmed], false);
      commit(dropGuests({ ...state, session: null }), false);
      return;
    }
    commit({ ...state, session: null }, false);
    setEndedTier(null);
    setEndedIds(null);
  };

  // Run the same pile again, starting from the order you just settled on rather
  // than from scratch — a second pass is for refining an answer, not discarding
  // it. The borrowed films come back with it: they are held on the result, which
  // is the only place they still exist once the run let them go.
  const rankAgain = () => {
    const r = runResult;
    if (!r || r.films.length < 2) return;
    setState((s) => {
      if (!s) return s;
      const guests = r.films.filter((f) => f.guest);
      const all = guests.length ? [...s.films, ...guests] : s.films;
      try {
        return {
          ...startRun(all, r.films[0].rating, { only: r.films.map((f) => f.id), crossTier: true }),
          journal: s.journal,
        };
      } catch {
        return s;
      }
    });
    setRunResult(null);
  };

  // A genre climb. The same engine as a person run — an explicit pile, cross-tier,
  // recording nothing — and started here rather than through a prop because
  // nothing outside this screen needs to know it happened.
  //
  // Highest-belief first, then truncated. That ordering is what makes a shortened
  // genre worth playing: "the top 25 dramas I own" is a list; the first 25 in
  // library order would be an arbitrary slice.
  const beginGenre = (genre: string, limit: number) => {
    setCuratedOpen(false);
    const request: RunRequest = { subject: { kind: "genre", name: genre }, limit };
    const { all, order } = pileFor(state.films, request, log);
    if (order.length < MIN_GENRE_RUN) return;
    setLocalSubject(request.subject);
    setRunResult(null);
    // A run started here supersedes any request still held by the shell. Stated
    // rather than relied on: `runSubject` prefers the prop, so leaving a stale
    // one behind would put a director's name over a genre's climb.
    onRunRequestHandled?.();
    try {
      commit(
        {
          ...startRun(all, order[0].rating, { only: order.map((f) => f.id), crossTier: true }),
          journal: state.journal,
        },
        false,
      );
    } catch {
      setLocalSubject(null);
    }
  };

  const promoteTo = promotionTarget(state);
  const takeOnTierAbove = () => commit(startPromotionDuel(state), false);
  const assertPromotion = () => commit(promoteDirect(state));

  // Rough Cut takes the whole surface, like Fast Shuffle: it has no pile, no
  // climb and no confirm, so none of the branches below apply to it. Placed
  // after every hook so the early return cannot change the hook order.
  if (roughCutTier !== null) {
    return (
      <RoughCut
        films={state.films}
        tier={roughCutTier}
        below={roughCutRange.below}
        above={roughCutRange.above}
        onFilms={(films) => {
          saveFilms(films);
          setState((s) => (s ? { ...s, films } : s));
        }}
        onExit={() => setRoughCutTier(null)}
        // Climb just the pile that was cut, not the whole tier again. `only`
        // takes an arbitrary set of ids and is independent of `crossTier`, so
        // this is an ordinary run that writes scores and locks — it simply has a
        // smaller pool. The films come in from Rough Cut rather than being read
        // from `state`, because its own write has not landed yet.
        onRankPile={(films, ids) => {
          saveFilms(films);
          setRoughCutTier(null);
          try {
            commit({ ...startRun(films, roughCutTier, { only: ids }), journal: state.journal }, false);
          } catch {
            // Fewer than two films left in the pile — nothing to climb. The cut
            // itself is already saved, so this is a no-op rather than a loss.
            setState((s) => (s ? { ...s, films } : s));
          }
        }}
        onSettings={onSettings}
        onTrophies={onTrophies}
        logging={logging}
        onToggleLog={onToggleLog}
        onBegan={onRoughCutBegan}
        onInfo={onInfo}
        // Rough Cut now draws the nav, so its cells have to actually go
        // somewhere. Clearing the tier first drops this branch, which puts the
        // next render back on a tree that renders `sheets` — so opening Play
        // from here raises the panel over the screen you land on rather than
        // setting a flag nothing reads. See the warning above `sheets`.
        onNavigate={(to) => {
          setRoughCutTier(null);
          if (to === "list") onList();
          else if (to === "profile") onProfile();
          else setModeOpen(true);
        }}
      />
    );
  }

  // A run that has just ended still owns the surface: `TierComplete` is the
  // acknowledgement that a sitting amounted to something, and skipping straight
  // past it to "what's left" is the app changing the subject.
  //
  // `endedTier` exists because `endRun` nulls the session, taking the tier with
  // it. This screen used to read `session?.tier ?? DEFAULT_TIER` at exactly the
  // moment session was null, so finishing a half-star climb showed FOUR-STAR's
  // films, count and duels under "Session done". Remembering the tier is what
  // makes the summary about the run you actually just played.
  // Defined once and rendered by EVERY branch. Mounted only at the foot of the
  // main return, any early return above silently killed them — "Something else"
  // set `modeOpen` and nothing read it. A new full-surface branch must render
  // `sheets` or its buttons do nothing.
  const sheets = (
    <>
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
          closing={modeClosing}
          onKoth={(t) => {
            setShuffleRun(null);
            if (beginRun(t)) closeSetup();
          }}
          onFastShuffle={(opts) => {
            setShuffleRun(opts);
            closeSetup();
          }}
          onCurated={() => {
            setShuffleRun(null);
            closeSetup();
            setCuratedOpen(true);
          }}
          onRankPile={(ids) => {
            setShuffleRun(null);
            closeSetup();
            try {
              commit({ ...startRun(state.films, setupTier, { only: ids }), journal: state.journal }, false);
            } catch {
              /* fewer than two films left in the pile */
            }
          }}
          onRoughCut={(t) => {
            setShuffleRun(null);
            // Frozen at the moment the pass starts, for the reason on the state.
            setRoughCutRange({ below, above });
            setRoughCutTier(t);
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
          // Only when the picker was opened FROM the Rough Cut setup, which is
          // exactly when the pile state answers the question being asked. The
          // overlay's "Pick a tier" and King of the Hill both land here too and
          // neither has piles to report.
          forRoughCut={chosenMode === "roughcut"}
          // Closing hands you back to whatever OPENED it. From the Play sheet
          // that is Play; from the overlay or the empty screen it is nothing at
          // all, because they are still underneath. Reopening Play regardless
          // meant dismissing the picker raised a second sheet you had to dismiss
          // as well.
          onClose={() => {
            setTierOpen(false);
            if (fromOverlay.current) fromOverlay.current = false;
            else setModeOpen(true);
          }}
          onPick={(t) => {
            // From the overlay a tier is a START, not a setting: you asked to
            // rank that tier, so ranking it is the answer. Reached from inside
            // the Play sheet it stays a setting and hands you back to the panel.
            if (fromOverlay.current) {
              fromOverlay.current = false;
              setTierOpen(false);
              dismissGreeting();
              beginRun(t);
              return;
            }
            setPickedTier(t);
            setBelow(0);
            setAbove(0);
            setTierOpen(false);
            setModeOpen(true);
          }}
        />
      )}
      {curatedOpen && (
        <CuratedPicker
          films={state.films}
          onClose={() => setCuratedOpen(false)}
          onPerson={(p) => {
            setCuratedOpen(false);
            onPerson?.(p);
          }}
          onGenre={beginGenre}
        />
      )}
    </>
  );

  // The greeting, when there is a climb waiting behind it. Rendered by both the
  // running branch and the empty one, so arriving always gets the same layer.
  const inTier = session ? state.films.filter((f) => f.rating === session.tier) : [];
  // A promotion attempt is excluded for the same reason `runs.ts` refuses to
  // store one: the offer to resume is about the climb, and the attempt is three
  // duels sitting on top of it.
  const resumable = session && !session.crossTier && !session.promotionQueue ? session : null;
  // Never over Fast Shuffle: `activeRun` gives ShuffleDuel the whole surface,
  // and that mode has no pile to come back to anyway.
  const overlay =
    greeting && resumable && !activeRun ? (
      <ResumeOverlay
        run={{
          tier: resumable.tier,
          placed: inTier.filter(isPlaced).length,
          total: inTier.length,
        }}
        onContinue={dismissGreeting}
        // The greeting is NOT dismissed here. The overlay sits below the sheets,
        // so it stays put while the picker opens over it and is still there when
        // the picker closes — nothing flashes, and closing lands you back where
        // you were rather than dropping you into the game.
        onTier={() => {
          fromOverlay.current = true;
          setTierOpen(true);
        }}
        // No `fromOverlay` here: that flag only governs what picking a TIER
        // means, and inside Play a tier is a setting. Closing Play simply
        // reveals this layer again, because it was never dismissed.
        onModes={toggleModes}
        onAbandon={() => {
          dismissGreeting();
          clearRun();
          commit({ ...state, session: null }, false);
          // Abandoning is not finishing. `commit` records the tier so a run that
          // ENDS gets its summary, but throwing one away should land on the
          // empty screen — a report congratulating you on work you just
          // discarded is the app not listening. Batched after, so this wins.
          setEndedTier(null);
          setEndedIds(null);
        }}
      />
    ) : null;

  // A finished run's summary. Skipped while greeting: arriving at RNK fresh and
  // being shown the report of a session you ended yesterday is not where you
  // are, it is where you were.
  if (endedTier !== null && !greeting) {
    return (
      <>
        <TierComplete
          films={state.films}
          tier={endedTier}
          runIds={endedIds ?? undefined}
          onPickTier={() => {
            setEndedTier(null);
            setEndedIds(null);
            setModeOpen(true);
          }}
          onList={onList}
          // Straight into the next pile. `commit` clears `endedTier` for us the
          // moment the new session exists, so this branch stands itself down.
          onRankPile={(ids) => {
            try {
              commit({ ...startRun(state.films, endedTier, { only: ids }), journal: state.journal }, false);
            } catch {
              /* fewer than two films left in the pile — the buttons already guard this */
            }
          }}
        />
        {sheets}
      </>
    );
  }

  // No run, and no finished cross-tier order still waiting to be read. Takes the
  // whole surface for the same reason Rough Cut does: it has no pile and no
  // duel, so the header, the status bar and every branch below are about a run
  // that does not exist. Rendering it inside that chrome drew two headers, one
  // of them reading "0 TO RANK" over a screen whose entire job is to say what
  // there is to rank.
  // Nothing running: chrome and a dark middle, because the choosing lives on a
  // LAYER over the game rather than in a page that replaces it. `overlay` is
  // what you actually see here.
  if (!session && !runResult) {
    const placedNow = state.films.filter(isPlaced).length;
    // ── The screen a brand-new user actually lands on ────────────────────────
    //
    // A new library is now EMPTY rather than pre-seeded, which makes this the
    // first screen anyone sees — and it was written for a library that had
    // films in it. A headline over "0 films" reads as a fault, and
    // the gold button under it offered to pick a tier when there are no tiers
    // to pick: a dead end presented as the primary action.
    //
    // With nothing to rank, the only useful thing this screen can do is say so
    // and point at the import.
    const empty = state.films.length === 0;
    return (
      <>
        <main className="relative flex h-app flex-col overflow-hidden select-none">
          <Header onSettings={onSettings} onTrophies={onTrophies} />
          {/* A real screen rather than a frosted card, because there is no game
              to frost: keeping the header and the nav means you can still see
              where you are and leave. The line sits in the middle and the
              choices sit low, within a thumb. */}
          <div className="flex min-h-0 flex-1 flex-col px-7">
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <p className="font-display text-[26px] leading-tight tracking-wide text-text-hi">
                  {empty ? "No films yet" : "Everyone has a favourite. What's yours?"}
                </p>
                {empty ? (
                  <>
                    <p className="mx-auto mt-2 max-w-[260px] text-[12px] leading-relaxed text-dim">
                      Bring your ratings over from Letterboxd and this becomes your list to
                      put in order.
                    </p>
                    {/* The steps, here rather than only behind the button. This
                        is the screen a new user lands on, and "Import your
                        films" tells somebody who has never exported anything
                        precisely nothing about where to go. */}
                    <div className="mx-auto mt-5 max-w-[290px] rounded-xl border border-border px-3.5 py-3 text-left">
                      <ImportGuide />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[12px] text-dim tabular-nums">
                    {state.films.length.toLocaleString()} films &middot; {placedNow.toLocaleString()} placed
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 pb-5">
              {empty ? (
                <>
                  {/* A real file picker, not a route into Settings. It used to
                      open the sheet, where every row is collapsed by default —
                      so the one button on a new user's only screen led to a
                      list of closed rows with no import control anywhere in
                      sight. The primary action on the empty screen has to BE
                      the action. */}
                  <ImportButton
                    label="Import your films"
                    merge={false}
                    onFile={(f) => onImportFile?.(f)}
                  />
                  {/* A "show me how it works" button lived here and is gone.
                      With nothing in the library there is nothing to
                      demonstrate: every tour points at films, a tier or a run,
                      and none of those exist yet. The teaching now happens
                      where it is useful — each screen explains itself the first
                      time you arrive with something on it. */}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      fromOverlay.current = true;
                      setTierOpen(true);
                    }}
                    className="w-full rounded-full bg-gold py-3.5 text-center text-[13px] font-bold text-[#1c1405] active:scale-[0.99]"
                  >
                    Pick a tier
                  </button>
                  <button
                    onClick={() => setModeOpen(true)}
                    className="mt-2.5 w-full rounded-full border border-border py-3.5 text-center text-[13px] font-bold text-text-hi active:scale-[0.99]"
                  >
                    Something else
                  </button>
                </>
              )}
              <button
                onClick={onProfile}
                className="mt-3 w-full py-2 text-center text-[12px] text-dim active:scale-95"
              >
                Your profile
              </button>
            </div>
          </div>
          <BottomNav
            screen="duel"
            onSettings={onSettings}
            onModes={toggleModes}
            onList={onList}
            onProfile={onProfile}
            logging={logging}
            onToggleLog={onToggleLog}
          />
        </main>
        {sheets}
      </>
    );
  }


  const pair = getPair(state);
  const champion = pendingConfirm(state);

  return (
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />
      {/* Hidden during Fast Shuffle: it reports a tier, a placed count and a
          to-go count, and that run has none of those. Left visible it read as
          "KING OF THE HILL · 0 placed · 50 to go" over a completely different
          game. ShuffleDuel carries its own status line instead. */}
      {/* `activeRun`, not `shuffleRun`: a person run is started from outside this
          screen and never sets `shuffleRun`, so guarding on that one left the
          tier bar sitting above a filmography run — the exact thing the comment
          above was written to prevent, reintroduced by adding a second way in. */}
      {!activeRun && !runResult && (
        <RunStatus
          // Borrowed films must not count toward what you have settled — a Nolan
          // run was reporting "0 of 42" for a library of ten.
          films={state.films.some((f) => f.guest) ? state.films.filter((f) => !f.guest) : state.films}
          log={log}
          // A promotion attempt is a different game against a different tier, and
          // saying KING OF THE HILL over it would be describing the climb it
          // interrupted rather than the three duels actually on screen.
          title={session?.promotionQueue ? "GOING UP A TIER" : "KING OF THE HILL"}
          run={{
            done: session?.confirmed.length ?? 0,
            total: (session?.confirmed.length ?? 0) + (session?.unconfirmed.length ?? 0),
          }}
          // The tier reads as its stars and doubles as the quickest way to
          // switch — the label you're looking at is the control.
          //
          // Except in a cross-tier run, where the pile spans star ratings and a
          // single tier is not a true thing to say about it, let alone a control
          // that could switch it. It says whose films these are instead.
          lead={
            session?.crossTier ? (
              <span className="max-w-[120px] truncate text-[11px] font-bold leading-none text-gold">
                {runSubject ? subjectTitle(runSubject) : ""}
              </span>
            ) : (
              <button onClick={() => setTierOpen(true)} className="flex items-baseline gap-1.5 active:scale-95">
                <span className="text-base leading-none text-gold">{starsFor(session?.tier ?? DEFAULT_TIER)}</span>
                <span className="text-[10px] leading-none text-dim">▾</span>
              </button>
            )
          }
        />
      )}

      {/* A finished cross-tier order takes the surface for the same reason Fast
          Shuffle does: there is no duel to show, and what it holds cannot be
          recovered from anywhere else once it is dismissed. */}
      {/* `!session` as well as `runResult`: starting a new run supersedes a
          summary that is still on screen, without anything having to remember to
          clear it. */}
      {runResult && !session ? (
        <RunSummary
          subject={runResult.subject}
          films={runResult.films}
          complete={runResult.complete}
          onList={onList}
          onAgain={rankAgain}
          onDone={() => {
            setRunResult(null);
            onRunRequestHandled?.(); // the request is finished with now, not before
          }}
        />
      ) : /* Fast Shuffle owns the whole surface while it runs: it has no pile, no
          climb and no confirm, so none of the branches below apply to it. */
      activeRun ? (
        <ShuffleDuel
          // Borrowed films are handed to the run and to nothing else. Both
          // writes below strip them, so there is no path from "I ranked a
          // director's whole filmography" to "my library gained forty films I
          // have never seen".
          films={guests.length ? [...state.films, ...guests] : state.films}
          onFilms={(films) => {
            const mine = films.filter((f) => !f.guest);
            saveFilms(mine);
            setState((s) => (s ? { ...s, films: mine } : s));
          }}
          // Applied as a functional update, so artwork arriving mid-streak folds
          // into whatever the library is NOW rather than into a stale snapshot
          // taken when the request went out.
          onMeta={(id, meta) =>
            setState((s) => {
              if (!s) return s;
              // A guest is not in `s.films`, so this maps over nothing and saves
              // the library unchanged — correct, but stated rather than relied on.
              if (guests.some((g) => g.id === id)) return s;
              const films = s.films.map((f) => (f.id === id ? withMeta(f, meta) : f));
              saveFilms(films);
              return { ...s, films };
            })
          }
          options={activeRun}
          onInfo={onInfo}
          onExit={() => {
            setShuffleRun(null);
            onRunRequestHandled?.();
          }}
          onList={onList}
        />
      ) : champion ? (
        <ConfirmView
          champion={champion}
          rank={(session?.confirmed.length ?? 0) + 1}
          onConfirm={lockIn}
          onBack={(session?.unconfirmed.length ?? 0) > 1 ? backOut : undefined}
          promoteTo={promoteTo}
          onTakeOn={takeOnTierAbove}
          onAssertPromotion={assertPromotion}
          justPromoted={promotionWon(state)}
          // The tier just EARNED, which is not the one the film currently
          // carries. `completePromotion` is what writes the new rating and it
          // does not run until Lock in is pressed, so reading it off the film
          // here showed the tier it was leaving: a promotion from ½ to ★ was
          // announced as "EARNED ½" over a button reading "Lock in at ½".
          // The run's own tier is the tier being taken on — `startPromotionDuel`
          // sets it — so it is the one true thing on screen to read from.
          earned={session?.tier}
          // Stopping has to be reachable from here too. The confirm screen is
          // the one place a run can sit indefinitely — it is waiting on you, not
          // the other way round — and until now it was also the one place with
          // no way out except answering it.
          onDone={endRun}
        />
      ) : pair && session ? (
        <Duel
          contender={pair.contender}
          challenger={pair.opponent}
          pile={session.unconfirmed}
          confirmed={session.confirmed}
          films={state.films}
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
        />
      ) : (
        // A run that exists but has no pair left: the tier ran out, or Done was
        // pressed. `session` is non-null here — the no-run case took the whole
        // surface above, before this tree was built.
        // The session is still alive here, so the pile can be read straight off
        // it rather than remembered — this is the branch where a run exists but
        // has no pair left, not the one where it has already been torn down.
        <TierComplete
          films={state.films}
          tier={session?.tier ?? DEFAULT_TIER}
          runIds={session ? [...session.confirmed, ...session.unconfirmed] : undefined}
          onPickTier={() => setTierOpen(true)}
          onList={onList}
          onRankPile={(ids) => {
            try {
              commit(
                { ...startRun(state.films, session?.tier ?? DEFAULT_TIER, { only: ids }), journal: state.journal },
                false,
              );
            } catch {
              /* fewer than two films left in the pile */
            }
          }}
        />
      )}

      <BottomNav
        screen="duel"
        onSettings={onSettings}
        onModes={toggleModes}
        onList={onList}
        onProfile={onProfile}
        logging={logging}
        onToggleLog={onToggleLog}
      />

      {/* Every mode stands the Fast Shuffle run down first: `activeRun` decides
          whether ShuffleDuel owns the surface, and leaving it set started the
          climb underneath while the shuffle stayed drawn on top. Fast Shuffle
          loses nothing by it — it writes every judgement and score as it goes. */}
      {sheets}


      {/* Last, so the greeting sits over the game it is describing. */}
      {overlay}
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
  onList,
  onProfile,
  logging,
  onToggleLog,
}: {
  screen: "duel" | "list" | "profile";
  onSettings: () => void;
  onModes?: () => void;
  onList: () => void;
  onProfile?: () => void;
  /** Whether the log sheet is up, so the cell that opened it stays lit. */
  logging?: boolean;
  onToggleLog?: () => void;
}) {
  // ── Nothing renders inside this nav ─────────────────────────────────────────
  //
  // The log sheet used to, on the reasoning that the sheet belongs where the
  // button is. It cost the app its only mis-layered overlay: `z-40` below makes
  // this element a stacking context, so a `z-30` sheet nested in it is z-ordered
  // WITHIN the nav and paints over the bar's own background rather than under
  // it. Every other sheet in the app is a sibling of the screens and sits
  // correctly beneath. Its state moved to `AppShell` alongside the rest of the
  // overlays; this keeps the lit flag and the toggle, which is all a control
  // needs. Do not move it back, and do not render anything else here.
  // The Activity cell has no screen behind it yet. See `teaseTimer` below.
  const [teasing, setTeasing] = useState(false);
  const teaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (teaseTimer.current) clearTimeout(teaseTimer.current);
  }, []);

  // ── `--nav-h` is a POSITION, not a height ──────────────────────────────────
  //
  // It is what `Sheet` sits its `bottom` on, so what it has to answer is "how
  // far up from the bottom of the screen does the bar start". That used to be
  // `offsetHeight`, on the assumption that the bar's own bottom edge IS the
  // bottom of the screen. It is not, and the gap the user sees under every
  // drawer is the difference.
  //
  // `main` is cut to `100svh` — the SMALLEST the viewport ever gets — and this
  // nav is pinned at its foot by flex, so in a mobile browser with the URL bar
  // retracted `main` ends well above the true bottom edge. A sheet is
  // `position: fixed` and measures the REAL viewport, so `bottom: offsetHeight`
  // put it `offsetHeight` up from the real bottom while the bar sits
  // `offsetHeight` up from `main`'s bottom. The two disagree by exactly the
  // slack that `svh` was erring by, and that slack is the gap.
  //
  // Measuring the bar's top edge against the visual viewport gets both cases
  // right and needs no assumption about which viewport unit won: in a
  // fullscreen PWA the two are equal and this is still `offsetHeight`.
  //
  // ── Measured against the LAYOUT viewport, not the visual one ───────────────
  //
  // This value is consumed as a `bottom` on `position: fixed` elements, and a
  // fixed element's containing block is the initial containing block — the
  // LAYOUT viewport, whose height is `document.documentElement.clientHeight`.
  // `getBoundingClientRect().top` is in those same coordinates, so both ends of
  // the subtraction have to be.
  //
  // The first version of this used `visualViewport.height`, which is a
  // different quantity: it shrinks when the URL bar is on screen and grows when
  // it retracts, while the layout viewport stays put. The two agree exactly
  // when browser chrome is hidden — which is every desktop, and a phone
  // mid-scroll — and disagree by the height of the URL bar the rest of the
  // time. So the sheets sat correctly on the bar in testing and drifted off it
  // in normal use, which is the worst possible way for this to be wrong.
  //
  // `visualViewport` is still LISTENED to, because it is the only reliable
  // signal that mobile chrome moved; it just is not what gets measured. Reset
  // to 0 on unmount, or sheets on screens that draw no nav would float above a
  // bar that is not there.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => {
      const bottom = document.documentElement.clientHeight || window.innerHeight;
      // Clamped: a bar measured below the fold would give a negative offset and
      // push a sheet off the bottom of the screen, which is worse than a seam.
      const up = Math.max(0, Math.round(bottom - el.getBoundingClientRect().top));
      document.documentElement.style.setProperty("--nav-h", `${up}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", publish);
    vv?.addEventListener("scroll", publish);
    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", publish);
      vv?.removeEventListener("scroll", publish);
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      document.documentElement.style.setProperty("--nav-h", "0px");
    };
  }, []);

  // ── A cell that answers ────────────────────────────────────────────────────
  //
  // Activity had no handler at all, so pressing it did nothing — not "nothing
  // yet", just nothing, which is indistinguishable from the app having frozen.
  // A tap that produces no response anywhere on screen is the one interaction
  // users retry, and then stop trusting.
  //
  // So it says so. A pill rather than a sheet: there is nothing to read and
  // nothing to decide, and making someone dismiss a panel to learn that a
  // feature does not exist yet would be worse than the silence it replaces.
  // Re-tapping restarts the timer rather than stacking a second one.
  const tease = () => {
    setTeasing(true);
    if (teaseTimer.current) clearTimeout(teaseTimer.current);
    teaseTimer.current = setTimeout(() => setTeasing(false), 1900);
  };
  return (
    <nav
      ref={navRef}
      // `z-40` puts the bar ABOVE the sheet scrim (z-30), which is what keeps it
      // lit and pressable while a panel is open. `main` is `relative` with no
      // z-index, so it creates no stacking context and this competes with the
      // fixed scrim directly — remove the relative here and the whole thing
      // silently stops working.
      className="relative z-40 flex flex-shrink-0 items-stretch border-t"
      // Pad into the home-indicator strip so the bar's black reaches the
      // physical bottom edge instead of cutting off into the page background.
      style={{ background: "var(--header-bg)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Sits above the bar rather than over it, so the cell you just pressed
          is still visible underneath and the pill reads as an answer to it.
          `pointer-events-none` so it can never swallow the next tap — it is a
          notice, not a control, and it is directly over two nav cells. */}
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2"
        style={{
          opacity: teasing ? 1 : 0,
          transform: teasing ? "translateY(0)" : "translateY(4px)",
          transition: "opacity 0.2s var(--ease), transform 0.2s var(--ease)",
        }}
      >
        <span
          className="rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-gold"
          style={{
            borderColor: "color-mix(in srgb, var(--gold) 35%, transparent)",
            background: "color-mix(in srgb, var(--bg) 92%, transparent)",
          }}
        >
          {teasing ? "Activity is coming soon" : ""}
        </span>
      </div>
      {/* Five equal cells so RNK sits dead centre — it's the core loop. */}
      <NavItem label="Your list" active={screen === "list"} onClick={onList} icon={<ListIcon />} />
      {/* Was End session, which is now Done inside the duel where it belongs —
          you stop a run from the run, not from the chrome. The cell goes to
          logging a film you've just watched, which is the one thing the app
          could not do at all: the library only ever arrived by CSV, so it knew
          your past and had nothing to say about tonight. Works on every screen,
          unlike the control it replaced. */}
      <NavItem label="Log a film" active={logging} onClick={onToggleLog} icon={<AddFilmIcon />} />
      <NavItem label="Rank" active={screen === "duel"} onClick={onModes} icon={<RankdMark />} tour="rank" />
      <NavItem label="Activity, coming soon" onClick={tease} icon={<ActivityIcon />} />
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
function NavItem({
  label,
  icon,
  active,
  onClick,
  tour,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  /** `data-tour` hook, so the coach marks can point at this cell. */
  tour?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-tour={tour}
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
  closing,
  onKoth,
  onFastShuffle,
  onCurated,
  onRoughCut,
  onRankPile,
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
  /** The nav is dismissing this; play the exit. See `toggleModes`. */
  closing?: boolean;
  onKoth: (t: Rating) => void;
  onFastShuffle: (opts: ShuffleOptions) => void;
  onCurated: () => void;
  onRoughCut: (tier: Rating) => void;
  onRankPile: (ids: string[]) => void;
  onPickTier: () => void;
}) {
  // Pick the game first, then set it up. A flat list asked you to read a tier
  // and a range before knowing what they were for.
  const setChosen = onChoose;

  const lowEdge = tier - below;
  const highEdge = tier + above;
  // The range pulls films in from either side, so the count has to reflect the
  // whole span, not just the chosen tier.
  const count = films.filter((f) => f.rating >= lowEdge && f.rating <= highEdge).length;
  const playable = count >= 2;

  if (chosen === null) {
    return (
      <Sheet title="Play" onClose={onClose} closing={closing}>
        {/* FIRST, not second. It was already above Fast Shuffle on the
            reasoning below; the same argument taken to its conclusion puts it
            above King of the Hill too.

            King of the Hill costs n(n-1)/2 duels and is the wrong first move on
            any tier worth ranking — at 185 films it is several thousand
            comparisons from a standing start. Rough Cut is one pass, one
            decision per film, and it hands the climb a nearly-sorted pile. So
            the order of this list is the order the work should actually happen
            in, rather than the order the modes were built in. */}
        <ModeRow
          title="Rough Cut"
          blurb="Large libraries can be daunting. Start dividing them into smaller groups, then compare from there."
          onClick={() => setChosen("roughcut")}
        />
        <ModeRow
          title="King of the Hill"
          blurb="One tier at a time. Winner moves on."
          onClick={() => setChosen("koth")}
        />
        {/* The one mode with no pile and no confirm. It asks whichever question
            it can least predict the answer to, and stops when you do. */}
        <ModeRow
          title="Fast Shuffle"
          blurb="Your provisional rating. Compare films to establish an initial ranking. It's much easier than ranking every film against every other. 50 films alone would mean 1,225 comparisons. Use the other modes for your hard locks."
          onClick={() => setChosen("shuffle")}
        />
        {/* Curated lists sit with the modes rather than behind a film's info
            card, which is where the only route to one used to be. They are a
            different KIND of thing — they change no scores and settle nothing —
            so the blurb has to say so, or it reads as a fourth way to rank. */}
        <ModeRow
          title="Curator"
          blurb="A director, an actor or genre. Everyone has their favourite. Your rankings don't move."
          onClick={onCurated}
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

  // Rough Cut needs a tier and nothing else — no range, no shuffle, because it
  // asks about one tier's own contents and asks it in the order they already
  // sit. It shipped without this step, taking whatever `setupTier` happened to
  // be, which on a fresh session is DEFAULT_TIER — so it always opened on 4★ and
  // there was no way to say otherwise.
  if (chosen === "roughcut") {
    // Counted over the RANGE, not the anchor tier, so the number on the start
    // button is the number of films the pass will actually deal.
    const inTier = films.filter(
      (f) => f.rating >= tier - below && f.rating <= tier + above && f.lock !== "hard",
    ).length;
    return (
      <Sheet title="Rough Cut" onClose={onClose} closing={closing}>
        <p className="mb-3 text-[11px] leading-snug text-dim">
          One pass, one decision per film. Nothing is settled — it just gives the tier a rough
          order so ranking it properly afterwards is a fraction of the work.
        </p>
        <button
          onClick={onPickTier}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
        >
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">TIER</span>
          <span className="flex items-baseline gap-2">
            <span className="text-base text-gold">{starsFor(tier)}</span>
            <span className="text-[11px] text-dim">
              {inTier} film{inTier === 1 ? "" : "s"} ›
            </span>
          </span>
        </button>
        {/* The same reach the climb and Fast Shuffle already had. Rough Cut was
            the one mode locked to a single tier, which made it useless for the
            case it is best at: two thin neighbouring tiers that together are
            worth one pass. Every film still keeps its own star rating —
            `applyRoughCut` scores each one inside its OWN band, so a range
            decides which films are dealt and nothing else. */}
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
          <div className="flex justify-between text-[10px] text-dim">
            <span>½</span>
            <span>★★★★★</span>
          </div>
          {(below > 0 || above > 0) && (
            <p className="mt-2 text-[11px] leading-snug text-dim">
              Every film keeps its own star rating — this only decides which films are dealt.
            </p>
          )}
        </div>

        <StartButton
          label={`Start · ${inTier} film${inTier === 1 ? "" : "s"}`}
          onClick={() => onRoughCut(tier)}
          disabled={inTier < 3}
        />
        {inTier < 3 && (
          <p className="mt-2 text-center text-[11px] text-gold">
            Needs at least 3 films to split into three piles.
          </p>
        )}

        {/* The piles from a previous cut, still there. They are not stored
            anywhere — a film's score IS which third it sits in, so this survives
            closing the app and, now that a pile run stays inside its own band,
            survives ranking one of them too. Ranking a pile used to be a
            one-shot: leave the summary screen and the only way back was to cut
            the whole tier again. */}
        {(() => {
          const bands = bandsOf(films, tier);
          // What each pile still has left to rank. `bandsOf` counts hard locks
          // so a ranked pile does not read as an empty band — but a settled film
          // must not be dragged back into a new climb, so the run itself is
          // built from the unlocked ones only.
          const open: Record<Bucket, Film[]> = {
            top: bands.top.filter((f) => f.lock !== "hard"),
            middle: bands.middle.filter((f) => f.lock !== "hard"),
            bottom: bands.bottom.filter((f) => f.lock !== "hard"),
          };
          const split = BUCKETS.filter((b) => bands[b].length > 0).length > 1;
          // Nothing left to rank anywhere means every pile is done — or the
          // spread came from an ordinary climb rather than a cut. Either way
          // three dead buttons say nothing.
          const anyRankable = BUCKETS.some((b) => open[b].length >= 2);
          if (!split || !anyRankable) return null;
          return (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-dim">
                Already split — rank a pile
              </p>
              <div className="flex gap-2">
                {BUCKETS.map((b) => (
                  <button
                    key={b}
                    disabled={open[b].length < 2}
                    onClick={() => onRankPile(open[b].map((f) => f.id))}
                    className="flex-1 rounded-xl border border-border py-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98] disabled:opacity-30"
                  >
                    {b === "top" ? "Upper" : b === "middle" ? "Middle" : "Lower"}
                    <span className="ml-1.5 text-dim tabular-nums">{open[b].length}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <BackRow onClick={() => setChosen(null)} />
      </Sheet>
    );
  }

  return (
    <Sheet title="King of the Hill" onClose={onClose} closing={closing}>
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
  forRoughCut,
}: {
  films: Film[];
  current: Rating;
  onClose: () => void;
  onPick: (t: Rating) => void;
  /**
   * Show what Rough Cut has already done to each tier.
   *
   * ── Why this is a flag and not just always on ──────────────────────────
   *
   * Choosing a tier for Rough Cut was two screens answering one question. You
   * picked blind here — stars and a count, nothing else — and only saw whether
   * that tier was already split, or had a pass half finished, after the picker
   * closed and the setup sheet came back. The one fact that decides which tier
   * to open was on the screen you had just left.
   *
   * King of the Hill shares this component and has no piles, so the extra line
   * would be dead furniture there. Off by default: a shared control should not
   * carry one caller's vocabulary for every other caller to read past.
   */
  forRoughCut?: boolean;
}) {
  const counts = tierCounts(films);
  return (
    <Sheet title="Choose a tier" onClose={onClose}>
      {ORDERED_TIERS.map((t) => {
        const n = counts.get(t) ?? 0;
        const playable = n >= 2;
        // Derived per tier rather than up front. Ten tiers of a large library is
        // still a single pass each and only runs while the sheet is open, where
        // hoisting it would mean recomputing all ten on every parent render.
        const cut = forRoughCut && playable ? roughCutState(films, t) : null;
        return (
          <button
            key={t}
            disabled={!playable}
            onClick={() => onPick(t)}
            className="mb-1.5 flex w-full flex-col gap-1 rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-30"
          >
            <span className="flex w-full items-center justify-between">
              <span className="text-base text-gold">{starsFor(t)}</span>
              <span className="flex items-center gap-2 text-[11px] text-dim">
                {n === 0 ? "none" : `${n} film${n === 1 ? "" : "s"}`}
                {n === 1 && ", needs 2"}
                {t === current && <span className="text-gold">✓</span>}
              </span>
            </span>
            {cut && (cut.resuming !== null || cut.split) && (
              <span className="flex w-full items-center gap-2 text-[10px] tabular-nums">
                {/* A half-finished pass outranks the split, because it is the
                    thing you would want to know first: the piles will still be
                    there afterwards, and the pass will not survive being
                    ignored in favour of starting a new one. */}
                {cut.resuming !== null ? (
                  <span className="text-gold">
                    {cut.resuming} left in an unfinished pass
                  </span>
                ) : (
                  <span className="text-dim">
                    Split {cut.bands.top} / {cut.bands.middle} / {cut.bands.bottom}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </Sheet>
  );
}

/**
 * What Rough Cut has already done to one tier, or nothing worth saying.
 *
 * Both facts come from state that already exists — no new bookkeeping. The split
 * is read straight off the scores (`bandsOf`), because a film's score IS which
 * third it sits in; the unfinished pass comes from the resume record.
 *
 * `split` deliberately counts bands holding anything at all, hard locks
 * included. A tier whose upper pile has been ranked to the end is still a tier
 * that was split, and reporting it as unsplit was the bug that made the third
 * pile disappear.
 */
function roughCutState(films: Film[], tier: Rating) {
  const bands = bandsOf(films, tier);
  const counts = {
    top: bands.top.length,
    middle: bands.middle.length,
    bottom: bands.bottom.length,
  };
  const resume = loadRoughCut(films, tier);
  return {
    bands: counts,
    split: BUCKETS.filter((b) => bands[b].length > 0).length > 1,
    resuming: resume ? resume.films.length - resume.at : null,
  };
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
// The tier + progress strip, sitting on the body just under the header feather.
// TierProgress lived here. Replaced by RunStatus, which every mode now shares.

// ── The climb: contender vs the film above, both UN-RNKD ───────────────────
function Duel({
  contender,
  challenger,
  pile,
  confirmed,
  films,
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
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  confirmed: string[]; // locked shelf, index 0 = #1
  films: Film[];
  onPick: (id: string) => void;
  onDraw: () => void;
  /** End the run and go back to the empty screen. */
  onDone: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onFlick: (id: string) => void;
  onSink: (id: string) => void;
  onScrub: (id: string) => void;
  onInfo: (film: Film) => void;
  stripOpen: boolean;
  onToggleStrip: () => void;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);

  // Draw and Undo are revealed by answering, not by arriving — and once revealed
  // they stay for the rest of the run.
  //
  // They used to time out after 2.5s and hand the slot back to the question,
  // which was wrong: you reach for these exactly when you have put the phone
  // down and looked away, which is the moment a timer has already taken them.
  //
  // Sticky rather than always-on because arriving at a fresh duel with three
  // buttons under it puts a decision in front of you before you have made the
  // only one that matters. One tap teaches them, then they are furniture.
  //
  // ── Done is the exception, and is always there ────────────────────────────
  //
  // It was gated behind the same flag, which meant the control for LEAVING a run
  // did not exist until you had played one. Someone who opened a climb, saw a
  // pairing they did not want to judge and simply wanted out had no exit at all:
  // no Done, and the confirm screen it might otherwise be reached from is two
  // duels away. The one control that must never require you to play first is the
  // one that stops you having to.
  //
  // It costs nothing to show, because the row is in the layout either way — only
  // the opacity moves — so Draw and Undo still fade up beside it without
  // anything shifting under the thumb.
  const [played, setPlayed] = useState(false);

  const declineToCall = () => {
    setPlayed(true);
    onDraw();
  };

  // Intercept a win by the right-hand card so it slides into the climbing seat
  // before the state swap paints. Picking the left card needs none of this — it
  // is already where it is going to be.
  const pick = (id: string) => {
    setPlayed(true);

    const arena = arenaRef.current;
    const cards = arena?.querySelectorAll<HTMLElement>("button");
    const climbImg = cards?.[0]?.querySelector("img");
    const challImg = cards?.[1]?.querySelector("img");

    // A winning challenger becomes the climber, so it flies into the climbing
    // seat before the state swap paints.
    if (id === challenger.id && climbImg && challImg) {
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
            {/* Only near the end. Announced too early it is noise; at three to
                go it is the reason you play three more. */}
            <Tips
              guidance={
                pile.length > 0 && pile.length <= RUN_ENDGAME
                  ? `Only ${pile.length} left in this run`
                  : undefined
              }
            />
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
        {/* Eager to shrink, but never to nothing.
            The weighting is deliberate — 12 against the poster row's 1 means
            opening the drawer tightens this gap instead of resizing the artwork,
            which is right. What was missing was a floor. On a phone with the
            strip open this collapsed to 8px, and since the box clips its
            overflow, the rank face did not compress: it disappeared. The screen
            silently dropped the only live game state it shows — which position
            is being fought over, out of how many — and the titles rose into the
            progress bar behind it.
            minHeight is what the shrink weighting always needed: give up the
            slack first, then stop. Anything still missing after that comes off
            the posters, which have 328px to spare and degrade gracefully. */}
        <div
          className="flex min-h-0 items-center justify-center overflow-hidden"
          style={{ height: 110, minHeight: 56, flexShrink: 12 }}
        >
          <RankFace from={rankOf(contender.id)} to={rankOf(challenger.id)} total={total} />
        </div>
        {/* A definite height the cards can fill, and one that yields under
            pressure. 356px = the original 270px poster plus the two-line title
            box above it, so a full-height phone looks exactly as it did; flex
            shrink hands the space back on anything shorter. */}
        {/* marginBottom is not decoration: the CLIMBING and UN-RNKD pills are
            positioned to STRADDLE the bottom edge of their card, so the row's
            visible ink ends below its box. Nothing enforced clearance for that,
            and while the results feed sat underneath, the feed's own line
            absorbed it by accident. Removing the feed put the controls flush
            against the box — measured at exactly 0px gap, with the pill hanging
            4px past it — so the buttons collided with the badges.
            The overhang belongs to the posters, so the space does too. */}
        <div
          className="relative flex items-stretch justify-center gap-3"
          style={{ height: 356, flexShrink: 1, minHeight: 0, marginBottom: 16 }}
        >
        <PosterCard film={contender} badge="CLIMBING" pick pairId={contender.id} onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        <PosterCard film={challenger} badge="UN-RNKD" pairId={contender.id} onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        </div>
        {/* Stays in the layout flow so it can never overlap anything at any
            screen height. It only needs to look right with the strip folded
            away, so rather than pinning it, the fade-in simply WAITS for the
            drawer to finish moving — invisible while the layout shifts, so it
            never appears to slide. Fading out has no delay. */}
        {/* Nearly all the slack goes ABOVE the controls (3.4 : 0.1, from 1.6 : 1).
            They sit low, near the thumb that reaches for them, instead of
            floating mid-gap under the posters — and the space that freed up goes
            to the arena rather than to a hole underneath. */}
        <div style={{ flexGrow: 3.4 }} />
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
          {/* The results feed used to sit here. Removed rather than restyled:
              it reported what you had just done to someone who had just done it,
              on the one screen where the next question is the only thing that
              matters, and it cost the arena a line to say so. Undo is the honest
              version of what it was for — if a result was wrong, the feed only
              let you read about it. */}
          {/* Undo sits between the two it mediates: it takes back the answer
              Draw would give and Done would end on. Disabled rather than absent
              once there is nothing to take back, so the row never changes width
              under your thumb. */}
          {/* The opacity is per-button rather than on the row, so Done can be
              present from the first frame while the other two are still earned.
              The row itself never changes size either way — see `played`. */}
          <div className="flex items-center gap-1 px-6 pb-2 pt-0">
            <button
              onClick={declineToCall}
              className={CONTROL}
              style={{
                opacity: played ? 1 : 0,
                pointerEvents: played ? "auto" : "none",
                transition: "opacity 0.25s var(--ease)",
              }}
            >
              Draw
            </button>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`${CONTROL} disabled:opacity-30 disabled:active:scale-100`}
              style={{
                opacity: played ? undefined : 0,
                pointerEvents: played ? "auto" : "none",
                transition: "opacity 0.25s var(--ease)",
              }}
            >
              Undo
            </button>
            {/* Done is the only one that ENDS something, so it carries a little
                gold — the same accent the climber wears. Kept to 70% because
                promoting "stop playing" into the brightest thing on screen
                would be an odd thing for the game to want. */}
            <button onClick={onDone} className={`${CONTROL} text-gold/70`}>
              Done
            </button>
          </div>
        </div>
        <div style={{ flexGrow: 0.1 }} />
      </div>

      <Rolodex
        lowToHigh={lowToHigh}
        locked={locked}
        contenderId={contender.id}
        challengerId={challenger.id}
        onScrub={onScrub}
        open={stripOpen}
        onToggle={onToggleStrip}
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
  "Can't separate two? Say so, it counts",
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
/** How few films left counts as the endgame, and earns a line saying so. */
const RUN_ENDGAME = 10;

// Text, not buttons. Pills gave three secondary actions the same visual weight
// as the thing you are actually here to do, and drew a box around each one at
// the bottom of a screen whose whole subject is two pieces of artwork. Stripped
// to labels they read as available without competing.
//
// The padding stays: it is the tap target (~38px tall), and losing it to make
// them look lighter would make them harder to hit. Small caps matches the
// session line and RankFace's "of 134", so the screen keeps one voice.
const CONTROL =
  "px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim transition-colors active:scale-95";

// `guidance` is a line about THIS run rather than about the app — "only 3 left"
// rather than "flick a film up". It joins the rotation at the front instead of
// replacing it: a fixed line stops being read after the second time you see it,
// and the hints are still worth teaching. The end of a run is the one moment
// worth naming, because it is the only one where knowing how close you are
// changes whether you keep going.
function Tips({ guidance }: { guidance?: string }) {
  const items = useMemo(() => (guidance ? [guidance, ...TIPS] : TIPS), [guidance]);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    // Fade the old tip out, swap the text while it's invisible, fade back in —
    // a crossfade rather than a cut. Opacity lives in CSS so the shine keeps
    // running underneath instead of restarting on every change.
    const cycle = setInterval(() => {
      setShown(false);
      setTimeout(() => {
        setI((n) => n + 1);
        setShown(true);
      }, TIP_FADE_MS);
    }, TIP_MS);
    return () => clearInterval(cycle);
  }, []);

  return (
    <span className="tip px-6 text-center text-[11px] leading-snug" style={{ opacity: shown ? 1 : 0 }}>
      {/* Wrapped here rather than in the setter: `items` changes length when
          guidance appears or goes, and a stored index modulo the OLD length
          would point somewhere else the moment it did. */}
      {items[i % items.length]}
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
  promoteTo,
  onTakeOn,
  onAssertPromotion,
  justPromoted,
  earned,
  onDone,
}: {
  champion: Film;
  rank: number;
  onConfirm: () => void;
  onBack?: () => void;
  promoteTo?: Rating;
  onTakeOn?: () => void;
  onAssertPromotion?: () => void;
  justPromoted?: boolean;
  /**
   * The rating a won promotion is about to bank.
   *
   * Not read off the film: the write happens on confirm, so until then it still
   * carries the tier it is leaving. See the call site.
   */
  earned?: Rating;
  /** Stop the run from here. See the call site. */
  onDone?: () => void;
}) {
  const won = justPromoted ? (earned ?? champion.rating) : champion.rating;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.14em] text-gold">
        {justPromoted ? `⭐ EARNED ${starsFor(won)}` : "🏆 TOPS THE PILE"}
      </span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--gold), 0 12px 36px color-mix(in srgb, var(--gold) 45%, transparent)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        {justPromoted ? (
          <div className="mt-1 text-base text-gold">{starsFor(won)}</div>
        ) : (
          <div className="mt-1 font-serif text-5xl font-bold text-gold">#{rank}</div>
        )}
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sm font-extrabold tracking-wide active:scale-95"
        style={{ color: "#1c1405", background: "var(--gold)", boxShadow: "0 4px 20px color-mix(in srgb, var(--gold) 40%, transparent)" }}
      >
        {justPromoted ? `Lock in at ${starsFor(won)}` : `Lock in as #${rank}`}
      </button>

      {/* Beating an entire tier is the one moment a star rating can change:
          earn it against the tier above, or assert it outright. `promotionTarget`
          is what decides this is that moment. */}
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

      {/* Quieter than everything above it, and last. This screen is asking you a
          question, so the answer stays the loud thing and the exit sits under it
          in the same weight the duel's own Done carries. */}
      {onDone && (
        <button onClick={onDone} className="text-[11px] font-semibold text-gold/70 active:scale-95">
          Done for now
        </button>
      )}
    </div>
  );
}

function TierComplete({
  films,
  tier,
  runIds,
  onPickTier,
  onList,
  onRankPile,
}: {
  films: Film[];
  tier: Rating;
  /**
   * The films this run actually worked through, when it was a slice of the tier
   * rather than the whole thing.
   *
   * Without it the counts describe the TIER and are read as describing the run.
   * Rank the second of three Rough Cut piles and "6 placed" is true of 4★ and a
   * lie about the twenty minutes you just spent — it silently includes the pile
   * you finished last week. Absent means the run was the whole tier, where the
   * two happen to coincide.
   */
  runIds?: string[];
  onPickTier: () => void;
  onList: () => void;
  /** Climb another of this tier's Rough Cut piles. */
  onRankPile?: (ids: string[]) => void;
}) {
  const inTier = films.filter((f) => f.rating === tier);
  const scope = runIds ? inTier.filter((f) => runIds.includes(f.id)) : inTier;
  const ranked = scope.filter(isPlaced).sort((a, b) => b.score - a.score);
  const duels = scope.reduce((n, f) => n + (f.duels ?? 0), 0);
  // This screen is reached two ways — the tier ran out of films, or you pressed
  // Done — and it used to say the same thing either way. Stopping after two
  // duels was congratulated with "Every film in this tier has found its spot"
  // above a count of zero, which is both false and, at the exact moment you
  // chose to stop, faintly insulting. The distinction costs one subtraction.
  const left = scope.length - ranked.length;
  const finished = left === 0 && ranked.length > 0;
  const pile = runIds !== undefined && scope.length < inTier.length;

  // ── What is still worth doing in this tier ────────────────────────────────
  //
  // Derived from the library rather than from run bookkeeping. A film's score IS
  // which third it sits in, so "are there piles left" is a question about the
  // tier as it stands — which means it answers correctly whether the run that
  // just ended was a pile, the whole tier, or something from three sessions ago.
  //
  // Hard locks are filtered out because a pile that has been climbed to the end
  // has nothing left to offer, and offering it would restart a finished job.
  const bands = bandsOf(films, tier);
  const openBands = BUCKETS.map((b) => ({
    bucket: b,
    films: bands[b].filter((f) => f.lock !== "hard"),
  })).filter((b) => b.films.length >= 2);
  // More than one occupied band is what makes this a SPLIT tier rather than an
  // untouched one, which reads as all-middle. Without the check, finishing an
  // ordinary King of the Hill run would offer to "rank a pile" of a tier nobody
  // ever cut.
  const wasSplit = BUCKETS.filter((b) => bands[b].length > 0).length > 1;
  const offer = wasSplit && onRankPile ? openBands : [];

  // Only once something is actually in order. Two films is the floor the rest of
  // the card path already uses (see `SavedListSheet`), and a card of one entry
  // is not a ranking.
  const card = ranked.length >= 2 ? cardDataFromFilms({ kind: "tier", rating: tier }, ranked.slice(0, 10)) : null;

  return (
    <SessionEnd
      title={finished ? (pile ? "Pile ranked" : `${starsFor(tier)} ranked`) : "Session done"}
      blurb={
        finished
          ? pile
            ? "That pile is in order. The rest of the tier is untouched."
            : "Every film in this tier has found its spot."
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
      extra={
        (offer.length > 0 || card) && (
          <div className="flex w-full max-w-[300px] flex-col gap-4">
            {offer.length > 0 && (
              <div>
                <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-dim">
                  Still split — rank another pile
                </p>
                <div className="flex gap-2">
                  {offer.map(({ bucket, films: pileFilms }) => (
                    <button
                      key={bucket}
                      onClick={() => onRankPile!(pileFilms.map((f) => f.id))}
                      className="flex-1 rounded-xl border border-border py-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98]"
                    >
                      {bucket === "top" ? "Upper" : bucket === "middle" ? "Middle" : "Lower"}
                      <span className="ml-1.5 text-dim tabular-nums">{pileFilms.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* The one place a tier's order becomes a thing you can keep. It was
                reachable only after a cross-tier person run, which meant the
                mode most people actually use produced nothing shareable. */}
            {card && <CardPicker data={card} />}
          </div>
        )
      }
    />
  );
}

// ── Rolodex — the unconfirmed pile, contender pinned as a gold YOU marker ──
