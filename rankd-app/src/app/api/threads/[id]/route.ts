// One conversation: reading it, and adding to it.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { textIsClean } from "@/lib/profanity";
import { LIMITS, take } from "@/lib/rateLimit";
import { MESSAGE_MAX, messagesFor, sendMessage } from "@/lib/social/threads";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const messages = await messagesFor(id, user.id);
  // Null means "not one of the two people", answered exactly as a missing
  // thread is, so this cannot be used to discover that one exists.
  if (!messages) return NextResponse.json({ error: "No such conversation" }, { status: 404 });

  return NextResponse.json({ messages });
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

  // Collapsed before measuring, so a message cannot be padded past the cap with
  // whitespace and cannot be a screenful of empty lines.
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length === 0) return NextResponse.json({ error: "Say something." }, { status: 400 });
  if (text.length > MESSAGE_MAX) {
    return NextResponse.json({ error: `Keep it under ${MESSAGE_MAX} characters.` }, { status: 400 });
  }

  // The same filter a handle and a bio go through. Its refusal never names the
  // match, deliberately — see `profanity.ts`.
  //
  // Applied even though both people opted in by following each other: a
  // conversation can sour, and this is the one thing that costs nothing to keep.
  const clean = textIsClean(text);
  if (!clean.clean) return NextResponse.json({ error: clean.reason }, { status: 400 });

  const { id } = await params;
  const message = await sendMessage(id, user.id, text);
  // Also null once the two are no longer mutual. Following opened the
  // conversation, so it is what keeps it open.
  if (!message) return NextResponse.json({ error: "No such conversation" }, { status: 404 });

  return NextResponse.json({ message });
}
