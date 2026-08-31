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
import { downloadCsv } from "@/lib/exportCsv";
import { filmsFromFile, mergeFilms } from "@/lib/importCsv";
import { installRoute, readEnv } from "@/lib/install";
import { clearLog, loadLog, logSize } from "@/lib/log";
import type { Prefs } from "@/lib/prefs";
import { resetRanking, wipeAccount, wipeEverything } from "@/lib/reset";
import { markRankingCleared } from "@/lib/cleared";
import { fetchAccount } from "@/lib/account";
import { withdrawSoftLocks } from "@/lib/shuffle";
import {
  applyPoint,
  dropPoint,
  loadPoints,
  missingFrom,
  takePoint,
  type RestorePoint,
} from "@/lib/restore";
import { shortAgo } from "@/lib/social/feed";
import type { Film } from "@/lib/types";
import { Account } from "./Account";
import { Visibility } from "./Visibility";
import type { Me } from "@/lib/account";
import { Feedback } from "./Feedback";
import { ImportGuide } from "./ImportGuide";
import { ImportButton, RestoreButton, SecondaryButton, SettingRow, Sheet, Tabs } from "./ui";
import { ChevronIcon } from "./Icons";
import { count, lex, lexOf } from "@/lib/lexicon";
import { currentMedium, setMedium, MEDIA } from "@/lib/medium";

/** Stable reference for `useSyncExternalStore`. */
const noSubscribe = () => () => {};

// How fast the list drifts. `Tabs` is index-based, so the order lives here once
// rather than being implied by two places that could drift apart.
const DRIFT_ORDER = ["slow", "medium", "fast"] as const;
const DRIFT_LABELS = ["Slow", "Medium", "Fast"] as const;

// The replay control's three states, in the order they read: most shown to least.
// "Ask" and not "Wait", which differs from "Watch" by one letter in a row where
// the two would sit side by side.
const REPLAY_ORDER = ["ask", "watch", "quick", "fast", "silent"] as const;
const REPLAY_LABELS = ["Ask", "Watch", "Quick", "Fast", "Skip"] as const;
const REPLAY_BLURB: Record<Prefs["replay"], string> = {
  ask: "Shows what you picked, and waits for you",
  watch: "Every one plays out in full",
  quick: "Plays fast, and speeds up through a long run",
  fast: "Barely pauses — you see it happen, not what it was",
  silent: "Resolved without showing anything",
};

