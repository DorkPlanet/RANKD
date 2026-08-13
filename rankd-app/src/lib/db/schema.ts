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
// `visibility` here and `handle` on the user are the two columns that buy that
// future. Nothing reads either of them yet, and that is deliberate.

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

export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // From the auth provider; the identity a repeat sign-in resolves back to.
    email: text("email").notNull(),
    // Reserved for the social future — a public address for a profile. Nullable
    // because nothing claims one yet. Uniqueness is case-insensitive and
    // enforced by the index below, so the database rather than the application
    // is the source of truth when two people race for the same name.
    handle: text("handle"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
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
