"use client";

// Settings — one tappable row per thing, all shut by default.
//
// It used to be nine stacked blocks, every one with a paragraph explaining
// itself, so opening it read as homework. Everything still here; you just have
// to ask for it.
//
// The backup row is the load-bearing one: localStorage is per-origin, so that
// file is the only bridge between a laptop and a phone, and clearing browser
// data without it destroys every duel ever fought.

import { useEffect, useState, useSyncExternalStore } from "react";

import { exportBackup, importBackup } from "@/lib/backup";
import { mergeFilms, parseLetterboxdCsv } from "@/lib/importCsv";
import { installRoute, readEnv } from "@/lib/install";
import { clearLog, loadLog, logSize } from "@/lib/log";
import type { Prefs } from "@/lib/prefs";
import { resetRanking } from "@/lib/reset";
import { withdrawSoftLocks } from "@/lib/shuffle";
import type { Film } from "@/lib/types";
import { Account } from "./Account";
import { Feedback } from "./Feedback";
import { ImportButton, RestoreButton, Sheet } from "./ui";

/** Stable reference for `useSyncExternalStore`. */
const noSubscribe = () => () => {};

const BTN =
  "flex-1 rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]";

/** One collapsed row. `note` is the only thing shown while shut. */
function Row({
  title,
  note,
  open,
  onToggle,
  children,
}: {
  title: string;
  note?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3.5 text-left active:scale-[0.99]"
      >
        <span className="text-[14px] text-text-hi">{title}</span>
        <span className="flex items-center gap-2">
          {note && <span className="text-[11px] text-dim">{note}</span>}
          <span
            className="text-[10px] text-dim"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s var(--ease)" }}
          >
            ▾
          </span>
        </span>
      </button>
      {/* 1fr/0fr so the row opens at the same rate everything else in the app
          animates, rather than snapping. */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s var(--ease)" }}
      >
        <div className="overflow-hidden">
          <div className="pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

type RowId = "library" | "account" | "install" | "help" | "say" | "reset";

export function Settings({
  brightness,
  onChange,
  prefs,
  onPrefs,
  onClose,
  films,
  onImport,
  onTour,
}: {
  brightness: number;
  onChange: (t: number) => void;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  onClose: () => void;
  films: Film[];
  onImport: (films: Film[]) => void;
  onTour?: () => void;
}) {
  // One at a time. Two open rows is the wall of text this replaced.
  const [open, setOpen] = useState<RowId | null>(null);
  const toggle = (id: RowId) => setOpen((o) => (o === id ? null : id));

  const [conflict, setConflict] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{ rows: number; bytes: number } | null>(null);
  useEffect(() => {
    void loadLog().then((log) => setEvidence(logSize(log)));
  }, []);

  const takeFile = async (file: File, merge: boolean) => {
    const { films: parsed, skipped } = parseLetterboxdCsv(await file.text());
    if (parsed.length === 0) {
      setNote("No rated films in that file.");
      return;
    }
    onImport(merge ? mergeFilms(films, parsed) : parsed);
    setNote(`${merge ? "Merged" : "Imported"} ${parsed.length} films${skipped ? `, skipped ${skipped}` : ""}.`);
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[14px] text-text-hi">Brightness</span>
        <span className="text-[11px] text-dim">{Math.round(brightness * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(brightness * 100)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        className="mb-3 w-full"
        style={{ accentColor: "var(--accent)" }}
      />

      {/* Beside brightness rather than inside a row, because it is the same
          KIND of thing: how the app looks and moves, decided once and then
          forgotten. Everything in the rows below is a task — import, sign in,
          reset — and burying a display switch among those makes it a chore to
          find.

          The list drifts on its own after a couple of seconds so a long list
          reads itself while you look at it. Some people find that unsettling
          rather than restful. `useDriftScroll` already stands down for
          `prefers-reduced-motion`; this is for the people who want it still
          without turning motion off across their whole phone. */}
      <label className="mb-4 flex cursor-pointer items-center justify-between gap-3 active:scale-[0.99]">
        <span className="min-w-0">
          <span className="block text-[14px] text-text-hi">Let the list drift</span>
          <span className="block text-[11px] leading-snug text-dim">
            Scrolls slowly on its own when you stop touching it
          </span>
        </span>
        <input
          type="checkbox"
          className="tickbox flex-shrink-0"
          checked={prefs.listDrift}
          onChange={(e) => onPrefs({ listDrift: e.target.checked })}
        />
      </label>

      <Row
        title="Your films"
        note={`${films.length}`}
        open={open === "library"}
        onToggle={() => toggle("library")}
      >
        <p className="mb-2 text-[11px] text-dim">Add a Letterboxd export.</p>
        <div className="mb-4 flex gap-2">
          <ImportButton label="Merge" merge onFile={takeFile} />
          <ImportButton label="Replace" onFile={takeFile} />
        </div>

        <p className="mb-2 text-[11px] text-dim">
          Back up everything to one file, or move it to another device.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              exportBackup();
              setNote("Saved.");
            }}
            className={BTN}
          >
            Save
          </button>
          <RestoreButton
            onFile={async (file) => {
              try {
                const r = importBackup(await file.text());
                setNote(`Restored ${r.films} films. Reloading…`);
                setTimeout(() => location.reload(), 900);
              } catch (e) {
                setNote(e instanceof Error ? e.message : "That file couldn't be read.");
              }
            }}
          />
        </div>
        {note && <p className="mt-3 text-[11px] text-gold">{note}</p>}
      </Row>

      {/* Forced open on a conflict. Two devices disagreeing needs an answer, and
          the chooser is the one panel in the app allowed to be demanding — it
          must not sit behind a shut row. */}
      <Row
        title="Account"
        note={conflict ? "needs you" : undefined}
        open={open === "account" || conflict}
        onToggle={() => toggle("account")}
      >
        <Account onConflict={setConflict} />
      </Row>

      <InstallRow open={open === "install"} onToggle={() => toggle("install")} />

      {onTour && (
        <Row title="How to play" open={open === "help"} onToggle={() => toggle("help")}>
          {/* Says what it DOES, because what it does is unusual. It shows
              nothing on the spot — it puts the browser back to how it was on
              day one, and the explanations then reappear as you arrive at each
              screen. Labelled "Show me around" it read as a button that would
              start something, and pressing it appeared to do nothing at all. */}
          <p className="mb-2 text-[11px] leading-snug text-dim">
            Every screen explains itself the first time you see it. This makes them all
            new again, so the notes come back as you go.
          </p>
          <button onClick={onTour} className={`${BTN} w-full`}>
            Refresh me
          </button>
        </Row>
      )}

      <Row title="Tell us something" open={open === "say"} onToggle={() => toggle("say")}>
        <Feedback films={films} duels={evidence?.rows ?? 0} />
      </Row>

      <Row title="Start again" open={open === "reset"} onToggle={() => toggle("reset")}>
        <StartAgain films={films} onReset={onImport} />
      </Row>

      {/* Required by TMDB's API terms. */}
      <p className="mt-5 text-[10px] leading-snug text-dim">
        Film data from TMDB. Not endorsed or certified by TMDB.
      </p>
    </Sheet>
  );
}

function InstallRow({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  // `useSyncExternalStore` because this reads `navigator`: a `useState`
  // initialiser breaks hydration and an effect costs a render cascade.
  const route = useSyncExternalStore(
    noSubscribe,
    () => installRoute(readEnv()),
    () => "installed" as const,
  );

  return (
    <Row
      title="Add to home screen"
      note={route === "installed" ? "done" : undefined}
      open={open}
      onToggle={onToggle}
    >
      {route === "installed" ? (
        <p className="text-[11px] text-gold">Installed. That&rsquo;s why there&rsquo;s no address bar.</p>
      ) : (
        <p className="text-[11px] leading-snug text-dim">
          {route === "ios" ? (
            <>
              Tap <span className="text-text">Share</span>, then{" "}
              <span className="text-text">Add to Home Screen</span>.
            </>
          ) : (
            <>
              Use <span className="text-text">Install</span> from your browser menu.
            </>
          )}{" "}
          Opens with its own icon and no address bar.
        </p>
      )}
    </Row>
  );
}

// WITHDRAW keeps your calls and drops the model's. Cheap, and it comes back as
// you play, so no confirm.
//
// START AGAIN also burns the evidence log, and that half is not optional:
// beliefs are fitted from the log, so a reset that spared it would refill the
// list with the order you were leaving (see lib/reset.ts). Only irreversible
// button in the app — it asks twice and names the number.
//
// Neither touches films or star ratings.
function StartAgain({ films, onReset }: { films: Film[]; onReset: (films: Film[]) => void }) {
  const [arming, setArming] = useState(false);
  const [duels, setDuels] = useState(0);
  useEffect(() => {
    void loadLog().then((l) => setDuels(l.length));
  }, []);

  const placed = films.filter((f) => f.lock).length;
  const soft = films.filter((f) => f.lock === "soft").length;

  return (
    <>
      <p className="mb-3 text-[11px] text-dim">Your films and stars are kept. Only the ranking goes.</p>

      {soft > 0 && (
        <button
          onClick={() => {
            onReset(withdrawSoftLocks(films));
            setArming(false);
          }}
          className={`${BTN} mb-2 w-full`}
        >
          Drop the {soft.toLocaleString()} the app placed
        </button>
      )}

      {!arming ? (
        <button
          onClick={() => setArming(true)}
          disabled={placed === 0 && duels === 0}
          className={`${BTN} w-full text-dim disabled:opacity-35`}
        >
          Clear my ranking
        </button>
      ) : (
        <>
          {/* The number, not "are you sure?" — it is the thing you would miss. */}
          <p className="mb-2 text-[11px] leading-snug text-gold">
            Erases {placed.toLocaleString()} placements and {duels.toLocaleString()} duels. Cannot be
            undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setArming(false)} className={BTN}>
              Keep it
            </button>
            <button
              onClick={() => {
                // Log first: if the write below fails the evidence is already
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
    </>
  );
}
