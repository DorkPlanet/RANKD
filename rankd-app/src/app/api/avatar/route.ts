// Uploading a face.
//
// `profile.ts` stores no images by design — a banner is a film id and a still
// URL, and the whole profile costs a few hundred bytes rather than competing
// with 861 films for the same 5MB of localStorage. That rule is not being
// broken here: what gets stored is still a URL. Only the hosting is new.
//
// ── Why this is behind sign-in ─────────────────────────────────────────────
//
// An upload endpoint with no auth is a free file host for the entire internet,
// and it would be discovered. `requireUser` is the same gate the sync routes
// use, so there is one definition of "signed in" in this app rather than two.
//
// The consequence, stated plainly: you cannot have a custom picture without an
// account. That is not a limitation of the design so much as the design — the
// picture lives on a server, and a server needs to know whose it is. Signed-out
// users keep the initial, which is what they have today and costs them nothing.

import { put } from "@vercel/blob";

import { requireUser } from "@/lib/auth";

/**
 * The ceiling on what the route will accept.
 *
 * The client shrinks to ~256px before sending, which lands a phone photo around
 * 20KB — so anything approaching this is not a shrunk avatar and should be
 * refused rather than stored. Generous enough to survive a bad re-encode,
 * nowhere near large enough to be worth abusing.
 */
const MAX_BYTES = 512 * 1024;

/** Raster only, and only formats a canvas can actually have produced. */
const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png"]);

/**
 * Is blob storage reachable from this deployment?
 *
 * TWO ways, and checking only the first was wrong. `@vercel/blob` authenticates
 * either with a classic `BLOB_READ_WRITE_TOKEN`, or — which is what connecting a
 * store through the Vercel dashboard actually sets up now — with OIDC, using
 * `BLOB_STORE_ID` plus a short-lived `VERCEL_OIDC_TOKEN` that the platform
 * injects at runtime.
 *
 * Connecting the store in the dashboard hands over `BLOB_STORE_ID` and no
 * read-write token at all. So the original guard refused every upload on a
 * deployment where uploads worked perfectly, and said "not configured" about a
 * store that was configured. Checking for the token alone is checking for one
 * particular way of holding the key rather than for the key.
 */
const blobConfigured = (): boolean =>
  !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID;

export async function POST(req: Request) {
  if (!blobConfigured()) {
    // Said out loud rather than failing obscurely inside `put`. Same reasoning
    // as the feedback route: a deployment that cannot do the thing should say
    // so, not throw a stack trace that reads like a bug.
    return Response.json({ error: "Uploads are not configured on this deployment." }, { status: 503 });
  }

  const user = await requireUser();
  if (!user) return Response.json({ error: "Sign in to upload a picture." }, { status: 401 });

  const type = req.headers.get("content-type") ?? "";
  if (!ALLOWED.has(type)) {
    return Response.json({ error: "That file type is not supported." }, { status: 415 });
  }

  const blob = await req.blob();
  if (blob.size === 0) return Response.json({ error: "Empty upload." }, { status: 400 });
  if (blob.size > MAX_BYTES) {
    return Response.json({ error: "That picture is too large." }, { status: 413 });
  }

  // Keyed by user id, so one account cannot fill the store by re-uploading:
  // `addRandomSuffix: false` means each upload OVERWRITES the last rather than
  // adding another file nobody will ever reference again. The extension follows
  // the content type so the served file keeps a sensible name.
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const { url } = await put(`avatars/${user.id}.${ext}`, blob, {
    access: "public",
    contentType: type,
    addRandomSuffix: false,
    // Overwriting a fixed key means the URL is stable, which would otherwise be
    // served stale from the CDN after a change. A short cache keeps the picture
    // fresh without giving up caching entirely.
    cacheControlMaxAge: 60,
    allowOverwrite: true,
  });

  return Response.json({ url });
}
