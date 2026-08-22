// Database schema, source of truth for the versioned Drizzle migrations under
// `drizzle/`.
//
// ── Why the library is a blob and a saved list is not ───────────────────────
//
// The library is private and only ever read by the person it belongs to, so the
// server never has a reason to look inside it: one `jsonb` column, opaque, is
// both correct and the cheapest thing that works. It is exactly the payload
// `lib/backup.ts` already writes to a file, so no second format exists.
//
// A saved list is different in kind. It is the thing another person could one
// day follow, like or comment on, and every one of those needs a stable row to
// point at. Held inside the library blob a list has no server identity at all,
// and adding any of that later would mean extracting and re-modelling every list
// that already exists. Modelled as its own table now, those features are pure
// additions that hang off `saved_list.id`.
//
// `visibility` here and `handle` on the user are the two columns that bought
// that future. `handle` is now claimed by every account at sign-in and read on
// every public surface. `saved_list.visibility` is still written by nobody, and
// that half is still deliberate: publishing a list is its own decision and it
// has not been offered yet.
//
// ── The library is still a blob, and that is now a decision rather than a
//    deferral ────────────────────────────────────────────────────────────────
//
// POTENTIAL-FEATURES.md said the blob stays until "a social feature where
// another person reads your data". That has happened, and the blob stayed
// anyway, because what another person reads is `taste_snapshot` — a projection
// the client already computes, a few percent of the blob's size. The library is
// what you are DOING and stays local, synchronous and private; the snapshot is
// what you are SHOWING. Different objects, different rules, and only one of them
// is in the path of a duel.

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { SavedEntry } from "../lists";
import type { SnapshotEntry, SnapshotSummary } from "../snapshot";

// Private until the owner chooses otherwise. A default of "public" would expose
// people who never asked to be, so the safe value is the one you get for free.
export const listVisibility = pgEnum("list_visibility", ["private", "public"]);

// Same two values, its own type. A list and a person are not the same kind of
// thing to publish, and sharing one enum would mean a later `followers` tier on
// a profile silently becoming a legal value for a list as well.
//
// Both default to `private`, which is what opts every EXISTING account out. The
// column arrives with the default already applied, so nobody becomes visible
// because a code path forgot to ask.
export const profileVisibility = pgEnum("profile_visibility", ["private", "public"]);

// Whether there is a person behind this account.
//
// ── Why a column and not `handle === "faulkner"` ───────────────────────────
//
// A string comparison scattered across aggregation, following, moderation and
// counts is a rule you have to remember, and this one is only load-bearing at
// the moment somebody forgets it. The worst case is silent: the house account's
// own snapshot is public, so an aggregation that fails to exclude it reads its
// own output, and the ranking slowly eats itself and freezes. That is a bug
// nobody notices for months.
//
// An enum rather than a boolean because there may one day be a third kind (a
// guest curator, a partner), and because `kind === "house"` reads better at
// every call site than `isBot`.
//
// What it enforces, wherever those surfaces exist: a house account is excluded
// from the community aggregation, may not follow anybody, is not counted as a
// user, and cannot be reported or suspended by readers.
export const accountKind = pgEnum("account_kind", ["person", "house"]);

/**
 * What a feed card is about.
 *
 * Every one is DERIVED, on the server, by diffing a pushed snapshot against the
 * stored one — see `lib/social/feed.ts`. No client writes this table, which is
 * why there is no trust boundary to police here and no emission route to rate
 * limit.
 *
 * There is no `upset`. That card would need the duel log, which is local by
 * architecture; the reasoning is written out in `feed.ts` and the omission is
 * deliberate rather than pending.
 */
export const activityKind = pgEnum("activity_kind", [
  "climb",
  "promotion",
  "arrival",
  "placed",
  // Not about the top ten, and the only card that is purely about persistence —
  // see `Counts` in `lib/social/feed.ts` for why the feed needed one.
  "milestone",
]);

