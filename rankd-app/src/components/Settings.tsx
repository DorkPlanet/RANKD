"use client";

// Settings — brightness, importing a library, and the only backup that exists.
//
// The move/back-up section is load-bearing rather than housekeeping: localStorage
// is per-origin, so this file is the only bridge between a laptop and a phone,
// and clearing browser data without it destroys every duel ever fought.

import { useEffect, useState, useSyncExternalStore } from "react";

// Stable reference for `useSyncExternalStore`; nothing here changes after load.
const noSubscribe = () => () => {};

import { exportBackup, importBackup } from "@/lib/backup";
import { mergeFilms, parseLetterboxdCsv } from "@/lib/importCsv";
import { installRoute, readEnv } from "@/lib/install";
import { clearLog, loadLog, logSize } from "@/lib/log";
import { resetRanking } from "@/lib/reset";
import { withdrawSoftLocks } from "@/lib/shuffle";
import type { Film } from "@/lib/types";
import { Account } from "./Account";
import { Feedback } from "./Feedback";
import { ImportButton, RestoreButton, Sheet } from "./ui";

export function Settings({
  brightness,
  onChange,
  onClose,
  films,
  onImport,
  onTour,
}: {
  brightness: number;
  onChange: (t: number) => void;
  onClose: () => void;
  films: Film[];
  onImport: (films: Film[]) => void;
  /** Replay the coach marks. Optional so the sheet still renders without one. */
  onTour?: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  // How much evidence is behind the list, and what it costs to keep. A storage
  // ceiling you can't see is a cliff; one you can see is a number going up.
  const [evidence, setEvidence] = useState<{ rows: number; bytes: number } | null>(null);
  useEffect(() => {
    void loadLog().then((log) => setEvidence(logSize(log)));
  }, []);

  const takeFile = async (file: File, merge: boolean) => {
    const { films: parsed, skipped } = parseLetterboxdCsv(await file.text());
    if (parsed.length === 0) {
      setNote("No rated films found — is that a Letterboxd ratings.csv?");
      return;
    }
    const next = merge ? mergeFilms(films, parsed) : parsed;
    onImport(next);
    setNote(
      `${merge ? "Merged" : "Imported"} ${parsed.length} films` +
        (skipped ? ` · skipped ${skipped} unrated` : "") +
        ". Posters are loading in the background.",
    );
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-[0.12em] text-dim">BRIGHTNESS</span>
          <span className="text-[11px] text-dim">{Math.round(brightness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(brightness * 100)}
          onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-dim">
          <span>Deep</span>
          <span>Bright</span>
        </div>

        {/* The half of onboarding that stops it being a one-shot. A tutorial you
            can only ever see on the day you install the app is one nobody can
            re-read, and the gestures here are the kind you half-remember. */}
        {onTour && (
          <div className="mt-7 border-t border-border pt-5">
            <span className="text-xs font-extrabold tracking-[0.12em] text-dim">HOW IT WORKS</span>
            <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
              A quick pass over the gestures: tapping, flicking, holding, and where Rough Cut
              lives. Runs on the duel screen, then again on your list.
            </p>
            <button
              onClick={onTour}
              className="w-full rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]"
            >
              Show me around
            </button>
          </div>
        )}

        <div className="mt-7 border-t border-border pt-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-extrabold tracking-[0.12em] text-dim">YOUR FILMS</span>
            <span className="text-[11px] text-dim">{films.length} in the library</span>
          </div>
          <p className="mb-3 text-[11px] leading-snug text-dim">
            Import a Letterboxd <span className="text-text">ratings.csv</span>. Merge keeps anything
            you&apos;ve already placed; replace starts over.
          </p>
          <div className="flex gap-2">
            <ImportButton label="Merge" merge onFile={takeFile} />
            <ImportButton label="Replace" onFile={takeFile} />
          </div>
          {note && <p className="mt-3 text-[11px] leading-snug text-gold">{note}</p>}
        </div>

        <Account />

        {/* Signing in mirrors all of this to an account, but the file stays
            first-class: it is the path that works with no account, no network
            and no trust in anyone else's uptime, and it is how you leave. */}
        <div className="mt-7 border-t border-border pt-5">
          <span className="text-xs font-extrabold tracking-[0.12em] text-dim">MOVE OR BACK UP</span>
          <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
            One file holds everything — films, placements, duels and your profile. Save it, then
            restore it wherever you want to carry on.
          </p>
          {evidence && evidence.rows > 0 && (
            <p className="mb-3 text-[11px] leading-snug text-dim">
              <span className="text-text-hi">{evidence.rows.toLocaleString()}</span> duels recorded
              · {Math.max(1, Math.round(evidence.bytes / 1024)).toLocaleString()} KB
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                exportBackup();
                setNote("Saved. Send it to your other device and restore it there.");
              }}
              className="flex-1 rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]"
            >
              Save a backup
            </button>
            <RestoreButton
              onFile={async (file) => {
                try {
                  const r = importBackup(await file.text());
                  const evidence = r.judgements ? `, ${r.judgements.toLocaleString()} duels` : "";
                  setNote(
                    `Restored ${r.films} films${evidence}${r.hadProfile ? " and your profile" : ""}. Reloading…`,
                  );
                  setTimeout(() => location.reload(), 900);
                } catch (e) {
                  setNote(e instanceof Error ? e.message : "That file couldn't be read.");
                }
              }}
            />
          </div>
        </div>

        <InstallSection />

        {/* Above START AGAIN, because someone scrolling this far in frustration
            should meet the way to TELL us before they meet the way to wipe
            everything. The evidence count is already loaded here, so the report
            can carry it without a second read. */}
        <Feedback films={films} duels={evidence?.rows ?? 0} />

        {/* Deliberately BELOW the backup block, so the export is the thing you
            read first and the destruction is the thing you scroll to. */}
        <StartAgain films={films} onReset={onImport} />

        {/* Required by TMDB's API terms, and the right thing regardless — every
            poster, still and credit in this app is their data. */}
        <p className="mt-7 border-t border-border pt-5 text-[10px] leading-snug text-dim">
          Artwork and film details from TMDB. This product uses the TMDB API but is not endorsed or
          certified by TMDB.
        </p>
      </div>
    </Sheet>
  );
}

/**
 * Where the one-time nudge goes to be found again.
 *
 * The banner is dismissible and stays dismissed, which is right for an
 * invitation and wrong for the only place a feature is explained. This says the
 * same thing permanently, and reports plainly when the app is already installed
 * rather than offering an action that would do nothing.
 */
function InstallSection() {
  // Read through `useSyncExternalStore` for the reason given in
  // `InstallPrompt`: it depends on `navigator`, so a `useState` initialiser
  // would break hydration and an effect would cost a render cascade.
  const route = useSyncExternalStore(
    noSubscribe,
    () => installRoute(readEnv()),
    () => "installed" as const,
  );

  return (
    <div className="mt-7 border-t border-border pt-5">
      <span className="text-xs font-extrabold tracking-[0.12em] text-dim">ON YOUR HOME SCREEN</span>
      {route === "installed" ? (
        <p className="mt-1 text-[11px] leading-snug text-gold">
          Installed. This is running as an app, which is why there is no address bar.
        </p>
      ) : (
        <p className="mt-1 text-[11px] leading-snug text-dim">
          {route === "ios" ? (
            <>
              Tap <span className="text-text">Share</span>, then{" "}
              <span className="text-text">Add to Home Screen</span>. Rankd then opens with its own
              icon and no address bar. A browser tab always shows its URL, so this is the only way
              to lose it.
            </>
          ) : (
            <>
              {/* The `{" "}` after the span is load-bearing: a bare space there
                  is swallowed when the text that follows wraps onto the next
                  line, which shipped as "Home screenin your browser's menu".
                  Only visible in the rendered DOM, never in the source. */}
              Use <span className="text-text">Install</span> or{" "}
              <span className="text-text">Add to Home screen</span>{" "}
              in your browser&rsquo;s menu. Rankd then opens with its own icon and no address bar.
              A browser tab always shows its URL, so this is the only way to lose it.
            </>
          )}
        </p>
      )}
    </div>
  );
}

// ── Starting over ──────────────────────────────────────────────────────────
//
// Two acts, and they are not degrees of the same thing.
//
// WITHDRAW turns off the model's opinions and keeps yours. Cheap, undoable in
// practice — the evidence is untouched, so the placements come back as you keep
// playing. No confirm, because nothing is lost.
//
// START AGAIN empties the ranking and burns the evidence with it. That second
// half is not optional: beliefs are fitted from the log, so a reset that spared
// it would refill the list with the order you were trying to leave (see
// lib/reset.ts). It is the only irreversible button in the app, so it asks
// twice, names the number it is about to destroy, and points at the export.
//
// Neither touches the films or the star ratings. Those came from the import.
function StartAgain({ films, onReset }: { films: Film[]; onReset: (films: Film[]) => void }) {
  const [arming, setArming] = useState(false);
  const [duels, setDuels] = useState(0);
  useEffect(() => {
    void loadLog().then((l) => setDuels(l.length));
  }, []);

  const placed = films.filter((f) => f.lock).length;
  const soft = films.filter((f) => f.lock === "soft").length;

  return (
    <div className="mt-7 border-t border-border pt-5">
      <span className="text-xs font-extrabold tracking-[0.12em] text-dim">START AGAIN</span>
      <p className="mb-3 mt-1 text-[11px] leading-snug text-dim">
        Your films and star ratings are always kept — only the ranking goes.
      </p>

      {soft > 0 && (
        <button
          onClick={() => {
            onReset(withdrawSoftLocks(films));
            setArming(false);
          }}
          className="mb-2 w-full rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]"
        >
          Drop the {soft.toLocaleString()} the model placed
        </button>
      )}

      {!arming ? (
        <button
          onClick={() => setArming(true)}
          disabled={placed === 0 && duels === 0}
          className="w-full rounded-xl border border-border py-2.5 text-center text-xs font-bold text-dim active:scale-[0.98] disabled:opacity-35"
        >
          Clear the whole ranking
        </button>
      ) : (
        <>
          {/* Says the number, not "are you sure?". A count you recognise is the
              only warning that works — it is the thing you would miss. */}
          <p className="mb-2 text-[11px] leading-snug text-gold">
            This erases {placed.toLocaleString()} placement{placed === 1 ? "" : "s"} and{" "}
            {duels.toLocaleString()} recorded duel{duels === 1 ? "" : "s"}. It cannot be undone —
            save a backup first if you might want this back.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setArming(false)}
              className="flex-1 rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]"
            >
              Keep it
            </button>
            <button
              onClick={() => {
                // Log first: if the write below fails, the evidence is already
                // gone and a retry finishes the job. The other order can leave a
                // library with no placements and a log that re-places it.
                clearLog();
                onReset(resetRanking(films));
                setArming(false);
              }}
              className="flex-1 rounded-xl border border-gold/50 py-2.5 text-center text-xs font-bold text-gold active:scale-[0.98]"
            >
              Erase it
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// A label wrapping a hidden file input, same trick as ImportButton — a styled
// button can't open a file picker.
