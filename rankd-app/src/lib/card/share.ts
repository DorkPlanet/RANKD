"use client";

/**
 * Hand a card to the user.
 *
 * The share sheet first, when the platform has one: on a phone this is the
 * difference between "the picture is now in your camera roll somewhere" and
 * "the picture is in the message you were about to send". Falls back to a
 * download everywhere else.
 */
export async function shareCard(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      // Dismissing the share sheet lands here, and so does a platform that
      // claimed it could share and then would not. Falling through to the
      // download would drop a file on someone who just cancelled, so: nothing.
      return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick rather than immediately — Safari has not started
  // reading the blob by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

/** A filename that says what it is: `rankd-michael-mann-classic.jpg`. */
export const cardFilename = (title: string, design?: string): string => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `rankd-${slug(title) || "ranking"}${design ? `-${slug(design)}` : ""}.jpg`;
};
