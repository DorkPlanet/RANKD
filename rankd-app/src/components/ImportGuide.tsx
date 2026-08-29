"use client";

// How to get your library out of the place it currently lives.
//
// ── Why this is worth screen space ─────────────────────────────────────────
//
// Importing is the onboarding. A new library is empty, and everything this app
// does needs something in it — so the gap between "I installed this" and "I have
// my ratings here" is the only place it can lose someone completely.
//
// The gap is not the parsing, which has always worked. It is that people cannot
// find the file. For films, two facts do almost all the work, and neither is
// discoverable:
//
//  1. The export is on the WEBSITE. It is not in the mobile apps at all, so
//     somebody hunting through the app's settings is looking for something that
//     was never there. Stated as a fact, not a complaint — Letterboxd's app is
//     not broken, it simply does not do this.
//  2. You get a .zip, and the file inside is `ratings.csv`.
//
// The second one used to be the wall on a phone. It is not any more: the import
// takes the zip whole (see `readFromZip`), so the steps end at "pick the file
// you downloaded". The guide still names `ratings.csv`, because anyone who has
// already unzipped it needs to know which of the eight files to choose.
//
// ── Books are a different route, not the same one reworded ─────────────────
//
// Goodreads buries its export one level deeper than Letterboxd — it is under My
// Books, not under Settings, which is where everybody looks first — and it makes
// you WAIT: the page generates the file in the background and you have to come
// back for a download link that appears in place. Somebody who taps the button
// and sees nothing happen concludes it is broken, and they are the person this
// guide exists for.
//
// It also hands back a bare .csv rather than a zip, so the "no need to open it"
// note would be answering a question nobody asked.
//
// So the two are written out as two lists. A shared list with the nouns swapped
// would have to describe a wait that only one of them has, and a zip that only
// the other one gives you.

import { lex } from "@/lib/lexicon";

interface Step {
  do: string;
  note?: string;
}

const LETTERBOXD: readonly Step[] = [
  {
    do: "Open letterboxd.com in a browser",
    note: "The export lives on the website. The phone apps don't have it.",
  },
  { do: "Your name, then Settings, then Import & Export" },
  { do: "Tap Export Your Data", note: "It downloads a .zip." },
  {
    do: "Come back here and pick that .zip",
    note: "No need to open it. If you already have, the file you want is ratings.csv.",
  },
];

const GOODREADS: readonly Step[] = [
  {
    do: "Open goodreads.com in a browser",
    note: "The export lives on the website. The phone apps don't have it.",
  },
  {
    do: "My Books, then Import and export",
    note: "It's under My Books, not under Settings — that's the one everybody tries first.",
  },
  {
    do: "Tap Export Library, then wait",
    note: "Nothing downloads yet. A link appears on that same line after a minute or so — tap it.",
  },
  {
    do: "Come back here and pick that .csv",
    note: "Books you shelved but never rated are left out. There's nothing to rank without a rating.",
  },
];

export function ImportGuide({ compact }: { compact?: boolean }) {
  const steps = lex().medium === "book" ? GOODREADS : LETTERBOXD;

  return (
    <ol className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}>
      {steps.map((s, i) => (
        <li key={s.do} className="flex gap-2.5">
          {/* Numbered, because these are in an order and two of them are easy to
              do in the wrong one. `tabular-nums` so the digits align and the
              text starts on one column. */}
          <span
            className="flex-shrink-0 font-display text-sub leading-[1.45] tabular-nums text-gold"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sub leading-snug text-text">{s.do}</span>
            {s.note && (
              <span className="mt-0.5 block text-label leading-snug text-dim">{s.note}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
