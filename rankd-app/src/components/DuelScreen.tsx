"use client";

import { dragScreen, inShelf, TURN_AT, type Dir } from "@/lib/ribbon";
import { useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_PACE_S, etaLabel, etaSeconds, paceSeconds } from "@/lib/progress";
import { PLACE_DUELS } from "@/lib/shuffle";
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
  clusterOf,
  confirmLast,
  confirmPrefix,
  settledPrefix,
  decidedRest,
  peekKnown,
  placeAt,
  reopenConfirmed,
  replayStep,
  finishDecided,
  groupFilms,
  nudgeConfirmed,
  reorderCluster,
  ungroupFilm,
} from "@/lib/ladder";
import { buildRelations } from "@/lib/relations";
import { ORDERED_TIERS, starsFor, tierCounts, type Rating } from "@/lib/tiers";
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
import { Eyebrow, ImportButton, PrimaryButton } from "./ui";
import { RunStatus } from "./RunStatus";
import ResumeOverlay from "./ResumeOverlay";
import { clearCuratedRun, clearRun, saveCuratedRun, saveRun } from "@/lib/runs";
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
  ChevronIcon,
  ChevronRightIcon,
  TickIcon,
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
import { MediumSwitch } from "./MediumSwitch";
import { count as plural, lex } from "@/lib/lexicon";
import { type Person } from "@/lib/people";
import { subjectTitle, type RankSubject } from "@/lib/subject";
import { MIN_GENRE_RUN } from "@/lib/genres";
import { pileFor, type RunRequest } from "@/lib/curated";

/** Stable, so `guests` is not a fresh array every render. */
const EMPTY_GUESTS: readonly Film[] = [];
/** Two films is the floor for a climb: one has nothing to be ranked against. */
const MIN_CURATED_RUN = 2;
import { CuratedPicker } from "./CuratedPicker";
import type { AutoStep, Film, RankState } from "@/lib/types";
import type { ReplayMode } from "@/lib/prefs";

const DEFAULT_TIER = 4 as const;

// Which game the setup panel is configuring; null while it is still asking.
type ChosenMode = "koth" | "shuffle" | "roughcut" | null;

