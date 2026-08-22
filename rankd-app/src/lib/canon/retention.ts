// Which captures to keep, so history is answerable forever and bounded anyway.
//
// ── The requirement ────────────────────────────────────────────────────────
//
// "Where it is against where it was. 1 week, 6 months." Both have to stay
// answerable indefinitely, and the table cannot grow without limit to do it.
//
// ── Logarithmic, which is the only shape that satisfies both ───────────────
//
// Recent history is asked about precisely and old history is asked about
// vaguely: nobody wants the ranking as it stood on a specific Tuesday in 2029,
// they want roughly-then. So resolution drops with age.
//
//   every weekly capture      for the last 8 weeks
//   one per calendar month    for the last 24 months
//   one per calendar year     beyond that
//
// Steady state is about 35 rows per user, around 1MB, and it stops growing.
//
// Pure and dateless-in-itself: `now` is passed in rather than read, so the
// policy can be tested against a synthetic five years without waiting for one.

/** How many weekly captures survive at full resolution. */
const WEEKS = 8;
/** How many months keep one capture each, after the weekly window. */
const MONTHS = 24;

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** `2029-03` — the bucket a capture falls in when it is months old. */
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const yearKey = (d: Date) => String(d.getUTCFullYear());

/**
 * The captures worth keeping, as a set of ISO strings.
 *
 * ── Newest wins inside a bucket, and that matters ──────────────────────────
 *
 * When a month has several captures, the one kept is the LATEST in that month.
 * Keeping the earliest would mean the answer to "six months ago" slowly drifted
 * further into the past as newer captures were discarded around it.
 *
 * Anything not in the returned set is safe to delete. The caller does the
 * deleting, so this stays testable without a database.
 */
export function keepers(captured: readonly Date[], now: Date): Set<string> {
  const keep = new Set<string>();
  // Newest first, so the first capture seen in any bucket is the one to keep.
  const sorted = [...captured].sort((a, b) => b.getTime() - a.getTime());

  const monthsTaken = new Set<string>();
  const yearsTaken = new Set<string>();
  const weeklyCutoff = now.getTime() - WEEKS * WEEK;
  const monthlyCutoff = now.getTime() - MONTHS * 31 * DAY;

  for (const at of sorted) {
    const age = at.getTime();

    // The most recent stretch, kept whole.
    if (age >= weeklyCutoff) {
      keep.add(at.toISOString());
      continue;
    }

    // Then one a month, for two years.
    if (age >= monthlyCutoff) {
      const key = monthKey(at);
      if (!monthsTaken.has(key)) {
        monthsTaken.add(key);
        keep.add(at.toISOString());
      }
      continue;
    }

    // Then one a year, forever.
    const key = yearKey(at);
    if (!yearsTaken.has(key)) {
      yearsTaken.add(key);
      keep.add(at.toISOString());
    }
  }

  // ── The newest capture is never dropped ──────────────────────────────────
  //
  // Every rule above is relative to `now`, and a clock that has jumped forward
  // would put every capture past the yearly cutoff and thin them to one per
  // year, including the one written seconds ago. Belt and braces on a table
  // whose whole job is to remember.
  if (sorted.length > 0) keep.add(sorted[0].toISOString());

  return keep;
}
