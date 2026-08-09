"use client";

/**
 * Save a card.
 *
 * ── Download first, share only where downloading is impossible ─────────────
 *
 * This used to prefer `navigator.share` wherever the platform offered it, on
 * the theory that a share sheet puts the picture straight into the message you
 * were about to send. In use that was wrong: tapping Save on Android Chrome
 * produced a sheet full of destinations to choose between, when what was wanted
 * was the file in Downloads and nothing else to think about. A save button
 * should save.
 *
 * So the anchor download is the default, and the share sheet is the fallback
 * for the one platform that genuinely cannot download a blob to anywhere the
 * user can find it: iOS Safari, where the camera roll is only reachable through
 * the share sheet. Detected by capability rather than by user-agent sniffing —
 * `download` on an anchor is the exact thing being relied on.
 */
export async function shareCard(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const a = document.createElement("a");
  const canDownload = "download" in a;

  if (canDownload) {
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    // Revoked on a delay rather than immediately — Safari has not started
    // reading the blob by the time click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  }

  const file = new File([blob], filename, { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      // Dismissing the sheet lands here, and so does a platform that claimed it
      // could share and then would not. Either way there is nothing left to try.
    }
    return "shared";
  }
  return "downloaded";
}

/** A filename that says what it is: `rankd-michael-mann-classic.jpg`. */
export const cardFilename = (title: string, design?: string): string => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `rankd-${slug(title) || "ranking"}${design ? `-${slug(design)}` : ""}.jpg`;
};
