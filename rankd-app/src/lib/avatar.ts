// Getting a phone photo down to something worth uploading.
//
// A phone camera produces 3–5MB at 4000px on the long edge; the avatar is drawn
// at 58px. Uploading the original would spend three hundred times the bytes on
// detail the first `object-fit: cover` throws away. Shrinking here rather than
// on the server also means the slow, unreliable half — the upload — is small.
//
// This module does NOT decide what part of the image is the subject. It renders
// a square region given in source pixels; choosing that region is
// `AvatarCropper`'s job, because it is the only thing that can see it. Centre-
// cropping on the user's behalf is a guess, and it is wrong for most photos.
//
// All of it runs in the browser, which is why the route needs no image library.

/** What the picture is shrunk to, on its long edge. */
export const AVATAR_SIZE = 256;
/** WebP quality. High enough that a face survives, low enough to stay tiny. */
const QUALITY = 0.82;

/** A square region of the source image, in its own pixels. */
export interface CropBox {
  x: number;
  y: number;
  size: number;
}

/**
 * Decode a file once, so the cropper can measure and draw from the same bitmap.
 *
 * The caller owns it and must `.close()` when finished — these are tens of
 * megabytes uncompressed on a phone, and waiting for GC while someone drags a
 * crop box around is how a mid-range device starts dropping frames.
 */
export function decodeImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Render a chosen square of an image to a small WebP.
 *
 * TRAP: `toBlob` with an unsupported type does not throw — it silently hands
 * back a PNG, several times larger, which would still upload fine. So the type
 * is read back off the blob rather than assumed, and that is what sets the
 * request's Content-Type.
 */
export async function cropAvatar(bitmap: ImageBitmap, box: CropBox): Promise<{ blob: Blob; type: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  // Downscaling by a large factor in one step aliases badly; the browser's own
  // smoothing is what keeps a shrunk face from going crunchy.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Clamped rather than trusted. The cropper keeps the box inside the image, but
  // a rounding error at the edge would otherwise draw a transparent sliver into
  // an avatar that is about to be permanent.
  const size = Math.max(1, Math.min(box.size, bitmap.width, bitmap.height));
  const x = Math.max(0, Math.min(box.x, bitmap.width - size));
  const y = Math.max(0, Math.min(box.y, bitmap.height - size));

  ctx.drawImage(bitmap, x, y, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
  if (!blob) throw new Error("Could not process that image.");
  return { blob, type: blob.type || "image/webp" };
}

/** Send a cropped avatar and return the URL it now lives at. */
export async function uploadAvatar(blob: Blob, type: string): Promise<string> {
  const res = await fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": type },
    body: blob,
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) throw new Error(body?.error ?? "That could not be uploaded.");
  return body.url;
}
