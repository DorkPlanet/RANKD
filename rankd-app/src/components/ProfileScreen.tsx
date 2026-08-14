"use client";

// Whose library this is.
//
// The list enumerates; this characterises. A grid of your top posters here would
// just be the list view with different margins — so the body of this screen is
// what kind of viewer you are: the tier you live in, the genre you keep coming
// back to, the decade you can't leave, how hard you are to please. Those are the
// only things the profile can say that the ranking can't.
//
// The banner is a frame from a scene rather than a poster, because posters are
// the library's currency and one more of them at the top of your own profile
// goes stale. There's no circular avatar straddling a cover either — that shape
// belongs to every social network, and this isn't one.

import { useEffect, useMemo, useState } from "react";
import { BottomNav, Header, tierCounts } from "./DuelScreen";
import { SpotlightPicker } from "./SpotlightPicker";
import { rankedFilms } from "@/lib/ladder";
import { isPlaced } from "@/lib/lock";
import { buildList } from "@/lib/list";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import Sheet from "./Sheet";
import { autoCollections, fingerprint, superlatives, topPeople, type Profile } from "@/lib/profile";
import { achievements } from "@/lib/achievements";
import { agoLabel, recapLine, type VisitDelta } from "@/lib/visit";
import type { Film } from "@/lib/types";

interface Collection {
  title: string;
  blurb: string;
  films: Film[];
  numbered?: boolean;
}