// The library and the app-wide chrome now live in AppShell — this screen owns
// only the duel. Everything it still holds is setup state for the next run.
export default function DuelScreen({
  replayMode,
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
  refine,
  onRefineHandled,
  onRunRequestHandled,
  onRunBegan,
  onRoughCutBegan,
  onPerson,
  greet = 0,
  onLocked,
  onRibbon,
  swipeBlocked = false,
}: {
  /**
   * How a duel the record already settles should be shown. See `lib/prefs.ts`.
   *
   * Passed down rather than read here, so changing it in Settings takes effect
   * on the very next duel instead of on the next mount.
   */
  replayMode: ReplayMode;
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
  refine?: RefineRequest | null;
  onRefineHandled?: () => void;
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
  /** The Activity screen. Optional so a caller that has none simply shows no destination. */
  /**
   * A film was just locked.
   *
   * The shell decides what to do about it — today that is offering the tag
   * sheet, which has to live up there because a sheet rendered inside a screen
   * is z-ordered within it and the nav paints over the top.
   */
  onLocked?: (filmId: string) => void;
  /** Somebody has spoken to you on Takes since you last looked. */
  /**
   * A horizontal swipe across the game, taken one step along the ribbon.
   *
   * See `lib/ribbon.ts`. The duel is the middle of it, so both directions lead
   * somewhere: right to the list, left to the profile.
   */
  onRibbon?: (dir: Dir, travelled?: number) => void;
  /** A sheet is open over the game and owns the finger. */
  swipeBlocked?: boolean;
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
  // Bumped every time a run starts, and used as `ShuffleDuel`'s key.
  //
  // Everything a run holds — its batch, its anchor, the sitting's duel count —
  // is component state. Starting a second batch by handing the same instance
  // new options would keep all of it and just change the number beside it, so
  // the run has to be a NEW component. Going again at the same size produces
  // identical options, which is exactly the case a key derived from the options
  // would fail to notice.
  const [runSeq, setRunSeq] = useState(0);
  const startShuffle = (opts: ShuffleOptions) => {
    setRunSeq((i) => i + 1);
    setShuffleRun(opts);
  };

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
  // The pile the user chose to keep playing rather than finish outright, and the
  // count of duels this run settled from the record — the receipt for the strip.
  const [playOnFor, setPlayOnFor] = useState("");
  // How many duels this run settled from the record. Reported once, on the
  // summary — the per-duel version is now the replay itself, which says far more
  // than a count ever did.
  const [skippedRun, setSkippedRun] = useState(0);
  // ── Every commit, counted ────────────────────────────────────────────────
  //
  // A replayed duel commits 200ms into the poster's flight and the flight cannot
  // be cancelled once started, so anything the user does in that window races
  // it — and the pending commit was computed from the state as it stood BEFORE
  // their action, so it wins and silently undoes them.
  //
  // Keying the guard on the pair being shown was not enough: reopening a locked
  // film changes the pile without changing the two posters, so the stale commit
  // sailed through and put the film back on the shelf. A plain counter moves on
  // every commit whatever it touched, which is the only thing that catches all
  // of them.
  const [commitSeq, setCommitSeq] = useState(0);
  useEffect(() => {
    void loadLog().then(setLog);
  }, []);

  // ── Swiping off the game ─────────────────────────────────────────────────
  //
  // The list and the profile own their swipe, because each has pages to turn
  // before the gesture is about the screen at all. The game has none, so this is
  // the whole of it.
  //
  // On the WINDOW rather than a wrapper, because this screen has three quite
  // different trees underneath it — the duel itself, Fast Shuffle and Rough Cut
  // — and one of them, `PosterCard`, is the protected compare screen. A listener
  // up here reaches all three and touches none of them. Checked before writing
  // it: there is not one `onTouch*` handler and not one horizontal scroller
  // anywhere in those components, so it competes with nothing.
  //
  // `PosterCard` did need one change and it was a bug fix. Its release handler
  // was `else { onPick }`, so any drag that was not a vertical throw picked a
  // winner — including a swipe straight across the screen. See `SIDEWAYS` there.
  //
  // In THIS component rather than `AppShell` because the shell's sign-in and
  // handle gates return early, so a hook added there would be called on some
  // renders and not others. This component only mounts while the game is
  // showing, which is also exactly the condition the listener wanted.
  useEffect(() => {
    if (!onRibbon || swipeBlocked) return;
    let from: { x: number; y: number; axis: null | "x" | "y" } | null = null;
    const start = (e: TouchEvent) => {
      // A flick that starts in the film strip belongs to the film strip. See
      // `inShelf` — this is the one guard the duel screen was missing.
      if (inShelf(e.target)) return;
      const t = e.touches[0];
      from = { x: t.clientX, y: t.clientY, axis: null };
    };
    const move = (e: TouchEvent) => {
      if (!from) return;
      const t = e.touches[0];
      const dx = t.clientX - from.x;
      // Already committed sideways: the screen follows the hand, so a swipe here
      // holds and drags like the profile's panels rather than only reporting
      // itself once the finger is gone.
      if (from.axis === "x") return dragScreen(dx);
      if (from.axis) return;
      const dy = t.clientY - from.y;
      // Waiting until the finger commits to an axis. Guessing early turns a
      // scroll that drifted sideways into a navigation.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      from.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    };
    const end = (e: TouchEvent) => {
      const f = from;
      from = null;
      if (!f) return;
      if (f.axis !== "x") return;
      const dx = e.changedTouches[0].clientX - f.x;
      // The same fraction a page turn costs on the list and the profile, so the
      // app asks for one amount of finger rather than three tuned numbers.
      if (Math.abs(dx) <= window.innerWidth * TURN_AT) return dragScreen(null);
      const travelled = Math.abs(dx) / window.innerWidth;
      // No spring back: this `main` is about to be replaced by the next screen's,
      // which arrives with the slide. Easing this one home first would be a
      // bounce nobody asked for in front of the navigation.
      onRibbon(dx < 0 ? 1 : -1, travelled);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, [onRibbon, swipeBlocked]);

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
  // ── A Refine, turned into a run ─────────────────────────────────────────
  //
  // DERIVED from the prop rather than started in an effect. An effect would
  // have to call setState on arrival, which is the pattern the React compiler
  // rejects and which the lint baseline pins at exactly two instances — and it
  // would be state duplicating a prop that already says everything.
  //
  // Scoped to the film's OWN TIER, and that is not a convenience. A score is
  // defined inside a tier band, so a cross-tier answer writes nothing; the
  // person run's comment is emphatic about it. Refining against other tiers
  // would look like it counted and quietly mean something else.
  //
  // `includeConfirmed` is true so the film is in the pool even when it is
  // locked. Whether that lock may MOVE is the separate `movePlaced` flag, which
  // is the user's explicit choice and nothing else's.
  const refineRun: ShuffleOptions | null = useMemo(
    () =>
      refine
        ? {
            scope: { kind: "tier", tier: refine.film.rating as Rating },
            includeConfirmed: true,
            movePlaced: refine.movePlaced,
            focus: refine.film.id,
            target: refine.duels,
          }
        : null,
    [refine],
  );

  // A started run wins: going again from the end screen replaces the refine.
  const activeRun: ShuffleOptions | null = shuffleRun ?? refineRun;

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

  // ── What the user has already decided ─────────────────────────────────────
  //
  // The evidence log has always been written and never read back. This is where
  // it starts being read: the closure over the current pile, handed to the
  // engine so a duel the user already answered is settled from the record rather
  // than put on screen again. See lib/relations.ts.
  //
  // Keyed on pile MEMBERSHIP rather than order — the pile reorders on every
  // duel, and an order-keyed memo would rebuild hundreds of times a run for no
  // reason — and on the log by reference, which changes exactly when a judgement
  // is written or retracted. Undo therefore rebuilds rather than patches, which
  // is the only way a retracted row can un-derive what it implied.
  const pileKeySet = state?.session
    ? [...state.session.confirmed, ...state.session.unconfirmed].slice().sort().join(",")
    : "";
  const oracle = useMemo(
    () => (pileKeySet ? buildRelations(pileKeySet.split(","), log) : undefined),
    [pileKeySet, log],
  );

  // The run as it stands, for callbacks that fire later than the render that
  // scheduled them. Written after every render; read through `cur` below.
  const latest = useRef<RankState | null>(null);
  useEffect(() => {
    latest.current = state ? { ...state, oracle } : null;
  });

  if (!state) return null;
  const { session } = state;

  // Every engine call goes through this, so the oracle can never be forgotten at
  // one call site and silently turn the saving off for that path.
  const armed: RankState = { ...state, oracle };

  // ── The oracle a run is STARTED with ──────────────────────────────────────
  //
  // `oracle` above is scoped to the pile currently being climbed, which is the
  // right scope for every transition inside a run and the wrong one for starting
  // a new one: at that moment the session still describes the run being left, or
  // there is no session at all. Passing it to `startRun` handed the new pile an
  // oracle that knew nothing about it, so a run opened by asking a duel the user
  // had already answered and only started remembering from the second tap.
  //
  // Built over the whole library instead, because `startRun` chooses its own
  // pool from a tier and a reach and this is the only set guaranteed to contain
  // it. One Warshall pass at run start — tens of milliseconds on a large
  // library, against the hours the run itself takes.
  const startingOracle = () => buildRelations(state.films.map((f) => f.id), log);

  // The one way a state from the engine reaches the screen.
  //
  // The engine is pure, so it cannot write; it hands settled duels up on
  // `state.journal` and they are drained HERE, at the moment the judgement was
  // made, rather than watched for in an effect. Draining on arrival is what
  // keeps the journal near-empty — a marathon session would otherwise copy an
  // ever-growing array on every single tap — and it means a duel is evidence the
  // instant it is answered, whatever happens to the run afterwards.
  const commit = (next: RankState, persist = true) => {
    setCommitSeq((n) => n + 1);
    if (persist) saveFilms(next.films);
    // Duels this transition settled from the record — one at a time now, since
    // the screen plays each one rather than the engine swallowing the lot.
    // `resolved` lives on RankState and never on the session, so it cannot
    // round-trip through localStorage and re-announce itself on a resume.
    const auto = next.resolved?.length ?? 0;
    if (auto > 0) setSkippedRun((n) => n + auto);
    // A new run starts its own tally.
    if (!state.session && next.session) {
      setSkippedRun(auto);
      setPlayOnFor("");
    }
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
    // And the curated half, on the same single path for the same reason. The
    // two stores are mutually exclusive by construction: `saveRun` clears when
    // handed a cross-tier session and this one clears when handed anything
    // else, so whichever kind of run you are in is the only one on disk.
    //
    // Guests come from the request rather than the session, because the session
    // holds ids and a guest is the one film an id cannot resolve.
    saveCuratedRun(
      next.session?.crossTier && runSubject
        ? { session: next.session, subject: runSubject, guests: [...guests] }
        : null,
    );
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
  const decide = (winnerId: string) => commitUndoable(choose(armed, winnerId));
  // Same shape as a decision, because that is what it is — a recorded answer of
  // "neither". The climb steps the contender in below the challenger.
  const declineToCall = () => commitUndoable(skipPair(armed));
  // Assertions, not judgements: they reorder the pile and record nothing, so
  // there is never a journal to drain and nothing to persist until a confirm.
  const flick = (filmId: string) => commit(flickToTop(armed, filmId), false);
  const sink = (filmId: string) => commit(flickToBottom(armed, filmId), false);
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  // ── The duel the record already settles ─────────────────────────────────
  //
  // A peek, so the arena can SHOW it before anything moves. Committing it is a
  // separate call the screen makes on a timer, which is what makes the pass
  // watchable and interruptible — the engine holds no replay state and needs no
  // mode. See `peekKnown` for why this replaced an atomic resolve loop.
  //
  // `persist` false: a replayed duel moves the pile and commits nothing, exactly
  // like a flick. Only a confirm writes scores.
  const replay = peekKnown(armed);

  // ── Why these read from a ref and not from `armed` ────────────────────────
  //
  // A replayed duel commits 200ms into the poster's flight, and the flight
  // cannot be cancelled once it has started. So the commit happens well after
  // the render that scheduled it — and if the user did anything in between (lock
  // the bottom film, place one by hand, reopen one), a handler holding the
  // `armed` from that older render would compute from a pile that no longer
  // exists and write it back, silently undoing them. Observed as "Make last"
  // locking the film and leaving it in the pile anyway.
  //
  // Guarding the commit was tried first and is the wrong shape: it makes a
  // deferred action a race to be refereed rather than one that simply reads the
  // current state when it runs. This ref is written after every render, so a
  // callback fired at any later moment sees the run as it stands.
  // Falls back to this render's value on the very first render, before the
  // effect that writes the ref has run.
  const cur = (): RankState => latest.current ?? armed;

  const playRemembered = () => commit(replayStep(cur()), false);
  // Locking the bottom film commits — it writes a score and a hard lock, exactly
  // as a confirm does — so unlike the assertions above it persists.
  const lockLast = () => commit(confirmLast(cur()));
  const placeHere = (index: number) =>
    commit(placeAt(cur(), cur().session?.contenderId ?? "", index), false);
  const reopen = (filmId: string) => commit(reopenConfirmed(cur(), filmId));
  // Gathering and releasing are assertions like the flicks — they reorder the
  // pile, record nothing, and commit nothing until a confirm. `persist` false
  // for the same reason: there are no scores to write yet.
  const gatherFilms = (ids: string[], anchorId: string) =>
    commit(groupFilms(armed, ids, anchorId), false);
  const releaseFilm = (filmId: string) => commit(ungroupFilm(armed, filmId), false);
  /**
   * One control, two meanings, decided by where the film is.
   *
   * On the shelf it is a real correction to a placed ranking, so it writes the
   * move to the log the way a drag does. Inside a group it is only rearranging
   * an assertion nobody has committed yet, so it writes nothing — see
   * `reorderCluster` for why minting rows there would poison the oracle.
   */
  const nudge = (filmId: string, delta: number) => {
    if (!session) return;
    if (session.confirmed.includes(filmId)) return commitUndoable(nudgeConfirmed(armed, filmId, delta));
    commit(reorderCluster(armed, filmId, delta), false);
  };
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
    // Which film this was about, read BEFORE confirming — `confirm` clears the
    // session, and the contender is what the tag prompt is for.
    const locked = session?.contenderId ?? null;
    // Winning the promotion duels banks a new star rating instead of a position.
    const next = promotionWon(armed) ? completePromotion(armed) : confirm(armed);
    // Offered after the commit, so the placement is already safe. A prompt that
    // could cost somebody their lock would be worse than no prompt.
    if (locked) setTimeout(() => onLocked?.(locked), 0);
    if (session?.crossTier && !next.session) {
      endCrossTier([...session.confirmed, session.contenderId], true);
      commit(dropGuests(next));
      return;
    }
    commit(next);
  };
  const backOut = () => commit(stepBackFromConfirm(armed), false);

  // Returns whether a run actually started, so the setup panel can stay open and
  // say why instead of dropping you on a "tier complete" screen that was really
  // "your range holds fewer than two films".
  const beginRun = (tier: Rating, films = state.films): boolean => {
    // startRun builds a state from films alone, so any duels not yet drained to
    // the log are carried across by hand rather than dropped.
    try {
      commit({ ...startRun(films, tier, { shuffle, below, above, oracle: startingOracle() }), journal: state.journal }, false);
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

  // ── Not offered for a champion the record carried to the top ──────────────
  //
  // `promotionTarget` says the claim is that a film "beat every other film you
  // own at that rating, one at a time". Transitively is a weaker claim than that
  // sentence, and a reward screen arriving after zero taps reads as the app
  // handing out a star rating on its own. If the record already knows this film
  // tops its tier, the promotion still gets offered — the next time it earns the
  // top with duels actually fought.
  const promoteTo = (state.resolved?.length ?? 0) > 0 ? undefined : promotionTarget(state);
  const takeOnTierAbove = () => commit(startPromotionDuel(armed), false);
  const assertPromotion = () => commit(promoteDirect(armed));

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
            commit({ ...startRun(films, roughCutTier, { only: ids, oracle: startingOracle() }), journal: state.journal }, false);
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
            startShuffle(opts);
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
              commit({ ...startRun(state.films, setupTier, { only: ids, oracle: startingOracle() }), journal: state.journal }, false);
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
          skipped={skippedRun}
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
              commit({ ...startRun(state.films, endedTier, { only: ids, oracle: startingOracle() }), journal: state.journal }, false);
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
  // ── `!activeRun` is load-bearing. Do not drop it. ────────────────────────
  //
  // Fast Shuffle sets `shuffleRun` and starts no SESSION — it has no pile, no
  // climb and no confirm, which is the whole point of it. So with nothing else
  // running, choosing it used to set the run, close the sheet, and land right
  // back on this screen, because this early return fires on `!session` alone and
  // sits ABOVE the branch that renders `ShuffleDuel`.
  //
  // The symptom was precisely: Fast Shuffle does nothing, and then starts by
  // itself the moment you pick a tier — because a King of the Hill run creates
  // the session this return was waiting for, and the shuffle branch below was
  // finally reached.
  //
  // Same shape as "Something else did nothing" and the sheets that had to be
  // rendered by every branch: an early return swallowing a state nobody checked
  // it against. Any new full-surface return above the shuffle branch needs this
  // guard too.
  if (!session && !runResult && !activeRun) {
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
                  {empty ? (
                    `No ${lex().many} yet`
                  ) : (
                    // Two sentences, two lines. Left to wrap it broke after
                    // WHAT'S, which splits the question rather than the pair of
                    // sentences and reads as a mistake.
                    //
                    // No full stop on the first line. The line break already
                    // does the stopping, and on a CENTRED line a trailing full
                    // stop is a piece of ink hanging past the last letter — it
                    // shifts the optical centre left while the box stays put,
                    // so the two lines read as misaligned. The user spotted it
                    // as "it makes the text off centre", which is exactly what
                    // it does.
                    <>
                      Everyone has a favourite
                      <br />
                      What&rsquo;s yours?
                    </>
                  )}
                </p>
                {empty ? (
                  <>
                    <p className="mx-auto mt-2 max-w-[260px] text-sub leading-relaxed text-dim">
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
                  <p className="mt-2 text-sub text-dim tabular-nums">
                    {plural(state.films.length)} &middot; {placedNow.toLocaleString()} placed
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
                  {/* `primary`, because on this screen it is not one of two
                      choices — it is the only thing there is to do. Without it
                      the control inherited the outlined treatment meant for
                      Settings' Merge/Replace pair, so a brand-new user's single
                      call to action was drawn as the quietest button in the app
                      while the same screen WITH films in it offered a full gold
                      pill. */}
                  <ImportButton
                    label={`Import your ${lex().many}`}
                    merge={false}
                    primary
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
                  {/* One way in, not two.
                      "Pick a tier" sat here as the primary action and started a
                      King of the Hill climb without ever naming it — so the
                      choice of MODE was made for you by the button you pressed
                      to choose a TIER, and the Play sheet underneath offers the
                      same tier picker anyway. Every mode now begins the same
                      way, which is also what stops this screen quietly deciding
                      that the default game is the most expensive one. */}
                  <PrimaryButton wide onClick={() => setModeOpen(true)}>
                      Start ranking
                    </PrimaryButton>
                </>
              )}
              <button
                onClick={onProfile}
                className="mt-3 w-full py-2 text-center text-sub text-dim active:scale-95"
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

  // ── Nothing left to decide ────────────────────────────────────────────────
  //
  // Checked BEFORE the confirm branch, and that ordering is the whole feature.
  // Once the climb reads the record, a fully settled pile costs no duels — but
  // it still costs one Lock in tap per film, because the engine walks to a
  // confirm, and confirm restarts the climb and walks to the next one. On a
  // re-ranked 200-film tier that is 200 taps for 200 foregone conclusions.
  // Offered, never automatic: placing fifty films unasked is the app deciding
  // for you, which is the one thing this is built not to do.
  // "Keep playing anyway" is remembered against the PILE, so declining once
  // silences the offer for the rest of that run rather than for one render —
  // and a different pile, which is a different run, gets asked again.
  const settledRest = playOnFor === pileKeySet ? null : decidedRest(armed);
  const finishAll = () => commit(finishDecided(armed));
  // The batch case: not the whole pile, but a settled run at the top of it.
  const settled = settledPrefix(armed);
  const lockSettled = () => commit(confirmPrefix(armed));

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
              <span className="max-w-[120px] truncate text-sub font-bold leading-none text-gold">
                {runSubject ? subjectTitle(runSubject) : ""}
              </span>
            ) : (
              <button onClick={() => setTierOpen(true)} className="flex items-baseline gap-1.5 active:scale-95">
                <span className="text-body leading-none text-gold">{starsFor(session?.tier ?? DEFAULT_TIER)}</span>
                <span className="text-dim"><ChevronIcon size={11} /></span>
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
            // Done with it, so it must not be offered again on the next open.
            // The commit path clears this too once the session goes null, but a
            // run finished from the summary can leave without another commit —
            // and a resume into a run you have already read the result of is
            // the exact thing this store exists to avoid.
            clearCuratedRun();
            onRunRequestHandled?.(); // the request is finished with now, not before
          }}
        />
      ) : /* Fast Shuffle owns the whole surface while it runs: it has no pile, no
          climb and no confirm, so none of the branches below apply to it. */
      activeRun ? (
        <ShuffleDuel
          key={runSeq}
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
            // Clear the refine as well, or the derived run reappears the
            // instant the screen re-renders and there is no way out of it.
            onRefineHandled?.();
          }}
          onList={onList}
          // Another batch, same scope, without going back through the sheet.
          //
          // Remounting matters and is why the key below exists: everything a
          // run holds — the batch, the anchor, the sitting's duel count — is
          // component state, and handing the same instance a new `options`
          // would keep the finished run's state and simply change the number
          // beside it.
          onAgainSize={(size) => startShuffle({ ...activeRun, batch: size })}
        />
      ) : settledRest && session ? (
        <AllDecided
          films={filmsOf(settledRest)}
          from={(session.confirmed.length ?? 0) + 1}
          onFinish={finishAll}
          onKeepPlaying={() => setPlayOnFor(pileKeySet)}
          onDone={endRun}
        />
      ) : champion ? (
        <ConfirmView
          champion={champion}
          rank={(session?.confirmed.length ?? 0) + 1}
          onConfirm={lockIn}
          batch={settled?.length}
          onBatch={lockSettled}
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
          tail={session.confirmedTail ?? []}
          films={state.films}
          onPick={decide}
          onDraw={declineToCall}
          onDone={endRun}
          onUndo={undo}
          canUndo={!!undoStep}
          onFlick={flick}
          onSink={sink}
          onScrub={scrub}
          replay={replay}
          onReplay={playRemembered}
          mode={replayMode}
          onLast={lockLast}
          onPlaceAt={placeHere}
          onReopen={reopen}
          seq={commitSeq}
          clusterFor={(id) => (session ? clusterOf(session, id) : null)}
          onGroup={gatherFilms}
          onUngroup={releaseFilm}
          onNudge={nudge}
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
          skipped={skippedRun}
          runIds={session ? [...session.confirmed, ...session.unconfirmed] : undefined}
          onPickTier={() => setTierOpen(true)}
          onList={onList}
          onRankPile={(ids) => {
            try {
              commit(
                { ...startRun(state.films, session?.tier ?? DEFAULT_TIER, { only: ids, oracle: startingOracle() }), journal: state.journal },
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
/**
 * A Refine asked for from a film card, waiting to be started.
 *
 * Deliberately not a `RunRequest`: that type is for CURATED runs, which write
 * no scores by design. Refining writes one — improving a film's position inside
 * its tier is the entire point — so it starts a Fast Shuffle instead.
 */
export interface RefineRequest {
  film: Film;
  duels: number;
  /** Only ever true for a locked film whose owner chose to let it move. */
  movePlaced: boolean;
}

export function BottomNav({
  screen,
  onSettings,
  onModes,
  onList,
  onProfile,
  logging,
  onToggleLog,
}: {
  screen: "duel" | "list" | "profile" | "activity";
  onSettings: () => void;
  onModes?: () => void;
  onList: () => void;
  onProfile?: () => void;
  /** Somebody has spoken to you since you last looked. Draws a dot, not a number. */
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
      {/* ── Four cells, and RNK is no longer dead centre ────────────────────
          This read "Five equal cells so RNK sits dead centre — it's the core
          loop", and that was true until Takes came out (28 Aug 2026, see
          `RIBBON` in lib/ribbon.ts). Four cells put RNK third of four, which is
          off centre by half a cell.

          Left that way ON PURPOSE rather than papered over by reordering. The
          centre rule is worth keeping and it wants its fifth cell back, so the
          honest state is a nav that visibly has a hole in it until the social
          rework decides what fills it. Reordering to fake a centre would hide
          the very thing the next person needs to see. */}
      <NavItem label="Your list" active={screen === "list"} onClick={onList} icon={<ListIcon />} />
      {/* Was End session, which is now Done inside the duel where it belongs —
          you stop a run from the run, not from the chrome. The cell goes to
          logging a film you've just watched, which is the one thing the app
          could not do at all: the library only ever arrived by CSV, so it knew
          your past and had nothing to say about tonight. Works on every screen,
          unlike the control it replaced. */}
      <NavItem label={`Log a ${lex().one}`} active={logging} onClick={onToggleLog} icon={<AddFilmIcon />} />
      <NavItem label="Rank" active={screen === "duel"} onClick={onModes} icon={<RankdMark />} tour="rank" />
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
          blurb={`Split a tier into piles, one ${lex().one} at a time. The fastest way to get a big library into shape.`}
          meta="one pass"
          onClick={() => setChosen("roughcut")}
        />
        <ModeRow
          title="King of the Hill"
          blurb={`One tier at a time. Winner moves on. This is how a ${lex().one} gets a place you locked yourself.`}
          meta={`locks ${lex().many}`}
          onClick={() => setChosen("koth")}
        />
        {/* The one mode with no pile and no confirm. It asks whichever question
            it can least predict the answer to, and stops when you do. */}
        {/* The blurb was four sentences and a worked example, which made this
            row three times the height of the one above it and buried the only
            thing that matters: these placements are PROVISIONAL. */}
        <ModeRow
          title="Fast Shuffle"
          blurb={`Two ${lex().many}, no piles, no confirming. Rankd places what it works out, and keeps the right to change its mind.`}
          meta="provisional"
          onClick={() => setChosen("shuffle")}
        />
        {/* Curated lists sit with the modes rather than behind a film's info
            card, which is where the only route to one used to be. They are a
            different KIND of thing — they change no scores and settle nothing —
            so the blurb has to say so, or it reads as a fourth way to rank. */}
        <ModeRow
          title="Curator"
          blurb={`${runSubjects()}. Everyone has their favourite. Your main list doesn't move.`}
          meta="changes nothing"
          onClick={onCurated}
        />
      </Sheet>
    );
  }

  if (chosen === "shuffle") {
    return (
      <ShuffleSetup
        films={films}
        onClose={onClose}
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
        <p className="mb-3 text-sub leading-snug text-dim">
          One pass, one decision per film. Nothing is locked — it just gives the tier a rough
          order so ranking it properly afterwards is a fraction of the work.
        </p>
        <button
          onClick={onPickTier}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
        >
          <Eyebrow>Tier</Eyebrow>
          <span className="flex items-baseline gap-2">
            <span className="text-body text-gold">{starsFor(tier)}</span>
            <span className="text-sub text-dim">
              {plural(inTier)} ›
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
            <span className="text-body text-text-hi">Range</span>
            <span className="text-sub text-gold">
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
          <div className="flex justify-between text-label text-dim">
            <span>½</span>
            <span>★★★★★</span>
          </div>
          {(below > 0 || above > 0) && (
            <p className="mt-2 text-sub leading-snug text-dim">
              Every film keeps its own star rating — this only decides which films are dealt.
            </p>
          )}
        </div>

        <StartButton
          label={`Start · ${plural(inTier)}`}
          onClick={() => onRoughCut(tier)}
          disabled={inTier < 3}
        />
        {inTier < 3 && (
          <p className="mt-2 text-center text-sub text-gold">
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
              <p className="mb-2 text-label font-bold uppercase tracking-[0.18em] text-dim">
                Already split — rank a pile
              </p>
              <div className="flex gap-2">
                {BUCKETS.map((b) => (
                  <button
                    key={b}
                    disabled={open[b].length < 2}
                    onClick={() => onRankPile(open[b].map((f) => f.id))}
                    className="flex-1 rounded-xl border border-border py-2.5 text-label font-bold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98] disabled:opacity-40"
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
        <Eyebrow>Tier</Eyebrow>
        <span className="flex items-baseline gap-2">
          <span className="text-body text-gold">{starsFor(tier)}</span>
          <span className="text-sub text-dim">
            {plural(count)} ›
          </span>
        </span>
      </button>

      {/* Reach set independently either side — a 1★ run might want 0.5★ below
          and 1.5★ above, which a single symmetric figure can't express.
          Cross-tier duels are the ones the overall order most needs: they're the
          only comparisons that say anything about how two star bands relate. */}
      <div className="mt-4 rounded-xl border border-border px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-body text-text-hi">Range</span>
          <span className="text-sub text-gold">
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
        <div className="flex justify-between text-label text-dim">
          <span>½</span>
          <span>★★★★★</span>
        </div>

        {(below > 0 || above > 0) && (
          <p className="mt-2 text-sub leading-snug text-dim">
            {plural(count)} in range. Every {lex().one} keeps its own star rating — this only decides which
            films meet each other.
          </p>
        )}
      </div>

      <div className="mt-2">
        <ShuffleRow shuffle={shuffle} onShuffle={onShuffle} />
      </div>

      <StartButton label={`Start · ${plural(count)}`} onClick={() => onKoth(tier)} disabled={!playable} />
      {!playable && (
        <p className="mt-2 text-center text-sub text-gold">
          Only {plural(count)} in range — widen it or pick another tier.
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
/**
 * The ten tiers, drawn as the shape of the library, selected by tapping.
 *
 * ── Why a histogram and not a list of rows ────────────────────────────────
 *
 * The question this control answers is "where should I spend the next twenty
 * minutes", and that question has never been answerable from a list of star
 * strings: it needs to know where the films ARE and where the unranked ones
 * are, and the old picker showed neither until you had already committed to a
 * tier and left the sheet.
 *
 * So the height of a column is how many films that tier holds, and the bright
 * part of it is how many of them this run would still have to place. A library
 * with a bulge at 3½ and nothing placed in it says so at a glance, and the tier
 * worth opening is the tallest bright bar. That is the same information the two
 * removed screens were withholding, in less vertical space than either took.
 *
 * ── Why tap-to-toggle and not a range slider ──────────────────────────────
 *
 * A slider can only express a contiguous span, and it costs a grab, a drag and
 * a release per edge. Ten targets cost one tap each, express spans that are not
 * contiguous, and — the part that matters on a phone — are hit with the thumb
 * without aiming at an 8px handle.
 *
 * Counts come from the run's own pool function, not from a filter written here,
 * so a tier that looks empty because everything in it is hard-locked reads as
 * empty rather than as a bar the run would refuse to draw from.
 */
function TierStrip({
  films,
  picked,
  includeConfirmed,
  reshuffle,
  onToggle,
}: {
  films: Film[];
  picked: Rating[];
  includeConfirmed: boolean;
  reshuffle: boolean;
  onToggle: (t: Rating) => void;
}) {
  const cols = ORDERED_TIERS.map((tier) => {
    const pool = poolFor(films, { scope: { kind: "tier", tier }, includeConfirmed });
    return {
      tier,
      total: pool.length,
      // What this run would actually still have to do here, under the two ticks
      // below the strip. Both of them change these bars live, which is the
      // cheapest way to show what "include ones I've placed" is worth.
      left: pool.filter((f) => reshuffle || !isPlaced(f)).length,
      // A duel needs two. One film in a tier is a bar you can see and cannot
      // play, and saying so with opacity is kinder than a toast on tap.
      playable: pool.length >= 2,
    };
  });
  // Relative heights, so the strip is about SHAPE rather than absolute size. A
  // floor of 1 keeps the division safe on an empty library.
  const tallest = Math.max(1, ...cols.map((c) => c.total));

  return (
    <div className="mb-1.5 flex items-end gap-1">
      {cols.map(({ tier, total, left, playable }) => {
        const on = picked.includes(tier);
        const h = Math.round((total / tallest) * BAR_H);
        return (
          <button
            key={tier}
            disabled={!playable}
            onClick={() => onToggle(tier)}
            aria-pressed={on}
            aria-label={`${starsFor(tier)} — ${plural(total)}, ${left} still to place`}
            className="flex flex-1 flex-col items-center gap-1 active:scale-95 disabled:opacity-25"
          >
            <span className="flex w-full items-end justify-center" style={{ height: BAR_H }}>
              <span
                className="relative w-full overflow-hidden rounded-t-[3px]"
                // A tier with films in it always draws something, or one outlier
                // tall bar would make three real tiers invisible.
                style={{ height: total > 0 ? Math.max(h, 3) : 2, background: "var(--border)" }}
              >
                <span
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: total > 0 ? `${(left / total) * 100}%` : 0,
                    background: on ? "var(--gold)" : "var(--dim)",
                  }}
                />
              </span>
            </span>
            <span className={`text-label font-bold tabular-nums ${on ? "text-gold" : "text-dim"}`}>
              {TIER_TICK[tier]}
            </span>
            {/* The selection rail. The bar itself cannot carry it: a bar's height
                is data, so a selected ½★ tier holding four films would announce
                itself with a 3px sliver. The rail is the same width under every
                column whatever the count. */}
            <span
              className="h-[2px] w-full rounded-full"
              style={{ background: on ? "var(--gold)" : "transparent" }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Tall enough to show shape, short enough that the ticks stay above the fold. */
const BAR_H = 52;

/**
 * Compact tier labels for the strip.
 *
 * `starsFor` is the app's word for a tier everywhere else and stays so in the
 * summary line under the strip, but five glyphs will not fit in a tenth of a
 * phone's width. A numeral does, and the column it sits under is already
 * carrying the meaning.
 */
const TIER_TICK: Record<number, string> = {
  5: "5",
  4.5: "4½",
  4: "4",
  3.5: "3½",
  3: "3",
  2.5: "2½",
  2: "2",
  1.5: "1½",
  1: "1",
  0.5: "½",
};

function ShuffleSetup({
  films,
  onClose,
  onBack,
  onStart,
}: {
  films: Film[];
  onClose: () => void;
  onBack: () => void;
  onStart: (opts: ShuffleOptions) => void;
}) {
  /**
   * Which tiers this run is aimed at. Empty means all of them.
   *
   * ── What this replaced, and why three controls became one ────────────────
   *
   * "What to compare" was a row of three tabs — All / This tier / Range — and
   * picking anything but the first opened a SECOND control: a row that said
   * "Tier ›", which closed this sheet and swapped in a different one, and then
   * for Range a two-handled slider underneath. Choosing 4★ and 5★ meant a tab,
   * a sheet you had to be handed back from, and a drag. The reported symptom
   * was "menus in menus"; the cause is that all three controls were saying the
   * same thing in three grammars, and one of them destroyed the sheet you were
   * filling in to say it.
   *
   * A tier selection is a SET, so the control is a set: ten tiers, tap to
   * include. Nothing selected is everything, which keeps the mode opening on
   * the answer it always opened on. Contiguity is no longer required, so "my
   * 5s and my 3s" is now sayable and was not before.
   */
  const [picked, setPicked] = useState<Rating[]>([]);
  const [includeConfirmed, setIncludeConfirmed] = useState(false);
  // Off every time the panel opens, deliberately not remembered. This rewrites
  // ratings, so it should be a decision made for THIS run rather than a setting
  // somebody turned on once and forgot about.
  const [reRateOn, setReRateOn] = useState(false);
  // Off by default so the mode still opens on "what has no number yet", which
  // is the right first answer for a library that is not finished.
  const [reshuffle, setReshuffle] = useState(false);
  // ── How big this run is ─────────────────────────────────────────────────
  //
  // FILMS, not minutes, and the third shape this control has taken.
  //
  // It was duels with a minutes estimate; then minutes with a duel count. Both
  // asked the same question — how long do you want to play — and the user's
  // objection is that the app should not be asking it at all: the time "means
  // nothing, it's just to help the user understand how big a task is before
  // they overcommit and hate the app".
  //
  // So the number you choose is a number of FILMS to get through, the ETA sits
  // under it as guidance, and the run ends when those films have their numbers.
  // What you are choosing is the size of the job rather than the length of the
  // sitting, and the job is the thing with a finish line.
  const [batch, setBatch] = useState<number | null>(50);
  // This person's own seconds-per-duel, read from the log once when the sheet
  // opens. Async because `loadLog` is, and `DEFAULT_PACE_S` until it lands — a
  // sheet that showed no estimate for a beat would be worse than one that shows
  // a reasonable default and then corrects itself.
  const [paceS, setPaceS] = useState(DEFAULT_PACE_S);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { loadLog } = await import("@/lib/log");
      const rows = await loadLog();
      if (alive) setPaceS(paceSeconds(rows));
    })();
    return () => {
      alive = false;
    };
  }, []);
  // Descending, because the strip is drawn that way and the scope should read
  // in the same order the eye picked it in.
  const chosen = ORDERED_TIERS.filter((t) => picked.includes(t));
  // A single tier still emits `kind: "tier"`. Nothing downstream distinguishes
  // it from a one-element `tiers`, but a run over one tier is the oldest shape
  // in the mode and there is no reason for it to start arriving in a new one.
  const scope: ShuffleOptions["scope"] =
    chosen.length === 0
      ? { kind: "all" }
      : chosen.length === 1
        ? { kind: "tier", tier: chosen[0] }
        : { kind: "tiers", tiers: chosen };

  // The count the run will actually use, from the run's own function — a second
  // filter computed here would drift from it the first time either changed.
  const count = poolFor(films, { scope, includeConfirmed }).length;
  const playable = count >= 2;
  // How many films in this scope have no number yet. A batch cannot be bigger
  // than the work available, and a start button offering 100 when 12 remain
  // would be promising a run that ends early for reasons nobody explained.
  // Matches what the run will actually draw, or the button promises a length
  // the batch cannot deliver. See `reshuffle` in ShuffleOptions.
  const unplaced = poolFor(films, { scope, includeConfirmed }).filter(
    (f) => reshuffle || !isPlaced(f),
  ).length;



  return (
    <Sheet title="Fast Shuffle" onClose={onClose}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-label font-bold uppercase tracking-[0.14em] text-dim">Which tiers</span>
        {/* Only once there is something to undo. An always-present "Clear" on a
            selection that is already empty is a control that does nothing, and
            the eye has to check it every time. */}
        {chosen.length > 0 && (
          <button
            onClick={() => setPicked([])}
            className="text-label font-bold uppercase tracking-[0.14em] text-gold active:scale-95"
          >
            Clear
          </button>
        )}
      </div>

      <TierStrip
        films={films}
        picked={picked}
        includeConfirmed={includeConfirmed}
        reshuffle={reshuffle}
        onToggle={(t) =>
          setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
        }
      />

      {/* One line, and it is the line the tabs used to be: what is in, and how
          much work that is. The count is the run's own `unplaced`, so the
          number here and the number on the start button cannot disagree. */}
      <p className="mb-3 text-center text-sub text-dim">
        {chosen.length === 0
          ? "Every tier"
          : chosen.length === 1
            ? starsFor(chosen[0])
            : `${chosen.length} tiers`}
        {" · "}
        <span className="text-gold">{plural(unplaced)}</span> to place
      </p>

      {/* ── Session length ───────────────────────────────────────────────
          The user's ask, and the choice inside it mattered: a target that ENDS
          the session, rather than fencing the shuffle into N films and running
          those to completion. Fencing it would take away the matchmaker's
          judgement about which question is worth asking and spend every duel
          inside a pen — sharpening one arbitrary patch and leaving the rest
          untouched. See the note on `ShuffleOptions.target`. */}
      <div className="mb-3">
        <div className="mb-1.5 text-label font-bold uppercase tracking-[0.14em] text-dim">How many</div>
        <div className="flex gap-2">
          {[25, 50, 100].map((b) => (
            <ScopeTab key={b} label={String(b)} active={batch === b} onClick={() => setBatch(b)} />
          ))}
          <ScopeTab label="No limit" active={batch === null} onClick={() => setBatch(null)} />
        </div>
        {/* The ETA is guidance, deliberately under the choice rather than
            beside it: it is not what you are picking, it is what you are being
            warned about. Derived from this person's own measured pace. */}
        <p className="mt-1.5 text-center text-sub text-dim">
          {batch === null
            ? "Runs until you stop."
            : `${plural(Math.min(batch, unplaced))} to get a number · ${etaLabel(
                etaSeconds(Math.min(batch, unplaced), paceS, PLACE_DUELS),
              )}`}
        </p>
      </div>

      {/* Off, this ranks the films with no position yet. On, it is allowed to
          re-order the ones you placed — which is why it is a deliberate tick
          rather than a default. */}
      <label className="mb-1 flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <span className="min-w-0 pr-3">
          <span className="block text-body text-text-hi">Include {lex().many} I&apos;ve already placed</span>
          <span className="block text-sub leading-snug text-dim">
            {includeConfirmed
              ? `Placed ${lex().many} can move within their star rating.`
              : `Placed ${lex().many} stay exactly where you put them.`}
          </span>
        </span>
        <input
          type="checkbox"
          checked={includeConfirmed}
          onChange={(e) => setIncludeConfirmed(e.target.checked)}
          className="tickbox"
        />
      </label>

      {/* ── Going back over what it already placed ──────────────────────
          Without this the mode retires itself: a batch is drawn from films with
          no number yet, so once everything has one there is nothing left to
          play, however shaky those numbers are. */}
      <label className="mb-1 flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <span className="min-w-0 pr-3">
          <span className="block text-body text-text-hi">Go over ones it already placed</span>
          <span className="block text-sub leading-snug text-dim">
            {reshuffle
              ? `Shakiest first, so the ${lex().many} it is least sure of come back round.`
              : `Only ${lex().many} with no number yet.`}
          </span>
        </span>
        <input
          type="checkbox"
          checked={reshuffle}
          onChange={(e) => setReshuffle(e.target.checked)}
          className="tickbox"
        />
      </label>

      {/* ── Letting the run fix a rating ──────────────────────────────────
          Below "include the ones I've placed" because it is the bigger claim of
          the two: that one lets the model re-ORDER what you placed, this one
          lets it disagree with the stars you gave. A tick, not a default, and
          it says out loud that the thing being changed is yours. */}
      <label className="mb-1 flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <span className="min-w-0 pr-3">
          <span className="block text-body text-text-hi">Fix ratings that look wrong</span>
          <span className="block text-sub leading-snug text-dim">
            {reRateOn
              ? `Stars move both ways: up for a ${lex().one} that keeps beating better-rated ones, down for one that keeps losing.`
              : `Stars stay exactly as you set them, even when the duels disagree.`}
          </span>
        </span>
        <input
          type="checkbox"
          checked={reRateOn}
          onChange={(e) => setReRateOn(e.target.checked)}
          className="tickbox"
        />
      </label>

      <StartButton
        label={`Start · ${plural(batch ? Math.min(batch, unplaced) : count)}`}
        onClick={() =>
          onStart({ scope, includeConfirmed, reRate: reRateOn, reshuffle, batch: batch ?? undefined })
        }
        disabled={!playable}
      />
      {!playable && (
        <p className="mt-2 text-center text-sub text-gold">
          Only {plural(count)} here — add a tier, or clear the selection.
        </p>
      )}
      <BackRow onClick={onBack} />
    </Sheet>
  );
}

// ── One row shape for all four modes ──────────────────────────────────────
//
// It was a bordered card per mode, each with a blurb of whatever length the
// mode happened to need — Fast Shuffle's ran to four sentences and a worked
// example while King of the Hill's was six words. Four boxes of wildly
// different heights read as four unrelated things rather than as one choice
// with four answers, and the user's verdict was that the menus are "a little
// awkward to navigate and understand".
//
// Hairlines instead of boxes, matching the list and profile. One type scale:
// 19px display title, 13px body, 9px small-caps for the cost. And a `meta`
// slot so the thing you are actually choosing on — how long this will take —
// is in the same place and the same unit on every row, instead of buried in
// the middle of a paragraph on one of them.
function ModeRow({
  title,
  blurb,
  meta,
  disabled,
  onClick,
}: {
  title: string;
  blurb: string;
  /** The cost, in the unit every mode shares. Right-aligned, same slot. */
  meta?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-baseline gap-3 border-b border-border py-3.5 text-left last:border-b-0 active:scale-[0.99] disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-display text-title leading-tight tracking-wide text-text-hi">{title}</span>
        <span className="mt-0.5 block text-sub leading-snug text-dim">{blurb}</span>
      </span>
      {/* What it costs you, in the one unit all four share. The list used to
          make you infer this from four blurbs of four different lengths. */}
      {meta && (
        <span className="flex-shrink-0 text-label font-bold uppercase tracking-[0.14em] text-dim">{meta}</span>
      )}
      <span className="flex-shrink-0 text-dim"><ChevronRightIcon /></span>
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
            className="mb-1.5 flex w-full flex-col gap-1 rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-40"
          >
            <span className="flex w-full items-center justify-between">
              <span className="text-body text-gold">{starsFor(t)}</span>
              <span className="flex items-center gap-2 text-sub text-dim">
                {n === 0 ? "none" : plural(n)}
                {n === 1 && ", needs 2"}
                {t === current && <span className="text-gold"><TickIcon /></span>}
              </span>
            </span>
            {cut && (cut.resuming !== null || cut.split) && (
              <span className="flex w-full items-center gap-2 text-label tabular-nums">
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
          className="absolute left-6 text-dim transition-colors active:scale-95"
          style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        >
          <GearIcon />
        </button>
      )}
      <button
        onClick={onTrophies}
        aria-label="Achievements"
        className="absolute right-6 text-dim transition-colors active:scale-95"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <TrophyIcon />
      </button>
      <div className="text-center">
        {/* The wordmark is the medium switch. See MediumSwitch.tsx for why it
            lives here rather than on the nav. */}
        <MediumSwitch />
        <div className="mt-1 flex items-center justify-center gap-1">
          {BARS.map((c) => (
            <span key={c} className="h-[3px] w-5 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      {/* ── The feather, and the one rule it broke ─────────────────────────
          A short gradient below the solid header, softening the edge where the
          black chrome meets the page. Ported from rankd.html .lh-header::after.

          It hangs 44px into whatever is underneath, and it is a child of a
          POSITIONED header — so it painted on top of that content rather than
          behind it. On the list screen the block underneath holds the user's
          name 12px down, which put every letter of it under a gradient that is
          92% opaque at the top. Measured: the feather spans 59–103px and the
          name sits at 71–99, entirely inside it. Reported as the name looking
          "a little feathered", which is precisely what was happening to it.

          `-z-10` puts it behind page content while staying above the page
          background, so it still softens the edge and can no longer touch a
          glyph. Nothing else in the header needs a z-index: the header's own
          background is opaque and paints over this quite happily. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full -z-10 h-11"
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
  tail,
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
  clusterFor,
  onGroup,
  onUngroup,
  onNudge,
  replay,
  onReplay,
  mode,
  onLast,
  onPlaceAt,
  onReopen,
  seq,
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  confirmed: string[]; // locked shelf, index 0 = #1
  /** Locked into the bottom of the run, worst last. See `confirmedTail`. */
  tail: string[];
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
  // Gathering and correcting both live in the strip rather than the arena: the
  // compare screen shows two posters and a choice, and it stays that way.
  clusterFor?: (id: string) => string[] | null;
  onGroup?: (ids: string[], anchorId: string) => void;
  onUngroup?: (id: string) => void;
  onNudge?: (id: string, delta: number) => void;
  /**
   * The duel on screen is one the record already settles — play it back.
   *
   * Null for an ordinary duel, which is the only state the arena had before.
   * When set, both posters read blue, the badges say who won last time, and the
   * line under the arena says why.
   */
  replay?: AutoStep | null;
  /** Commit that replayed step and move on to the next. */
  onReplay: () => void;
  mode: ReplayMode;
  /**
   * Lock the pile's bottom film into last place. See `confirmLast`.
   *
   * Only forwarded to the strip — the arena renders no control for it. The pile
   * is not visible here, so the question it answers cannot be asked here.
   */
  onLast?: () => void;
  /** Drop the climber straight into a slot in the pile. See `placeAt`. */
  onPlaceAt?: (index: number) => void;
  /** Take a locked film back off the shelf. See `reopenConfirmed`. */
  onReopen?: (id: string) => void;
  /** Bumped on every commit, so a replay in flight can tell it has been overtaken. */
  seq: number;
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
  // Set while a poster is mid-flight, so one duel cannot be settled twice.
  const busy = useRef(false);
  // Set when the user answers by hand: it stops the replay running on without
  // them. Cleared the moment the climb reaches a duel the record cannot settle,
  // so taking control back is temporary and needs no mode to turn off again.
  const halt = useRef(false);
  // How many remembered duels have run back-to-back, for the pacing ramp.
  const streak = useRef(0);
  // ── Which duel is on screen RIGHT NOW ─────────────────────────────────────
  //
  // A replayed duel commits 200ms into the poster's flight, and the flight
  // cannot be cancelled once it has started. So anything the user does during
  // those 200ms — locking the bottom film from the strip, placing a film by
  // hand, reopening one — races the pending commit, and the commit was built
  // from the state as it stood BEFORE their action. It won, silently undoing
  // them: observed as "Make last" locking the film but leaving it in the pile.
  //
  // The guard is identity, not a lock: the pending commit only lands if the pair
  // it was computed for is still the pair on screen.
  const seqAt = useRef(seq);

  useEffect(() => {
    seqAt.current = seq;
  }, [seq]);

  useEffect(() => {
    busy.current = false;
    if (!replay) {
      // A real decision: the user is being asked something, so the next streak
      // is theirs to watch again.
      halt.current = false;
      streak.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contender.id, challenger.id]);

  // ── Moving the posters ────────────────────────────────────────────────────
  //
  // Shared by a real answer and a replayed one, deliberately: a duel the record
  // already settles has to LOOK like a duel, or the pile appears to reorder
  // itself. The only difference between the two is who chose, and that is said
  // in colour and in words, never by skipping the animation.
  const runMove = (winnerId: string, done: () => void) => {
    const arena = arenaRef.current;
    const cards = arena?.querySelectorAll<HTMLElement>("button");
    const climbImg = cards?.[0]?.querySelector("img");
    const challImg = cards?.[1]?.querySelector("img");

    // A winning challenger becomes the climber, so it flies into the climbing
    // seat before the state swap paints.
    if (winnerId === challenger.id && climbImg && challImg) {
      flyPosterAcross(challImg, climbImg, challenger.poster ?? "");
      setTimeout(done, 200); // commit mid-flight, under the clone
      return;
    }
    if (winnerId === contender.id && challImg) {
      // The climber stays put; only the beaten challenger needs to leave.
      fadeLoserOut(challImg, challenger.poster ?? "");
      done(); // commit at once so the replacement fades up underneath
      return;
    }
    done();
  };

  const pick = (id: string) => {
    // ── The double-tap guard ────────────────────────────────────────────────
    //
    // There was none, and the 200ms commit window was short enough to hide it.
    // A replay holds the same pair on screen for much longer, so a second tap
    // during the beat would settle the same duel twice — once from the tap and
    // once from the timer. Cleared on the pair changing, below.
    if (busy.current) return;
    busy.current = true;
    setPlayed(true);
    // Answering by hand stops the replay. The user is taking the climb back,
    // which is the whole point of showing it to them; `halted` clears itself
    // once the run reaches a duel the record cannot settle. See the effect.
    halt.current = true;
    runMove(id, () => onPick(id));
  };

  // ── Playing back a duel the user already settled ──────────────────────────
  //
  // Measured on a simulated 100-film tier: half of all streaks are a SINGLE
  // remembered duel, but the 95th percentile is 28 and the longest seen was 69.
  // So the common case wants a readable beat and the tail must not become a
  // cutscene — hence the ramp, and hence a tap always stopping it dead.
  useEffect(() => {
    if (!replay || halt.current || busy.current) return;
    // "Skip silently" is the old behaviour, kept as a choice rather than a
    // default: resolve without drawing anything. Same one call, no animation.
    if (mode === "silent") {
      onReplay();
      return;
    }
    const winner = replay.o === "a" ? contender.id : challenger.id;
    const n = streak.current;
    const startedAt = seqAt.current;
    // First few at a readable pace, then accelerating: a long carry reads as the
    // film being swept past everything it has already beaten, which is the true
    // description of what is happening.
    const wait = mode === "watch" ? 620 : Math.max(110, 300 - n * 26);
    const t = setTimeout(() => {
      streak.current = n + 1;
      busy.current = true;
      // Only commit if nothing else has committed meanwhile — see `commitSeq`.
      runMove(winner, () => {
        if (seqAt.current === startedAt) onReplay();
      });
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay?.a, replay?.b, replay?.o, mode]);


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

  // The films locked into the BOTTOM of the run, worst last. They belong at the
  // far end of the strip, below the pile — the strip reads worst-to-best, so a
  // film settled into last place has to appear before everything still fighting
  // or it simply vanishes from the map of where you are.
  const lockedTail = useMemo(
    () => tail.map((id) => films.find((f) => f.id === id)!).filter(Boolean),
    [tail, films],
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
            {/* During a replay this slot says why the duel is settling itself.
                It takes the tips' place rather than sitting beside them: a hint
                about how to play is exactly the wrong thing to read while
                watching a decision you already made, and two lines competing
                here is what made the old receipt easy to miss. */}
            {replay ? (
              <span
                key={`${replay.a}:${replay.b}`}
                className="tip text-center text-label font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--accent)" }}
              >
                {whyLine(replay, films)}
              </span>
            ) : (
              // Only near the end. Announced too early it is noise; at three to
              // go it is the reason you play three more.
              <Tips
                guidance={
                  pile.length > 0 && pile.length <= RUN_ENDGAME
                    ? `Only ${pile.length} left in this run`
                    : undefined
                }
              />
            )}
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
        {/* In a replay the badges stop describing POSITION ("climbing", "not
            ranked yet") and start describing the RECORD, because that is the
            question the user is actually asking: what is this and why is it
            moving. The winner carries the claim; the other card says nothing,
            which `PosterCard` renders as no pill at all. */}
        <PosterCard
          film={contender}
          badge={replay ? (replay.o === "a" ? wonBadge(replay) : "") : "CLIMBING"}
          pick={!replay || replay.o === "a"}
          tone={replay ? "blue" : "gold"}
          pairId={contender.id}
          onPick={pick}
          onFlick={onFlick}
          onSink={onSink}
          onInfo={onInfo}
        />
        <PosterCard
          film={challenger}
          badge={replay ? (replay.o === "a" ? "" : wonBadge(replay)) : "UN-RNKD"}
          pick={!!replay && replay.o !== "a"}
          tone={replay ? "blue" : "gold"}
          pairId={contender.id}
          onPick={pick}
          onFlick={onFlick}
          onSink={onSink}
          onInfo={onInfo}
        />
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
              className={`${CONTROL} disabled:opacity-40 disabled:active:scale-100`}
              style={{
                opacity: played ? undefined : 0,
                pointerEvents: played ? "auto" : "none",
                transition: "opacity 0.25s var(--ease)",
              }}
            >
              Undo
            </button>
            {/* A "Last" control lived here and has gone to the strip. It was
                gated on the climber BEING the pile's bottom film and on no
                replay running — conditions that only coincide for the instant a
                pass starts, which is exactly when a replay is most likely to be
                running. So it almost never appeared.
                It was also the wrong home. The arena shows two posters and a
                choice between them; the pile is not visible here, so "this is
                the worst of what's left" is not a thought this screen can
                prompt. The strip is the only place the whole pile is on screen,
                and that is where MAKE LAST lives now. */}
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
        clusterFor={clusterFor}
        onGroup={onGroup}
        onUngroup={onUngroup}
        onNudge={onNudge}
        onPlaceAt={onPlaceAt}
        onReopen={onReopen}
        onLast={onLast}
        lockedTail={lockedTail}
      />
    </>
  );
}

// ── Saying what a replayed duel is, in the fewest words that are true ───────
//
// The complaint this answers was not "it goes too fast", it was "I am jumping
// places without knowing why or what it's jumping". So the badge names the act
// and the line underneath names the evidence.
//
// Measured on a simulated 100-film tier, essentially every replayed duel is
// DIRECT — the climb kept re-serving pairs the user had literally already
// fought, because each pass walks the same neighbours. The inferred wording is
// still here and still correct, but it is the rare case, not the common one.

/** What the winning poster says while its duel is being played back. */
function wonBadge(step: AutoStep): string {
  if (step.o === "draw") return "TOO CLOSE — YOU SAID";
  return step.via === "direct" ? "YOU PICKED THIS" : "FOLLOWS FROM YOURS";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * The line under the arena: why this duel is settling itself.
 *
 * A direct row can name WHEN, which is the thing that makes it feel like the
 * user's own answer rather than the app's. An inferred one names the film the
 * decision travelled through — the shortest chain, because it is the most
 * convincing version of the argument and the only one that fits on a line.
 */
function whyLine(step: AutoStep, films: Film[]): string {
  const title = (id: string) => films.find((f) => f.id === id)?.title ?? "";
  if (step.via === "direct") {
    if (step.o === "draw") return "You couldn't separate these two";
    if (!step.at) return "You've already picked between these two";
    const d = new Date(step.at);
    const now = new Date();
    const when =
      d.getFullYear() === now.getFullYear()
        ? MONTHS[d.getMonth()]
        : `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return `You picked this in ${when}`;
  }
  // The chain runs winner → … → loser. The middle is the interesting part: it
  // names the film the user's own two decisions met at.
  const via = step.chain?.slice(1, -1) ?? [];
  if (via.length === 0) return "This follows from what you've already said";
  if (via.length === 1) return `You put it over ${title(via[0])}, and ${title(via[0])} over this`;
  return `Follows through ${via.map(title).filter(Boolean).join(", ")}`;
}

// Every mechanic the duel screen understands, cycled one at a time — the screen
// carries no chrome explaining itself, so this is where the game gets taught.
//
// ── Why this is a function and no longer an array ─────────────────────────
//
// It names the medium eight times, and a module-level array is built once when
// the module is first imported — which, for a client component, happens during
// the server pass as well. `lex()` answers with the film words there, so a
// constant would have frozen "Flick a film up" into a book library's tips.
//
// Rebuilt per call, which is nothing: it is eight strings, behind a `useMemo`
// in its only caller.
const tips = (): string[] => {
  const L = lex();
  return [
    // "Tap the one you like more" is gone — the question under the posters now
    // says that, and a tip repeating it wastes a turn of the cycle.
    `Whichever ${L.one} wins keeps climbing`,
    "Can't separate two? Say so, it counts",
    `Flick a ${L.one} up to send it straight to the top`,
    `Flick a ${L.one} down to send it to the bottom`,
    // "who's in it" was a cast question and a book has no cast. "Who made it"
    // is true of both and is what the card actually leads with.
    `Hold a ${L.one} to see who made it and what it's about`,
    "Swipe the row below to choose who you face next",
    "Pull the handle down to hide the row",
    `Nothing's saved until you lock a ${L.one} into place`,
  ];
};
const STRIP_KEY = "rankd-strip-open";

/**
 * "A director, an actor or a genre" — or, for a medium with one credit role,
 * "An author or a genre".
 *
 * Spelled out here rather than inline because the join is the whole point: the
 * list is a different LENGTH per medium, so the comma and the "or" move. Written
 * as a substitution it would have read "An author,  or a genre" for books, with
 * the gap where the actor used to be.
 */
function runSubjects(): string {
  const L = lex();
  // "A author" is what a naive template produced, and it shipped. The article
  // has to follow the word, and the word is different per medium — which is
  // exactly the class of bug the lexicon exists to make impossible, so it is
  // fixed here rather than by choosing nouns that happen to start with a
  // consonant.
  const a = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
  const parts = [a(L.maker), L.secondRole ? a(L.secondRole) : null, "a genre"].filter(
    (p): p is string => p !== null,
  );
  const last = parts.pop()!;
  const line = `${parts.join(", ")} or ${last}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

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
  "px-4 py-3 text-label font-bold uppercase tracking-[0.18em] text-dim transition-colors active:scale-95";

// `guidance` is a line about THIS run rather than about the app — "only 3 left"
// rather than "flick a film up". It joins the rotation at the front instead of
// replacing it: a fixed line stops being read after the second time you see it,
// and the hints are still worth teaching. The end of a run is the one moment
// worth naming, because it is the only one where knowing how close you are
// changes whether you keep going.
function Tips({ guidance }: { guidance?: string }) {
  const items = useMemo(() => {
    const t = tips();
    return guidance ? [guidance, ...t] : t;
  }, [guidance]);
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
    <span className="tip px-6 text-center text-sub leading-snug" style={{ opacity: shown ? 1 : 0 }}>
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
        <span className="text-gold"><ClimbArrow /></span>
        <span className="min-w-[3ch] text-left font-display text-[32px] leading-none tracking-wide text-text/45 tabular-nums">
          {to}
        </span>
        <Hairline flip />
      </div>
      {/* Underneath and centred, so it can't pull the numbers off true. */}
      <span className="text-label font-bold uppercase tracking-[0.14em] text-dim">
        of {total}
      </span>
    </div>
  );
}

// Exported for ShuffleDuel, which needs the poster interaction exactly as it is
// but none of the pile machinery around it. (DuelScreen is due a split — see the
// plan's Phase 3 — at which point this and LastResult get their own file.)
// ── Nothing left to decide ──────────────────────────────────────────────────
//
// The record already settles every remaining pair, so there is no duel left to
// fight and no judgement left to make — only taps. This turns those taps into
// one, and it is the difference between the climb being fast and the climb being
// over.
//
// It is an OFFER. The order is shown before it is taken, and "keep playing" is
// always there: the point of reading the evidence log is to stop asking
// questions the user answered, not to start answering them on their behalf.
function AllDecided({
  films,
  from,
  onFinish,
  onKeepPlaying,
  onDone,
}: {
  films: Film[];
  /** The rank the first of them will take. */
  from: number;
  onFinish: () => void;
  onKeepPlaying: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-label font-bold tracking-[0.14em] text-gold">✓ NOTHING LEFT TO DECIDE</span>
      {/* The order itself, not just a count. A promise to place forty films is
          one the user should be able to check before they accept it — and
          seeing their own ranking is the reassurance that nothing was invented. */}
      <div className="flex w-full max-w-sm justify-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {films.slice(0, 8).map((f, i) => (
          <div key={f.id} className="flex w-[46px] flex-shrink-0 flex-col items-center gap-1">
            <div
              className="w-full overflow-hidden rounded-md bg-surface"
              style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 1.5px var(--gold)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            <span className="text-label font-bold tabular-nums text-dim">{from + i}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">
          {films.length} {films.length === 1 ? lex().one : lex().many}
        </div>
        <div className="mt-1 text-sub text-dim">
          Every one of these is already settled by duels you&rsquo;ve fought.
        </div>
      </div>
      <PrimaryButton wide onClick={onFinish}>
        Finish &middot; lock in {films.length}
      </PrimaryButton>
      {/* Never buried. Declining has to be as easy as accepting, or the offer is
          not really an offer. */}
      <button onClick={onKeepPlaying} className="text-sub text-dim underline underline-offset-4 active:scale-95">
        Keep playing anyway
      </button>
      {onDone && (
        <button onClick={onDone} className="text-label font-bold uppercase tracking-[0.14em] text-dim/70 active:scale-95">
          Done for now
        </button>
      )}
    </div>
  );
}

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
  batch,
  onBatch,
}: {
  champion: Film;
  rank: number;
  onConfirm: () => void;
  /** How many from the top of the pile the record already settles, if several. */
  batch?: number;
  onBatch?: () => void;
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
      <span className="text-label font-bold tracking-[0.14em] text-gold">
        {justPromoted ? `⭐ EARNED ${starsFor(won)}` : "🏆 TOPS THE PILE"}
      </span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--gold), 0 12px 36px color-mix(in srgb, var(--gold) 45%, transparent)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        {justPromoted ? (
          <div className="mt-1 text-body text-gold">{starsFor(won)}</div>
        ) : (
          <div className="mt-1 font-serif text-5xl font-bold text-gold">#{rank}</div>
        )}
      </div>
      {/* The one primary in the app that keeps a glow. It sits over artwork
          rather than over a page, so the shadow is what separates it from the
          poster behind — everything else about it is the shared shape. */}
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sub font-bold active:scale-[0.98]"
        style={{ color: "var(--gold-ink)", background: "var(--gold)", boxShadow: "0 4px 20px color-mix(in srgb, var(--gold) 40%, transparent)" }}
      >
        {justPromoted ? `Lock in at ${starsFor(won)}` : `Lock in as #${rank}`}
      </button>

      {/* ── The rest of the settled top, in one tap ─────────────────────────
          Once the record is being read, the top of a pile is often decided
          several films deep — and each of those still cost a separate Lock in,
          for a position nothing was arguing about. Offered under the single
          confirm rather than replacing it, because taking six at once is a
          bigger claim than taking one and should be the deliberate choice. */}
      {batch && batch > 1 && !justPromoted && (
        <button
          onClick={onBatch}
          className="text-sub underline underline-offset-4 active:scale-95"
          style={{ color: "var(--accent)" }}
        >
          Lock in all {batch} you&rsquo;ve settled
        </button>
      )}

      {/* Beating an entire tier is the one moment a star rating can change:
          earn it against the tier above, or assert it outright. `promotionTarget`
          is what decides this is that moment. */}
      {promoteTo !== undefined && !justPromoted && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onTakeOn}
            className="rounded-full border px-6 py-2.5 text-sub font-bold active:scale-95"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            Take on {starsFor(promoteTo)}
          </button>
          <button onClick={onAssertPromotion} className="text-sub font-semibold text-dim active:scale-95">
            or move it up without dueling
          </button>
        </div>
      )}

      {onBack && !justPromoted && (
        <button onClick={onBack} className="-mt-1 py-2 text-sub text-dim active:scale-95">
          Not yet — keep playing
        </button>
      )}

      {/* Quieter than everything above it, and last. This screen is asking you a
          question, so the answer stays the loud thing and the exit sits under it
          in the same weight the duel's own Done carries. */}
      {onDone && (
        <button onClick={onDone} className="text-sub font-semibold text-gold/70 active:scale-95">
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
  skipped,
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
  /**
   * Duels this run settled from the evidence log instead of asking.
   *
   * Reported because it is the answer to "why was that so much quicker than last
   * time", and because a saving nobody is told about looks like the app skipping
   * work rather than remembering theirs.
   */
  skipped?: number;
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
            : `Every ${lex().one} in this tier has found its spot.`
          : "Every answer is kept. Pick this tier back up whenever you like."
      }
      films={ranked}
      stats={[
        { label: "placed", value: String(ranked.length) },
        ...(left > 0 ? [{ label: "still to place", value: String(left) }] : []),
        ...(duels > 0 ? [{ label: "duels", value: String(duels) }] : []),
        ...(skipped && skipped > 0 ? [{ label: "already decided", value: String(skipped) }] : []),
      ]}
      onList={onList}
      onAgain={onPickTier}
      againLabel={finished ? "Rank another tier" : "Keep ranking"}
      extra={
        (offer.length > 0 || card) && (
          <div className="flex w-full max-w-[300px] flex-col gap-4">
            {offer.length > 0 && (
              <div>
                <p className="mb-2 text-label font-bold uppercase tracking-[0.18em] text-dim">
                  Still split — rank another pile
                </p>
                <div className="flex gap-2">
                  {offer.map(({ bucket, films: pileFilms }) => (
                    <button
                      key={bucket}
                      onClick={() => onRankPile!(pileFilms.map((f) => f.id))}
                      className="flex-1 rounded-xl border border-border py-2.5 text-label font-bold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98]"
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