export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // From the auth provider; the identity a repeat sign-in resolves back to.
    email: text("email").notNull(),
    // The public address for a profile. Uniqueness is case-insensitive and
    // enforced by the index below, so the database rather than the application
    // is the source of truth when two people race for the same name.
    //
    // ── Still nullable, and it always will be ──────────────────────────────
    //
    // Every account is REQUIRED to claim one: `HandleGate` will not let you past
    // without it and `requireHandle` refuses any public write. But `NOT NULL`
    // cannot be added, because it would need a backfill and there is no honest
    // value to backfill with. A name nobody chose is worse than a null.
    //
    // So the column stays nullable and the requirement lives in the two places
    // that can actually enforce it. `handle IS NULL` means "has not been through
    // the gate yet", which is a real state on every existing account.
    handle: text("handle"),
    handleClaimedAt: timestamp("handle_claimed_at", { withTimezone: true }),
    // A person, unless something says otherwise. See `accountKind` above for
    // what the exception costs if it is ever left unchecked.
    kind: accountKind("kind").notNull().default("person"),
    // ── Public identity, which is why it moved off the device ──────────────
    //
    // These three used to live in `lib/profile.ts` in localStorage, where they
    // were nobody's business but yours. They are read by strangers now, and a
    // public field held only on a phone has no uniqueness, no moderation
    // surface and no way for a second person to read it at all.
    //
    // The rest of the local `Profile` stayed local: a banner, a pinned list and
    // a pinned person are relative to a library, not to an identity.
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    // 'google' | 'upload'. Which of the two an avatar came from, so that
    // re-provisioning can refresh a Google photo without silently discarding a
    // picture somebody deliberately cropped and uploaded.
    avatarSource: text("avatar_source"),
    bio: text("bio"),
    // Whether a stranger sees a profile at all, and whether the taste half of it
    // is included. Separate, because "here is what I made" and "here is what
    // Rankd worked out about me" are not the same offer.
    profileVisibility: profileVisibility("profile_visibility").notNull().default("private"),
    tasteVisibility: profileVisibility("taste_visibility").notNull().default("private"),
    // Moderation, so acting on a report is a row rather than a deploy.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    // Soft delete. A real DELETE follows after a grace period; until then this
    // is what hides someone from every public read.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // ── The last time they opened Activity ─────────────────────────────────
    //
    // One timestamp, not a notifications table. What the dot on the nav has to
    // answer is "has anybody spoken to me since I last looked", and that is a
    // comparison against a single moment — a row per notification would be a
    // second copy of facts the comments already hold, kept in step by hand.
    //
    // Null means never opened, which correctly reads as "everything is new".
    activitySeenAt: timestamp("activity_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One account per identity: a repeat sign-in must resolve to the same row
    // rather than duplicate it. `provisionUser` leans on this constraint instead
    // of an application-level read-then-write.
    uniqueIndex("user_email_unique").on(table.email),
    // NULL handles are exempt, which Postgres allows by default — most accounts
    // will sit without one indefinitely.
    uniqueIndex("user_handle_lower_unique").on(sql`lower(${table.handle})`),
  ],
);

