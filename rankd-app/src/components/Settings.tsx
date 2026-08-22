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
import { filmsFromFile, mergeFilms } from "@/lib/importCsv";
import { installRoute, readEnv } from "@/lib/install";
import { clearLog, loadLog, logSize } from "@/lib/log";
import type { Prefs } from "@/lib/prefs";
import { resetRanking, wipeAccount, wipeEverything } from "@/lib/reset";
import { markRankingCleared } from "@/lib/cleared";
import { fetchAccount } from "@/lib/account";
import { withdrawSoftLocks } from "@/lib/shuffle";
import type { Film } from "@/lib/types";
import { Account } from "./Account";
import { Visibility } from "./Visibility";
import type { Me } from "@/lib/account";
import { Feedback } from "./Feedback";
import { ImportGuide } from "./ImportGuide";
import { ImportButton, RestoreButton, Sheet } from "./ui";

/** Stable reference for `useSyncExternalStore`. */
const noSubscribe = () => () => {};

const BTN =
  "flex-1 rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]";

/** One collapsed row. `note` is the only thing shown while shut. */
function Row({
  title,
  note,
  urgent,
  open,
  onToggle,
  children,
}: {
  title: string;
  note?: string;
  /** The note is something the user has to act on, so it is not dim. */
  urgent?: boolean;
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
        <span className="text-body text-text-hi">{title}</span>
        <span className="flex items-center gap-2">
          {note && (
            <span className={urgent ? "text-label font-bold text-gold" : "text-label text-dim"}>{note}</span>
          )}
          <span
            className="text-label text-dim"
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

type RowId = "library" | "account" | "visibility" | "install" | "help" | "say" | "reset";

export function Settings({
  brightness,
  onChange,
  prefs,
  onPrefs,
  onClose,
  films,
  onImport,
  onTour,
  me,
  onMe,
}: {
  brightness: number;
  onChange: (t: number) => void;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  onClose: () => void;
  films: Film[];
  onImport: (films: Film[]) => void;
  onTour?: () => void;
  me: Me;
  onMe: (patch: Partial<Me>) => void;
}) {
  // One at a time. Two open rows is the wall of text this replaced.
  // Open on the import when there is nothing to import INTO. Every row is shut
  // by default, which is right for a settings sheet and wrong for the one
  // arrival that has a single obvious next step — "Import your films" opened
  // this and showed a list of closed rows with no import control in sight.
  const [open, setOpen] = useState<RowId | null>(films.length === 0 ? "library" : null);
  const toggle = (id: RowId) => setOpen((o) => (o === id ? null : id));

  const [conflict, setConflict] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{ rows: number; bytes: number } | null>(null);
  useEffect(() => {
    void loadLog().then((log) => setEvidence(logSize(log)));
  }, []);

  const takeFile = async (file: File, merge: boolean) => {
    // ── The zip is accepted whole ────────────────────────────────────────────
    //
    // Letterboxd hands you a .zip and the importer wants one file inside it.
    // Extracting that file on a phone is the step people actually abandon: it
    // means a file manager, a folder nobody can find again, and on some phones
    // no obvious route at all. Reading it here removes the step.
    //
    // Sniffed by CONTENT, not by extension. A phone's file picker reports all
    // sorts of types for the same file, and the first four bytes never lie.
    const result = await filmsFromFile(file);
    if ("error" in result) {
      setNote(result.error);
      return;
    }
    const { films: parsed, skipped } = result;
    onImport(merge ? mergeFilms(films, parsed) : parsed);
    setNote(`${merge ? "Merged" : "Imported"} ${parsed.length} films${skipped ? `, skipped ${skipped}` : ""}.`);
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-body text-text-hi">Brightness</span>
        <span className="text-label text-dim">{Math.round(brightness * 100)}%</span>
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
          <span className="block text-body text-text-hi">Let the list drift</span>
          <span className="block text-sub leading-snug text-dim">
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
        <p className="mb-2.5 text-sub text-dim">Add a Letterboxd export.</p>
        <div className="mb-3 rounded-xl border border-border px-3 py-2.5">
          <ImportGuide compact />
        </div>
        <div className="mb-4 flex gap-2">
          <ImportButton label="Merge" merge onFile={takeFile} />
          <ImportButton label="Replace" onFile={takeFile} />
        </div>

        <p className="mb-2 text-sub text-dim">
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
        {note && <p className="mt-3 text-sub text-gold">{note}</p>}
      </Row>

      {/* ── Why this row no longer opens itself ────────────────────────────
          It used to be `open={open === "account" || conflict}`, on the reasoning
          that a conflict is the one thing in the app allowed to be demanding and
          must not sit behind a shut row. The reasoning was fine and the timing
          was awful.

          `conflict` arrives from an async check, so the sequence on a real phone
          was: the panel draws with every row shut, the user's thumb starts
          moving toward Account, and about half a second later the row animates
          itself open under that thumb and a tall chooser fills the screen. That
          is N7, reported as "it jumps open, and it's jarring especially since
          people are pressing that tab".

          The answer is not to hide the conflict — it is that a row opening on
          its own, LATE, is the worst possible way to raise something urgent. The
          `note` beside the title already says "needs you" and now says it in
          gold, which is visible without moving anything. The banner is still the
          first thing inside the row when it is opened.

          Note for anyone tempted to cut the chooser instead: the server is a
          MIRROR, not a source of truth (see the header of `lib/sync.ts`).
          localStorage is what every screen reads and writes, so two devices
          genuinely can diverge and nothing merges them. The question is real. */}
      <Row
        title="Account"
        note={conflict ? "needs you" : undefined}
        urgent={!!conflict}
        open={open === "account"}
        onToggle={() => toggle("account")}
      >
        <Account onConflict={setConflict} />
      </Row>

      {/* ── Its own row, not a corner of Account ────────────────────────────
          Account is about BACKUP: what is safe, when it last synced, and how to
          get it back. This is about who else can see it, which is a different
          question with a different worst case. Filed together, the switch that
          publishes a profile would sit under a heading nobody opens unless
          something has gone wrong with syncing. */}
      <Row
        title="Who can see you"
        open={open === "visibility"}
        onToggle={() => toggle("visibility")}
      >
        <Visibility me={me} onMe={onMe} />
      </Row>

      <InstallRow open={open === "install"} onToggle={() => toggle("install")} />

      {onTour && (
        <Row title="How to play" open={open === "help"} onToggle={() => toggle("help")}>
          {/* Says what it DOES, because what it does is unusual. It shows
              nothing on the spot — it puts the browser back to how it was on
              day one, and the explanations then reappear as you arrive at each
              screen. Labelled "Show me around" it read as a button that would
              start something, and pressing it appeared to do nothing at all. */}
          <p className="mb-2 text-sub leading-snug text-dim">
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
      <p className="mt-5 text-sub leading-snug text-dim">
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
        <p className="text-sub text-gold">Installed. That&rsquo;s why there&rsquo;s no address bar.</p>
      ) : (
        <p className="text-sub leading-snug text-dim">
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
  const [wiping, setWiping] = useState(false);
  const [duels, setDuels] = useState(0);
  // Signed in changes what the second tap is agreeing to: the wipe reaches the
  // account, which means every other device the user has. The copy has to say
  // so, so the answer is needed before the button is armed rather than after.
  const [hasAccount, setHasAccount] = useState(false);
  const [wipeFailed, setWipeFailed] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  useEffect(() => {
    void loadLog().then((l) => setDuels(l.length));
    void fetchAccount().then((a) => setHasAccount(!!a));
  }, []);

  const placed = films.filter((f) => f.lock).length;
  const soft = films.filter((f) => f.lock === "soft").length;

  return (
    <>
      <p className="mb-3 text-sub text-dim">Your films and stars are kept. Only the ranking goes.</p>

      {soft > 0 && (
        <button
          onClick={() => {
            onReset(withdrawSoftLocks(films));
            setArming(false);
          }}
          className={`${BTN} mb-2 w-full`}
        >
          Drop the {soft.toLocaleString()} Fast Shuffle placed
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
          <p className="mb-2 text-sub leading-snug text-gold">
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
                // Record that the emptiness is DELIBERATE. Without this, a sync
                // against a device that still holds the duels merges them back
                // in and undoes exactly what this button just did. See
                // `cleared.ts`.
                markRankingCleared();
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

      {/* ── Back to a first open ────────────────────────────────────────────
          Every other reset here keeps your library, which is right for someone
          fixing a ranking and useless for the one thing they cannot otherwise
          do: see the app as a new user sees it. Empty is a real state now, with
          its own screens, and this is the only way to reach it.

          Two taps, and the second one says the number out loud. This is the
          most destructive control in the app — it takes the films as well —
          so it sits last, dimmest, and behind its own arming. */}
      <div className="mt-4 border-t border-border pt-3">
        {!wiping ? (
          <button
            onClick={() => setWiping(true)}
            disabled={films.length === 0}
            className="w-full text-center text-sub text-dim active:scale-95 disabled:opacity-35"
          >
            Delete everything and start fresh
          </button>
        ) : (
          <>
            <p className="mb-2 text-sub leading-snug text-gold">
              Removes all {films.length.toLocaleString()} films, every placement, every duel and
              your profile. The app opens as if you had just installed it. Save a backup first if
              you want any of it back.
            </p>
            {/* Said separately because it is a different claim. The paragraph
                above is about this phone; this one is about every device the
                account touches, and burying it in the same sentence would let
                it be skimmed. */}
            {hasAccount && (
              <p className="mb-2 text-sub leading-snug text-gold">
                Your saved copy goes too, so it will not come back on your other devices.
              </p>
            )}
            {wipeFailed && (
              <p className="mb-2 text-sub leading-snug" style={{ color: "#D81E26" }}>
                Your saved copy could not be reached, so nothing was deleted. Check your connection
                and try again.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setWiping(false)} className={BTN}>
                Keep it
              </button>
              <button
                disabled={wipeBusy}
                onClick={() => {
                  void (async () => {
                    setWipeBusy(true);
                    setWipeFailed(false);
                    try {
                      // Account FIRST, and nothing local happens if it fails.
                      // A browser emptied while the account copy survives is
                      // the exact state that restores itself: the reload looks
                      // like a new phone to `reconcile.ts`, which pulls. Half a
                      // wipe is worse than none.
                      await wipeAccount();
                    } catch {
                      setWipeFailed(true);
                      setWipeBusy(false);
                      return;
                    }
                    wipeEverything();
                    // Reloaded rather than re-rendered: every screen read the
                    // library once at mount and would be holding films that no
                    // longer exist.
                    location.reload();
                  })();
                }}
                style={{ color: "#D81E26", borderColor: "#D81E26" }}
                className="flex-1 rounded-xl border py-2.5 text-center text-xs font-bold active:scale-[0.98] disabled:opacity-50"
              >
                {wipeBusy ? "Deleting" : "Delete it all"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
