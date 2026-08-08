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
import { withMeta, type FilmMeta } from "@/lib/meta";
import { PersonSheet } from "./PersonSheet";
import type { Person } from "@/lib/people";
import type { Film, RankState } from "@/lib/types";

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

  if (!state) return null;

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
          onPersonRunHandled={() => setPersonRun(null)}
        />
      ) : screen === "list" ? (
        <ListScreen
          films={state.films}
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
          films={state.films}
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

      {trophiesOpen && <Trophies films={state.films} onClose={() => setTrophiesOpen(false)} />}

      {infoFilm && (
        <FilmInfo
          film={infoFilm}
          films={state.films}
          onClose={() => setInfoFilm(null)}
          // The info card closes on the way through: two stacked sheets over the
          // duel is one too many, and you came here to leave this film behind.
          onPerson={(p) => {
            setInfoFilm(null);
            setPerson(p);
          }}
        />
      )}

      {person && (
        <PersonSheet
          person={person}
          films={state.films}
          onClose={() => setPerson(null)}
          onInfo={(f) => {
            setPerson(null);
            setInfoFilm(f);
          }}
          onAddFilm={addFilm}
          onRank={(p) => {
            setPerson(null);
            setPersonRun(p);
            setScreen("duel");
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          brightness={brightness}
          onChange={changeBrightness}
          onClose={() => setSettingsOpen(false)}
          films={state.films}
          onImport={loadLibrary}
        />
      )}
    </>
  );
}
