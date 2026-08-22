// Somebody who would rather not be read.
//
// ── Why this page exists at all ────────────────────────────────────────────
//
// It did not, until 22 Aug 2026. A private profile answered the same 404 as a
// handle nobody had ever claimed, on the argument that distinguishing them turns
// a handle into an oracle for who is on Rankd.
//
// That argument is still true. It was overruled deliberately, because search
// lists everybody and a search result that leads to a 404 is worse than one that
// leads to a locked door: the reader assumes Rankd is broken rather than that
// the person is private. Existence being confirmable is the price, and it is the
// same price every large social app has already paid.
//
// ── What must never appear here ────────────────────────────────────────────
//
// Anything derived from a library. No counts, no top films, no genre, no
// fingerprint, not even "0". A count is a fact about somebody's ranking and the
// ranking is the thing being withheld, so a zero would be a lie and a real
// number would be a leak.
//
// What IS shown is only what a person wrote to be read: their name, their
// picture, their bio. That is the whole of it, and `ProfileIdentity` is shaped so
// there is nothing else in scope to render by accident.

import { avatarOf } from "@/lib/profile";
import type { ProfileIdentity } from "@/lib/social/publicProfile";

export function PrivateProfileView({ identity }: { identity: ProfileIdentity }) {
  const avatar = avatarOf({
    handle: identity.handle,
    displayName: null,
    avatarUrl: identity.avatarUrl,
  });

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center px-6 pb-16 text-center"
      style={{
        background: "var(--bg)",
        paddingTop: "calc(env(safe-area-inset-top) + 4rem)",
      }}
    >
      {avatar.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar.url}
          alt=""
          className="h-20 w-20 rounded-full object-cover"
          style={{ border: "1px solid var(--border)" }}
        />
      ) : (
        <span
          className="flex h-20 w-20 items-center justify-center rounded-full font-display text-3xl text-gold"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {avatar.letter}
        </span>
      )}

      <span className="mt-3 block max-w-full truncate font-display text-[26px] leading-none tracking-wide text-gold">
        {identity.handle}
      </span>

      {identity.bio && (
        <p className="mx-auto mt-3.5 max-w-[280px] whitespace-pre-line font-serif text-sub italic leading-snug text-dim">
          {identity.bio}
        </p>
      )}

      {/* Says what is true and does not apologise for it. No "request to
          follow", because Rankd has no request flow and offering a button that
          does nothing is worse than offering none. */}
      <div className="mt-8 w-full max-w-[300px] rounded-2xl px-5 py-6" style={{ background: "rgba(255,255,255,0.04)" }}>
        <p className="text-sm leading-snug text-text-hi">This profile is private.</p>
        <p className="mt-1.5 text-sub leading-snug text-dim">
          {identity.handle} keeps their ranking to themselves.
        </p>
      </div>

      {/* No TMDb line here, unlike the public profile. Nothing on this page came
          from TMDb, so crediting them for it would be noise. */}
      <footer className="mt-auto pt-12">
        <p className="text-label leading-snug text-dim">© Jarrad Bishop</p>
      </footer>
    </main>
  );
}
