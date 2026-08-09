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
import DuelScreen, { pickOpeningTier } from "./DuelScreen";
import { FilmInfo } from "./FilmInfo";
import { Settings } from "./Settings";
import ListScreen from "./ListScreen";
import ProfileScreen from "./ProfileScreen";
import Trophies from "./Trophies";
import { loadProfile, saveProfile, EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun } from "@/lib/ladder";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { backfillPosters, needsCredits, withMeta, type FilmMeta } from "@/lib/meta";
import { PersonSheet } from "./PersonSheet";
import type { Person } from "@/lib/people";
import type { Film, RankState } from "@/lib/types";

// Slow on purpose: the sweep must always lose a race against artwork you are
// actually looking at. A real 861-film library takes a few minutes to converge,
// which is fine for something nobody is waiting on.
const SWEEP_DELAY_MS = 4000;
const SWEEP_GAP_MS = 400;
// How many films land before the library is written to disk. See the sweep.
const SWEEP_BATCH = 10;

export default function AppShell() {
  const [state, setState] = useState<RankState | null>(null);
  const [screen, setScreen] = useState<"duel" | "list" | "profile">("duel");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [infoFilm, setInfoFilm] = useState<Film | null>(null);
  // A film the review card has handed over to be re-placed. It lives here rather
  // than in ListScreen because answering the question means changing screens.
  const [spotlightFilm, setSpotlightFilm] = useState<Film | null>(null);
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

  useEffect(() => {
    const films = loadFilms();
    // Open on the biggest tier that can actually be played — with a real library
    // the default 4★ might be empty, and an empty screen is a poor first look.
    try {
      setState(startRun(films, pickOpeningTier(films)));
    } catch {
      setState({ films, session: null, journal: [] });
    }
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
    const b = loadBrightness();
    setBrightness(b);
    applyBrightness(b);
    setProfile(loadProfile());
  }, []);

  const changeProfile = (p: Profile) => {
    setProfile(p);
    saveProfile(p);
  };

  const changeBrightness = (t: number) => {
    setBrightness(t);
    applyBrightness(t);
    saveBrightness(t);
  };

  // Swap the whole library for an imported one and restart on it.
  const loadLibrary = (films: Film[]) => {
    saveFilms(films);
    try {
      setState(startRun(films, pickOpeningTier(films)));
    } catch {
      setState({ films, session: null, journal: [] });
    }
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

  if (!state) return null;

  // What the user actually owns. A person run merges borrowed films into
  // `state.films` so the engine can duel them, and the duel screen is the only
  // screen entitled to see them — everywhere else they would read as films you
  // logged. `saveFilms` keeps them out of storage; this keeps them off screen.
  const library = state.films.some((f) => f.guest)
    ? state.films.filter((f) => !f.guest)
    : state.films;

  return (
    <>
      {screen === "duel" ? (
        <DuelScreen
          state={state}
          setState={setState}
          spotlightRequest={spotlightFilm}
          onSpotlightHandled={() => setSpotlightFilm(null)}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onList={() => setScreen("list")}
          onProfile={() => setScreen("profile")}
          onAddFilm={addFilm}
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
      ) : screen === "list" ? (
        <ListScreen
          films={library}
          profile={profile}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onDuel={() => setScreen("duel")}
          onProfile={() => setScreen("profile")}
          onPoster={setMeta}
          onSpotlight={(film) => {
            setSpotlightFilm(film);
            setScreen("duel");
          }}
          onAddFilm={addFilm}
        />
      ) : (
        <ProfileScreen
          films={library}
          profile={profile}
          onProfile={changeProfile}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onDuel={() => setScreen("duel")}
          onList={() => setScreen("list")}
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
            setScreen("duel");
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
        />
      )}
    </>
  );
}
