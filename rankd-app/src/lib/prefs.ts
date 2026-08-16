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
}

export const DEFAULT_PREFS: Prefs = {
  listDrift: true,
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
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or disabled. The preference holds for this session and is
    // forgotten on reload, which is the right way for a display toggle to fail.
  }
}
