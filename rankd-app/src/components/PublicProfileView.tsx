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
import { ProfileBanner } from "./ProfileBanner";
import { starsFor } from "@/lib/tiers";
import type { PublicProfile } from "@/lib/social/publicProfile";
import type { PersonStat } from "@/lib/profile";
import type { SnapshotFilm } from "@/lib/snapshot";
import { blockFor, inkOn } from "@/lib/card/palette";
import { genreTypeSize } from "@/lib/card/genreType";

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

/**
 * The one card on the page, and it is the genre.
 *
 * ── It is a MARQUEE, in HTML ───────────────────────────────────────────────
 *
 * `lib/card/marquee.ts` is the loud share card: a solid block of colour filling
 * the left third, the claim about you set larger than anything else in the app,
 * and the ranking demoted to support. Its own header explains the borrowed
 * trick, which is that a slide says ONE thing enormously.
 *
 * This is that card, drawn in the DOM instead of on a canvas, for a surface that
 * has no duels behind it and nothing to export. A stranger reading a profile
 * gets the same object your share card is, in the same colours, without anybody
 * having had to make one.
 *
 * The block colour and the ink rule come from `lib/card/palette.ts`, which both
 * files now read, so a subject is the same colour here as it is on anything you
 * post. That is the reason those two functions were lifted out.
 *
 * ── Why genre and not something with a picture ─────────────────────────────
 *
 * Films, directors and actors were already on the page and all three have a
 * face: a poster, a portrait, a name people recognise. A genre has none, which
 * is exactly why it needs the loud treatment rather than another row of text.
 * The colour IS the artwork here, which is the marquee's whole argument.
 */
function GenreCard({ genre, film }: { genre: PersonStat; film?: SnapshotFilm }) {
  const block = blockFor(genre.name);
  const ink = inkOn(block);

  // ── The type is sized from the WORD, because nothing here can measure ─────
  //
  // The canvas marquee calls `fitText`, which shrinks until it fits because it
  // has a rendering context to ask. In the DOM there is no such thing at render
  // time, and the first version simply set a large size and let a long genre run
  // straight out of its block: "DOCUMENTARY" overlapped the numbers beside it on
  // a real profile.
  //
  // So the size comes from the longest word instead: see `genreTypeSize`, which
  // is its own tested function because the first version was inline and split on
  // the letter "s" instead of on whitespace. `break-words` and `overflow-hidden`
  // are the backstop for anything longer than it anticipates.
  const size = genreTypeSize(genre.name);

  return (
    <section className="mt-7">
      <div className="rule-fade mb-6" />
      <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        {/* ── Full width, not a left third ──────────────────────────────────
            `marquee.ts` fills the left 41% of a 960px landscape card, which
            leaves about 120px for the word on a phone. That is enough for CRIME
            and not for DOCUMENTARY, and the whole argument of the format is that
            the claim is enormous.

            So the block spans the card and the support sits under it. Same
            language, different proportions, because the proportions were a
            consequence of a 960px canvas rather than a decision about how loud
            the thing should be. */}
        <div className="px-5 py-5" style={{ background: block, color: ink }}>
          <span className="block text-label font-extrabold tracking-[0.16em] opacity-70">
            THEIR GENRE
          </span>
          <span
            className="mt-1 block break-words font-display leading-[0.9] tracking-wide"
            style={{ fontSize: size }}
          >
            {genre.name.toUpperCase()}
          </span>
        </div>

        {/* The support: numbers, and a whisper of the film behind them. */}
        <div className="relative flex items-center gap-6 px-5 py-4">
          {film?.poster && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={film.poster}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                style={{ opacity: 0.12 }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to right, var(--surface), color-mix(in srgb, var(--surface) 70%, transparent))",
                }}
              />
            </>
          )}
          <div className="relative">
            <span className="block font-serif text-lg font-bold tabular-nums text-text-hi">
              {genre.count}
            </span>
            <span className="block text-label font-extrabold tracking-[0.14em] text-dim">FILMS</span>
          </div>
          <div className="relative">
            <span className="block font-serif text-lg font-bold tabular-nums text-text-hi">
              {genre.avg.toFixed(1)}★
            </span>
            <span className="block text-label font-extrabold tracking-[0.14em] text-dim">
              ON AVERAGE
            </span>
          </div>
          {film && (
            <div className="relative min-w-0 flex-1 text-right">
              <span className="block truncate text-label text-dim">Their best</span>
              <span className="block truncate text-sub text-text-hi">{film.title}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PublicProfileView({
  profile,
  banner,
}: {
  profile: PublicProfile;
  /** Zero, one or two images. Resolved on the server; see `bannerImages`. */
  banner: string[];
}) {
  const summary = profile.summary;

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-md pb-16"
      style={{ background: "var(--bg)" }}
    >
      {/* Full bleed, so the frames run to the edges of the phone. Everything
          below it keeps the page's own gutter. */}
      <ProfileBanner images={banner} identity={profile} />

      {/* One gutter for the whole page below the banner. The banner itself is full
          bleed so the frames reach the edges of the phone. */}
      <div className="px-6">
      <div className="flex flex-col items-center pt-10 text-center">
        {/* No `@`, matching the owner's own profile. The handle is a title here
            rather than an address being typed. */}
        <span className="mt-3 block max-w-full truncate font-display text-[26px] leading-none tracking-wide text-gold">
          {profile.handle}
        </span>

        {/* Said before the bio, because "this is not a person" changes how you
            read everything under it.

            It does NOT say "a Rankd house account", which was the wording while
            the account had a name of its own. The account is called rankd, so
            that read as "rankd, a Rankd house account". This says what it holds
            instead of restating whose it is. */}
        {profile.house && (
          <span className="mt-2 text-label font-extrabold tracking-[0.16em] text-dim">
            THE HOUSE RANKING
          </span>
        )}

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
          {summary.genre && <GenreCard genre={summary.genre} film={summary.genreFilm} />}

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
      </div>

      <footer className="mt-12 px-6 text-center">
        <div className="rule-fade mb-5" />
        <p className="text-label leading-snug text-dim">
          Ranked on Rankd. Film data and artwork from TMDb, which has not endorsed this.
        </p>
        <p className="mt-2 text-label leading-snug text-dim">© Jarrad Bishop</p>
      </footer>
    </main>
  );
}
