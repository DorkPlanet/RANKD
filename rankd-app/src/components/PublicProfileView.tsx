// A profile, drawn for somebody who is not its owner.
//
// ── A server component, and it stays one ───────────────────────────────────
//
// No "use client", no hooks, no storage. This has to render for a crawler and
// for a signed-out stranger on a bad connection, and everything it needs is
// already in the object handed to it. Adding state here would quietly make the
// one page in Rankd that works without JavaScript stop working without it.
//
// ── Why this is not `ProfileScreen` with a flag ────────────────────────────
//
// The owner's profile is a control surface: every block on it is a way into
// something. Tap the picture, tap the bio, tap a shelf, jump to a tier. A
// visitor can do none of that, so a shared component would be a large one with
// most of itself switched off, and every future edit would have to keep both
// readings in mind.
//
// What IS shared is the vocabulary: the same tokens, the same gold display
// face, the same faded rules, the same stat row. It should read as the same app
// because it is, without being the same code.

import { FollowButton } from "./FollowButton";
import { avatarOf } from "@/lib/profile";
import { starsFor } from "@/lib/tiers";
import type { PublicProfile } from "@/lib/social/publicProfile";

/** Matches `Stat` on the owner's profile. Numbers first, label under. */
function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <span className="block font-serif text-lg font-bold text-text-hi tabular-nums">
        {n.toLocaleString()}
      </span>
      <span className="block text-label font-extrabold tracking-[0.14em] text-dim">
        {label.toUpperCase()}
      </span>
    </div>
  );
}

/** Matches `Section`. A rule that fades at both ends, then a small heading. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="rule-fade mb-6" />
      <div className="mb-2.5 text-label font-extrabold tracking-[0.18em] text-dim">
        {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}

export function PublicProfileView({ profile }: { profile: PublicProfile }) {
  const avatar = avatarOf({
    handle: profile.handle,
    displayName: null,
    avatarUrl: profile.avatarUrl,
  });
  const summary = profile.summary;

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-md px-6 pb-16"
      style={{
        background: "var(--bg)",
        paddingTop: "calc(env(safe-area-inset-top) + 2rem)",
      }}
    >
      <div className="flex flex-col items-center text-center">
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

        {/* No `@`, matching the owner's own profile. The handle is a title here
            rather than an address being typed. */}
        <span className="mt-3 block max-w-full truncate font-display text-[26px] leading-none tracking-wide text-gold">
          {profile.handle}
        </span>

        {profile.bio && (
          <p className="mx-auto mt-3.5 max-w-[280px] whitespace-pre-line font-serif text-sub italic leading-snug text-dim">
            {profile.bio}
          </p>
        )}

        {/* The only client component on the page, and the only part that depends
            on WHO is looking. Everything above renders the same for everybody,
            which is what keeps this a public page rather than a private render
            per visitor. */}
        <FollowButton handle={profile.handle} />
      </div>

      <div className="mt-6 flex items-start justify-around text-center">
        <Stat n={profile.filmCount} label="Films" />
        <Stat n={profile.rankedCount} label="Ranked" />
        <Stat n={profile.duelCount} label="Duels" />
      </div>

      {/* ── Nothing below here when the taste half is private ─────────────────
          A profile can exist while its contents do not. Said out loud rather
          than rendered as a run of empty sections, which reads as broken. */}
      {!summary ? (
        <p className="mt-10 text-center text-sub leading-snug text-dim">
          {profile.handle} keeps the rest to themselves.
        </p>
      ) : (
        <>
          {summary.topFilms.length > 0 && (
            <Section title="Their top films">
              <ol className="space-y-2.5">
                {summary.topFilms.map((film, i) => (
                  <li key={film.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right font-serif text-sub font-bold tabular-nums text-dim">
                      {i + 1}
                    </span>
                    {film.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={film.poster}
                        alt=""
                        className="h-12 w-8 shrink-0 rounded-sm object-cover"
                        style={{ background: "var(--surface)" }}
                      />
                    ) : (
                      <span
                        className="h-12 w-8 shrink-0 rounded-sm"
                        style={{ background: "var(--surface)" }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-hi">{film.title}</span>
                      <span className="block text-label text-dim">
                        {film.year}
                        {film.year ? " · " : ""}
                        {starsFor(film.rating)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(summary.directors.length > 0 || summary.actors.length > 0) && (
            <Section title="Who they rate highest">
              <div className="space-y-2">
                {[...summary.directors, ...summary.actors].slice(0, 6).map((person) => (
                  <div key={person.name} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-text-hi">{person.name}</span>
                    <span className="shrink-0 text-label text-dim">
                      {person.avg.toFixed(1)}★ · {person.count} films
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {summary.superlatives.length > 0 && (
            <Section title="Facts">
              <div className="space-y-2">
                {summary.superlatives.slice(0, 5).map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 text-label font-extrabold tracking-[0.14em] text-dim">
                      {fact.label.toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-right text-sm text-text-hi">
                      {fact.value}
                      {fact.note ? <span className="text-dim"> {fact.note}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* ── Attribution, and it is not decoration ─────────────────────────────
          Until this page existed, TMDb artwork was only ever shown to the person
          whose library it was, behind a sign-in. This republishes it to anybody
          with the address, including people who have never heard of Rankd, which
          is the point at which TMDb's terms require the credit to be visible.
          It goes on every public surface, including share cards later. */}
      <footer className="mt-12 text-center">
        <div className="rule-fade mb-5" />
        <p className="text-label leading-snug text-dim">
          Ranked on Rankd. Film data and artwork from TMDb, which has not endorsed this.
        </p>
        <p className="mt-2 text-label leading-snug text-dim">© Jarrad Bishop</p>
      </footer>
    </main>
  );
}
