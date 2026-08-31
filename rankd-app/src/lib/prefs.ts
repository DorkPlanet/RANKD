// Display preferences — the small on/off choices about how the app behaves.
//
// ── Why one key rather than one key per toggle ─────────────────────────────
//
// `rankd-brightness` and `rankd-strip-open` each own a localStorage key, which
// was fine at two and would not be at ten: every new toggle would need its own
// entry in `SYNC_KEYS`, its own entry in the file format's owned set, and its
// own round of "did we remember to add it to the backup". One object under one
// key means a new preference is a field, and backup, restore and sync all
// already carry it.
//
// The existing two keys are deliberately left alone. Moving them would mean
// migrating live data to tidy up something that already works, and a migration
// that can go wrong is a worse trade than a slightly untidy key list.
//
// ── Reading is total ───────────────────────────────────────────────────────
//
// `loadPrefs` never throws and never returns a partial object. Storage can hold
// anything — a value written by an older build, a half-synced blob, junk from a
// failed restore — and a preference read is called during render on screens the
// user cannot leave. Anything unreadable falls back to the default for that
// field alone, so one bad value cannot take the rest with it.

import { markDirty } from "./syncState";

const KEY = "rankd-prefs-v1";

export interface Prefs {
  /**
   * Whether the list drifts on its own after you stop touching it.
   *
   * On by default, because it is how the list has always behaved and turning it
   * off for everybody to serve the people who dislike it is the wrong default.
   * `useDriftScroll` already yields to `prefers-reduced-motion`, so this is the
   * preference for people who want the motion off WITHOUT declaring that at the
   * OS level — a different, narrower ask than accessibility.
   */
  listDrift: boolean;
  /**
   * How fast the list drifts when it is left alone.
   *
   * A switch was not enough: 20px/s is a showcase pace and reading a long list
   * at it is slower than scrolling by hand, so the setting was really "on and
   * too slow" or "off". Asked for directly — "a faster option for the speed
   * scroll".
   *
   * `listDrift` still decides WHETHER it moves, so an existing off stays off.
   */
  driftSpeed: DriftSpeed;
  /**
   * What happens when the climb reaches a duel you have already settled.
   *
   *  · "watch"  — play it back slowly. Every one, at a readable pace.
   *  · "quick"  — play it back fast, accelerating through a long run. Default.
   *  · "fast"   — as fast as the animation allows and still be seen at all.
   *  · "silent" — resolve it without showing anything.
   *
   * "silent" was the only behaviour when this shipped and it was wrong as a
   * default: the pile leapt several places between taps with nothing on screen
   * to say what had been decided, which reads as the app ranking films on its
   * own. It survives as a choice for people who have made their peace with it.
   */
  replay: ReplayMode;
  /**
   * Whether the list shows the star rating on each row and its tier headers.
   *
   * ── Why somebody would want this ───────────────────────────────────────
   *
   * A star is an anchor. Reading down a list with them showing, the eye checks
   * each film against the rating it already has rather than against the film
   * above it — which is exactly the wrong comparison when the question is
   * "where does this tier actually end". Off, the list is one continuous run of
   * films and the boundaries are the reader's to place.
   *
   * ── Deliberately not everywhere ────────────────────────────────────────
   *
   * This covers the surfaces read WHILE RANKING: the list rows, the tier rules,
   * the film sheet. It does not touch share cards, the profile or achievements.
   * Those are outbound artifacts — a starless card is a different design
   * question, and a preference about how you read your own list has no business
   * silently rewriting what you publish. The setting's blurb says so, because a
   * toggle called "hide stars" that leaves them on four other screens is only
   * honest if it admits which ones.
   */
  hideStars: boolean;
  /**
   * Read the list as a grid of posters rather than one row per film.
   *
   * A reading mode, not a different list: same order, same numbers, same tier
   * rules, several times as many films on screen at once. Rows are the better
   * shape for reading a film's title, year and maker; a grid is the better shape
   * for seeing the SHAPE of a stretch of the ranking, which is the question you
   * are asking when you scroll a long way.
   *
   * Dragging stays a rows-only gesture — see the comment at the grid's render.
   */
  grid: boolean;
}


export type ReplayMode = "watch" | "quick" | "fast" | "silent";

export type DriftSpeed = "slow" | "medium" | "fast";

/** Pixels a second. `slow` is the original pace and stays the default. */
export const DRIFT_PX_PER_SEC: Record<DriftSpeed, number> = {
  slow: 20,
  medium: 55,
  fast: 120,
};

const DRIFT_SPEEDS: readonly string[] = ["slow", "medium", "fast"];

const REPLAY_MODES: readonly string[] = ["watch", "quick", "fast", "silent"];

export const DEFAULT_PREFS: Prefs = {
  listDrift: true,
  // The pace the list has always drifted at, so nobody's screen changes speed
  // without them asking.
  driftSpeed: "slow",
  // Fast enough not to be a cutscene, visible enough that nothing moves
  // unexplained. See the field's own note for why this is not "silent".
  replay: "quick",
  // Off: the stars are how the list has always read, and somebody who wants
  // them gone will say so.
  hideStars: false,
  // Off: rows are what the list has always been, and they carry more per film.
  grid: false,
};

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      // Per-field, not a spread. A spread would let a non-boolean through and
      // `listDrift: "false"` is truthy — the toggle would read as on while the
      // stored value says off.
      listDrift:
        typeof parsed.listDrift === "boolean" ? parsed.listDrift : DEFAULT_PREFS.listDrift,
      // Same rule as above, one step wider: an unrecognised string — a value
      // from a future build, or junk — falls back rather than being trusted,
      // because it reaches a `switch` on the duel screen that would otherwise
      // match nothing and leave the replay neither playing nor resolving.
      replay: REPLAY_MODES.includes(parsed.replay as string)
        ? (parsed.replay as ReplayMode)
        : DEFAULT_PREFS.replay,
      // Per-field for the same reason `listDrift` is: a stored "false" is
      // truthy, and the toggle would read as on while the value says off.
      hideStars:
        typeof parsed.hideStars === "boolean" ? parsed.hideStars : DEFAULT_PREFS.hideStars,
      grid: typeof parsed.grid === "boolean" ? parsed.grid : DEFAULT_PREFS.grid,
      driftSpeed: DRIFT_SPEEDS.includes(parsed.driftSpeed as string)
        ? (parsed.driftSpeed as DriftSpeed)
        : DEFAULT_PREFS.driftSpeed,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    // This key is in `SYNC_KEYS` and nothing here used to say so. It reached the
    // account only as a passenger on some other write, which meant it could sit
    // differing from the server indefinitely — and a difference the sync layer
    // has not been told about is what produced a conflict chooser offering two
    // identical libraries. If it is synced, it marks.
    markDirty();
  } catch {
    // Storage full or disabled. The preference holds for this session and is
    // forgotten on reload, which is the right way for a display toggle to fail.
  }
}
