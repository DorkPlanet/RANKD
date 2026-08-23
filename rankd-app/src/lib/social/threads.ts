// Talking to one person about one film.
//
// ── Why this shape and not a wall ──────────────────────────────────────────
//
// A public thread per film was the obvious answer and it is the wrong one: with
// five people it is empty, with five thousand it is a cesspit, and there is no
// moderation capacity for either. A review surface was the other obvious answer,
// and prose about a film is Letterboxd's primary object — building a worse one
// would be both obvious and pointless.
//
// So the smallest thing that is still talking: two people who have each chosen
// the other, about one film. The choosing is what makes it safe. Nobody receives
// an unsolicited message, nobody walks into an argument, and there is no audience
// to perform for — which is most of what makes public threads go bad.
//
// ── Where it starts ────────────────────────────────────────────────────────
//
// From a card where you disagree. The feed already tells you privately that they
// have Heat at #1 and you have it at #14; the only thing missing was somewhere
// to say so. That is the moment of maximum motivation, and it is why the entry
// point is there rather than buried in a menu.

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { db, threadMessages, threads, users } from "@/lib/db";
import { isFriend } from "@/lib/social/follow";

// The length cap lives in `feed.ts`, which imports no database — see the note
// on `MESSAGE_MAX` there for why a client cannot take a value from this module.
export { MESSAGE_MAX } from "@/lib/social/feed";

/**
 * The pair, in the order the table stores them.
 *
 * Lower id first, always. Otherwise A→B and B→A are two different rows and the
 * two of them end up in separate halves of the same conversation — silent, and
 * each person simply concludes the other never replied.
 */
function pair(a: string, b: string): { lowId: string; highId: string } {
  return a < b ? { lowId: a, highId: b } : { lowId: b, highId: a };
}

export interface ThreadSummary {
  id: string;
  subjectId: string;
  meta: Record<string, unknown>;
  lastAt: string;
  /** The person who is not you. */
  withHandle: string;
  withAvatar: string | null;
  /** The most recent line, for the list to preview. */
  latest?: { mine: boolean; body: string };
}

export interface ThreadMessageItem {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export type StartResult =
  | { ok: true; threadId: string }
  | { ok: false; reason: "not-friends" | "self" };

/**
 * Open the conversation, or find the one already open.
 *
 * Mutual follow only, and that is the whole access model — `isFriend` is already
 * documented in `follow.ts` as the gate for exactly this. Unfollowing does not
 * delete what was said: a falling-out should not burn the record of a
 * conversation both people took part in, and the thread simply stops accepting
 * new lines.
 */
export async function openThread(
  viewerId: string,
  otherId: string,
  subjectId: string,
  meta: Record<string, unknown>,
): Promise<StartResult> {
  if (viewerId === otherId) return { ok: false, reason: "self" };
  if (!(await isFriend(viewerId, otherId))) return { ok: false, reason: "not-friends" };

  const { lowId, highId } = pair(viewerId, otherId);
  const [row] = await db
    .insert(threads)
    .values({ lowId, highId, subjectId, meta })
    // Already talking about this film. The unique index is what guarantees one
    // conversation rather than two halves of one.
    .onConflictDoUpdate({
      target: [threads.lowId, threads.highId, threads.subjectId],
      set: { meta },
    })
    .returning({ id: threads.id });

  return { ok: true, threadId: row.id };
}

/** Whether this reader is one of the two people in this thread. */
export async function inThread(threadId: string, viewerId: string): Promise<boolean> {
  const row = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: { lowId: true, highId: true },
  });
  return !!row && (row.lowId === viewerId || row.highId === viewerId);
}

