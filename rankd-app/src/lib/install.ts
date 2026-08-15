// Getting Rankd onto a home screen, which is the only way the address bar goes.
//
// `app/manifest.ts` declares `display: standalone`, but a manifest does nothing
// for a page being viewed in a TAB — no browser lets a site hide its own URL,
// and that is a security rule rather than a setting. The chrome disappears only
// once the app is installed, so the whole job here is telling people that.
//
// ── Why the platform decision is a pure function ───────────────────────────
//
// The iOS path cannot be exercised on the machine this was written on. Keeping
// the branch as a function of (user agent, display mode, touch points) means it
// can be tested against real iPhone and iPad strings instead of trusted, which
// matters because iPadOS deliberately lies: since 13 it reports itself as a
// Macintosh, so a naive /iPhone|iPad/ check misses every modern iPad.

/** How this browser can install, if at all. */
export type InstallRoute =
  /** Already running from the home screen — nothing to offer. */
  | "installed"
  /** iOS/iPadOS Safari: no API exists, the user must use the Share sheet. */
  | "ios"
  /** Anything that may fire `beforeinstallprompt`, or offer it in a menu. */
  | "other";

export interface Env {
  ua: string;
  /** `display-mode: standalone` OR the legacy `navigator.standalone` on iOS. */
  standalone: boolean;
  /** `navigator.maxTouchPoints`. The only way to tell an iPad from a Mac. */
  touchPoints: number;
}

export function installRoute({ ua, standalone, touchPoints }: Env): InstallRoute {
  if (standalone) return "installed";
  // iPadOS 13+ reports a desktop Safari UA. A real Mac reports 0 touch points;
  // an iPad reports 5. This is the documented way to tell them apart, and it is
  // why `touchPoints` is threaded through rather than read here.
  const iPadPretendingToBeAMac = /Macintosh/.test(ua) && touchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadPretendingToBeAMac) return "ios";
  return "other";
}

/** Read the live environment. Split out so `installRoute` stays testable. */
export function readEnv(): Env {
  if (typeof window === "undefined") return { ua: "", standalone: true, touchPoints: 0 };
  return {
    ua: navigator.userAgent,
    // Two checks because iOS never implemented the standard one: Safari sets a
    // non-standard `navigator.standalone` instead, and a home-screen launch on
    // an iPhone matches nothing else.
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      !!(window.navigator as unknown as { standalone?: boolean }).standalone,
    touchPoints: navigator.maxTouchPoints ?? 0,
  };
}

const KEY = "rankd-install-hint-v1";

/**
 * Has the nudge been dismissed?
 *
 * Stored rather than shown once per session, because this is an invitation and
 * a second one is nagging. Deliberately NOT in the backup manifest: it describes
 * one browser's relationship with one home screen, and carrying it to a new
 * device would suppress the hint on the device most likely to need it.
 */
export function hintDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage disabled — say nothing rather than nag every load
  }
}

export function dismissHint(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // nothing to do; the hint simply reappears next time
  }
}