// One row per user: the mirror of what that person's browser holds.
//
// `payload` is the `Backup` object from lib/backup.ts, stored verbatim and never
// inspected by the server. `format` is lifted out of it into a column so a
// future migration can find the rows it needs to rewrite without parsing every
// blob in the table.
export const libraries = pgTable("library", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  format: integer("format").notNull(),
  payload: jsonb("payload").notNull(),
  // Which browser wrote this. Not used to resolve anything automatically — it
  // exists so the sign-in chooser can say "your phone" rather than "the cloud",
  // and so a device can recognise its own last write.
  deviceId: text("device_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A ranking someone decided to keep.
//
// `entries` is jsonb rather than a child table on purpose: the order FREEZES at
// save time (see the header of lib/lists.ts), so a list is read whole or not at
// all and no query ever wants one row of it. A like or a comment attaches to the
// LIST, which is why the list itself is relational and its contents are not.
export const savedLists = pgTable("saved_list", {
  // Client-generated (`lib/lists.ts`), already stable and collision-safe, so it
  // carries across unchanged and a re-sync is an upsert rather than a duplicate.
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // "Michael Mann · director" — where the list came from, for the subtitle.
  source: text("source"),
  entries: jsonb("entries").$type<SavedEntry[]>().notNull(),
  // When the user froze it, not when the row was written: a list keeps the date
  // its answer was true even if it syncs a week later.
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  visibility: listVisibility("visibility").notNull().default("private"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// What another person is allowed to read, derived from the library and never
// the other way round. See the header of lib/snapshot.ts for why this exists
// instead of the relational migration POTENTIAL-FEATURES.md predicted.
//
// One row per user, replaced whole on every push. There is no history here and
// there should not be: a snapshot is the current answer, and yesterday's answer
// about somebody's taste is of no interest to anybody including them.
export const tasteSnapshots = pgTable("taste_snapshot", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // The rank order, for comparison. Small keys, one object per placed film.
  entries: jsonb("entries").$type<SnapshotEntry[]>().notNull(),
  // Lifted out of the summary into columns because they are the two numbers a
  // profile shows above everything else, and a future "who has ranked the most"
  // wants to sort on them without opening every blob in the table. Same
  // reasoning as `library.format`.
  filmCount: integer("film_count").notNull(),
  duelCount: integer("duel_count").notNull(),
  // Everything the page draws: titles, artwork, names, the fingerprint.
  summary: jsonb("summary").$type<SnapshotSummary>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Who follows whom.
//
// ── One-way by construction, not by convention ─────────────────────────────
//
// The primary key is the ORDERED pair, so a follow is a single directed edge and
// there is nowhere to record reciprocity. A mutual follow is simply two rows,
// and "are we friends" is one existence check for the reverse edge rather than a
// status column somebody has to keep in step.
//
// That matters because the two directions genuinely come apart: you can follow
// somebody who never follows back, and they can stop following you without your
// row changing. A single `friendship` row with a state on it would have to
// answer "who ended it" and "what happens to the other half", and neither
// question has a good answer.
//
// ── No counter columns ─────────────────────────────────────────────────────
//
// Follower counts are `COUNT(*)` against the indexes below. A denormalised
// count is a second source of truth, and the first time it drifts nobody
// notices because there is nothing to compare it against. Revisit only when a
// count is measurably slow, which at this scale it is not.
export const follows = pgTable(
  "follow",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The pair IS the identity, so following twice is not a duplicate row and
    // does not need application-level de-duplication.
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    // "Who do I follow", and the join the feed will run.
    index("follow_follower_idx").on(table.followerId, table.createdAt.desc()),
    // "Who follows them", and the follower count.
    index("follow_followee_idx").on(table.followeeId, table.createdAt.desc()),
    // Nobody follows themselves. Enforced here rather than in a route, so no
    // future caller can invent a path around it.
    check("follow_not_self", sql`${table.followerId} <> ${table.followeeId}`),
  ],
);

// How many times this account has done this thing lately.
//
// ── Why there is a table for this at all ───────────────────────────────────
//
// There was no rate limiting anywhere in Rankd, which was fine while every
// endpoint either read your own data or spent TMDb's quota behind `guard.ts`.
// Following somebody is neither: it writes a row that appears on another
// person's page, under a name they can read.
//
// Postgres rather than Redis, deliberately. A limiter is not worth a new piece
// of infrastructure, a new connection string and a new thing that can be down;
// this is one small table and one upsert, on a database every one of these
// routes has already opened a connection to.
//
// ── One row per account per bucket, forever ────────────────────────────────
//
// The obvious shape keys on the window as well, which is simpler to write and
// leaves a row behind for every window that ever passes: unbounded growth that
// needs a sweeper nobody will remember to run. Here the window is a COLUMN, so
// a roll-over overwrites its own row and the table stays exactly as large as
// the number of people using it.
//
// Fixed windows, not a sliding log. A fixed window lets somebody spend two
// windows' worth of budget across a boundary, and that is an acceptable answer
// for a limiter whose job is to stop scripts rather than to be exact.
export const rateLimits = pgTable(
  "rate_limit",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What is being counted: "follow", "handle-check", and so on. */
    bucket: text("bucket").notNull(),
    /** The start of the window these hits belong to. */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bucket] })],
);

// One periodic archive of somebody's published order.
//
// ── Deliberately NOT `taste_snapshot` with a date on it ────────────────────
//
// That table's header says there is no history there and there should not be,
// and it is right: a snapshot is the CURRENT answer, and last week's guess about
// a person's taste is of no use to anybody including them.
//
// This is a different object. The house account's ranking is a public artefact
// whose CHANGE is the interesting part, and "where it is against where it was"
// is the thing that was actually asked for. Nothing resets; the old orders are
// simply kept.
//
// ── Keyed on user, written only for the house account ──────────────────────
//
// Keying on `user_id` rather than on a bot constant costs nothing today and
// means "your ranking moved too" is later a decision about who writes rows
// rather than a migration.
//
// ── Full orders, not deltas ────────────────────────────────────────────────
//
// A delta chain needs an unbroken base to replay from, and pruning is exactly
// what the retention policy does, so one removed middle row would silently break
// everything after it. A full capture is self-describing, prunable in any order,
// and costs about 30KB. Deltas would be an optimisation for a storage problem
// that does not exist: logarithmic retention holds roughly 35 rows per user,
// forever.
export const rankingHistory = pgTable(
  "ranking_history",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    entries: jsonb("entries").$type<SnapshotEntry[]>().notNull(),
    filmCount: integer("film_count").notNull(),
    // How many published snapshots fed this capture. The honest denominator
    // behind every movement number, and the thing that says whether a week's
    // change meant anything or was three people.
    contributors: integer("contributors").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.capturedAt] }),
    index("ranking_history_user_idx").on(table.userId, table.capturedAt.desc()),
  ],
);