/** Every conversation this reader is in, most recently alive first. */
export async function threadsFor(viewerId: string): Promise<ThreadSummary[]> {
  const rows = await db
    .select({
      id: threads.id,
      subjectId: threads.subjectId,
      meta: threads.meta,
      lastAt: threads.lastAt,
      lowId: threads.lowId,
      highId: threads.highId,
    })
    .from(threads)
    .where(or(eq(threads.lowId, viewerId), eq(threads.highId, viewerId)))
    .orderBy(desc(threads.lastAt))
    .limit(50);

  if (rows.length === 0) return [];

  // The other person, and the last thing said, in two reads rather than one per
  // row. Fifty threads is the ceiling, so both stay small.
  const otherIds = rows.map((r) => (r.lowId === viewerId ? r.highId : r.lowId));
  const people = await db
    .select({ id: users.id, handle: users.handle, avatarUrl: users.avatarUrl })
    .from(users)
    // `inArray`, not a raw ANY: drizzle sends a JS array as ONE parameter, and
    // Postgres then rejects it as a malformed array literal.
    .where(inArray(users.id, otherIds));
  const byId = new Map(people.map((p) => [p.id, p]));

  const latest = await db
    .select({
      threadId: threadMessages.threadId,
      body: threadMessages.body,
      authorId: threadMessages.authorId,
      createdAt: threadMessages.createdAt,
    })
    .from(threadMessages)
    .where(and(inArray(threadMessages.threadId, rows.map((r) => r.id)), isNull(threadMessages.deletedAt)))
    .orderBy(threadMessages.createdAt);

  // Oldest first, last write wins, so this ends up holding the newest of each
  // without a window function.
  const newest = new Map<string, { mine: boolean; body: string }>();
  for (const m of latest) {
    newest.set(m.threadId, { mine: m.authorId === viewerId, body: m.body });
  }

  const out: ThreadSummary[] = [];
  for (const r of rows) {
    const other = byId.get(r.lowId === viewerId ? r.highId : r.lowId);
    // No handle means they never reached the gate, so there is nobody to name as
    // the other half of the conversation.
    if (!other?.handle) continue;
    const last = newest.get(r.id);
    out.push({
      id: r.id,
      subjectId: r.subjectId,
      meta: r.meta,
      lastAt: r.lastAt.toISOString(),
      withHandle: other.handle,
      withAvatar: other.avatarUrl,
      // Omitted rather than set to undefined — an empty thread has no last line,
      // which is different from having one nobody read.
      ...(last ? { latest: last } : {}),
    });
  }
  return out;
}

/** One conversation, oldest first, because that is how a conversation is read. */
export async function messagesFor(
  threadId: string,
  viewerId: string,
): Promise<ThreadMessageItem[] | null> {
  if (!(await inThread(threadId, viewerId))) return null;

  const rows = await db
    .select({
      id: threadMessages.id,
      body: threadMessages.body,
      createdAt: threadMessages.createdAt,
      authorId: threadMessages.authorId,
    })
    .from(threadMessages)
    .where(and(eq(threadMessages.threadId, threadId), isNull(threadMessages.deletedAt)))
    .orderBy(threadMessages.createdAt);

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    mine: r.authorId === viewerId,
  }));
}

/**
 * Say something.
 *
 * Refuses once the two are no longer mutual. Following is what opened the
 * conversation, so it is also what keeps it open — otherwise unfollowing someone
 * leaves them still able to write to you, which is the one thing a private
 * thread must not allow.
 */
export async function sendMessage(
  threadId: string,
  viewerId: string,
  body: string,
): Promise<ThreadMessageItem | null> {
  const row = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: { lowId: true, highId: true },
  });
  if (!row) return null;
  if (row.lowId !== viewerId && row.highId !== viewerId) return null;

  const other = row.lowId === viewerId ? row.highId : row.lowId;
  if (!(await isFriend(viewerId, other))) return null;

  const [message] = await db
    .insert(threadMessages)
    .values({ threadId, authorId: viewerId, body })
    .returning({ id: threadMessages.id, createdAt: threadMessages.createdAt });

  // So the list sorts by life rather than by birth — a conversation somebody
  // just answered belongs at the top of it.
  await db.update(threads).set({ lastAt: new Date() }).where(eq(threads.id, threadId));

  return { id: message.id, body, createdAt: message.createdAt.toISOString(), mine: true };
}

/**
 * Take back something you said.
 *
 * Only ever your own line, and soft. The other person cannot delete yours: that
 * is moderation, and handing it to whoever you are arguing with turns every
 * disagreement into a race to delete.
 */
export async function removeMessage(messageId: string, authorId: string): Promise<boolean> {
  const done = await db
    .update(threadMessages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(threadMessages.id, messageId),
        eq(threadMessages.authorId, authorId),
        isNull(threadMessages.deletedAt),
      ),
    )
    .returning({ id: threadMessages.id });
  return done.length > 0;
}
