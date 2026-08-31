"use client";

// The app around the screens. Until now DuelScreen was the app — it owned the
// library, the settings sheet and the brightness slider as well as the duel —
// which left no way for a second screen to exist. Everything shared lives here
// now; each screen owns only its own business.
//
// Screens are a toggle rather than routes on purpose: an in-progress session
// lives in memory, and navigating away would destroy it mid-run. When sessions
// are persisted this becomes the one place to swap in real routing.

import { dragScreen, exitScreen, stepScreen, type Dir, type RibbonScreen } from "@/lib/ribbon";
import { useEffect, useRef, useState } from "react";
import { TagSheet } from "./TagSheet";
import { placedOrder } from "@/lib/snapshot";
import DuelScreen from "./DuelScreen";
import { LogFilm } from "./LogFilm";
import { SCRIM_ARM_MS, SHEET_EXIT_MS } from "./ui";
import { FilmInfo } from "./FilmInfo";
import { Settings } from "./Settings";
import ListScreen from "./ListScreen";
import ProfileScreen from "./ProfileScreen";
import Trophies from "./Trophies";
import { loadProfile, saveProfile, EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { filmsFromFile } from "@/lib/importCsv";
import { loadFilms, saveFilms } from "@/lib/store";
import { currentMedium } from "@/lib/medium";
import { loadCuratedRun, loadRun } from "@/lib/runs";
import { syncOnOpen } from "@/lib/startupSync";
import { startSync } from "@/lib/sync";
import { isPlaced } from "@/lib/lock";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { DEFAULT_PREFS, DRIFT_PX_PER_SEC, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import { backfillPosters, needsCredits, withMeta, type FilmMeta } from "@/lib/meta";
import { PersonSheet } from "./PersonSheet";
import Splash, { SPLASH_FADE_MS, SPLASH_HOLD_MS } from "./Splash";
import Coach from "./Coach";
import { InstallPrompt } from "./InstallPrompt";
import SignInGate from "./SignInGate";
import HandleGate from "./HandleGate";
import { FindPeople } from "./FindPeople";
import {
  fetchMe,
  fetchSession,
  hasSignedInBefore,
  needsHandle,
  saveMe,
  EMPTY_ME,
  type Me,
  type MeState,
} from "@/lib/account";
import { forgetTours, markTourSeen, onTourRequested, seenTours, TOURS, type TourId } from "@/lib/tour";
import { loadLog } from "@/lib/log";
import { openVisit, snapshotOf } from "@/lib/visit";
import { subjectFromPerson } from "@/lib/subject";
import type { RunRequest } from "@/lib/curated";
import type { RefineRequest } from "./DuelScreen";
import type { Person } from "@/lib/people";
import type { Film, RankState } from "@/lib/types";

// Slow on purpose: the sweep must always lose a race against artwork you are
// actually looking at. A real 861-film library takes a few minutes to converge,
// which is fine for something nobody is waiting on.
const SWEEP_DELAY_MS = 4000;
const SWEEP_GAP_MS = 400;
// How many films land before the library is written to disk. See the sweep.
const SWEEP_BATCH = 10;

// The ribbon IS the screen list. Aliased rather than restated, so adding
// Activity to `RIBBON` adds it here and to every swipe in the app at once.
type Screen = RibbonScreen;

/**
 * What is open OVER the current screen. At most one, ever.
 *
 * A union rather than a flag each, so "only one at a time" is a thing the type
 * cannot express otherwise rather than a rule every call site has to keep. The
 * two that carry a subject carry it here, which also means a film card cannot
 * be open with nothing to show.
 */
type Overlay =
  | { kind: "info"; film: Film }
  | { kind: "person"; person: Person }
  | { kind: "settings" }
  | { kind: "trophies" }
  | { kind: "tags"; film: Film }
  | { kind: "log" }
  | { kind: "people" };

/** Matches `.veil-out` in globals.css. Kept here only to sequence the tour behind it. */
const VEIL_MS = 200;

/**
 * Where the app opens. Always the game.
 *
 * ── What this used to be, and why it changed ───────────────────────────────
 *
 * It opened on the PROFILE once anything had been placed, and on the duel
 * otherwise. The reasoning was that the profile says what your library amounts
 * to rather than enumerating it, and the recap made it the one screen whose
 * contents differ from last time.
 *
 * Cut on 21 Aug 2026, the user's call. The profile is a page ABOUT the ranking;
 * the duel screen IS the ranking. Landing on the description rather than the
 * thing is a detour on every single open, and the recap is still there for
 * anyone who goes looking.
 *
 * `RunStart` is what makes this safe now and did not exist when the old rule was
 * written. Arriving at RNK no longer drops you into a climb nobody chose — it
 * offers one. The old objection, that opening on the game demands a judgement
 * before offering anything, was true then and is not true now.
 *
 * ── Still asked ONCE, at load, and that is still load-bearing ──────────────
 *
 * Kept as a function rather than inlined so this stays a question about OPENING.
 * The previous version's input was "has anything been placed", which the act of
 * playing changes — so evaluated on every render it re-fired mid-run and
 * confirming your first film threw you onto the profile with the climb still
 * going behind it. If this ever becomes conditional again, it must still be
 * asked once.
 */
function openingScreen(): Screen {
  // Always the game. The user's call, 21 Aug 2026.
  //
  // It used to open on the profile once anything had been placed, on the
  // reasoning that a returning reader wants their standing before their next
  // move. In practice the profile is a page ABOUT the ranking and the duel
  // screen is the ranking, and landing on the description of a thing rather
  // than the thing is a detour every single time you open the app.
  //
  // `RunStart` makes that safe in a way it was not when this rule was written:
  // arriving at RNK no longer drops you into a climb somebody else chose, it
  // offers one. So the old worry — that opening on the game asks for a
  // judgement before offering anything — no longer applies.
  //
  return "duel";
}

export default function AppShell() {
  const [state, setState] = useState<RankState | null>(null);
  // `null` until the library lands, because the opening rule needs it and it is
  // not loaded on the first render — that is what keeps this component's first
  // paint identical on the server and the client. A screen chosen before then
  // would have to be corrected afterwards, which the user would watch happen.
  //
  // Set exactly once, in the load effect, and only ever changed by `go` after
  // that. See `openingScreen` for why it must not stay derived.
  const [screen, setScreen] = useState<Screen | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  // ── One overlay, not five booleans ─────────────────────────────────────────
  //
  // These were five independent pieces of state, and nothing stopped them being
  // true at once: Settings, the trophy case, a film card and a person sheet
  // could all be open together, each unaware of the others, with the reader
  // left to dismiss them one at a time in an order nobody designed. Two call
  // sites had grown ad-hoc pairwise closes to patch the worst pair.
  //
  // A single slot makes the rule structural instead of remembered — opening
  // anything replaces whatever was open, because there is only one place to put
  // it. `go` empties it, which is what makes a bottom-bar press close the sheet
  // over it.
  //
  // The trophy case and Settings live here rather than on a screen because both
  // are reached from the shared header, so they have to work from whichever
  // screen you are looking at. Logging joined them for a different reason: it
  // was rendered INSIDE `BottomNav`, whose `z-40` is a stacking context, so its
  // sheet painted over the very bar it belongs to. Overlays go over screens,
  // never inside chrome.
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // The log sheet is the one overlay that plays an exit animation before it
  // unmounts, so its closing frame outlives the slot being emptied. Kept as its
  // own flag rather than a sixth `kind`, which would make every reader of
  // `overlay` handle a state that is on its way out.
  const [logClosing, setLogClosing] = useState(false);
  // ── Pressing the same cell again closes what it opened ─────────────────────
  //
  // Moved here with the sheet it drives, and it has to sit with the other hooks
  // rather than beside `toggleLog` further down: there is an early return
  // between the two, and a conditionally-called hook is a different hook order
  // on the render that takes it.
  //
  // GHOST CLICKS are why the guard exists at all. A browser synthesises a
  // `click` ~300ms after a finger lifts, at the coordinates it lifted from —
  // here, the cell that just opened the panel. Unguarded, the sheet opens and
  // shuts on a single tap, and only ever on touch. Same trap `Sheet` arms its
  // backdrop against, same window.
  const logOpenedAt = useRef(0);
  const [brightness, setBrightness] = useState(0);
  // Read in the same effect as brightness rather than as a lazy initialiser —
  // see the note on that effect for why localStorage cannot be read during the
  // first render without tearing hydration.
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // The curated run just asked for. Whose filmography is OPEN is an overlay and
  // lives in the slot above; this is the request that outlives it, because
  // acting on it means changing screens.
  //
  // One object where there were three pieces of state — the subject, the
  // borrowed films and the portrait were separate, set together and cleared
  // together, and nothing but discipline kept them consistent. See
  // `lib/curated.ts`.
  const [runRequest, setRunRequest] = useState<RunRequest | null>(null);
  // A Refine asked for from a film card, waiting for the duel screen to start
  // it. Deliberately NOT a `RunRequest`: that type is for curated runs, which
  // write no scores, and the whole point of refining is that it writes one.
  const [refine, setRefine] = useState<RefineRequest | null>(null);
  // The taste shape as this sitting began, for the chart's before/after.
  //
  // This is now the ONLY reason the visit snapshot exists. "Last time" was cut
  // on 21 Aug and the obvious follow-up — delete `lib/visit.ts`, which nothing
  // else imported — would have silently taken the chart's "where you started"
  // outline with it. The module stays; only the recap half of it went.
  const [wasShape, setWasShape] = useState<Record<string, number> | undefined>(undefined);
  // ── The splash, in two flags ───────────────────────────────────────────────
  //
  // `held` is the deliberate part elapsing; `splashGone` is the fade having
  // finished, which is what actually unmounts it. Two flags rather than one
  // because the exit has to be a CLASS on a mounted element — unmounting at the
  // end of the hold would remove the splash between two frames, and the whole
  // reason to spend the time is that the arrival should not feel abrupt.
  const [held, setHeld] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  // ── The gate ───────────────────────────────────────────────────────────────
  //
  // `null` while the session is still being asked about, which is why the
  // splash's hold is load-bearing rather than decorative now: it is the window
  // the answer arrives in, so neither the gate nor the app is ever shown and
  // then replaced by the other. A flash of a sign-in wall at somebody already
  // signed in is worse than a slightly longer splash.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // ── Who you are in public ──────────────────────────────────────────────────
  //
  // `null` while the answer is still being asked about, and the splash covers
  // that window for the same reason it covers the session lookup: a reader must
  // never see the app and then a wall, or a wall and then the app.
  //
  // Three states rather than two once it lands, and the difference is the whole
  // point. Only `kind: "me"` is Rankd having ANSWERED, and only an answered
  // "no handle" is allowed to put the gate on screen. `unknown` means the
  // network could not be asked, which says nothing about whether a handle
  // exists and must therefore let the reader through to their own library. See
  // `fetchMe` in lib/account.ts.
  const [meState, setMeState] = useState<MeState | null>(null);
  // Which tour is on screen. Set one tick AFTER a navigation, never during it:
  // `Coach` resolves its targets as it renders, so mounting it in the same
  // commit as a screen change measures the screen the user is leaving.
  const [tourDue, setTourDue] = useState<TourId | null>(null);
  // Which tours this browser has finished. Read once, at mount, and never
  // re-read: `markTourSeen` writes storage the moment a tour ends, and reading
  // storage during render would pull the overlay out from under the reader on
  // the very tap that finished it.
  const [seen, setSeen] = useState<Set<TourId>>(seenTours);
  // Settings asked for the whole thing again, which has to bypass the
  // new-library gate below. Deliberately not persisted: it dies with the reload.
  const [replaying, setReplaying] = useState(false);

  // ── The two `set-state-in-effect` lint errors are DELIBERATE ───────────────
  //
  // This effect and the brightness one below are the whole of the lint baseline,
  // and both are load-bearing. They read localStorage, which does not exist on
  // the server — so the values cannot be lazy `useState` initialisers without
  // the first client render disagreeing with the server's HTML and tearing the
  // hydration. Reading them in an effect is what keeps the first paint
  // identical on both sides; the cascading render is the price.
  //
  // Fix them only with a pattern that keeps that parity. Moving the reads into
  // `useState` compiles, passes lint, and breaks hydration silently.
  useEffect(() => {
    const films = loadFilms();
    // Restored, not invented: `loadRun` returns null for anything stale,
    // unreadable, or naming a film this library no longer holds.
    // A curated run wins when both are somehow present. It is the one that
    // cannot be rebuilt from the library — its guests exist nowhere else — so
    // if a stale climb ever survived beside it, dropping the climb costs a pile
    // that can be re-picked and dropping this costs films that cannot.
    const curated = loadCuratedRun(films);
    setState({ films, session: curated?.session ?? loadRun(films), journal: [] });
    if (curated) {
      setRunRequest({ subject: curated.subject, guests: curated.guests });
    }
    // Decided here, on the library as it arrived, and never re-derived. Guests
    // cannot be in play yet — nothing has started a run — so `films` is already
    // the guest-free library the rule wants.
    setScreen(openingScreen());

    // Catch up with the account, if there is one. `pull` reloads the page, so on
    // a new device this render is simply replaced by one holding the real
    // library — which is why nothing here has to reconcile React state by hand.
    // A conflict is deliberately left alone for the chooser in settings; see
    // lib/startupSync.ts.
    //
    // ── And then WATCH, which is the part that was missing ──────────────────
    //
    // `startSync` used to be called only from `Account`, which mounts only when
    // the settings sheet is opened. So on any session where the reader never
    // opened settings, `enabled` stayed false and `push`/`schedule` returned
    // early every time: no debounce, no flush on backgrounding, nothing. A
    // whole evening of duels sat in localStorage until the next app open, and
    // the account was "backed up" as of hours ago.
    //
    // That is what made the conflict chooser routine rather than rare — a
    // browser holding a session of unsent work will of course disagree with the
    // account — and it is a durability hole besides, on an app that now asks
    // people to sign in precisely so their ranking is safe.
    //
    // NEVER on `conflict` or `offline`, and that guard is not decoration.
    // `Account.tsx` records what starting the watcher over an unresolved
    // conflict actually cost: it pushed a device's 10-film library over the
    // account's 861 while the chooser was still on screen asking which to keep.
    // Same rule here, same reason.
    void syncOnOpen().then((outcome) => {
      if (outcome && outcome.kind !== "conflict" && outcome.kind !== "offline") startSync();
    });

    // Ask who is signed in, and let the splash's hold cover the answer.
    //
    // "Could not ask" is NOT "signed out" — see `fetchSession`. Offline, this
    // falls back to whether this browser has ever completed a sign-in, so a
    // signed-in reader on a plane gets their library rather than a wall they
    // cannot get through without the network they do not have. That is the one
    // case a naive gate breaks, and it breaks it for exactly the people who
    // have most invested in the app.
    void fetchSession().then((s) => {
      setSignedIn(s.kind === "in" || (s.kind === "unknown" && hasSignedInBefore()));
    });

    // Asked ALONGSIDE the session rather than after it, so the two answers race
    // each other instead of queueing and the splash covers one window and not
    // two. A signed-out visitor gets a cheap 401 here, which is the answer this
    // needs anyway.
    void fetchMe().then((answer) => {
      setMeState(answer);
      // ── Clearing a name Rankd stores and never shows ──────────────────────
      //
      // `display_name` was written once by `provisionUser` from whatever Google
      // held. Nothing displays it any more (see `publicName`), which leaves a
      // person's real name sitting in the database for no purpose at all.
      //
      // Accounts that claim a handle from now on shed it in `HandleGate`. This
      // catches the ones that already went through, and it is self-limiting:
      // after one success the field is null and the condition never holds
      // again. A failure simply leaves it for the next open.
      if (answer.kind === "me" && answer.me.handle && answer.me.displayName) {
        void saveMe({ displayName: null }).then((done) => {
          if (done.ok) setMeState({ kind: "me", me: done.me });
        });
      }
    });

    // ── Why the visit marker advances HERE and not on the profile ────────────
    //
    // `openVisit` rolls the last snapshot into `prev` and takes a new one. That
    // has to happen when the APP opens, once, before any duel of this sitting
    // has been fought — otherwise the "current" snapshot would already include
    // the work the before/after is meant to be showing.
    //
    // Doing it on `ProfileScreen` mount instead would look equivalent and is
    // not: the profile would advance its own marker on arrival and erase its
    // own subject. It is also a no-op after the first call in a tab, so this
    // stays true however many times you come back to the screen.
    void loadLog().then((log) => {
      const record = openVisit(snapshotOf(films, log.length));
      setWasShape(record?.current.shape);
    });
  }, []);

  // ── The credits sweep ──────────────────────────────────────────────────────
  //
  // Until this existed, a film only learned who made it if you happened to
  // SCROLL PAST IT. `director`, `cast` and `genres` arrive on the same response
  // as the artwork, and only two things ever asked for that response: the list
  // screen's viewport queue and the duel screens' backfill. So a film you had
  // never scrolled to carried no credits — and `filmsBy` matches on
  // `f.director === name`, so it was invisible to its own director. Opening
  // Michael Mann showed four films when you owned nine, and the fix looked like
  // "go and scroll the list", which is exactly what the user reported.
  //
  // The real fix is that the library converges on its own, so nothing depends on
  // where you have happened to look. That is this: a slow, patient walk over
  // every film still missing credits, persisting each as it lands.
  //
  // Three things keep it out of the way of the app:
  //  · It starts after a delay, so opening the app is never competing with it.
  //  · It is paced far slower than the viewport queue (which uses 120ms). A
  //    poster you are looking at is urgent; a credit you are not is not, and
  //    losing that race is the correct outcome.
  //  · `fetchMeta` caches per film for the session, so the viewport queue and
  //    this sweep can want the same film without it being fetched twice.
  //
  // `noMatch` is what stops it running forever: a film TMDb cannot find is
  // recorded as such and never qualifies again.
  useEffect(() => {
    if (!state) return;
    let stopped = false;
    // State updates every film, but the WRITE is batched.
    //
    // The real library in test/fixtures is 861 films, and a fresh CSV import has credits
    // for none of them — so this walk is 861 long. `saveFilms` serialises the
    // entire library on every call, so persisting per film meant 861 full
    // serialisations of an 861-film array, back to back, on a phone. React state
    // is cheap and localStorage is not, so the screen still updates on every
    // film and only the disk write waits.
    //
    // The cost of a batch is that closing the tab mid-run can lose up to
    // `SWEEP_BATCH` films' credits. They are simply re-fetched next session, and
    // the API route caches for a week, so that is a few requests rather than a
    // loss.
    const start = setTimeout(() => {
      const need = state.films.filter(needsCredits);
      if (need.length === 0) return;
      // The batch is counted out here rather than inside the updater. A setState
      // updater must be PURE — React calls it twice in development — so writing
      // to localStorage from within one is both a double write and the exact
      // impurity that turned a 19-film pile into a 35-film one earlier.
      let since = 0;
      let pending: Film[] | null = null;
      const flush = () => {
        if (pending) saveFilms(pending);
        pending = null;
        since = 0;
      };
      void backfillPosters(
        need,
        (id, meta) => {
          setState((s) => {
            if (!s) return s;
            const films = s.films.map((f) => (f.id === id ? withMeta(f, meta) : f));
            pending = films;
            return { ...s, films };
          });
          if (++since >= SWEEP_BATCH) flush();
        },
        () => stopped,
        SWEEP_GAP_MS,
      ).finally(flush); // whatever the last partial batch was
    }, SWEEP_DELAY_MS);
    return () => {
      stopped = true;
      clearTimeout(start);
    };
    // Deliberately once, on the first library it sees. Re-running whenever
    // `films` changed would restart the walk on every single duel — and since
    // each fetch writes a film, it would restart itself forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state]);

  useEffect(() => {
    const t = setTimeout(() => setHeld(true), SPLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const b = loadBrightness();
    setBrightness(b);
    applyBrightness(b);
    setProfile(loadProfile());
    setPrefs(loadPrefs());
  }, []);

  // ── A screen reporting that it has something to teach ─────────────────────
  //
  // The decision stays here: the screen knows it is on show, this knows whether
  // the reader is owed it.
  //
  // Re-subscribed whenever those inputs change rather than reading them through
  // refs. A ref would have to be written during render to stay current, and the
  // subscribe/unsubscribe pair is two Set operations — cheaper than the bug
  // where the callback closes over a stale `seen` and re-offers a tour the
  // reader just dismissed.
  //
  // Deferred a tick for the same reason every other tour start is: `Coach`
  // resolves its targets as it renders, and the sheet that just asked has not
  // committed yet.
  const owed = (state?.films.length ?? 0) > 0 && !(state?.films ?? []).some(isPlaced);
  useEffect(
    () =>
      onTourRequested((id) => {
        if (seen.has(id) || !(owed || replaying)) return;
        setTimeout(() => setTourDue(id), 20);
      }),
    [seen, owed, replaying],
  );


  // ── Arriving at the duel ───────────────────────────────────────────────────
  //
  // The splash's language, a third of the length: the screen you were on is
  // replaced by a wash of the page background which then falls away, so the duel
  // is revealed rather than cut to. Both screens sit on `--bg`, so this reads as
  // a dip through the page and not a flash of anything new.
  //
  // Only in this direction, and only from somewhere else. Going back to the list
  // or the profile is returning to a page you were reading; arriving at the duel
  // is starting to play, and it is the only switch that changes what the app is
  // asking of you.
  //
  // A counter rather than a boolean, so a second arrival re-triggers the
  // animation: React reuses the element, and a CSS animation that has already
  // finished does not restart just because the component re-rendered. The
  // counter is the `key`, which is what makes it a new element each time.
  const [veil, setVeil] = useState(0);
  /**
   * Which way the arriving screen should slide in, or null when it should not.
   *
   * A class, not a remount: adding it starts the animation, and clearing it on
   * animationend takes the transform away again. Leaving one in place would be
   * a permanent stacking context over every screen, which is exactly how a sheet
   * ends up trapped behind the nav.
   */
  const [slide, setSlide] = useState<{ dir: Dir; phase: "hold" | "run" } | null>(null);
  /**
   * Has anybody spoken to me since I last looked?
   *
   * Asked with `peek`, which is what stops the question answering itself: the
   * feed route marks everything seen when it is READ, and the nav asking for a
   * dot is not somebody reading anything.
   */
  // ── Arrivals at RNK ────────────────────────────────────────────────────────
  //
  // Bumped every time the user comes to the duel from somewhere else, and it
  // starts at 1 so opening the app counts as the first arrival. `DuelScreen`
  // compares it against the last one dismissed, which is what lets the overlay
  // greet you on every arrival without ever reappearing while you sit there.
  //
  // A counter, not a boolean: arriving twice has to greet twice, and a flag left
  // true is indistinguishable from one nobody reset.
  const [greet, setGreet] = useState(1);

  const changeProfile = (p: Profile) => {
    setProfile(p);
    saveProfile(p);
  };

  /**
   * Change the public half of the profile.
   *
   * ── Optimistic, and it has to be ───────────────────────────────────────────
   *
   * The local sibling above is synchronous, because `saveProfile` writes to
   * localStorage. This one is a network round trip, and waiting for it would
   * mean a name you just typed sits unchanged on screen until a server answers.
   * That reads as a broken field rather than a slow one, and it is the exact
   * gap between how the two halves of the same sheet feel.
   *
   * So the screen updates first and the write follows. On failure the server's
   * answer wins, which puts the old value back rather than leaving the reader
   * looking at a change that did not happen.
   */
  const changeMe = (patch: Partial<Me>) => {
    setMeState((s) => {
      // Only ever refines an identity we already hold. There is nothing sensible
      // to merge a patch into before the first answer has landed, and inventing
      // a base here would be inventing an account.
      const base = s && (s.kind === "me" || s.kind === "unknown") ? s.me : null;
      if (!base) return s;
      return { kind: "me", me: { ...base, ...patch } };
    });
    void saveMe(patch).then((result) => {
      if (result.ok) setMeState({ kind: "me", me: result.me });
      // A failure leaves the optimistic value on screen for now. Re-reading here
      // would be the correct-looking fix and the wrong one: it would clobber a
      // SECOND edit the reader has made in the meantime with a stale row. The
      // next open re-reads, which is soon enough for a display name.
    });
  };

  const changeBrightness = (t: number) => {
    setBrightness(t);
    applyBrightness(t);
    saveBrightness(t);
  };

  // Takes a partial so a caller changes the one field it cares about without
  // having to hold — and risk staling — the rest of the object.
  const changePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  };

  // Swap the whole library for an imported one.
  //
  // No run afterwards: somebody who has just imported 861 films has not been
  // shown what they have, and a duel is a poor answer to "what did that just do".
  const loadLibrary = (films: Film[]) => {
    saveFilms(films);
    setState({ films, session: null, journal: [] });
    setScreen("duel");
  };

  // Anything found while browsing the list is worth keeping — it saves the duel
  // fetching it again later, and it's how the library learns who made each film.
  const setMeta = (id: string, meta: FilmMeta) =>
    setState((s) => {
      if (!s) return s;
      const films = s.films.map((f) => (f.id === id ? withMeta(f, meta) : f));
      saveFilms(films);
      return { ...s, films };
    });

  // A film you just watched, joining the library from the nav on any screen.
  //
  // Deliberately does NOT touch a running session. Adding a film mid-climb and
  // splicing it into the pile would change the thing being fought over while it
  // was being fought over — so it lands in the library unplaced and waits for
  // the next run, which is also what an import does.
  const addFilm = (film: Film) =>
    setState((s) => {
      if (!s) return s;
      // Same title and year is the same film. The list is keyed by that id, so
      // adding a duplicate would not create two rows, it would quietly replace
      // one — including its rating and everything it has been through.
      if (s.films.some((f) => f.id === film.id)) return s;
      const films = [...s.films, film];
      saveFilms(films);
      return { ...s, films };
    });

  // Take a film out of the library.
  //
  // Until now nothing could: a bad import, a wrong TMDb match or a film you
  // never actually watched was permanent, and the only escape was wiping the
  // whole library and re-importing.
  //
  // The evidence log is deliberately NOT touched. Removal is not undo — the
  // duels really happened, and a judgement naming a departed film is simply not
  // evidence about anyone still here; `fitBeliefs` already skips those rows by
  // id lookup, with a comment anticipating exactly this. Retracting them would
  // also destroy what they say about the film on the OTHER side of each duel,
  // which is still in your library and did nothing wrong.
  //
  // If the film is in the run on screen, the run ends. Splicing it out of a
  // live pile means rewriting `contenderId`, `challengerId` and two arrays that
  // ladder.ts alone is allowed to reason about; ending the session costs an
  // unfinished climb and cannot leave the engine holding a film that no longer
  // exists.
  const removeFilm = (id: string) =>
    setState((s) => {
      if (!s) return s;
      const films = s.films.filter((f) => f.id !== id);
      if (films.length === s.films.length) return s;
      saveFilms(films);
      const inPlay =
        !!s.session &&
        (s.session.unconfirmed.includes(id) ||
          s.session.confirmed.includes(id) ||
          s.session.contenderId === id ||
          s.session.challengerId === id);
      return { ...s, films, session: inPlay ? null : s.session };
    });

  /**
   * The user has said which film this actually is.
   *
   * Written as a pin, so `withMeta` REPLACES the old film's fields rather than
   * filling gaps, and the credits sweep never asks about this one again. Both
   * halves matter: without the replace the card would end up half one film and
   * half another, and without the pin the next sweep would search by title,
   * land on the same wrong film, and quietly undo the correction.
   *
   * The film's own identity — its id, title, year, rating, score, every
   * placement it has earned and every duel it has fought — is untouched. This
   * corrects what the app FETCHED about a film, not which film it is in your
   * library, and a correction that silently re-rated something would be a much
   * worse bug than the one it fixes.
   */
  const fixMatch = (film: Film, meta: FilmMeta) =>
    setState((s) => {
      if (!s) return s;
      const films = s.films.map((f) => (f.id === film.id ? withMeta(f, meta, true) : f));
      saveFilms(films);
      return { ...s, films };
    });

  /**
   * Land a reorder from the list.
   *
   * ── Why this MERGES rather than replaces ──────────────────────────────────
   *
   * The list is handed `library`, which is `state.films` with guests filtered
   * out — so writing what it hands back would silently drop every borrowed film
   * from a person run that happened to be open. `saveFilms` strips guests on the
   * way to storage anyway, which means the loss would be invisible until the run
   * came back and found its pile empty.
   *
   * Merging by id keeps them. The list is authoritative about the films it can
   * see and says nothing about the ones it cannot.
   */
  const reorder = (next: Film[]) =>
    setState((s) => {
      if (!s) return s;
      const byId = new Map(next.map((f) => [f.id, f]));
      const films = s.films.map((f) => byId.get(f.id) ?? f);
      saveFilms(films);
      return { ...s, films };
    });

  /**
   * Keep the record, swap the artwork, and make it stick.
   *
   * Deliberately NOT routed through `withMeta`. That function's job is to fold a
   * FETCHED response into a record, and this is neither fetched nor a response —
   * it is a person pointing at one of several covers and saying "that one".
   * Passing it as a meta object would drag in the whole replace-or-fill
   * question, when the answer here is one field.
   *
   * `pinnedArt` is what stops the credits sweep undoing it on its next pass. See
   * the flag's own note in lib/types.ts for why it is not `pinnedMeta`.
   */
  const pickCover = (film: Film, poster: string) =>
    setState((s) => {
      if (!s) return s;
      const films = s.films.map((f) =>
        f.id === film.id ? { ...f, poster, pinnedArt: true } : f,
      );
      saveFilms(films);
      return { ...s, films };
    });

  // The hold is a floor, not a duration: the splash leaves when the deliberate
  // time is up AND there is an app behind it to reveal. On any real device the
  // library (<92ms) is long since in hand and the hold is the only thing being
  // waited on — which is the point. A splash whose length depends on the speed
  // of the phone is not a decision, it is a symptom.
  // `signedIn !== null` joined the condition when the gate landed: the splash
  // now also covers the session lookup, so the reader never sees the app and
  // then the wall, or the wall and then the app.
  // `meState !== null` joined it for the handle gate, on the same argument. Both
  // requests were sent together, so this waits for the slower of two rather than
  // for one after the other.
  const splashLeaving = held && !!state && signedIn !== null && meState !== null;

  useEffect(() => {
    if (!splashLeaving) return;
    const t = setTimeout(() => setSplashGone(true), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splashLeaving]);

  // ── Held off-screen until it has finished building ────────────────────────
  //
  // `hold` parks the arriving screen at the edge with no animation, so the mount
  // happens while it is out of sight. Only once React has painted does the class
  // go on and the slide run. Setting it in the frame after paint rather than in
  // the same commit is the whole point: an animation that starts alongside a
  // mount spends its opening frames on the mount.
  useEffect(() => {
    if (slide?.phase !== "hold") return;
    const id = requestAnimationFrame(() => {
      setSlide((cur) => (cur?.phase === "hold" ? { ...cur, phase: "run" } : cur));
    });
    return () => cancelAnimationFrame(id);
  }, [slide]);


  const splash = splashGone ? null : <Splash leaving={splashLeaving} />;

  // Still nothing to show behind it — the splash IS the screen for now.
  if (!state || signedIn === null || meState === null) return splash;

  // ── The gate ───────────────────────────────────────────────────────────────
  //
  // Above every hook, below none of them: this sits after the last `useState`
  // and `useEffect` in this component, so taking it cannot change the hook
  // order. The library has already loaded by here and stays loaded — nothing is
  // cleared on the way past, so signing in reveals whatever this browser was
  // already holding rather than starting anyone from nothing.
  if (!signedIn) {
    return (
      <>
        <SignInGate />
        {splash}
      </>
    );
  }

  // ── The second gate ────────────────────────────────────────────────────────
  //
  // Read this condition as the safety property it is: the gate appears when
  // Rankd ANSWERED and the answer was "this account has no handle". Nothing
  // else. `meState.kind === "unknown"` is the offline case and falls straight
  // through to the app, deliberately, because a handle cannot be claimed
  // without a network anyway — so blocking buys nothing and costs somebody
  // access to a library already sitting on the device in their hand. That is
  // the exact failure `fetchSession` was written to prevent, and it would be a
  // poor way to reintroduce it.
  //
  // `needsHandle` is the predicate and it lives in lib/account.ts, where it is
  // tested. The `kind` check is repeated here only to narrow `meState.me` down
  // to a `Me` for the prop; it is not a second opinion about whether to show it.
  if (needsHandle(meState) && meState.kind === "me") {
    return (
      <>
        <HandleGate
          me={meState.me}
          // Straight into the app, with no reload and no second request. The
          // library was loaded before either gate and has been sitting behind
          // both of them the whole time.
          onDone={(me: Me) => setMeState({ kind: "me", me })}
        />
        {splash}
      </>
    );
  }

  // ── Who you are, whichever way the question was answered ──────────────────
  //
  // Past both gates, so `unknown` is the offline reader who was deliberately
  // let through: their cached identity is the right thing to draw, and it is
  // the same identity they saw last time. `EMPTY_ME` only covers a first-ever
  // open with no network and nothing cached, where it renders exactly what a
  // signed-out reader has always seen: the word You, and a letter.
  const me: Me = (meState.kind === "out" ? null : meState.me) ?? EMPTY_ME;

  // What the user actually owns. A person run merges borrowed films into
  // `state.films` so the engine can duel them, and the duel screen is the only
  // screen entitled to see them — everywhere else they would read as films you
  // logged. `saveFilms` keeps them out of storage; this keeps them off screen.
  const library = state.films.some((f) => f.guest)
    ? state.films.filter((f) => !f.guest)
    : state.films;

  // The screen you navigated to, or the one the opening rule chose when the
  // library landed. The fallback is only reachable in the single render between
  // `state` arriving and the load effect committing its `setScreen`, so it can
  // no longer re-fire once something has been placed — which is what used to
  // throw a player onto the profile on their first confirm.
  const current = screen ?? openingScreen();

  // ── When a tour runs by itself ─────────────────────────────────────────────
  //
  // Only for a library nobody has ranked, which is the same predicate as the
  // landing rule and for a matching reason. Someone with 861 films and a year of
  // duels behind them does not need to be told what a tap does, and ambushing
  // them with a tutorial on open would be the app talking over their own work.
  // Settings is where they ask for it.
  // A library with nothing settled in it is one the tours are still worth
  // offering. An EMPTY one is not: every tour points at films, and the list
  // tour fired over "Nothing here yet" — one step, explaining how to jump
  // between tiers that do not exist, and then marking itself seen so the reader
  // never got it again once they had films. Emptiness has its own screen now,
  // and that screen offers the tutorial deliberately.
  const newLibrary = library.length > 0 && !library.some(isPlaced);

  const tourFor = (s: Screen): TourId | null => {
    const id: TourId | null = s === "duel" ? "duel" : s === "list" ? "list" : null;
    if (!id || seen.has(id)) return null;
    // The duel tour points at two posters and the film strip, and none of them
    // exist until a run is actually running. Since the RNK screen now opens on
    // `RunStart`, firing on arrival resolved the whole tour down to its one
    // Rough Cut step and then marked it seen — so the first user to need it was
    // the one guaranteed not to get it. `onRunBegan` fires it at the moment the
    // duel appears instead, which is also when the marks make most sense.
    if (id === "duel" && !state?.session) return null;
    return newLibrary || replaying ? id : null;
  };

  // ── Every tour is queued, never derived ────────────────────────────────────
  //
  // This used to fall back to `tourFor(current)` while nobody had navigated yet,
  // on the reasoning that the splash had held the landing screen long enough for
  // it to have committed. That was true of the screen and false of its contents.
  // The duel tour's targets appear when a RUN starts, not when the screen does,
  // so the fallback re-evaluated to "duel" in the very commit that started the
  // run and mounted `Coach` alongside the posters rather than after them — which
  // is precisely the race `tourDue` exists to avoid. It resolved to one step.
  //
  // So there is one path in and it is always deferred: `go` for the list,
  // `onRunBegan` for the duel. Nothing is owed on landing, because the landing
  // screen is either the profile, which has no tour, or `RunStart`, which has
  // nothing to point at yet.
  const activeTour = tourDue;
  const showCoach = splashGone && activeTour !== null;

  const finishTour = () => {
    if (!activeTour) return;
    markTourSeen(activeTour, seen);
    setSeen(new Set(seen).add(activeTour));
    setTourDue(null);
  };

  /**
   * Change screens, and queue that screen's tour if one is owed.
   *
   * Every navigation goes through here so the deferral cannot be forgotten at
   * one call site. The delay is the only thing standing between `Coach` and
   * measuring the outgoing screen.
   */
  const go = (s: Screen, swiped = false) => {
    const arriving = s === "duel" && current !== "duel";
    // Every arrival earns the greeting, however you got here — that is what puts
    // `ResumeOverlay` in front of a run you walked away from. Only the VEIL is
    // suppressed for a swipe, because the swipe already carries the motion and
    // the two together are two transitions for one navigation.
    if (arriving) setGreet((g) => g + 1);
    if (arriving && !swiped) setVeil((v) => v + 1);
    setScreen(s);
    // Whatever was open over the old screen does not follow you to the new one.
    // These render outside the screen branch, so without this a Settings sheet
    // simply re-parented itself over wherever you had just navigated to and had
    // to be dismissed separately — pressing a bottom-bar tab looked like it had
    // done nothing.
    setOverlay(null);
    setLogClosing(false);
    setTourDue(null);
    const due = tourFor(s);
    if (due) setTimeout(() => setTourDue(due), arriving ? VEIL_MS + 20 : 20);
  };

  /**
   * A swipe that ran off the edge of a screen, taken one step along the ribbon.
   *
   * Every screen hands its gesture here once it has no page of its own left to
   * turn. Going through `go` rather than `setScreen` is what makes the continue
   * screen work for free: `go` bumps `greet`, and `DuelScreen` shows
   * `ResumeOverlay` on a greeting when a run is waiting. So swiping back into a
   * game mid-flight lands on the offer to continue rather than dropping you into
   * a duel you had walked away from.
   */
  const ribbon = (dir: Dir, travelled = 0) => {
    const next = stepScreen(current, dir);
    // Nothing next door. Whatever the finger dragged eases back where it was.
    if (!next) return dragScreen(null);
    // Leave first, then arrive. See `exitScreen` for why the two are separate
    // and why the mount belongs in the gap between them.
    exitScreen(dir, travelled, () => {
      setSlide({ dir, phase: "hold" });
      go(next, true);
    });
  };

  const goDuel = () => go("duel");

  const toggleLog = () => {
    if (overlay?.kind === "log") {
      if (Date.now() - logOpenedAt.current <= SCRIM_ARM_MS || logClosing) return;
      setLogClosing(true);
      setTimeout(() => {
        // Only if it is still the thing on screen. `go` empties the slot on a
        // tab press, and this timer would otherwise close whatever had taken
        // its place in the meantime.
        setOverlay((o) => (o?.kind === "log" ? null : o));
        setLogClosing(false);
      }, SHEET_EXIT_MS);
      return;
    }
    logOpenedAt.current = Date.now();
    setLogClosing(false);
    setOverlay({ kind: "log" });
  };

  /**
   * "Show me the tutorials again" — be treated as new.
   *
   * ── Why this does not START anything ───────────────────────────────────────
   *
   * It used to jump to the duel screen and try to fire the duel tour there and
   * then, which only worked if a run happened to already be in progress. With
   * films but no live duel — the state the RNK screen normally sits in — it set
   * the screen and did nothing else, so the button looked broken.
   *
   * Each tour already knows when to appear: the list tour on arriving at the
   * list, the duel tour when a run begins, Rough Cut when a pass does, logging
   * when the sheet opens. So this only has to put the browser back into the
   * state where they are all owed, and let the reader meet them where they
   * live. Nothing is shown until you go somewhere that has something to teach.
   *
   * `replaying` is what lets them fire on a library that has already been
   * ranked, and it stays on for the rest of the session so every tour is caught
   * as the reader wanders, not just the first.
   */
  const startTour = () => {
    setOverlay(null);
    forgetTours();
    setSeen(new Set());
    setReplaying(true);
    setTourDue(null);
    // And show the one for where you already are, rather than making the reader
    // navigate somewhere and come back to see anything happen. Pressing a button
    // and getting nothing is the whole complaint this was fixing.
    //
    // Named rather than derived from `tourFor`, which would still be reading the
    // pre-reset `seen` and `replaying` from this render's closure. The duel tour
    // needs a live run for the same reason it always has: its marks point at
    // posters, and there are none between runs.
    const here: TourId | null =
      current === "list" ? "list" : current === "duel" && state.session ? "duel" : null;
    if (here) setTimeout(() => setTourDue(here), 20);
  };

  return (
    <>
      <div
        className={slide ? (slide.phase === "run" ? "page-slide" : "page-park") : undefined}
        // The direction, as a custom property the content children inherit. The
        // wrapper itself never moves — moving it moves the bars inside it, which
        // is the whole bug this shape exists to avoid.
        style={
          slide
            ? ({ "--from": slide.dir === 1 ? "var(--page-in)" : "calc(var(--page-in) * -1)" } as React.CSSProperties)
            : undefined
        }
        // Matched by NAME, not by target.
        //
        // Every animation inside a screen bubbles to here — the poster shake, the
        // sheets, the coach marks — so it cannot simply accept the first one. It
        // used to test `e.target === e.currentTarget`, which was right while the
        // wrapper itself animated and became silently wrong when the animation
        // moved down to the content layer: the class was never cleared, and a
        // finished `both`-filled animation OVERRIDES INLINE STYLES, so the page
        // stayed pinned at `transform: none` and every drag after the first did
        // nothing at all. That was most of the remaining chop.
        onAnimationEnd={(e) => {
          if (e.animationName === "page-in") setSlide(null);
        }}
      >
      {current === "duel" ? (
        <DuelScreen
          replayMode={prefs.replay}
          state={state}
          setState={setState}
          onInfo={(f) => setOverlay({ kind: "info", film: f })}
          onSettings={() => setOverlay({ kind: "settings" })}
          onTrophies={() => setOverlay({ kind: "trophies" })}
          onList={() => go("list")}
          onProfile={() => go("profile")}
          logging={overlay?.kind === "log"}
          onToggleLog={toggleLog}
          // A run just started, so the duel's targets exist now. Deferred a tick
          // for the same reason every other tour start is: `Coach` measures as
          // it renders, and the posters have not committed yet.
          // 0 until the splash has gone, so the greeting cannot arrive on top of
          // the opening animation. Derived rather than an effect that flips a
          // flag, which would be a cascading render to express one comparison.
          greet={splashGone ? greet : 0}
          onLocked={(id) => {
            const film = library.find((f) => f.id === id);
            if (film) setOverlay({ kind: "tags", film });
          }}
          onRibbon={ribbon}
          // A sheet over the game owns the finger. Swiping across an open
          // Settings panel is about that panel, not about leaving the game
          // behind it.
          swipeBlocked={overlay !== null || !splashGone}
          onImportFile={(file) => {
            void filmsFromFile(file).then((r) => {
              if ('error' in r) return;
              loadLibrary(r.films);
            });
          }}
          onRunBegan={() => {
            if (seen.has("duel") || !(newLibrary || replaying)) return;
            setTimeout(() => setTourDue("duel"), 20);
          }}
          // Rough Cut gets its own, on the same terms. It cannot go through
          // `tourFor` because it is a branch rather than a screen, and it could
          // never have ridden the duel tour's trigger, which requires a session
          // this mode does not create. The mode the app now recommends FIRST was
          // the one mode with no tutorial at all.
          onRoughCutBegan={() => {
            if (seen.has("roughcut") || !(newLibrary || replaying)) return;
            setTimeout(() => setTourDue("roughcut"), 20);
          }}
          runRequest={runRequest}
          onPerson={(p) => setOverlay({ kind: "person", person: p })}
          onRunRequestHandled={() => setRunRequest(null)}
          refine={refine}
          onRefineHandled={() => setRefine(null)}
        />
      ) : current === "list" ? (
        <ListScreen
          films={library}
          onInfo={(f) => setOverlay({ kind: "info", film: f })}
          onSettings={() => setOverlay({ kind: "settings" })}
          onTrophies={() => setOverlay({ kind: "trophies" })}
          onDuel={goDuel}
          onProfile={() => go("profile")}
          onRibbon={ribbon}
          // Swiped in from the game, which sits to the RIGHT of the list, so the
          // state to land on is the one nearest it.
          enterAtEnd={slide?.dir === -1}
          onPoster={setMeta}
          onFilms={reorder}
          logging={overlay?.kind === "log"}
          onToggleLog={toggleLog}
          // A tutorial is a held moment. Nothing behind it may move.
          // Neither may it move when the reader has said they don't want it to.
          frozen={showCoach || !prefs.listDrift}
          hideStars={prefs.hideStars}
          grid={prefs.grid}
          driftPx={DRIFT_PX_PER_SEC[prefs.driftSpeed]}
          onGrid={(on) => changePrefs({ grid: on })}
        />
      ) : (
        <ProfileScreen
          films={library}
          profile={profile}
          me={me}
          wasShape={wasShape}
          onProfile={changeProfile}
          onMe={changeMe}
          onFindPeople={() => setOverlay({ kind: "people" })}
          onInfo={(f) => setOverlay({ kind: "info", film: f })}
          onSettings={() => setOverlay({ kind: "settings" })}
          onTrophies={() => setOverlay({ kind: "trophies" })}
          onDuel={goDuel}
          onList={() => go("list")}
          onRibbon={ribbon}
          logging={overlay?.kind === "log"}
          onToggleLog={toggleLog}
        />
      )}

      {/* ── The overlay slot ──────────────────────────────────────────────────
          One branch, so the "only one at a time" rule is visible as a shape
          rather than asserted in a comment. Every hand-off between two of them
          — a film card to a person, a person to a film card — is now a single
          assignment, because replacing is all the slot can do. */}
      {overlay?.kind === "tags" && (
        <TagSheet
          film={overlay.film}
          onClose={() => setOverlay(null)}
          onSave={(draft) => {
            // ── The rank is captured HERE, at the moment of publishing ──────
            //
            // A take stores the position its film held when it was written, so
            // it can say "was #3 · now #40" later. That number cannot be
            // recovered afterwards, because the ranking is a live order and the
            // old position is gone the instant it changes.
            //
            // `placedOrder` and not `overallRank`: the latter counts un-rnkd
            // films, so it answers a different question from the one every
            // other person's screen is asking. See the note on `placedOrder`.
            const already = overlay.film.take;
            const at = already?.at ?? Date.now();
            const rank =
              already?.rank ??
              placedOrder(library).findIndex((f) => f.id === overlay.film.id) + 1;

            // Written straight into the library, beside the lock it explains.
            // Same path every other film edit takes, so it syncs and backs up
            // without anything new being taught about it.
            const next = library.map((f) =>
              f.id === overlay.film.id
                ? {
                    ...f,
                    tags: draft.tags,
                    note: draft.note,
                    scene: draft.scene,
                    // Never stored as `false`. An absent flag and a false one
                    // mean the same thing, and only one of them costs bytes in
                    // a store that shares a 5MB budget with the log.
                    spoiler: draft.spoiler ? true : undefined,
                    // ── Publishing is withdrawn, so this always clears ────────
                    //
                    // The sheet no longer offers "Share this" — see its header
                    // for why — so there is nothing that can set this, and any
                    // take made while the switch was briefly live is retired the
                    // next time its film is saved. That is the honest end state:
                    // nothing may sit marked as published while there is nowhere
                    // for a published take to appear.
                    //
                    // `takesFrom` then finds nothing, `syncTakes` deletes any
                    // stored rows on the next push, and the whole path stays
                    // exercised rather than rotting. Restoring is this line and
                    // the two switches, once a profile has a shelf.
                    take: undefined,
                  }
                : f,
            );
            saveFilms(next);
            setState((s) => (s ? { ...s, films: next } : s));
          }}
        />
      )}

      {overlay?.kind === "trophies" && (
        <Trophies films={library} onClose={() => setOverlay(null)} />
      )}

      {overlay?.kind === "people" && <FindPeople onClose={() => setOverlay(null)} />}

      {overlay?.kind === "info" && (
        <FilmInfo
          film={overlay.film}
          films={library}
          onClose={() => setOverlay(null)}
          onPerson={(p) => setOverlay({ kind: "person", person: p })}
          // A guest is not in the library, so there is nothing to write tags to.
          onTags={overlay.film.guest ? undefined : (f) => setOverlay({ kind: "tags", film: f })}
          // Guests are not in the library, so there is nothing to remove them
          // from - offering it would be a button that silently does nothing.
          onRemove={overlay.film.guest ? undefined : (f) => removeFilm(f.id)}
          // Same reasoning as removal: a guest is not in the library, so there
          // is nothing to correct and the fix would be written to nothing.
          onFixMatch={overlay.film.guest ? undefined : fixMatch}
          // ── Only where there is a choice to make ────────────────────────
          //
          // A film has one canonical poster, so offering to change it would be
          // a control with an empty sheet behind it. A book has as many covers
          // as it has had printings. `secondRole` in the lexicon draws the same
          // kind of line for the same reason: a medium that lacks a thing says
          // so, rather than showing an affordance that never pays off.
          //
          // A guest is somebody else's book, borrowed for one run and never
          // saved — so there is nothing of theirs to pin, exactly as with the
          // three controls above.
          onPickCover={
            overlay.film.guest || currentMedium() !== "book" ? undefined : pickCover
          }
          // A guest belongs to somebody's filmography, not to your library, so
          // there is no position of theirs to refine — the same reasoning as
          // the two above.
          onRefine={
            overlay.film.guest
              ? undefined
              : (f, duels, movePlaced) => {
                  setOverlay(null);
                  setRefine({ film: f, duels, movePlaced });
                  goDuel();
                }
          }
        />
      )}

      {overlay?.kind === "person" && (
        <PersonSheet
          person={overlay.person}
          films={library}
          onClose={() => setOverlay(null)}
          onInfo={(f) => setOverlay({ kind: "info", film: f })}
          // A real add, not the nav's toggle: the sheet offers to log a
          // borrowed film straight into the library.
          onAddFilm={addFilm}
          onRank={(p, guests, portrait) => {
            setOverlay(null);
            // A fresh object every time, so asking for the same person twice is
            // two requests. The duel screen starts a run when this prop CHANGES,
            // and handing back the identical object would be a no-op it read as
            // "nothing new to do".
            setRunRequest({ subject: subjectFromPerson(p, portrait), guests });
            goDuel();
          }}
        />
      )}

      {overlay?.kind === "settings" && (
        <Settings
          me={me}
          onMe={changeMe}
          brightness={brightness}
          onChange={changeBrightness}
          prefs={prefs}
          onPrefs={changePrefs}
          onClose={() => setOverlay(null)}
          films={library}
          onImport={loadLibrary}
          onTour={startTour}
        />
      )}

      {/* Rendered here rather than inside `BottomNav`, where it used to live
          next to the button that opens it. The nav is `relative z-40`, which is
          a stacking context, so a `z-30` sheet nested inside it was scoped to
          that context and painted over the bar instead of under it — the one
          sheet in the app that did. Being a sibling of the screens also means
          it survives a tab press long enough to animate out, which it could not
          do when a screen change unmounted the nav underneath it. */}
      {overlay?.kind === "log" && (
        <LogFilm
          films={library}
          onAdd={addFilm}
          closing={logClosing}
          onClose={() => {
            setOverlay(null);
            setLogClosing(false);
          }}
        />
      )}
      </div>

      {/* Over the screens and the veil, under the splash. */}
      {showCoach && (
        // Keyed by tour, so moving from the duel's to the list's remounts and
        // re-resolves rather than carrying the old steps and step index across.
        <Coach key={activeTour} steps={TOURS()[activeTour]} onDone={finishTour} />
      )}

      {/* `key={veil}` is the whole mechanism: a new element every arrival, so
          the animation plays from the start instead of being already spent.
          It removes itself the moment the fade ends rather than lingering at
          zero opacity over the duel. */}
      {veil > 0 && (
        <div
          key={veil}
          aria-hidden
          className="veil-out fixed inset-0 z-50"
          style={{ background: "var(--bg)" }}
          onAnimationEnd={() => setVeil(0)}
        />
      )}

      {/* Held back until the splash has gone and no tutorial is running: this is
          an invitation, and it must not be the first thing a new user meets or
          land on top of a coach mark explaining something else. */}
      {splashGone && !showCoach && <InstallPrompt />}

      {/* Last, so it is over everything — including any sheet that a restored
          screen might already have open. */}
      {splash}
    </>
  );
}
