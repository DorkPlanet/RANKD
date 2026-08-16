"use client";

// How to get your films out of Letterboxd.
//
// ── Why this is worth screen space ─────────────────────────────────────────
//
// Importing is the onboarding. A new library is empty, and everything this app
// does needs films in it — so the gap between "I installed this" and "I have my
// ratings here" is the only place it can lose someone completely.
//
// The gap is not the parsing, which has always worked. It is that people cannot
// find the file. Two facts do almost all the work, and neither is discoverable:
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

const STEPS: readonly { do: string; note?: string }[] = [
  {
    do: "Open letterboxd.com in a browser",
    note: "The export lives on the website. The phone apps do not have it.",
  },
  { do: "Your name, then Settings, then Import & Export" },
  { do: "Tap Export Your Data", note: "It downloads a .zip." },
  {
    do: "Come back here and pick that .zip",
    note: "No need to open it. If you already have, the file you want is ratings.csv.",
  },
];

export function ImportGuide({ compact }: { compact?: boolean }) {
  return (
    <ol className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}>
      {STEPS.map((s, i) => (
        <li key={s.do} className="flex gap-2.5">
          {/* Numbered, because these are in an order and two of them are easy to
              do in the wrong one. `tabular-nums` so the digits align and the
              text starts on one column. */}
          <span
            className="flex-shrink-0 font-display text-[11px] leading-[1.45] tabular-nums text-gold"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] leading-snug text-text">{s.do}</span>
            {s.note && (
              <span className="mt-0.5 block text-[10px] leading-snug text-dim">{s.note}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
