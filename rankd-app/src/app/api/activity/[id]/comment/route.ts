// Saying something on a card, and reading what has been said.
//
// The only route in the app that accepts prose from one person to be shown to
// another, which is why everything here is about what may be written rather than
// what may be read.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { textIsClean } from "@/lib/profanity";
import { LIMITS, take } from "@/lib/rateLimit";
import { addComment, commentsFor } from "@/lib/social/activity";
import { COMMENT_MAX } from "@/lib/social/feed";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const comments = await commentsFor(id, user.id);
  // Null means "not yours to read", and it answers exactly as a missing card
  // does. A thread must not be a way to discover that a card exists.
  if (!comments) return NextResponse.json({ error: "No such card" }, { status: 404 });

  return NextResponse.json({ comments });
}

export async function POST(request: Request, { params }: Params) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const allowed = await take(user.id, LIMITS.comment);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const raw = (body as { body?: unknown })?.body;
  if (typeof raw !== "string") return NextResponse.json({ error: "Say something." }, { status: 400 });

  // Collapsed before measuring, so a comment cannot be padded past the cap with
  // whitespace and cannot be a screenful of empty lines.
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) return NextResponse.json({ error: "Say something." }, { status: 400 });
  if (text.length > COMMENT_MAX) {
    return NextResponse.json({ error: `Keep it under ${COMMENT_MAX} characters.` }, { status: 400 });
  }

  // The same filter a handle and a bio go through. Its refusal never names the
  // match, deliberately — see `profanity.ts`.
  const clean = textIsClean(text);
  if (!clean.clean) return NextResponse.json({ error: clean.reason }, { status: 400 });

  const { id } = await params;
  const said = await addComment(id, user, text);
  if (!said.ok) return NextResponse.json({ error: said.error }, { status: 404 });

  return NextResponse.json({ comment: said.comment });
}
