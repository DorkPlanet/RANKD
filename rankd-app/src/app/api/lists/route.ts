// Saved rankings, as rows.
//
// Everything else this app syncs is one opaque blob per account. Lists are not,
// and the reason is the only forward-looking decision in this slice: a list is
// what another person could one day follow, like or comment on, and each of
// those needs something stable to point at. See the header of `lib/db/schema.ts`.
//
// `visibility` is written by nothing and read by nothing yet. It defaults to
// private, which is the value that cannot expose anyone by accident.

import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db, savedLists } from "@/lib/db";
import type { SavedEntry } from "@/lib/lists";

/** The wire shape — `SavedList` from lib/lists.ts, dates as ISO strings. */
interface ListPayload {
  id: string;
  name: string;
  source?: string;
  savedAt: string;
  entries: SavedEntry[];
}

function isListPayload(v: unknown): v is ListPayload {
  const l = v as Partial<ListPayload> | null;
  return (
    !!l &&
    typeof l === "object" &&
    typeof l.id === "string" &&
    l.id.length > 0 &&
    typeof l.name === "string" &&
    typeof l.savedAt === "string" &&
    !Number.isNaN(Date.parse(l.savedAt)) &&
    Array.isArray(l.entries) &&
    l.entries.every(
      (e) => e && typeof e === "object" && typeof e.id === "string" && typeof e.title === "string",
    )
  );
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await db.select().from(savedLists).where(eq(savedLists.userId, user.id));

  // Newest first, the order `lib/lists.ts` keeps locally — the one you just made
  // is the one you want to see.
  const lists = rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      ...(r.source ? { source: r.source } : {}),
      savedAt: r.savedAt.toISOString(),
      entries: r.entries,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  return NextResponse.json({ lists });
}

// Upsert by client id. A list is immutable in practice — its order freezes at
// save time (see lib/lists.ts) — so a repeat push of the same id is a re-sync of
// something unchanged, not an edit, and overwriting is safe. `renameList` is the
// one thing that does change, and this carries the new name across.
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const { lists } = (body ?? {}) as { lists?: unknown };
  if (!Array.isArray(lists) || !lists.every(isListPayload)) {
    return NextResponse.json({ error: "That doesn't look like a set of saved lists." }, { status: 400 });
  }
  if (lists.length === 0) return NextResponse.json({ written: 0 });

  const updatedAt = new Date();
  await db
    .insert(savedLists)
    .values(
      lists.map((l) => ({
        id: l.id,
        userId: user.id,
        name: l.name,
        source: l.source ?? null,
        entries: l.entries,
        savedAt: new Date(l.savedAt),
        updatedAt,
      })),
    )
    .onConflictDoUpdate({
      target: savedLists.id,
      set: {
        // `excluded` is the row this statement tried to insert — referencing the
        // columns directly would set each field to the value already stored and
        // make the update a no-op.
        //
        // Name and entries only. `visibility` is untouched on purpose: once
        // publishing exists, a routine re-sync from a device that has never
        // heard of it must not quietly un-publish a list.
        name: sql`excluded.name`,
        entries: sql`excluded.entries`,
        updatedAt,
      },
    });

  return NextResponse.json({ written: lists.length });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ids = new URL(request.url).searchParams.getAll("id");
  if (ids.length === 0) return NextResponse.json({ error: "No id given." }, { status: 400 });

  // Scoped to the caller's own rows, so an id belonging to someone else matches
  // nothing rather than deleting it.
  await db
    .delete(savedLists)
    .where(and(eq(savedLists.userId, user.id), inArray(savedLists.id, ids)));

  return NextResponse.json({ deleted: ids.length });
}
