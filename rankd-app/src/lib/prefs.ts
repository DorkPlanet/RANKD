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
   * What happens when the climb reaches a duel you have already settled.
   *
   *  · "watch"  — play it back slowly. Every one, at a readable pace.
   *  · "quick"  — play it back fast, accelerating through a long run. Default.
   *  · "silent" — resolve it without showing anything.
   *
   * "silent" was the only behaviour when this shipped and it was wrong as a
   * default: the pile leapt several places between taps with nothing on screen
   * to say what had been decided, which reads as the app ranking films on its
   * own. It survives as a choice for people who have made their peace with it.
   */
  replay: ReplayMode;
}

export type ReplayMode = "watch" | "quick" | "silent";

const REPLAY_MODES: readonly string[] = ["watch", "quick", "silent"];

export const DEFAULT_PREFS: Prefs = {
  listDrift: true,
  // Fast enough not to be a cutscene, visible enough that nothing moves
  // unexplained. See the field's own note for why this is not "silent".
  replay: "quick",
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
