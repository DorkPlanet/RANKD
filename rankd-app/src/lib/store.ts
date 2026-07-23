import type { Film } from "./types";
import { SEED_FILMS } from "./seed";

// Local-first persistence. No backend yet — the master library lives in
// localStorage, seeded on first run. (Accounts/sync arrive in a later phase.)
const KEY = "rankd-app-v1";

export function loadFilms(): Film[] {
  if (typeof window === "undefined") return SEED_FILMS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Film[];
  } catch {
    // ignore corrupt/absent storage — fall through to seed
  }
  return SEED_FILMS;
}

export function saveFilms(films: Film[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(films));
  } catch {
    // storage full / disabled — nothing we can do, and nothing to fall back to
  }
}

export function resetFilms(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
