"use client";

// The app around the screens. Until now DuelScreen was the app — it owned the
// library, the settings sheet and the brightness slider as well as the duel —
// which left no way for a second screen to exist. Everything shared lives here
// now; each screen owns only its own business.
//
// Screens are a toggle rather than routes on purpose: an in-progress session
// lives in memory, and navigating away would destroy it mid-run. When sessions
// are persisted this becomes the one place to swap in real routing.

import { useEffect, useState } from "react";
import DuelScreen from "./DuelScreen";
import { FilmInfo } from "./FilmInfo";
import { Settings } from "./Settings";
import ListScreen from "./ListScreen";
import ProfileScreen from "./ProfileScreen";
import Trophies from "./Trophies";
import { loadProfile, saveProfile, EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { loadFilms, saveFilms } from "@/lib/store";
import { loadRun } from "@/lib/runs";
import { syncOnOpen } from "@/lib/startupSync";
import { isPlaced } from "@/lib/lock";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { backfillPosters, needsCredits, withMeta, type FilmMeta } from "@/lib/meta";
import { PersonSheet } from "./PersonSheet";
import Splash, { SPLASH_FADE_MS, SPLASH_HOLD_MS } from "./Splash";
import Coach from "./Coach";
import { InstallPrompt } from "./InstallPrompt";
import { forgetTours, markTourSeen, seenTours, TOURS, type TourId } from "@/lib/tour";
import { loadLog } from "@/lib/log";
import { deltaOf, openVisit, snapshotOf, type VisitDelta } from "@/lib/visit";
import type { Person } from "@/lib/people";
import type { Film, RankState } from "@/lib/types";

// Slow on purpose: the sweep must always lose a race against artwork you are
// actually looking at. A real 861-film library takes a few minutes to converge,
// which is fine for something nobody is waiting on.
const SWEEP_DELAY_MS = 4000;
const SWEEP_GAP_MS = 400;
// How many films land before the library is written to disk. See the sweep.
const SWEEP_BATCH = 10;

type Screen = "duel" | "list" | "profile";

/** Matches `.veil-out` in globals.css. Kept here only to sequence the tour behind it. */
const VEIL_MS = 200;

/**
 * Where the app opens.
 *
 * The profile, once there is a profile worth opening on. It is the screen that
 * says what your library amounts to rather than enumerating it — and with the
 * recap on it, it is now the one screen whose contents differ from the last time
 * you looked, which is what earns it the landing.
 *
 * But only once something has been placed. A library nobody has ranked has no
 * number one, therefore no hero, therefore no COLLECTIONS row at all — and no
 * recap either, since a first visit has nothing to compare against. A new user
 * would land on a page of empty sections instead of a playable duel.
 * `pickOpeningTier` already refuses to open on an empty tier because "an empty
 * screen is a poor first look"; this is that same rule one level up.
 *
 * Derived rather than stored, so it answers to the library as it stands. Nothing
 * needs migrating, and someone who clears their ranking goes back to landing on
 * the duel — which is where they now have work to do.
 *
 * ASKED ONCE, at load, and that is load-bearing. Its input is "has anything been
 * placed", which the act of playing CHANGES — so evaluated on every render it
 * re-fires mid-run, and confirming your first film throws you onto the profile
 * with the climb still running behind it. Where the app OPENS is a question
 * about opening; asking it continuously makes it a rule about where the app
 * should be, which is not this function's business.
 */
function openingScreen(films: readonly Film[]): Screen {
  return films.some(isPlaced) ? "profile" : "duel";
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
  const [infoFilm, setInfoFilm] = useState<Film | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Lives here, not on the profile — the trophy sits in the shared header, so it
  // has to work from whichever screen you're looking at.
  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [brightness, setBrightness] = useState(0);
  // Whose filmography is open, and who a cross-tier run was just asked for.
  // Both live here because opening one means closing the info card, and starting
  // the other means changing screens.
  const [person, setPerson] = useState<Person | null>(null);
  const [personRun, setPersonRun] = useState<Person | null>(null);
  const [personGuests, setPersonGuests] = useState<Film[]>([]);
  // Their face, fetched by the sheet and carried through to the share card. A
  // plain value rather than another request, so it starts no effect of its own.
  const [personPortrait, setPersonPortrait] = useState<string | undefined>(undefined);
  // What the last sitting amounted to. Read once, here, for the reason below.
  const [recap, setRecap] = useState<VisitDelta | null>(null);
  // ── The splash, in two flags ───────────────────────────────────────────────
  //
  // `held` is the deliberate part elapsing; `splashGone` is the fade having
  // finished, which is what actually unmounts it. Two flags rather than one
  // because the exit has to be a CLASS on a mounted element — unmounting at the
  // end of the hold would remove the splash between two frames, and the whole
  // reason to spend the time is that the arrival should not feel abrupt.
  const [held, setHeld] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
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
    setState({ films, session: loadRun(films), journal: [] });
    // Decided here, on the library as it arrived, and never re-derived. Guests
    // cannot be in play yet — nothing has started a run — so `films` is already
    // the guest-free library the rule wants.
    setScreen(openingScreen(films));

    // Catch up with the account, if there is one. `pull` reloads the page, so on
    // a new device this render is simply replaced by one holding the real
    // library — which is why nothing here has to reconcile React state by hand.
    // A conflict is deliberately left alone for the chooser in settings; see
    // lib/startupSync.ts.
    void syncOnOpen();

    // ── Why the visit marker advances HERE and not on the profile ────────────
    //
    // `openVisit` rolls the last snapshot into `prev` and takes a new one. That
    // has to happen when the APP opens, once, before any duel of this sitting
    // has been fought — otherwise the "current" snapshot would already include
    // work the recap is meant to be describing next time.
    //
    // Doing it on `ProfileScreen` mount instead would look equivalent and is
    // not: once the profile becomes the landing screen (roadmap #2) the feature
    // would advance its own marker on arrival and erase its own subject. It is
    // also a no-op after the first call in a tab, so this stays true however
    // many times you come back to the screen.
    //
    // The counts are taken from the library as loaded. The credits sweep can
    // still earn a badge a few seconds later, which lands in the NEXT recap —
    // correct, since that badge was earned during this sitting.
    void loadLog().then((log) => {
      const record = openVisit(snapshotOf(films, log.length));
      setRecap(record ? deltaOf(record) : null);
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
  }, []);

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

  const changeBrightness = (t: number) => {
    setBrightness(t);
    applyBrightness(t);
    saveBrightness(t);
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

  // The hold is a floor, not a duration: the splash leaves when the deliberate
  // time is up AND there is an app behind it to reveal. On any real device the
  // library (<92ms) is long since in hand and the hold is the only thing being
  // waited on — which is the point. A splash whose length depends on the speed
  // of the phone is not a decision, it is a symptom.
  const splashLeaving = held && !!state;

  useEffect(() => {
    if (!splashLeaving) return;
    const t = setTimeout(() => setSplashGone(true), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splashLeaving]);

  const splash = splashGone ? null : <Splash leaving={splashLeaving} />;

  // Still nothing to show behind it — the splash IS the screen for now.
  if (!state) return splash;

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
  const current = screen ?? openingScreen(library);

  // ── When a tour runs by itself ─────────────────────────────────────────────
  //
  // Only for a library nobody has ranked, which is the same predicate as the
  // landing rule and for a matching reason. Someone with 861 films and a year of
  // duels behind them does not need to be told what a tap does, and ambushing
  // them with a tutorial on open would be the app talking over their own work.
  // Settings is where they ask for it.
  const newLibrary = !library.some(isPlaced);

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
  const go = (s: Screen) => {
    const arriving = s === "duel" && current !== "duel";
    if (arriving) {
      setVeil((v) => v + 1);
      setGreet((g) => g + 1); // coming back to the game earns the overlay again
    }
    setScreen(s);
    setTourDue(null);
    const due = tourFor(s);
    if (due) setTimeout(() => setTourDue(due), arriving ? VEIL_MS + 20 : 20);
  };

  const goDuel = () => go("duel");

  // Asked for from Settings: forget both tours and start again from the duel.
  // `replaying` is what lets them run at all on a ranked library, and it stays
  // on for the rest of the session so the list tour still fires when the user
  // wanders over to it.
  const startTour = () => {
    setSettingsOpen(false);
    forgetTours();
    setSeen(new Set());
    setReplaying(true);
    if (current !== "duel") setVeil((v) => v + 1);
    setScreen("duel");
    setTourDue(null);
    // Only if a duel is actually on screen. With no run in progress the RNK
    // screen is `RunStart`, which has none of the tour's targets — so the replay
    // waits for `onRunBegan` exactly like a first run does. `replaying` stays on
    // for the session, so it will fire the moment they start something.
    //
    // Named rather than derived from `tourFor`, which would still be reading the
    // pre-reset `seen` and `replaying` from this render's closure.
    if (state.session) setTimeout(() => setTourDue("duel"), VEIL_MS + 20);
  };

  return (
    <>
      {current === "duel" ? (
        <DuelScreen
          state={state}
          setState={setState}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onList={() => go("list")}
          onProfile={() => go("profile")}
          onAddFilm={addFilm}
          // A run just started, so the duel's targets exist now. Deferred a tick
          // for the same reason every other tour start is: `Coach` measures as
          // it renders, and the posters have not committed yet.
          // 0 until the splash has gone, so the greeting cannot arrive on top of
          // the opening animation. Derived rather than an effect that flips a
          // flag, which would be a cascading render to express one comparison.
          greet={splashGone ? greet : 0}
          onRunBegan={() => {
            if (seen.has("duel") || !(newLibrary || replaying)) return;
            setTimeout(() => setTourDue("duel"), 20);
          }}
          personRun={personRun}
          personGuests={personGuests}
          personPortrait={personPortrait}
          onPerson={setPerson}
          onPersonRunHandled={() => {
            setPersonRun(null);
            setPersonGuests([]);
            setPersonPortrait(undefined);
          }}
        />
      ) : current === "list" ? (
        <ListScreen
          films={library}
          profile={profile}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onDuel={goDuel}
          onProfile={() => go("profile")}
          onPoster={setMeta}
          onAddFilm={addFilm}
          // A tutorial is a held moment. Nothing behind it may move.
          frozen={showCoach}
        />
      ) : (
        <ProfileScreen
          films={library}
          profile={profile}
          recap={recap}
          onProfile={changeProfile}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onDuel={goDuel}
          onList={() => go("list")}
          onAddFilm={addFilm}
        />
      )}

      {trophiesOpen && <Trophies films={library} onClose={() => setTrophiesOpen(false)} />}

      {infoFilm && (
        <FilmInfo
          film={infoFilm}
          films={library}
          onClose={() => setInfoFilm(null)}
          // The info card closes on the way through: two stacked sheets over the
          // duel is one too many, and you came here to leave this film behind.
          onPerson={(p) => {
            setInfoFilm(null);
            setPerson(p);
          }}
          // Guests are not in the library, so there is nothing to remove them
          // from - offering it would be a button that silently does nothing.
          onRemove={infoFilm.guest ? undefined : (f) => removeFilm(f.id)}
        />
      )}

      {person && (
        <PersonSheet
          person={person}
          films={library}
          onClose={() => setPerson(null)}
          onInfo={(f) => {
            setPerson(null);
            setInfoFilm(f);
          }}
          onAddFilm={addFilm}
          onRank={(p, guests, portrait) => {
            setPerson(null);
            setPersonPortrait(portrait);
            // A fresh object every time, so asking for the same person twice is
            // two requests. The duel screen starts a run when this prop CHANGES,
            // and handing back the identical object would be a no-op it read as
            // "nothing new to do".
            setPersonRun({ ...p });
            setPersonGuests(guests);
            goDuel();
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          brightness={brightness}
          onChange={changeBrightness}
          onClose={() => setSettingsOpen(false)}
          films={library}
          onImport={loadLibrary}
          onTour={startTour}
        />
      )}

      {/* Over the screens and the veil, under the splash. */}
      {showCoach && (
        // Keyed by tour, so moving from the duel's to the list's remounts and
        // re-resolves rather than carrying the old steps and step index across.
        <Coach key={activeTour} steps={TOURS[activeTour]} onDone={finishTour} />
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
