// Stopping one account doing one thing ten thousand times.
//
// ── What this is for, and what it is not ───────────────────────────────────
//
// It is not security and it is not fairness. Every endpoint behind it already
// requires a signed-in account, so this is not keeping strangers out: it is
// bounding what a single account can do if somebody points a script at it, and
// making the bound a row rather than an outage.
//
// `guard.ts` records that Rankd HAD a limiter and it was removed, because it was
// sized for browsing and an import is not browsing: both backfill loops pace at
// 120ms, so a fresh library spent a minute's budget in eleven seconds and then
// 429'd for the rest. Worse, the 429 was indistinguishable from "TMDb has
// nothing", so those films were cached as answered and never asked about again.
//
// The lesson is not "no limiters". It is that a limit must be sized against what
// the app ACTUALLY DOES on that path, and that being refused has to be
// distinguishable from being answered. So: nothing here sits on a loop the app
// drives itself, and every refusal is a 429 with a sentence.

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export interface Limit {
  /** What is being counted. One name per kind of action. */
  bucket: string;
  /** How many are allowed in a window. */
  max: number;
  windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The limits, in one place, with the reasoning attached to each.
 *
 * Every number is set against what a PERSON does, then multiplied to leave room
 * for enthusiasm. If any of these ever fires for somebody using the app
 * normally, the number is wrong and this is the file to change.
 */
export const LIMITS = {
  /**
   * Following. A person on a discovery page might follow a dozen in a sitting
   * and would have to be doing nothing else to reach sixty in an hour.
   */
  follow: { bucket: "follow", max: 60, windowMs: HOUR },

  /**
   * Handle availability, checked as somebody types.
   *
   * The only limit here that sits near a loop the app drives itself, so it is
   * the one worth being careful about. `HandleGate` debounces at 400ms and only
   * asks once the field is a valid handle, so continuous typing produces well
   * under thirty a minute. Sized at twice that.
   *
   * It matters because this endpoint answers "does this person exist", and
   * without a bound it is a way to enumerate every handle on Rankd.
   */
  handleCheck: { bucket: "handle-check", max: 60, windowMs: MINUTE },

  /** Claiming. One succeeds, so anything past a handful is somebody guessing. */
  handleClaim: { bucket: "handle-claim", max: 20, windowMs: HOUR },

  /**
   * People search, typed into a field with its own debounce.
   *
   * Same enumeration concern as the handle check above and the same sizing: a
   * person looking for a friend types a handful of queries, and 120 a minute is
   * far past anything a debounced field produces.
   */
  peopleSearch: { bucket: "people-search", max: 120, windowMs: MINUTE },

  /**
   * Saying something on somebody's card.
   *
   * The tightest allowance here, because it is the only one that puts a
   * stranger's words on a page somebody else owns. Thirty an hour is a
   * conversation — several threads, several replies each — and is nowhere near
   * enough to flood a feed faster than a person can mute it.
   */
  comment: { bucket: "comment", max: 30, windowMs: HOUR },
} as const satisfies Record<string, Limit>;

export interface Verdict {
  ok: boolean;
  /** Whole seconds until the current window rolls over. For Retry-After. */
  retryAfter: number;
}

/**
 * Count one hit, and say whether it was allowed.
 *
 * ── One statement, and it has to be ────────────────────────────────────────
 *
 * Read-then-write would let two concurrent requests both read the same count
 * and both decide they were under the limit, which is exactly the situation a
 * limiter exists for. `ON CONFLICT DO UPDATE` makes the read, the decision and
 * the write one atomic operation, and `RETURNING` hands back the value that was
 * actually stored rather than the one this request hoped for.
 *
 * The CASE is the window roll-over: when the stored window is older than the
 * current one, the count RESTARTS at one instead of incrementing, so a row is
 * reused forever and nothing has to be swept up.
 *
 * ── Fails OPEN, on purpose ─────────────────────────────────────────────────
 *
 * If the limiter itself errors, the request is allowed. A limiter that takes the
 * app down when its own table is unreachable has caused more harm than the abuse
 * it was written to prevent, and everything behind it is already authenticated.
 */
export async function take(userId: string, limit: Limit): Promise<Verdict> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / limit.windowMs) * limit.windowMs);
  const retryAfter = Math.ceil((windowStart.getTime() + limit.windowMs - now) / 1000);

  try {
    const rows = await db.execute<{ hits: number }>(sql`
      INSERT INTO rate_limit (user_id, bucket, window_start, hits)
      VALUES (${userId}, ${limit.bucket}, ${windowStart}, 1)
      ON CONFLICT (user_id, bucket) DO UPDATE SET
        hits = CASE
          WHEN rate_limit.window_start < ${windowStart} THEN 1
          ELSE rate_limit.hits + 1
        END,
        window_start = GREATEST(rate_limit.window_start, ${windowStart})
      RETURNING hits
    `);

    const hits = Number(rows[0]?.hits ?? 0);
    return { ok: hits <= limit.max, retryAfter };
  } catch {
    return { ok: true, retryAfter };
  }
}
