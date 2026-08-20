"use client";

// A temporary readout for one specific bug, and nothing else.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Fast Shuffle freezes the whole app after a couple of hundred duels, keeps
// working after a restart, and freezes again the moment you re-enter the mode.
// Reported 21 Aug 2026.
//
// Three theories were measured and two died. The engine is not it: 300
// consecutive duels against 861 films with a 950-row log run flat at 0.6ms
// each, and the opening belief fit is 6ms. Matchmaking, scoring, respreading
// and serialisation are all clear.
//
// That leaves the browser layer, which cannot be measured from Node — real
// localStorage writes, DOM and animation accumulation, or memory. This shows
// the four numbers that tell those apart, on the device where it actually
// happens.
//
// ── How to use it ──────────────────────────────────────────────────────────
//
// Settings has no control for this on purpose. Turn it on by opening the app
// with `?diag=1` on the URL; it sticks until you use `?diag=0`.
//
// Play Fast Shuffle until it stutters, then screenshot. The reading just before
// it dies is the answer:
//
//   · STALL climbing while STORE is large  → localStorage writes, or quota
//   · STALL climbing while NODES climbs    → the DOM is accumulating
//   · HEAP climbing steadily to a ceiling  → a retain, and the freeze is GC
//   · everything flat and it still freezes → none of the above, tell me
//
// DELETE THIS FILE once the cause is known. It is not a feature, it has no
// design, and it is deliberately ugly so nobody mistakes it for one.

import { useEffect, useState, useSyncExternalStore } from "react";

const KEY = "rankd-diag";

// The query parameter is read ONCE, here, at import. Doing it in an effect and
// calling setState is the cascading-render pattern the linter rejects, and the
// baseline for this repo is two of those errors in `AppShell` and no more.
// `InstallPrompt` solves the identical problem the same way.
if (typeof window !== "undefined") {
  try {
    const q = new URLSearchParams(window.location.search).get("diag");
    if (q === "1") localStorage.setItem(KEY, "1");
    if (q === "0") localStorage.removeItem(KEY);
  } catch {
    /* storage disabled */
  }
}

const noSubscribe = () => () => {};

/** Whether the readout is on. Set by `?diag=1`, cleared by `?diag=0`. */
export function useDiagFlag(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false, // server: never
  );
}

const bytesOf = (): number => {
  let total = 0;
  try {
    for (const k of Object.keys(localStorage)) total += (localStorage.getItem(k)?.length ?? 0) + k.length;
  } catch {
    /* ignore */
  }
  return total;
};

export function Diag() {
  const [row, setRow] = useState({ stall: 0, store: 0, nodes: 0, heap: 0, taps: 0, secs: 0 });

  useEffect(() => {
    // ── The decisive pair of numbers ────────────────────────────────────────
    //
    // The first version of this readout could not measure its own death: if the
    // main thread blocks, the frame loop stops and every figure freezes at its
    // last healthy value. A screenshot taken mid-freeze therefore showed STALL
    // 46ms and looked fine, which is exactly what happened.
    //
    // TAPS counts pointerdown on the window, in the capture phase, so nothing in
    // the app can stop it. SECS is a plain wall-clock second counter.
    //
    //   · SECS stops advancing            → the main thread is genuinely blocked
    //   · SECS advances, TAPS advances,
    //     but the game does not respond   → the thread is alive and a handler is
    //                                       dead, which is a completely different
    //                                       bug in a completely different place
    //
    // Both are written by the same interval that writes the rest, so if the
    // display is stale everything is stale together and there is no way to read
    // a frozen figure as a live one.
    let taps = 0;
    const onTap = () => {
      taps += 1;
    };
    window.addEventListener("pointerdown", onTap, true);
    const started = Date.now();
    // Worst frame gap seen since the last readout. A main thread that is blocked
    // cannot paint, so this is the number that actually detects a freeze — and
    // it keeps its peak rather than averaging it away.
    let worst = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap > worst) worst = gap;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const timer = setInterval(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setRow({
        stall: Math.round(worst),
        store: bytesOf(),
        nodes: document.getElementsByTagName("*").length,
        heap: mem ? Math.round(mem.usedJSHeapSize / 1_048_576) : 0,
        taps,
        secs: Math.round((Date.now() - started) / 1000),
      });
      worst = 0;
    }, 1000);

    return () => {
      window.removeEventListener("pointerdown", onTap, true);
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 2,
        left: 2,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.82)",
        color: "#7CFF9B",
        font: "600 10px/1.35 ui-monospace, monospace",
        padding: "3px 5px",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {`SECS  ${row.secs}
TAPS  ${row.taps}
STALL ${row.stall}ms\nSTORE ${(row.store / 1024).toFixed(0)}KB\nNODES ${row.nodes}\nHEAP  ${row.heap || "-"}MB`}
    </div>
  );
}
