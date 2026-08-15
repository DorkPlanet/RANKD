"use client";

// The invitation to put Rankd on a home screen.
//
// This is the only thing that removes the address bar. A tab always shows its
// URL, whatever the manifest says, so an app that wants to feel installed has to
// ask — and until this existed nothing in Rankd ever mentioned it.
//
// Two shapes, because the platforms genuinely differ:
//
//  · Android and desktop Chrome fire `beforeinstallprompt`, which can be saved
//    and replayed on a tap. One button, and the browser does the rest.
//  · iOS has no such event and never has. The only route is Share → Add to Home
//    Screen, so all this can do is say so clearly and get out of the way.
//
// Shown once, dismissible, and never on a device already running standalone.
// `Settings` says the same thing permanently — see `InstallSection` there.

import { useEffect, useState, useSyncExternalStore } from "react";

import { dismissHint, hintDismissed, installRoute, readEnv, type InstallRoute } from "@/lib/install";

/** The slice of `beforeinstallprompt` actually used. Not in lib.dom yet. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

// Nothing here ever changes after load, so there is nothing to subscribe to.
// Module scope because `useSyncExternalStore` needs a stable reference.
const noSubscribe = () => () => {};

/**
 * The install route, read without a render cascade.
 *
 * This depends on `navigator` and `localStorage`, neither of which exists on the
 * server — so it cannot be a `useState` initialiser without the first client
 * render disagreeing with the server's HTML. The usual escape is to read it in
 * an effect and `setState`, which works and costs a second render on every
 * mount. `useSyncExternalStore` is the API built for exactly this shape: it
 * takes a separate server snapshot and never cascades.
 *
 * `getSnapshot` returns a string, so React's `Object.is` comparison is stable
 * and this cannot loop.
 */
function useInstallRoute(): InstallRoute {
  return useSyncExternalStore(
    noSubscribe,
    () => (hintDismissed() ? "installed" : installRoute(readEnv())),
    () => "installed" as const, // server: render nothing at all
  );
}

export function InstallPrompt() {
  const route = useInstallRoute();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Chrome fires this only when the app is genuinely installable (HTTPS, valid
    // manifest, icons present). Treating its ARRIVAL as the signal means the
    // Install button is never offered where pressing it would do nothing.
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress Chrome's mini-infobar; this card replaces it
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (gone || route === "installed") return null;

  const close = () => {
    dismissHint();
    setGone(true);
  };

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4" style={{ bottom: "calc(var(--nav-h, 0px) + 12px)" }}>
      <div
        className="resume-card w-full max-w-md rounded-2xl border border-border px-4 py-3.5"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="flex-shrink-0 rounded-lg" style={{ width: 38, height: 38 }} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-none tracking-wide text-gold">Put Rankd on your home screen</p>
            <p className="mt-1.5 text-[11px] leading-snug text-dim">
              {route === "ios" ? (
                <>
                  Tap <span className="text-text-hi">Share</span>, then{" "}
                  <span className="text-text-hi">Add to Home Screen</span>. It opens without the
                  address bar, with its own icon.
                </>
              ) : (
                <>Opens without the address bar, with its own icon. Nothing to download.</>
              )}
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              {/* Only where a real prompt is in hand. Offering a button that
                  cannot do anything is worse than offering none. */}
              {deferred && (
                <button
                  onClick={async () => {
                    await deferred.prompt();
                    close();
                  }}
                  className="rounded-full px-4 py-1.5 text-[11px] font-bold active:scale-95"
                  style={{ color: "#1c1405", background: "var(--gold)" }}
                >
                  Install
                </button>
              )}
              <button onClick={close} className="px-2 py-1.5 text-[11px] font-semibold text-dim active:scale-95">
                {deferred ? "Not now" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