export default function ProfileScreen({
  films,
  profile,
  recap,
  onProfile,
  onInfo,
  onSettings,
  onDuel,
  onList,
  onTrophies,
  onAddFilm,
}: {
  films: Film[];
  profile: Profile;
  /** What the previous sitting amounted to, or null when there is nothing to say. */
  recap?: VisitDelta | null;
  onProfile: (p: Profile) => void;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onList: () => void;
  onTrophies: () => void;
  onAddFilm: (film: Film) => void;
}) {
  const [open, setOpen] = useState<Collection | null>(null);
  const [editing, setEditing] = useState(false);
  const [pickingFilm, setPickingFilm] = useState(false);
  const [stillsFor, setStillsFor] = useState<Film | null>(null);

  const ranked = useMemo(() => rankedFilms(films), [films]);
  const model = useMemo(() => buildList(films), [films]);
  const counts = useMemo(() => tierCounts(films), [films]);
  const people = useMemo(() => topPeople(films), [films]);
  const print = useMemo(() => fingerprint(films), [films]);
  const facts = useMemo(() => superlatives(films), [films]);
  const autos = useMemo(() => autoCollections(ranked, print, people), [ranked, print, people]);
  const badges = useMemo(() => achievements(films), [films]);
  const earned = badges.filter((b) => b.got).length;

  const placed = useMemo(() => ranked.filter(isPlaced), [ranked]);
  const hero = placed[0];
  const topTen = placed.slice(0, 10);
  const bannerFilm = films.find((f) => f.id === profile.bannerFilmId) ?? hero;

  // With no banner chosen, borrow a frame from your number one. Fetched once and
  // never stored on the profile, so choosing your own always wins.
  const [fallback, setFallback] = useState<string | undefined>();
  useEffect(() => {
    if (profile.bannerStill || !hero) return;
    let dead = false;
    fetch(`/api/stills?title=${encodeURIComponent(hero.title)}&year=${hero.year ?? ""}`)
      .then((r) => r.json())
      .then((d) => !dead && setFallback(d?.stills?.[0]))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [profile.bannerStill, hero]);

  const banner = profile.bannerStill ?? fallback;

  const filmsOf = (name: string, isDirector: boolean) =>
    ranked.filter((f) => (isDirector ? f.director === name : f.cast?.includes(name)));

  const tiers = ORDERED_TIERS.map((t) => ({
    tier: t,
    total: counts.get(t) ?? 0,
    placed: model.sections.find((s) => s.tier === t)?.placed.length ?? 0,
  })).filter((t) => t.total > 0);
  const widest = Math.max(1, ...tiers.map((t) => t.total));

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* 16/9 is a TMDb backdrop's native shape. Forcing one into a shorter
            box and letting object-cover crop it threw away 40% of the frame —
            which rather defeats choosing a particular scene. */}
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          {banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: "var(--surface)" }} />
          )}
          {/* Fades into the page so the name below emerges from the scene rather
              than sitting on a photograph. */}
          <div className="banner-fade absolute inset-0" />
          <button
            onClick={() => setPickingFilm(true)}
            className="absolute bottom-2 right-4 rounded-full border border-border px-2.5 py-1 text-[10px] text-dim active:scale-95"
            style={{ background: "color-mix(in srgb, var(--bg) 70%, transparent)" }}
          >
            {bannerFilm ? "Change scene" : "Pick a scene"}
          </button>
        </div>

        {/* The name card. Its own block, held apart from the details below by a
            rule that fades out at both ends — so the top of the screen reads as
            "this is who you are" and everything under it as evidence. Avatar
            sits beside the name rather than straddling the banner: that overlap
            is every social network's signature, and it was also what made the
            circle look clipped. */}
        <div className="mt-5 px-6">
          <div className="flex items-center gap-3">
            <span
              className="flex flex-shrink-0 items-center justify-center rounded-full font-display text-[26px] text-gold"
              style={{ width: 58, height: 58, background: "var(--surface)", boxShadow: "0 0 0 1.5px var(--border)" }}
            >
              {profile.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-1.5">
                <span className="min-w-0 flex-1 truncate font-display text-[26px] leading-none tracking-wide text-gold">
                  {profile.name}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  aria-label="Edit your name and bio"
                  className="mt-[1px] flex-shrink-0 text-dim active:scale-90"
                >
                  <PencilIcon />
                </button>
              </span>
              <span className="mt-1 block font-serif text-[12px] italic leading-snug text-dim">
                {profile.bio || "Add a line about your taste"}
              </span>
            </span>
          </div>

          <div className="mt-4 flex gap-7">
            <Stat n={model.total} label="Films" onClick={onList} />
            <Stat n={model.placedCount} label="Settled" onClick={onList} />
            <Stat n={print.duels} label="Duels" onClick={onDuel} />
            <Stat n={earned} label="Badges" onClick={onTrophies} />
          </div>

          {/* What the last sitting amounted to.

              The four stats above are cumulative and therefore never move
              visibly — 861 films and 1,204 duels look identical the day after
              a good session. This is the one line on the screen that is about
              a particular afternoon, so it sits directly under them, in the
              same label/value/note grammar `Your taste` uses. No new furniture:
              the app was told once already that a number in an existing control
              beats a chart. */}
          {recap && (
            <div className="mt-4">
              <Line label="Last time" value={recapLine(recap)} note={agoLabel(recap.since)} />
            </div>
          )}

          <div className="card-rule mt-5" />

          {/* Who you are, in four lines that the ranking can't tell you. */}
          <Section title="Your taste">
            <div className="space-y-1.5">
              {print.homeTier !== undefined && (
                <Line label="You live at" value={starsFor(print.homeTier)} gold />
              )}
              {print.genre && <Line label="You keep returning to" value={print.genre.name} note={`${print.genre.count} films`} />}
              {people.subgenre && (
                <Line label="More precisely" value={people.subgenre.name} note={`${people.subgenre.count} films`} />
              )}
              {print.decade && <Line label="Your decade" value={print.decade.label} note={`${print.decade.count} films`} />}
              {print.generosity && (
                <Line
                  label="As a rater you're"
                  value={print.generosity.label}
                  note={`${print.generosity.mean.toFixed(2)}★ average`}
                />
              )}
            </div>
            {!print.genre && (
              <p className="mt-2 text-[10px] leading-snug text-dim">
                Genres arrive with artwork — browse your list and this sharpens up.
              </p>
            )}
          </Section>

          {facts.length > 0 && (
            <Section title="Odds and ends">
              <div className="grid grid-cols-2 gap-2">
                {facts.map((f) => (
                  <div key={f.label} className="rounded-xl border border-border px-3 py-2.5">
                    <span className="block text-[9px] font-extrabold tracking-[0.16em] text-dim">
                      {f.label.toUpperCase()}
                    </span>
                    <span className="mt-1 block truncate text-[13px] text-text-hi">{f.value}</span>
                    {f.note && <span className="block text-[10px] text-gold">{f.note}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(people.director || people.actors.length > 0) && (
            <Section title="Your highest rated">
              {people.director && (
                <div className="mb-2 flex">
                  <PersonCard
                    role="Director"
                    p={people.director}
                    onClick={() =>
                      setOpen({
                        title: people.director!.name,
                        blurb: "Every film of theirs in your library, best first.",
                        films: filmsOf(people.director!.name, true),
                      })
                    }
                  />
                </div>
              )}
              {/* Four, not one — a single actor says almost nothing about taste,
                  and the fourth name is usually the interesting one. */}
              <div className="grid grid-cols-2 gap-2">
                {people.actors.map((a) => (
                  <PersonCard
                    key={a.name}
                    role="Actor"
                    p={a}
                    onClick={() =>
                      setOpen({
                        title: a.name,
                        blurb: "Every film of theirs in your library, best first.",
                        films: filmsOf(a.name, false),
                      })
                    }
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Collections scroll sideways so user-made lists can join them without
            the screen growing another full-width block each time. */}
        {hero && (
          <section className="mt-7">
            <div className="mb-2.5 px-6 text-[10px] font-extrabold tracking-[0.18em] text-dim">COLLECTIONS</div>
            <div className="flex gap-2.5 overflow-x-auto px-6 pb-1">
              <MiniCard
                film={hero}
                eyebrow="#1"
                title={hero.title}
                sub={[hero.year, hero.director].filter(Boolean).join(" · ")}
                onClick={() => onInfo(hero)}
              />
              <MiniCard
                film={topTen[1] ?? hero}
                eyebrow="RANKED"
                title="Top ten"
                sub={`${topTen.length} films`}
                onClick={() =>
                  setOpen({
                    title: "Your top ten",
                    blurb: "The highest films in your ranking, in order.",
                    films: topTen,
                    numbered: true,
                  })
                }
              />
              {/* Everything else in this row is derived, not curated — which is
                  exactly the shape user-made lists will take when they land. */}
              {autos.map((c) => (
                <MiniCard
                  key={c.title}
                  film={c.films[0]}
                  eyebrow="YOURS"
                  title={c.title}
                  sub={`${c.films.length} films`}
                  onClick={() => setOpen({ ...c, numbered: true })}
                />
              ))}
            </div>
          </section>
        )}

        {/* One chart doing two jobs. The bar's length is how many films are in
            the tier — the shape of your taste — and the solid part is how many
            you've settled. Two separate charts of the same ten tiers was one
            chart too many, and no other app can draw this one because no other
            app knows the difference between owning a film and placing it. */}
        <div className="px-6">
          <Section title="Your tiers">
            <div className="space-y-2">
              {tiers.map((t) => (
                <button key={t.tier} onClick={onList} className="flex w-full items-center gap-3 active:scale-[0.99]">
                  <span className="w-[46px] flex-shrink-0 text-left text-[11px] text-gold">
                    {starsFor(t.tier as Rating)}
                  </span>
                  <span className="flex h-3 flex-1 items-center">
                    <span
                      className="flex h-full overflow-hidden rounded-sm"
                      style={{ width: `${(t.total / widest) * 100}%`, background: "var(--border)" }}
                    >
                      <span
                        className="h-full transition-[width] duration-500"
                        style={{ width: `${(t.placed / t.total) * 100}%`, background: "var(--gold)" }}
                      />
                    </span>
                  </span>
                  <span className="w-[58px] flex-shrink-0 text-right text-[10px] text-dim tabular-nums">
                    {t.placed}/{t.total}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-dim">
              Bar length is how many films you own at that rating. The gold is how many you&rsquo;ve settled.
            </p>
          </Section>
        </div>
      </div>

      <BottomNav screen="profile" onSettings={onSettings} onModes={onDuel} onList={onList} onProfile={() => {}} films={films} onAddFilm={onAddFilm} />

      {open && <CollectionSheet c={open} onInfo={onInfo} onClose={() => setOpen(null)} />}
      {editing && <EditIdentity profile={profile} onSave={onProfile} onClose={() => setEditing(false)} />}


      {pickingFilm && (
        <SpotlightPicker
          films={films}
          title="Pick a film"
          blurb="Then choose a frame from it for the top of your profile."
          onClose={() => setPickingFilm(false)}
          onPick={(id) => {
            setPickingFilm(false);
            setStillsFor(films.find((f) => f.id === id) ?? null);
          }}
        />
      )}

      {stillsFor && (
        <StillPicker
          film={stillsFor}
          onClose={() => setStillsFor(null)}
          onPick={(url) => {
            onProfile({ ...profile, bannerFilmId: stillsFor.id, bannerStill: url });
            setStillsFor(null);
          }}
        />
      )}
    </main>
  );
}

function StillPicker({
  film,
  onClose,
  onPick,
}: {
  film: Film;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [stills, setStills] = useState<string[] | null>(null);

  useEffect(() => {
    let dead = false;
    fetch(`/api/stills?title=${encodeURIComponent(film.title)}&year=${film.year ?? ""}`)
      .then((r) => r.json())
      .then((d) => !dead && setStills(d?.stills ?? []))
      .catch(() => !dead && setStills([]));
    return () => {
      dead = true;
    };
  }, [film]);

  return (
    <Sheet title={film.title} onClose={onClose}>
      <p className="mb-3 text-[11px] leading-snug text-dim">Choose a frame for the top of your profile.</p>
      {stills === null && <p className="text-[11px] text-dim">Finding frames…</p>}
      {stills?.length === 0 && (
        <p className="text-[11px] leading-snug text-dim">
          TMDb has no frames for this one. Try another film.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(stills ?? []).map((s) => (
          <button key={s} onClick={() => onPick(s)} className="overflow-hidden rounded-lg active:scale-[0.97]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: "16/9" }} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function Line({ label, value, note, gold }: { label: string; value: string; note?: string; gold?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-shrink-0 text-[11px] text-dim">{label}</span>
      <span className={`min-w-0 truncate text-[15px] ${gold ? "text-gold" : "text-text-hi"}`}>{value}</span>
      {note && <span className="ml-auto flex-shrink-0 text-[10px] text-dim">{note}</span>}
    </div>
  );
}

// Narrow enough that several sit side by side and you can tell there are more.
function MiniCard({
  film,
  eyebrow,
  title,
  sub,
  onClick,
}: {
  film?: Film;
  eyebrow: string;
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flagship w-[172px] flex-shrink-0 text-left active:scale-[0.98]">
      {film?.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={film.poster}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40"
          style={{ objectPosition: "center 20%" }}
        />
      )}
      <span className="flagship-wash" />
      <span className="relative block p-3">
        <span className="block text-[8px] font-extrabold tracking-[0.2em] text-dim">{eyebrow}</span>
        <span className="mt-1 block truncate font-display text-[19px] leading-tight tracking-wide text-text-hi">
          {title}
        </span>
        {sub && <span className="mt-0.5 block truncate text-[10px] text-dim">{sub}</span>}
      </span>
    </button>
  );
}

function CollectionSheet({
  c,
  onInfo,
  onClose,
}: {
  c: Collection;
  onInfo: (f: Film) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="sheet-in flex max-h-[82vh] w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 flex-shrink-0 rounded-full bg-border" />
        <div className="mb-1 flex flex-shrink-0 items-baseline justify-between">
          <span className="min-w-0 truncate font-display text-2xl tracking-wide text-gold">{c.title}</span>
          <button onClick={onClose} className="ml-3 flex-shrink-0 text-sm font-semibold text-dim active:scale-95">
            Done
          </button>
        </div>
        <p className="mb-3 flex-shrink-0 text-[11px] leading-snug text-dim">{c.blurb}</p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {c.films.map((f, i) => (
            <button
              key={f.id}
              onClick={() => onInfo(f)}
              className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
            >
              {c.numbered && (
                <span className="w-5 flex-shrink-0 text-right font-serif text-[15px] font-bold text-gold tabular-nums">
                  {i + 1}
                </span>
              )}
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.poster}
                  alt=""
                  loading="lazy"
                  style={{ width: 30, aspectRatio: "2/3", objectFit: "cover", borderRadius: 3 }}
                />
              ) : (
                <span
                  className="shrink-0"
                  style={{ width: 30, aspectRatio: "2/3", borderRadius: 3, background: "var(--border)" }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-hi">{f.title}</span>
                <span className="block text-[10px] text-dim">{f.year}</span>
              </span>
              <span className="flex-shrink-0 text-[11px] text-gold">{starsFor(f.rating)}</span>
            </button>
          ))}
          {c.films.length === 0 && <p className="text-[11px] text-dim">Nothing in here yet.</p>}
        </div>
      </div>
    </div>
  );
}

function PersonCard({
  role,
  p,
  onClick,
}: {
  role: string;
  p: { name: string; count: number; avg: number };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5 text-left active:scale-[0.98]"
    >
      <span className="block text-[9px] font-extrabold tracking-[0.16em] text-dim">{role.toUpperCase()}</span>
      <span className="mt-1 block truncate text-sm text-text-hi">{p.name}</span>
      <span className="block text-[10px] text-gold">
        {p.avg.toFixed(1)}★ across {p.count}
      </span>
    </button>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left active:scale-95">
      <span className="block font-serif text-lg font-bold text-text-hi tabular-nums">{n}</span>
      <span className="block text-[9px] font-extrabold tracking-[0.14em] text-dim">{label.toUpperCase()}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 text-[10px] font-extrabold tracking-[0.18em] text-dim">{title.toUpperCase()}</div>
      {children}
    </section>
  );
}

function EditIdentity({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="sheet-in w-full max-w-md rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <span className="mb-4 block font-display text-2xl tracking-wide text-gold">You</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="Your name"
          className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
        />
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={120}
          rows={2}
          placeholder="A line about your taste"
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
        />
        <p className="mt-3 text-[10px] leading-snug text-dim">
          A profile picture arrives with accounts. Until then it&rsquo;s your initial.
        </p>
        <button
          onClick={() => {
            onSave({ ...profile, name: name.trim() || "You", bio: bio.trim() });
            onClose();
          }}
          className="mt-3 w-full rounded-full bg-gold py-3 text-sm font-bold text-[#1c1405] active:scale-[0.99]"
        >
          Save
        </button>
      </div>
    </div>
  );
}
