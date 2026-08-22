// Who you are in public.
//
// `/api/auth/session` already says which Google identity is signed in. This says
// what Rankd knows about that person: the handle they claimed, the name and
// picture other people see, and whether they have agreed to be seen at all.
//
// Two endpoints rather than one because they answer to different rules. GET is
// asked on every open and must be cheap. PATCH edits public identity and has to
// validate, since everything it writes ends up on somebody else's screen.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { updateProfile } from "@/lib/users";
import { textIsClean } from "@/lib/profanity";
import type { User } from "@/lib/db/schema";

/**
 * Matches the textarea in `ProfileScreen`, which has allowed 300 since bios grew
 * past one line. A server cap BELOW the field the reader is typing into would
 * reject a bio the app itself invited, and would do it only on save.
 */
const BIO_MAX = 300;

/**
 * Hosts an avatar is allowed to come from.
 *
 * TWO, because an avatar has two legitimate origins and always has:
 *  · Vercel Blob, where `/api/avatar` puts a cropped upload.
 *  · TMDb, because picking a frame from a film as your picture is a real
 *    feature (`StillPicker`), and a frame is a TMDb URL rather than anything
 *    Rankd stores. It costs a URL, which is the whole reason it works.
 */
const AVATAR_HOSTS = [".public.blob.vercel-storage.com", "image.tmdb.org"];

/**
 * Did this picture come from somewhere Rankd already serves?
 *
 * The value ends up in an `<img src>` on a page other people load, so an
 * unchecked string here is a way to put any host's URL on somebody else's
 * screen with their referrer attached, and to make Rankd look like the one
 * asking for it.
 *
 * Parsed through `URL` rather than matched against the raw string, so the host
 * is the real host and not something before an `@`. The blob entry is matched on
 * a LEADING DOT so `evil-public.blob.vercel-storage.com` cannot pass as a
 * subdomain of nothing; TMDb's is a single exact host and is compared as one.
 */
function isAllowedAvatarUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return AVATAR_HOSTS.some((host) =>
    host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host,
  );
}

/**
 * What the client is allowed to know about itself.
 *
 * Built by hand rather than returning the row. `email` is on that row, and
 * spreading it into a JSON response is how a field nobody meant to publish ends
 * up in a cache, a log or a screenshot.
 */
function meFrom(user: User) {
  return {
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    profileVisibility: user.profileVisibility,
    tasteVisibility: user.tasteVisibility,
  };
}

export async function GET() {
  const user = await requireUser();
  // 401 rather than an empty object, so `fetchMe` can tell "signed out" from
  // "signed in with nothing set yet". Those lead to different screens, and the
  // handle gate turns on exactly that distinction.
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(meFrom(user));
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const { displayName, bio, avatarUrl, profileVisibility, tasteVisibility } = (body ?? {}) as Record<
    string,
    unknown
  >;

  // Built field by field, so a key nobody meant to be editable cannot arrive in
  // the body and be written. `handle` is the one that matters: it is claimed
  // once, by its own endpoint, and must not have a second way in.
  const patch: Parameters<typeof updateProfile>[1] = {};

  if (displayName !== undefined) {
    if (typeof displayName !== "string") {
      return NextResponse.json({ error: "That name isn't valid." }, { status: 400 });
    }
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Pick a name to show." }, { status: 400 });
    }
    if (trimmed.length > 60) {
      return NextResponse.json({ error: "That name's too long." }, { status: 400 });
    }
    // A display name sits beside a handle on every public surface, so it is the
    // obvious way round a clean handle. Same check, same sentence.
    const clean = textIsClean(trimmed);
    if (!clean.clean) return NextResponse.json({ error: clean.reason }, { status: 400 });
    patch.displayName = trimmed;
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") {
      return NextResponse.json({ error: "That bio isn't valid." }, { status: 400 });
    }
    const trimmed = typeof bio === "string" ? bio.trim() : null;
    if (trimmed && trimmed.length > BIO_MAX) {
      return NextResponse.json(
        { error: `That's too long. ${BIO_MAX} characters is the maximum.` },
        { status: 400 },
      );
    }
    if (trimmed) {
      const clean = textIsClean(trimmed);
      if (!clean.clean) return NextResponse.json({ error: clean.reason }, { status: 400 });
    }
    // Empty becomes null rather than "". One absent value, so no reader has to
    // know that a bio can be missing in two different ways.
    patch.bio = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      return NextResponse.json({ error: "That picture isn't valid." }, { status: 400 });
    }
    if (avatarUrl === null) {
      patch.avatarUrl = null;
      patch.avatarSource = null;
    } else {
      // ── Not any URL somebody sends ─────────────────────────────────────────
      //
      // This value ends up in an `<img src>` on a page other people load, so an
      // unchecked string here is a way to make Rankd fetch and display anything,
      // from any host, on somebody else's screen, with their referrer attached.
      //
      // Uploads already go through /api/avatar, which writes the row itself
      // from the URL Vercel Blob returned. The callers of THIS path are the
      // one-time hand-over in `HandleGate` and picking a film frame, and both
      // carry a URL from a host Rankd already serves.
      if (!isAllowedAvatarUrl(avatarUrl)) {
        return NextResponse.json({ error: "That picture isn't valid." }, { status: 400 });
      }
      patch.avatarUrl = avatarUrl;
      patch.avatarSource = "upload";
    }
  }

  for (const [key, value] of [
    ["profileVisibility", profileVisibility],
    ["tasteVisibility", tasteVisibility],
  ] as const) {
    if (value === undefined) continue;
    if (value !== "private" && value !== "public") {
      return NextResponse.json({ error: "That isn't a visibility." }, { status: 400 });
    }
    patch[key] = value;
  }

  const updated = await updateProfile(user.id, patch);
  if (!updated) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(meFrom(updated));
}