/**
 * One thing that happened to a ranking, ready to render.
 *
 * ── `meta` is denormalised on purpose ──────────────────────────────────────
 *
 * Title, artwork and the numbers are copied in rather than joined. A card has to
 * draw in a single read, and it has to survive its film leaving the library it
 * came from — a feed that quietly loses its own history the moment somebody
 * re-ranks is not a feed.
 *
 * `subject_id` is a `slugId`, not a foreign key, for the same reason the
 * snapshot uses one: there is no global film table and this must not invent one.
 */
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: activityKind("kind").notNull(),
    /** The film, as a `slugId`. Empty for a card about no single film. */
    subjectId: text("subject_id").notNull().default(""),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The feed's only query: everyone you follow, newest first.
    index("activity_actor_idx").on(table.actorId, table.createdAt.desc()),
    // ── There is no daily dedupe index, and that is deliberate ──────────────
    //
    // The plan called for `UNIQUE (actor, kind, subject, date_trunc('day',
    // created_at))` to stop a re-sync becoming a firehose. Two things killed it.
    //
    // It cannot be built. `date_trunc` on a `timestamptz` is STABLE rather than
    // IMMUTABLE — the answer depends on the session's TimeZone — so Postgres
    // refuses it in an index expression (42P17). Forcing it would mean picking
    // an arbitrary zone to truncate in, which is a fiction about somebody's day.
    //
    // And it was never needed. Cards are derived by diffing a pushed snapshot
    // against the stored one, so a re-sync of an unchanged library diffs to
    // nothing — the firehose it was guarding against cannot form. What the index
    // WOULD have done is throw away real news: rank in the morning and again at
    // night, and Heat climbing in both sessions is two true things, of which it
    // would have kept one.
    //
    // The bound that remains is `MAX_CARDS` in `lib/social/feed.ts`, applied per
    // push, on a push that must actually differ to say anything at all.
  ],
);

/**
 * Something somebody said on a card.
 *
 * ── The one place a person writes prose that another person reads ──────────
 *
 * Everything else on this server is derived: a ranking, a diff of a ranking, a
 * projection of a library. This is typed by a human at somebody else, which is a
 * different kind of object and carries the only moderation surface the app has.
 * `body` is capped, run through `textIsClean`, and soft-deleted rather than
 * removed so a thread keeps its shape when one line is taken out of it.
 *
 * Mentions are NOT a table. `@handle` is parsed out of `body` at render, because
 * a mention is a fact about the text rather than a thing of its own — storing
 * both means two truths about one sentence and an edit that updates one of them.
 */
export const activityComments = pgTable(
  "activity_comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft, so removing a line does not silently renumber a conversation or
    // orphan the replies that answered it.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Reading one thread, oldest first — a conversation is read downward.
    index("activity_comment_thread_idx").on(table.activityId, table.createdAt),
    // "What has been said to me lately", which is what the unread dot counts.
    index("activity_comment_author_idx").on(table.authorId, table.createdAt.desc()),
  ],
);

export type User = typeof users.$inferSelect;
export type TasteSnapshot = typeof tasteSnapshots.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type RankingCapture = typeof rankingHistory.$inferSelect;
export type Library = typeof libraries.$inferSelect;
export type Activity = typeof activity.$inferSelect;
export type ActivityComment = typeof activityComments.$inferSelect;
export type SavedListRow = typeof savedLists.$inferSelect;
