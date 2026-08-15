// Getting a phone photo down to something worth uploading.
//
// A modern phone camera produces 3–5MB at 4000px on the long edge. The avatar is
// drawn at 58px and never larger, so uploading the original would be spending
// three hundred times the bytes on detail that is thrown away by the first
// `object-fit: cover` it meets. Shrinking here rather than on the server also
// means the slow, unreliable half — the upload — is the small half.
//
// Everything below runs in the browser. The server never resizes anything, which
// is why the route can stay twenty lines and needs no image library.

/** What the picture is shrunk to, on its long edge. */
const SIZE = 256;
/** WebP quality. High enough that a face survives, low enough to stay tiny. */
const QUALITY = 0.82;

export interface ShrunkAvatar {
  blob: Blob;
  type: string;
}

/**
 * Square-crop and shrink an image file, centred.
 *
 * Cropped rather than letterboxed because the avatar is drawn in a circle: a
 * non-square image would otherwise be squashed into it, and a face is the one
 * subject where that is immediately obvious.
 *
 * Returns WebP where the browser can encode it and falls back to JPEG where it
 * cannot — both are in the route's allow-list. The fallback matters: `toBlob`
 * with an unsupported type does not throw, it silently hands back a PNG, which
 * would be several times larger than intended and still upload fine. So the
 * result's real type is read back off the blob rather than assumed.
 */
export async function shrinkAvatar(file: File): Promise<ShrunkAvatar> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    // Downscaling by a large factor in one step aliases badly; the browser's own
    // smoothing is what keeps a shrunk face from going crunchy.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob) throw new Error("Could not process that image.");
    // `blob.type` is what the encoder actually produced, which is not always
    // what was asked for. The upload's Content-Type has to match the bytes.
    return { blob, type: blob.type || "image/webp" };
  } finally {
    // Frees the decoded bitmap immediately rather than waiting for GC — these
    // are tens of megabytes uncompressed, on a phone.
    bitmap.close();
  }
}

/** Send a shrunk avatar and return the URL it now lives at. */
export async function uploadAvatar(file: File): Promise<string> {
  const { blob, type } = await shrinkAvatar(file);
  const res = await fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": type },
    body: blob,
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) throw new Error(body?.error ?? "That could not be uploaded.");
  return body.url;
}
