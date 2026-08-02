"use client";

// Whose library this is — built out of the ranking, not out of a social
// profile.
//
// There is no avatar over a banner and no row labelled Favourites, because that
// shape belongs to every social network and says nothing about a ranking app.
// What Rankd owns is a film you've decided is your best, collections that fall
// out of that order, and ten tiers in progress.
//
// One idea does the work here: a CARD stands for a collection of films, and
// opening it shows them. Your number one is a collection of one. Your top ten is
// a collection of ten. A director is every film of theirs you own. When
// user-made lists arrive — fav slashers, fav sci-fi — they become more cards in
// the same row and cost nothing new to display.

import { useMemo, useState } from "react";
import { BottomNav, Header, tierCounts } from "./DuelScreen";
import { rankedFilms } from "@/lib/ladder";
import { buildList } from "@/lib/list";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import { topPeople, type Profile } from "@/lib/profile";
import type { Film } from "@/lib/types";

// A collection is a title, a line about it, and films — nothing else. Every
// opener on this screen produces one of these.
interface Collection {
  title: string;
  blurb: string;
  films: Film[];
  numbered?: boolean; // ranked collections count from 1; a filmography doesn't
}

export default function ProfileScreen({
  films,
  profile,
  onProfile,
  onInfo,
  onSettings,
  onDuel,
  onList,
}: {
  films: Film[];
  profile: Profile;
  onProfile: (p: Profile) => void;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onList: () => void;
}) {
  const [open, setOpen] = useState<Collection | null>(null);
  const [editing, setEditing] = useState(false);

  const ranked = useMemo(() => rankedFilms(films), [films]);
  const model = useMemo(() => buildList(films), [films]);
  const counts = useMemo(() => tierCounts(films), [films]);
  const people = useMemo(() => topPeople(films), [films]);

  const placed = useMemo(() => ranked.filter((f) => f.confirmed), [ranked]);
  const hero = placed[0];
  const topTen = placed.slice(0, 10);

  const filmsOf = (name: string, isDirector: boolean) =>
    ranked.filter((f) => (isDirector ? f.director === name : f.cast?.includes(name)));

  const progress = ORDERED_TIERS.map((t) => {
    const total = counts.get(t) ?? 0;
    return { tier: t, total, placed: model.sections.find((s) => s.tier === t)?.placed.length ?? 0 };
  }).filter((p) => p.total > 0);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <button onClick={() => setEditing(true)} className="mt-5 block w-full text-left active:scale-[0.99]">
          <span className="block font-display text-[30px] leading-none tracking-wide text-gold">
            {profile.name}
          </span>
          <span className="mt-1.5 block font-serif text-[13px] italic leading-snug text-dim">
            {profile.bio || "Add a line about your taste"}
          </span>
        </button>

        <div className="mt-4 flex gap-7">
          <Stat n={model.total} label="Films" onClick={onList} />
          <Stat n={model.placedCount} label="Settled" onClick={onList} />
          <Stat n={progress.length} label="Tiers" onClick={onList} />
        </div>

        {hero ? (
          <>
            <Section title="Your number one">
              <FilmCard
                film={hero}
                eyebrow="THE BEST FILM YOU OWN"
                title={hero.title}
                sub={[hero.year, hero.director].filter(Boolean).join(" · ")}
                badge="1"
                onClick={() => onInfo(hero)}
              />
            </Section>

            <Section title="Collections">
              {/* Backed by the SECOND film, not the first — the hero above is
                  already wearing the number one's artwork, and two identical
                  washes stacked read as one card rendered twice. */}
              <FilmCard
                film={topTen[1] ?? topTen[0]}
                stack={topTen.slice(2, 5)}
                eyebrow="RANKED"
                title="Your top ten"
                sub={`${topTen.length} film${topTen.length === 1 ? "" : "s"}`}
                onClick={() =>
                  setOpen({
                    title: "Your top ten",
                    blurb: "The highest films in your ranking, in order.",
                    films: topTen,
                    numbered: true,
                  })
                }
              />
            </Section>
          </>
        ) : (
          <Section title="Your number one">
            <p className="text-[11px] leading-snug text-dim">
              Nothing settled yet. Play a tier and your best film takes this place.
            </p>
          </Section>
        )}

        <Section title="Your highest rated">
          {people.director || people.actor ? (
            <div className="flex gap-2.5">
              {people.director && (
                <PersonCard
                  role="Director"
                  p={people.director}
                  onClick={() =>
                    setOpen({
                      title: people.director!.name,
                      blurb: `Every film of theirs in your library, best first.`,
                      films: filmsOf(people.director!.name, true),
                    })
                  }
                />
              )}
              {people.actor && (
                <PersonCard
                  role="Actor"
                  p={people.actor}
                  onClick={() =>
                    setOpen({
                      title: people.actor!.name,
                      blurb: `Every film of theirs in your library, best first.`,
                      films: filmsOf(people.actor!.name, false),
                    })
                  }
                />
              )}
            </div>
          ) : (
            <p className="text-[11px] leading-snug text-dim">
              Nobody with two films yet. Credits arrive with artwork — browse your list and this fills in.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-snug text-dim">
            From the{" "}
            <span className="text-text-hi">
              {people.coverage} of {model.total}
            </span>{" "}
            films that know their credits.
          </p>
        </Section>

        <Section title="How far through">
          <div className="space-y-2">
            {progress.map((p) => (
              <button key={p.tier} onClick={onList} className="flex w-full items-center gap-3 active:scale-[0.99]">
                <span className="w-[46px] flex-shrink-0 text-left text-[11px] text-gold">
                  {starsFor(p.tier as Rating)}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(p.placed / p.total) * 100}%`, background: "var(--gold)" }}
                  />
                </span>
                <span className="w-[54px] flex-shrink-0 text-right text-[10px] text-dim tabular-nums">
                  {p.placed}/{p.total}
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>

      <BottomNav screen="profile" onSettings={onSettings} onModes={onDuel} onList={onList} onProfile={() => {}} />

      {open && <CollectionSheet c={open} onInfo={onInfo} onClose={() => setOpen(null)} />}
      {editing && <EditIdentity profile={profile} onSave={onProfile} onClose={() => setEditing(false)} />}
    </main>
  );
}

// The card. Its own artwork washes across it, so a collection is recognisable by
// the films in it rather than by a label — and a stack of small posters at the
// right says "there's more in here" without needing to spell it out.
function FilmCard({
  film,
  stack,
  eyebrow,
  title,
  sub,
  badge,
  onClick,
}: {
  film?: Film;
  stack?: Film[];
  eyebrow: string;
  title: string;
  sub?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flagship flex w-full items-stretch active:scale-[0.99]">
      {film?.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={film.poster}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40"
          style={{ objectPosition: "center 22%" }}
        />
      )}
      <span className="flagship-wash" />

      <span className="relative flex-shrink-0 p-3">
        {film?.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.poster}
            alt=""
            className="block rounded-md object-cover"
            style={{ width: 66, height: 99, boxShadow: "0 6px 18px rgba(0,0,0,0.7)" }}
          />
        ) : (
          <span className="block rounded-md" style={{ width: 66, height: 99, background: "var(--border)" }} />
        )}
      </span>

      <span className="relative flex min-w-0 flex-1 flex-col justify-center py-3 pr-2 text-left">
        <span className="block text-[9px] font-extrabold tracking-[0.2em] text-dim">{eyebrow}</span>
        <span className="mt-1 block truncate font-display text-[24px] leading-none tracking-wide text-text-hi">
          {title}
        </span>
        {sub && <span className="mt-1.5 block truncate text-[11px] text-dim">{sub}</span>}
      </span>

      {badge && (
        <span className="relative self-center pr-4 font-serif text-[40px] font-bold leading-none text-gold">
          {badge}
        </span>
      )}

      {stack && stack.length > 0 && (
        <span className="relative flex items-center gap-[3px] self-center pr-3">
          {stack.map((f) => (
            <span key={f.id} className="block overflow-hidden rounded-sm" style={{ width: 17, height: 26 }}>
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.poster} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full" style={{ background: "var(--border)" }} />
              )}
            </span>
          ))}
        </span>
      )}
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
                <span className="shrink-0" style={{ width: 30, aspectRatio: "2/3", borderRadius: 3, background: "var(--border)" }} />
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
      <span className="block font-serif text-xl font-bold text-text-hi tabular-nums">{n}</span>
      <span className="block text-[10px] font-extrabold tracking-[0.14em] text-dim">{label.toUpperCase()}</span>
    </button>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[10px] font-extrabold tracking-[0.18em] text-dim">{title.toUpperCase()}</span>
        {action && (
          <button onClick={onAction} className="text-[10px] text-gold active:scale-95">
            {action}
          </button>
        )}
      </div>
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
