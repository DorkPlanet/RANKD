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
import DuelScreen, { FilmInfo, Settings, pickOpeningTier } from "./DuelScreen";
import ListScreen from "./ListScreen";
import ProfileScreen from "./ProfileScreen";
import Trophies from "./Trophies";
import { loadProfile, saveProfile, EMPTY_PROFILE, type Profile } from "@/lib/profile";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun } from "@/lib/ladder";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { withMeta, type FilmMeta } from "@/lib/meta";
import type { Film, RankState } from "@/lib/types";

export default function AppShell() {
  const [state, setState] = useState<RankState | null>(null);
  const [screen, setScreen] = useState<"duel" | "list" | "profile">("duel");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [infoFilm, setInfoFilm] = useState<Film | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Lives here, not on the profile — the trophy sits in the shared header, so it
  // has to work from whichever screen you're looking at.
  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    const films = loadFilms();
    // Open on the biggest tier that can actually be played — with a real library
    // the default 4★ might be empty, and an empty screen is a poor first look.
    try {
      setState(startRun(films, pickOpeningTier(films)));
    } catch {
      setState({ films, session: null });
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
      setState({ films, session: null });
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

  if (!state) return null;

  return (
    <>
      {screen === "duel" ? (
        <DuelScreen
          state={state}
          setState={setState}
          onInfo={setInfoFilm}
          onSettings={() => setSettingsOpen(true)}
          onTrophies={() => setTrophiesOpen(true)}
          onList={() => setScreen("list")}
          onProfile={() => setScreen("profile")}
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
        />
      )}

      {trophiesOpen && <Trophies films={state.films} onClose={() => setTrophiesOpen(false)} />}

      {infoFilm && <FilmInfo film={infoFilm} onClose={() => setInfoFilm(null)} />}

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
