// A person's face, wherever it appears.
//
// ── One circle, where there were four ─────────────────────────────────────
//
// The same picture was drawn by four separate pieces of code and no two agreed:
//
//   ProfileScreen      76px, a DOUBLE RING (`--bg` then `--border`)
//   ProfileBanner      80px, a 3px `--bg` border          (a visitor's view of YOU)
//   PrivateProfileView 80px, a 1px `--border` hairline
//   PersonRow          44px, no edge at all
//
// So your own avatar had one treatment on your profile and a different one on the
// page other people see — the one element on the site that is literally your
// identity, rendered two ways depending on who was looking.
//
// The double ring wins, and the reason is in `ProfileScreen`'s own note: the
// circle overlaps the banner, and a hairline against a photograph is not an edge
// — the artwork reads straight through it and the picture looks clipped out of
// the cover. The inner band is the page's own colour, so the circle is cut OUT of
// the banner rather than laid on top of it. That argument is just as true on the
// public page, which has the same banner.
//
// The letter is 0.45× the circle at every size. It was 0.45, 0.375 and 0.41 in
// the three places that drew one, which is why the fallback looked slightly
// wrong somewhere depending on where you had last seen it.

import { avatarOf, type Identity } from "@/lib/profile";

export function Avatar({
  identity,
  accountImage,
  size = 76,
  /** No ring. For a row, where the circle sits on the page rather than on art. */
  flat,
  className = "",
}: {
  identity: Identity;
  accountImage?: string | null;
  size?: number;
  flat?: boolean;
  className?: string;
}) {
  const avatar = avatarOf(identity, accountImage ?? null);
  const ring = flat ? undefined : "0 0 0 3px var(--bg), 0 0 0 4.5px var(--border)";

  return (
    <span
      className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-gold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: "var(--surface)",
        boxShadow: ring,
      }}
    >
      {avatar.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{avatar.letter}</span>
      )}
    </span>
  );
}