// The BTN constant that used to live here is gone. It was `rounded-xl … text-xs`
// — neither of the two shapes the rest of the app uses — so every control in this
// sheet was a third thing sitting beside file-picker labels that were a fourth.
// `SecondaryButton` in ui.tsx is the shape now, for this sheet and everywhere.

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
          <span className="text-dim">
            <ChevronIcon open={open} />
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
  // ── A note that says WHICH kind of thing just happened ────────────────────
  //
  // This was a bare string painted gold, and the same slot carried "Imported 861
  // films" and "That file couldn't be read." in the identical colour. Gold is how
  // the app says a thing WORKED, so a failure wearing it read as a success the
  // reader had simply not finished parsing. The flag is what lets the one line
  // choose between `--gold` and `--danger`.
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
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
      setNote({ text: result.error, bad: true });
      return;
    }
    const { films: parsed, skipped } = result;
    onImport(merge ? mergeFilms(films, parsed) : parsed);
    setNote({
      text: `${merge ? "Merged" : "Imported"} ${count(parsed.length)}${skipped ? `, skipped ${skipped}` : ""}.`,
    });
  };

  const L = lex();
  // Read straight rather than through an effect — this sheet only ever exists
  // over a mounted app. Same reasoning, at more length, in `MediumSwitch`.
  const medium = currentMedium();

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
        aria-label="Brightness"
        className="range mb-1"
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
      {/* A switch, not a tick. This is a SETTING — it persists and it changes
          how the app behaves from now on — and it sat four rows above the two
          switches under "Who can see you" wearing a completely different
          control. Same sheet, same kind of question, two idioms. The tick is
          still the right shape for a run OPTION (shuffle this run, let this
          refine move a locked film); see `Switch` in ui.tsx for the line. */}
      <SettingRow
        className="mb-1"
        title="Let the list drift"
        blurb="Scrolls slowly on its own when you stop touching it"
        on={prefs.listDrift}
        onToggle={() => onPrefs({ listDrift: !prefs.listDrift })}
      />

      {/* Only worth asking once drifting is on at all. It was one pace — a
          showcase crawl at 20px a second — which made the switch really "on and
          too slow" or "off", and reading a long list that way is slower than
          scrolling it by hand. */}
      {prefs.listDrift && (
        <div className="mb-4 -mt-2">
          <Tabs
            nested
            labels={DRIFT_LABELS}
            at={DRIFT_ORDER.indexOf(prefs.driftSpeed)}
            onPick={(i) => onPrefs({ driftSpeed: DRIFT_ORDER[i] })}
          />
        </div>
      )}

      {/* ── Reading the list without the stars ──────────────────────────────
          A star is an anchor: with them showing, the eye checks each film
          against the rating it already has instead of against the film above
          it. That is the wrong comparison when the question is where a tier
          should end, which is what "Set tiers" on the list asks.

          The blurb names the surfaces it does NOT cover. A toggle called "hide
          stars" that leaves them on the profile and every share card is only
          honest if it says so — and they stay deliberately, because a
          preference about reading your own list should not quietly rewrite
          what you publish. */}
      <SettingRow
        className="mb-4"
        title={`Hide ${L.one} ratings`}
        blurb="Stars off in the list and the film sheet, so you read position instead. Cards and your profile keep them."
        on={prefs.hideStars}
        onToggle={() => onPrefs({ hideStars: !prefs.hideStars })}
      />

      {/* ── Duels you have already settled ──────────────────────────────────
          Three states rather than a switch, because the middle one is the
          answer and a switch cannot hold it. Ranking used to re-ask duels you
          had already fought; now it plays them back instead, and the only real
          question is how much of that you want to sit through. "Skip silently"
          is what shipped first and it was the wrong default — the pile jumped
          several places between taps with nothing on screen to say why. */}
      <div className="mb-4">
        <p className="mb-1.5 text-sub font-bold text-text-hi">Duels you&rsquo;ve already settled</p>
        <p className="mb-2.5 text-sub text-dim">
          Ranking replays them instead of asking again
        </p>
        <Tabs
          nested
          labels={REPLAY_LABELS}
          at={REPLAY_ORDER.indexOf(prefs.replay)}
          onPick={(i) => onPrefs({ replay: REPLAY_ORDER[i] })}
        />
        <p className="mt-2 text-center text-label text-dim">{REPLAY_BLURB[prefs.replay]}</p>
      </div>

      {/* ── The medium, mirrored from the header ──────────────────────────
          The wordmark is the primary control and this is the second way in,
          which the user asked for. It is here rather than in a row because it
          is the same KIND of thing as brightness and the drift toggle: a
          standing choice about what the app is, decided once and then
          forgotten — not a task like importing or signing in.

          It sits ABOVE the library row on purpose. That row now counts
          whichever library is active, so reading them the other way round
          would show a number before saying what it is a number of. */}
      <div className="mb-4">
        <span className="mb-1 block text-body text-text-hi">What you&rsquo;re ranking</span>
        <span className="mb-2 block text-sub leading-snug text-dim">
          Two separate libraries. Nothing crosses between them.
        </span>
        <div className="flex gap-2">
          {MEDIA.map((m) => {
            const active = m === medium;
            return (
              <button
                key={m}
                aria-pressed={active}
                onClick={() => setMedium(m)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-center text-body active:scale-[0.99] ${
                  active ? "border-gold/50 text-gold" : "border-border text-dim"
                }`}
              >
                {lexOf(m).Many}
              </button>
            );
          })}
        </div>
      </div>

      <Row
        title={`Your ${L.many}`}
        note={`${films.length}`}
        open={open === "library"}
        onToggle={() => toggle("library")}
      >
        <p className="mb-2.5 text-sub text-dim">Add a {L.importFrom} export.</p>
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
          <SecondaryButton
            onClick={() => {
              exportBackup();
              setNote({ text: "Saved." });
            }}
            className="flex-1"
            >
              Save
            </SecondaryButton>
          <RestoreButton
            onFile={async (file) => {
              try {
                const r = importBackup(await file.text());
                setNote({ text: `Restored ${r.films} films. Reloading…` });
                setTimeout(() => location.reload(), 900);
              } catch (e) {
                setNote({
                  text: e instanceof Error ? e.message : "That file couldn't be read.",
                  bad: true,
                });
              }
            }}
          />
        </div>

        {/* ── Back to where the library came from ─────────────────────────
            The backup above is a bridge between two Rankd installs and nothing
            else can read it. This is the other direction: the ratings you have
            actually settled, in the file format the service you imported from
            will take back. It is deliberately underneath, because it is the
            rarer action and the backup is the load-bearing one. */}
        <p className="mb-2 mt-4 text-sub text-dim">
          Send your ratings back to {L.importFrom}. One row per {L.one}, ready to re-upload.
        </p>
        <SecondaryButton
          onClick={() => {
            downloadCsv(films);
            setNote({ text: `Saved ${count(films.filter((f) => !f.guest).length)}.` });
          }}
          className="w-full"
        >
          Export CSV
        </SecondaryButton>
        {note && (
          <p className={`mt-3 text-sub leading-snug ${note.bad ? "text-danger" : "text-gold"}`}>
            {note.text}
          </p>
        )}
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
          <SecondaryButton wide onClick={onTour}>
            Refresh me
          </SecondaryButton>
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
        {lex().medium === "book"
          ? "Book data from Google Books. Cover art from Open Library."
          : "Film data from TMDB. Not endorsed or certified by TMDB."}
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

/**
 * The way back from the buttons underneath it.
 *
 * Sits ABOVE the resets on purpose. Everything below this destroys something,
 * and the first thing somebody arriving at a screen full of red buttons should
 * see is the one that puts things back — not after they have read past three
 * ways to lose their work.
 *
 * Renders nothing when there is nothing to undo, which is the common case: this
 * is a section that appears when it has something to say, rather than an empty
 * shelf explaining that it is empty.
 */
function UndoThat({
  films,
  points,
  onPoints,
  onReset,
}: {
  films: Film[];
  /**
   * Held by the PARENT, not read from storage here.
   *
   * The buttons that create a point are the ones directly below this list, so a
   * component that read storage on mount showed an empty section, and the undo
   * for the reset you had just pressed did not appear until you left Settings
   * and came back. Which is the one moment it exists for.
   */
  points: RestorePoint[];
  onPoints: (points: RestorePoint[]) => void;
  onReset: (films: Film[]) => void;
}) {
  const [undone, setUndone] = useState<string | null>(null);

  if (points.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="mb-1.5 text-label font-bold uppercase tracking-[0.14em] text-dim">Undo that</div>
      {points.map((p) => {
        // Said, not fixed. A restore point holds placements and no titles, so a
        // film removed since cannot come back and the row has to admit it
        // rather than quietly restoring less than the sentence promises.
        const gone = missingFrom(p, films);
        return (
          <button
            key={p.id}
            onClick={() => {
              // Undoing is itself a change to every placement in the library,
              // so it gets a point of its own. Without one the escape hatch
              // would be the one action in here with no way back out.
              takePoint(`Undid: ${p.label}`, films);
              onReset(applyPoint(p, films));
              dropPoint(p.id);
              onPoints(loadPoints());
              setUndone(p.label);
            }}
            className="mb-1.5 flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block truncate text-body text-text-hi">{p.label}</span>
              <span className="block text-sub leading-snug text-dim">
                Puts {count(p.films.length)} back where they were
                {gone > 0 && `, except ${gone.toLocaleString()} you have removed since`}.
              </span>
            </span>
            <span className="flex-shrink-0 text-label font-bold uppercase tracking-[0.14em] text-dim">
              {shortAgo(new Date(p.at).toISOString())}
            </span>
          </button>
        );
      })}
      {undone && (
        <p className="mt-1 text-center text-sub text-gold">
          Undone: {undone}. Stars and positions are back; any duels that were
          erased are not.
        </p>
      )}
    </div>
  );
}

// WITHDRAW keeps your calls and drops the model's. Cheap, and it comes back as
// you play, so no confirm.
//
// START AGAIN also burns the evidence log, and that half is not optional:
// beliefs are fitted from the log, so a reset that spared it would refill the
// list with the order you were leaving (see lib/reset.ts). It asks twice and
// names the number.
//
// Both now take a restore point first, so the PLACEMENTS can come back — see
// `UndoThat` above. The duels cannot: a restore point carries four fields per
// film and the log is not among them. That is why the warning still says the
// erase cannot be undone, and why it is still true of the half that matters.
//
// Neither touches films or star ratings.
function StartAgain({ films, onReset }: { films: Film[]; onReset: (films: Film[]) => void }) {
  const [arming, setArming] = useState(false);
  const [wiping, setWiping] = useState(false);
  // Every button below that takes a point refreshes this, so the way back
  // appears the moment the thing it undoes has happened.
  const [points, setPoints] = useState<RestorePoint[]>(() => loadPoints());
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
      <UndoThat films={films} points={points} onPoints={setPoints} onReset={onReset} />

      <p className="mb-3 text-sub text-dim">Your {lex().many} and stars are kept. Only the ranking goes.</p>

      {soft > 0 && (
        <SecondaryButton
          wide
          className="mb-2"
          onClick={() => {
            // Before, not after. The point has to describe the library the
            // button is about to rewrite.
            takePoint(`Dropped ${soft.toLocaleString()} Fast Shuffle placed`, films);
            setPoints(loadPoints());
            onReset(withdrawSoftLocks(films));
            setArming(false);
          }}
        >
          Drop the {soft.toLocaleString()} Fast Shuffle placed
        </SecondaryButton>
      )}

      {!arming ? (
        <SecondaryButton wide onClick={() => setArming(true)} disabled={placed === 0 && duels === 0}>
          Clear my ranking
        </SecondaryButton>
      ) : (
        <>
          {/* The number, not "are you sure?" — it is the thing you would miss. */}
          {/* Danger, not gold. Gold is how this app says a thing SUCCEEDED, and
              spending it on the sentence that names what is about to be
              destroyed made a warning look like a receipt. */}
          <p className="mb-2 text-sub leading-snug text-danger">
            Erases {placed.toLocaleString()} placements and {duels.toLocaleString()} duels. Cannot be
            undone.
          </p>
          <div className="flex gap-2">
            <SecondaryButton className="flex-1" onClick={() => setArming(false)}>
              Keep it
            </SecondaryButton>
            <SecondaryButton
              danger
              className="flex-1"
              onClick={() => {
                // The placements can come back; the duels cannot. A restore
                // point holds four fields per film and the log is not among
                // them, which is why the warning above still says what it says.
                takePoint("Cleared the ranking", films);
                setPoints(loadPoints());
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
            >
              Erase it
            </SecondaryButton>
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
          // A bordered button, not bare text. This is the MORE destructive of
          // the two resets in this row and it was drawn as the weaker of the
          // two: "Clear my ranking" above it had a border and this one did not,
          // so the affordance ran opposite to the consequence.
          <SecondaryButton wide onClick={() => setWiping(true)} disabled={films.length === 0}>
            Delete everything and start fresh
          </SecondaryButton>
        ) : (
          <>
            <p className="mb-2 text-sub leading-snug text-danger">
              Removes all {count(films.length)}, every placement, every duel and
              your profile. The app opens as if you had just installed it. Save a backup first if
              you want any of it back.
            </p>
            {/* Said separately because it is a different claim. The paragraph
                above is about this phone; this one is about every device the
                account touches, and burying it in the same sentence would let
                it be skimmed. */}
            {hasAccount && (
              <p className="mb-2 text-sub leading-snug text-danger">
                Your saved copy goes too, so it will not come back on your other devices.
              </p>
            )}
            {wipeFailed && (
              <p className="mb-2 text-sub leading-snug text-danger">
                Your saved copy could not be reached, so nothing was deleted. Check your connection
                and try again.
              </p>
            )}
            <div className="flex gap-2">
              <SecondaryButton className="flex-1" onClick={() => setWiping(false)}>
                Keep it
              </SecondaryButton>
              <SecondaryButton
                danger
                className="flex-1"
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
              >
                {wipeBusy ? "Deleting…" : "Delete it all"}
              </SecondaryButton>
            </div>
          </>
        )}
      </div>
    </>
  );
}
