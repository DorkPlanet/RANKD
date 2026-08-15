// Uploading a face.
//
// `profile.ts` stores no images, only references to them — this keeps that rule:
// what lands in the profile is a URL. Only the hosting is new.
//
// BEHIND SIGN-IN, deliberately. An upload endpoint with no auth is a free file
// host for the internet and would be found. `requireUser` is the same gate the
// sync routes use, so "signed in" has one definition here rather than two. The
// consequence is that a custom picture needs an account; signed-out users keep
// the initial, which costs them nothing.

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
 * TWO ways to hold the key, and either is enough. `@vercel/blob` authenticates
 * with a classic `BLOB_READ_WRITE_TOKEN`, OR with OIDC via `BLOB_STORE_ID` plus
 * a short-lived `VERCEL_OIDC_TOKEN` the platform injects at runtime.
 *
 * Connecting a store through the Vercel dashboard sets `BLOB_STORE_ID` and no
 * token at all, so checking only for the token refuses every upload on a
 * deployment where uploads work.
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
  try {
    const { url } = await put(`avatars/${user.id}.${ext}`, blob, {
      access: "public",
      contentType: type,
      addRandomSuffix: false,
      // Overwriting a fixed key means the URL is stable, which would otherwise
      // be served stale from the CDN after a change. A short cache keeps the
      // picture fresh without giving up caching entirely.
      cacheControlMaxAge: 60,
      allowOverwrite: true,
    });
    // ── Why the URL carries a version ──────────────────────────────────────
    //
    // The key above is FIXED and overwritten, which keeps the store from
    // filling up — and means every upload returns the identical URL. The
    // browser and the CDN edge both already hold the previous picture under
    // that exact URL, so the new one does not appear until the old entry
    // expires. `cacheControlMaxAge: 60` was meant to bound that wait and does
    // not: it bounds the EDGE, while the phone that just did the upload is
    // reading its own memory cache and answering from the old bytes. Measured
    // from the user's side as "I set a new picture and it hadn't changed
    // thirty seconds later".
    //
    // A version parameter is the whole fix. Blob storage ignores the query
    // string, every cache between here and the screen treats it as a different
    // resource, and the stored profile URL changes with each upload — so the
    // new face is fetched immediately rather than waited for. It also fixes the
    // FIRST upload, where the same URL had already been cached as a 404.
    return Response.json({ url: `${url}?v=${Date.now().toString(36)}` });
  } catch (e) {
    // Configured is not the same as reachable: OIDC is enabled PER ENVIRONMENT,
    // so a project whose Preview and Production work can still refuse
    // Development — which is what every local upload hits. Uncaught, this
    // escapes as a bare 500 with no body and the SDK's plain-English reason
    // reaches nobody but this log.
    console.error("avatar: blob upload failed", e);
    return Response.json(
      { error: "That could not be uploaded. Try again shortly." },
      { status: 502 },
    );
  }
}
