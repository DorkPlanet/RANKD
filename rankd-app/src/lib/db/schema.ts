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
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { SavedEntry } from "../lists";

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

export type User = typeof users.$inferSelect;
export type Library = typeof libraries.$inferSelect;
export type SavedListRow = typeof savedLists.$inferSelect;
