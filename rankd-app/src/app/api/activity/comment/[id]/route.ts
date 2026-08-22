// Taking back a line you wrote.
//
// Only ever your own, and soft — see `removeComment`. The owner of a card
// cannot delete comments on it: that is moderation, and giving it to whoever
// happens to own the post turns every disagreement into a race to delete.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { removeComment } from "@/lib/social/activity";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const done = await removeComment(id, user.id);
  // One answer for "no such comment" and "not yours", so this cannot be used to
  // find out what somebody else wrote and deleted.
  if (!done) return NextResponse.json({ error: "No such comment" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
