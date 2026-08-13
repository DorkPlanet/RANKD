// Your library, mirrored.
//
// The server keeps one row per account and never looks inside it. That is not
// laziness — the blob is validated on the way in by the SAME code that guards a
// file restore (`backupFormat.ts`), so "opaque" here means "checked, then not
// re-interpreted", and the shape of a film can change without a migration.
//
// Nothing in this file resolves a conflict. It reports `updatedAt` and
// `deviceId` and lets the client decide, because the only honest answer to "two
// devices both have work" is to ask.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db, libraries } from "@/lib/db";
import { validateBackup, BackupError } from "@/lib/backupFormat";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const row = await db.query.libraries.findFirst({ where: eq(libraries.userId, user.id) });
  // No row is a normal state, not an error: it is what every account looks like
  // until its first push.
  if (!row) return NextResponse.json({ payload: null });

  return NextResponse.json({
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
    deviceId: row.deviceId,
  });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const { payload, deviceId } = (body ?? {}) as { payload?: unknown; deviceId?: unknown };

  let backup;
  try {
    ({ backup } = validateBackup(payload));
  } catch (e) {
    // A rejected upload must never become a stored one. The message is the same
    // sentence a bad file gets, so the two paths explain themselves alike.
    if (e instanceof BackupError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const updatedAt = new Date();
  await db
    .insert(libraries)
    .values({
      userId: user.id,
      format: backup.format,
      payload: backup,
      deviceId: typeof deviceId === "string" ? deviceId : null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: libraries.userId,
      set: {
        format: backup.format,
        payload: backup,
        deviceId: typeof deviceId === "string" ? deviceId : null,
        updatedAt,
      },
    });

  return NextResponse.json({ updatedAt: updatedAt.toISOString() });
}
