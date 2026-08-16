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
import { FilmPicker } from "./FilmPicker";
import { rankedFilms } from "@/lib/ladder";
import { isPlaced } from "@/lib/lock";
import { buildList } from "@/lib/list";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import Sheet from "./Sheet";
import { autoCollections, avatarOf, fingerprint, MAX_PINNED, superlatives, topPeople, type Profile } from "@/lib/profile";
import { fetchAccount } from "@/lib/account";
import { AvatarCropper } from "./AvatarCropper";
import { loadLists, subjectOf, type SavedList } from "@/lib/lists";
import SavedListSheet from "./SavedListSheet";
import LiveCardSheet from "./LiveCardSheet";
import { liveViews } from "@/lib/card/live";
import { subjectEyebrow, subjectKey, subjectTitle, type RankSubject } from "@/lib/subject";
import { achievements } from "@/lib/achievements";
import { agoLabel, recapLine, type VisitDelta } from "@/lib/visit";
import type { Film } from "@/lib/types";

/**
 * What a chosen frame is going to become.
 *
 * The banner and the avatar are the same two-step pick — a film, then a frame
 * from it — differing only in where the URL lands and what shape it is shown
 * in. Carried through the flow rather than inferred at the end, so the picker
 * can be honest about the crop while you are still choosing.
 */
type StillTarget = "banner" | "avatar";

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
  logging,
  onToggleLog,
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
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
}) {
  const [open, setOpen] = useState<Collection | null>(null);
  const [editing, setEditing] = useState(false);
  // ── One film-picking flow, two things it can be picking FOR ────────────────
  //
  // The banner has always been "pick a film, then pick a frame from it". The
  // avatar now borrows the same two steps rather than growing its own, so the
  // target rides along instead of being inferred from which state happens to be
  // set. Two booleans would have made "picking a banner AND an avatar" a state
  // the type allowed.
  const [pickingFor, setPickingFor] = useState<StillTarget | null>(null);
  const [stillsFor, setStillsFor] = useState<{ film: Film; target: StillTarget } | null>(null);
  const [avatarMenu, setAvatarMenu] = useState(false);
  // The photo waiting to be cropped. Picking one does not upload it — see
  // `AvatarCropper` for why centre-cropping on the user's behalf was wrong.
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [openList, setOpenList] = useState<SavedList | null>(null);
  // Whether the shelf's card shortcut was what opened it. Separate from
  // `openList` so closing the card still leaves the list behind it.
  const [openOnCard, setOpenOnCard] = useState(false);
  // A live view — the overall top ten, or one tier's. Not a saved list and it
  // never becomes one; see `lib/card/live.ts`.
  const [openLive, setOpenLive] = useState<RankSubject | null>(null);
  // Read once per mount and re-read whenever one is saved, pinned or deleted.
  // A counter rather than storing the lists themselves, so the source of truth
  // stays localStorage and nothing here can drift from it.
  const [listsRead, setListsRead] = useState(0);
  const savedLists = useMemo(() => loadLists(), [listsRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // The signed-in account, for its photo and to know whether uploading is even
  // offered. Null covers signed out, offline, and a deployment with no auth
  // configured — all three mean the same thing here: no account picture.
  const [accountImage, setAccountImage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let dead = false;
    void fetchAccount().then((a) => {
      if (dead || !a) return;
      setSignedIn(true);
      setAccountImage(a.image ?? null);
    });
    return () => {
      dead = true;
    };
  }, []);

  // What the master list already says, ready to be looked at. Recomputed from
  // the library rather than stored, which is the entire distinction between
  // these and the saved shelf below.
  const live = useMemo(() => liveViews(films), [films]);

  // Memoised so the `?? []` fallback is not a fresh array every render, which
  // would make the shelf below recompute on every keystroke in the bio field.
  const pinnedIds = useMemo(() => profile.pinnedListIds ?? [], [profile.pinnedListIds]);
  // Pinned first, then the rest, each with its number one for the artwork. A
  // pin naming a list that has since been deleted simply does not match
  // anything here, which is why deleting never has to tidy up after itself.
  const shelf = useMemo(() => {
    const byId = new Map(films.map((f) => [f.id, f]));
    const decorate = (list: SavedList) => ({
      list,
      pinned: pinnedIds.includes(list.id),
      top: list.entries[0] ? byId.get(list.entries[0].id) : undefined,
    });
    const all = savedLists.map(decorate);
    return [...all.filter((x) => x.pinned), ...all.filter((x) => !x.pinned)];
  }, [savedLists, films, pinnedIds]);

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
    <main className="relative flex h-app flex-col overflow-hidden select-none">
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
            onClick={() => setPickingFor("banner")}
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
        <div className="px-6">
          {/* Centred, with the name and the line under it.
              Beside the name it was a bullet point: the eye went to the 26px
              gold type and the picture was something to its left. Stacked on
              the axis the whole screen already uses — the banner above it, the
              stat band below — it is the first thing you see, which is right
              for the one element on this screen that is actually YOU.

              ── The overlap ──────────────────────────────────────────────────
              This file used to argue against a circle straddling the cover, on
              the grounds that it is every social network's signature. Overruled
              deliberately, and the distinction that makes it work is HOW FAR:
              the classic version sits half in and half out, which is the shape
              being avoided. A quarter is a different thing — the picture reads
              as tucked under the banner's lower edge rather than pinned to it.

              The other half of the old objection was that the circle looked
              clipped. That was a missing ring, not the overlap: the double ring
              below cuts it out of the page, so its own edge is what ends the
              banner rather than the banner ending mid-circle. */}
          <div className="flex flex-col items-center text-center">
            <span className="relative z-10 -mt-[26px]">
              <AvatarSlot
                profile={profile}
                accountImage={accountImage}
                onOpen={() => setAvatarMenu(true)}
              />
            </span>
            {/* The pencil sits after the name rather than pinned to the right
                edge. Centred text with a control anchored to one side reads as
                lopsided — and pushed the name itself off the true centre, which
                is the one thing this layout exists to fix. */}
            <span className="mt-3 flex max-w-full items-start gap-1.5">
              <span className="min-w-0 truncate font-display text-[26px] leading-none tracking-wide text-gold">
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
            <span className="mt-1.5 block max-w-[280px] font-serif text-[12px] italic leading-snug text-dim">
              {profile.bio || "Add a line about your taste"}
            </span>
          </div>

          {/* ── WHERE YOU ARE ───────────────────────────────────────────────
              The stats, the recap and the way back into the game, as ONE band
              rather than three things that happened to be adjacent.

              They belong together because they answer one question — how far
              along am I — and they were previously split by a rule that implied
              the recap was the start of a new subject. The four counters are
              cumulative and therefore never visibly move; the recap is the only
              line on the screen about a particular afternoon; the button is what
              you do about either. Read as a unit they say something. Read as
              three they were a header, an orphan line, and no exit at all. */}
          <div className="mt-4 rounded-2xl border border-border px-4 py-3.5">
            <div className="flex gap-7">
              <Stat n={model.total} label="Films" onClick={onList} />
              <Stat n={model.placedCount} label="Settled" onClick={onList} />
              <Stat n={print.duels} label="Duels" onClick={onDuel} />
              <Stat n={earned} label="Badges" onClick={onTrophies} />
            </div>

            {recap && (
              <div className="mt-3.5 border-t border-border pt-3">
                <Line label="Last time" value={recapLine(recap)} note={agoLabel(recap.since)} />
              </div>
            )}

            {/* A gold "start ranking" button lived here and was cut on sight.
                The nav's RNK cell already does this from every screen, and a
                second, louder route to the same place made the profile look
                like it was selling the game back to you. The Duels counter
                above is still a link into it for anyone who wants one. */}
          </div>

          {/* ── WHAT YOU LIKE ───────────────────────────────────────────────
              The thesis. Three blocks that were peers of everything else on the
              screen — the fingerprint, the odds and ends, the people — now sit
              under one heading, because they are one argument made three ways
              and the page never said so. */}
          <Zone title="What you like" />

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
                        blurb: "Every film of theirs in your library, your favourite first.",
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
                        blurb: "Every film of theirs in your library, your favourite first.",
                        films: filmsOf(a.name, false),
                      })
                    }
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── WHAT YOU'VE MADE ─────────────────────────────────────────────
            Both shelves under one heading. They are the same kind of object —
            a set of films with a name — and the only difference is whether the
            app derived it or you sat through the duels for it. That distinction
            is already carried by each card's eyebrow, so it does not also need
            two unrelated-looking headers. */}
        {(hero || savedLists.length > 0) && (
          <div className="px-6">
            <Zone title="What you've made" />
          </div>
        )}

        {/* Collections scroll sideways so user-made lists can join them without
            the screen growing another full-width block each time. */}
        {hero && (
          <section className="mt-4">
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

        {/* Rankings you made and kept.
            `saveList` has written these since the share cards landed and nothing
            ever read them back, so a ranking you sat through the duels for could
            be saved and never seen again. Pinned ones lead — that is what
            pinning is — and the rest follow, so this is both the shelf and the
            way to see everything at once. */}
        {/* ── What the list already says ──────────────────────────────────
            The app's whole output was write-only from here. Every duel feeds
            the master order, and the only way to LOOK at that order as a thing
            — let alone share it — was to finish a King of the Hill run and
            catch the card on the summary screen before dismissing it. Miss it
            and your top ten existed nowhere you could point at.

            These sit ABOVE the saved shelf on purpose. They are the answer the
            app is actually building; a saved ranking is a side quest off it.

            Nothing here can be saved or pinned, and the sheet says so. A frozen
            copy of a live view starts lying the moment you duel again. */}
        {live.length > 0 && (
          <section className="mt-5">
            <div className="mb-2.5 px-6 text-[10px] font-extrabold tracking-[0.18em] text-dim">
              STRAIGHT FROM YOUR LIST
            </div>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-6 pb-1">
              {live.map(({ subject, films: top }) => (
                <MiniCard
                  key={subjectKey(subject)}
                  film={top[0]}
                  eyebrow={subjectEyebrow(subject).toUpperCase()}
                  title={subjectTitle(subject)}
                  sub={`${top.length} film${top.length === 1 ? "" : "s"}`}
                  onClick={() => setOpenLive(subject)}
                  // No card shortcut. The tile is already one tap from the
                  // designs, and the list underneath is the part a reader has
                  // never been shown — skipping it would hide the new thing to
                  // save a tap on the old one.
                />
              ))}
            </div>
          </section>
        )}

        {savedLists.length > 0 && (
          <section className="mt-5">
            <div className="mb-2.5 px-6 text-[10px] font-extrabold tracking-[0.18em] text-dim">
              YOUR RANKINGS
            </div>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-6 pb-1">
              {shelf.map(({ list, top, pinned }) => (
                <MiniCard
                  key={list.id}
                  film={top}
                  eyebrow={pinned ? "PINNED" : (list.source ?? "RANKING").toUpperCase()}
                  title={list.name}
                  sub={`${list.entries.length} films`}
                  onClick={() => {
                    setOpenOnCard(false);
                    setOpenList(list);
                  }}
                  // Only where a card can actually be drawn. `SavedListSheet`
                  // uses the same two conditions — a subject to be OF, and two
                  // films to compare — and offering the shortcut on a tile that
                  // cannot honour it would be worse than not offering it.
                  onCard={
                    subjectOf(list) && list.entries.length >= 2
                      ? () => {
                          setOpenOnCard(true);
                          setOpenList(list);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* ── THE TROPHY CASE ──────────────────────────────────────────────
            Badges lived behind the trophy in the header and nowhere else, so
            the profile counted them in a stat tile and then never showed you
            one. A number is a score; the badges themselves are the thing worth
            looking at, and this is the screen for looking at what your library
            amounts to.

            Earned only. The full list including everything still to do is what
            the sheet is for — putting the locked ones here would turn a shelf of
            what you have done into a chore list, on the one screen that exists
            to say what you have done.

            All of them still carry the same star mark; bespoke icons are in
            POTENTIAL-FEATURES.md. */}
        {earned > 0 && (
          <section className="mt-5">
            <button
              onClick={onTrophies}
              className="mb-2.5 flex w-full items-baseline justify-between px-6 text-left active:scale-[0.99]"
            >
              {/* Not "BADGES". The counter band at the top of this screen
                  already carries that word, and two headings with the same
                  label on one page make the reader check whether they are
                  looking at the same thing twice. */}
              <span className="text-[10px] font-extrabold tracking-[0.18em] text-dim">TROPHY CASE</span>
              <span className="text-[10px] text-dim tabular-nums">
                {earned} of {badges.length} ›
              </span>
            </button>
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-1">
              {badges
                .filter((b) => b.got)
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={onTrophies}
                    className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 active:scale-[0.98]"
                  >
                    <span className="text-[13px] text-gold">★</span>
                    <span className="whitespace-nowrap text-[11px] text-text-hi">{b.name}</span>
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* ── THE LEDGER ───────────────────────────────────────────────────
            Last, and deliberately. This is the most detailed thing on the page
            and the least likely to be why anyone opened it — so it is what you
            arrive at by scrolling to the end, not what you wade through.

            One chart doing two jobs. The bar's length is how many films are in
            the tier — the shape of your taste — and the solid part is how many
            you've settled. Two separate charts of the same ten tiers was one
            chart too many, and no other app can draw this one because no other
            app knows the difference between owning a film and placing it. */}
        <div className="px-6">
          <Zone title="Where it stands" />
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

      <BottomNav screen="profile" onSettings={onSettings} onModes={onDuel} onList={onList} onProfile={() => {}} logging={logging} onToggleLog={onToggleLog} />

      {/* Closes itself on the way through. `onInfo` opens a film card in
          `AppShell`, which renders over this sheet rather than inside it, so
          passing the handler straight through left two stacked panels and a
          reader who had to dismiss them one at a time. One overlay at a time is
          the rule everywhere; a screen handing off to the shell is where it was
          being quietly broken. */}
      {open && (
        <CollectionSheet
          c={open}
          onInfo={(f) => {
            setOpen(null);
            onInfo(f);
          }}
          onClose={() => setOpen(null)}
        />
      )}

      {openList && (
        <SavedListSheet
          list={openList}
          films={films}
          pinned={pinnedIds.includes(openList.id)}
          canPin={pinnedIds.length < MAX_PINNED}
          onPin={(pin) => {
            // Newest pin last, and the cap is enforced here rather than trusted
            // to the button being disabled — the profile is what the rule is
            // about, so the rule lives where the profile is written.
            const next = pin
              ? [...pinnedIds.filter((id) => id !== openList.id), openList.id].slice(-MAX_PINNED)
              : pinnedIds.filter((id) => id !== openList.id);
            onProfile({ ...profile, pinnedListIds: next });
          }}
          startOnCard={openOnCard}
          onClose={() => setOpenList(null)}
          onDeleted={() => {
            setOpenList(null);
            setListsRead((n) => n + 1);
          }}
        />
      )}
      {/* Closes itself before handing off to the shell's film card, for the same
          reason `CollectionSheet` does. One overlay at a time. */}
      {openLive && (
        <LiveCardSheet
          subject={openLive}
          films={films}
          onInfo={(f) => {
            setOpenLive(null);
            onInfo(f);
          }}
          onClose={() => setOpenLive(null)}
        />
      )}

      {editing && <EditIdentity profile={profile} onSave={onProfile} onClose={() => setEditing(false)} />}


      {avatarMenu && (
        <AvatarMenu
          profile={profile}
          signedIn={signedIn}
          onClose={() => setAvatarMenu(false)}
          onPickFromFilms={() => {
            setAvatarMenu(false);
            setPickingFor("avatar");
          }}
          onUploadFile={(file) => {
            setAvatarMenu(false);
            setPendingAvatar(file);
          }}
          onRemove={() => {
            setAvatarMenu(false);
            // Deleted, not blanked. An empty string is still a value, and
            // absence is the state `avatarOf` reads as "fall back to the
            // account photo, then to the initial".
            const next = { ...profile };
            delete next.avatarUrl;
            onProfile(next);
          }}
        />
      )}

      {/* Errors and the busy state belong to the cropper: it is the thing on
          screen when either happens, and reporting an upload failure next to a
          small circle the user is no longer looking at helped nobody. */}
      {pendingAvatar && (
        <AvatarCropper
          file={pendingAvatar}
          onCancel={() => setPendingAvatar(null)}
          onUploaded={(url) => {
            setPendingAvatar(null);
            onProfile({ ...profile, avatarUrl: url });
          }}
        />
      )}

      {pickingFor && (
        <FilmPicker
          films={films}
          title="Pick a film"
          blurb={
            pickingFor === "banner"
              ? "Then choose a frame from it for the top of your profile."
              : "Then choose a frame from it for your picture."
          }
          onClose={() => setPickingFor(null)}
          onPick={(id) => {
            const film = films.find((f) => f.id === id);
            setPickingFor(null);
            setStillsFor(film ? { film, target: pickingFor } : null);
          }}
        />
      )}

      {stillsFor && (
        <StillPicker
          film={stillsFor.film}
          target={stillsFor.target}
          onClose={() => setStillsFor(null)}
          onPick={(url) => {
            // A frame costs a URL, exactly as the banner does, so this works
            // signed out and adds nothing to the server. `avatarUrl` is read
            // first by `avatarOf`, so choosing one also overrides the Google
            // picture for anyone who has both.
            onProfile(
              stillsFor.target === "banner"
                ? { ...profile, bannerFilmId: stillsFor.film.id, bannerStill: url }
                : { ...profile, avatarUrl: url },
            );
            setStillsFor(null);
          }}
        />
      )}
    </main>
  );
}

/**
 * The picture, and the ways to change it.
 *
 * ── Why this is no longer signed-in only ───────────────────────────────────
 *
 * It used to render a bare initial when signed out, on the reasoning that
 * uploads live behind auth (`api/avatar/route.ts`) and a button that can only
 * answer "sign in first" is the app asking for something it will not accept.
 * That reasoning was sound and the conclusion was too broad: it assumed a
 * picture must be an UPLOAD. A frame from a film you already own is a URL, the
 * same as `bannerStill`, so it costs no storage, needs no account, and keeps
 * the whole profile a few hundred bytes. Signed out, that is the whole menu.
 *
 * So tapping opens a chooser rather than a file dialog directly. A label
 * wrapping a hidden input is still how the upload option works — the same trick
 * `ImportButton` uses, because a styled button cannot open a file picker.
 *
 * The pencil badge is now always drawn, because there is now always something
 * to press.
 */
function AvatarSlot({
  profile,
  accountImage,
  onOpen,
}: {
  profile: Profile;
  accountImage: string | null;
  onOpen: () => void;
}) {
  // The file waiting to be cropped. Picking one no longer uploads it — see
  // `AvatarCropper` for why centre-cropping on the user's behalf was wrong.
  const avatar = avatarOf(profile, accountImage);
  // Big enough to be the face of the card rather than a bullet point beside the
  // name. Everything else here is derived from it so the badge and the fallback
  // initial keep their proportions. Stays under AVATAR_SIZE at 3× density, so
  // the uploaded 256px crop still has pixels to spare.
  const SIZE = 76;

  const face = (
    <span
      className="relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-gold"
      style={{
        width: SIZE,
        height: SIZE,
        fontSize: Math.round(SIZE * 0.45),
        background: "var(--surface)",
        // A double ring, not the old hairline. The circle now overlaps the
        // banner, and 1.5px against a photograph is not an edge — the artwork
        // reads straight through it and the picture looks clipped out of the
        // cover. The inner band is the page's own colour, so the circle is cut
        // OUT of the banner rather than laid on top of it.
        boxShadow: "0 0 0 3px var(--bg), 0 0 0 4.5px var(--border)",
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

  return (
    <button onClick={onOpen} aria-label="Change your picture" className="relative flex-shrink-0 active:scale-95">
      {face}
      <span
        aria-hidden
        className="absolute bottom-0 right-0 flex items-center justify-center rounded-full"
        style={{ width: 23, height: 23, background: "var(--gold)", boxShadow: "0 0 0 2px var(--bg)" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1c1405" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
    </button>
  );
}

/**
 * The menu behind the picture.
 *
 * Rendered by the screen rather than by `AvatarSlot`, alongside every other
 * sheet here. A `position: fixed` overlay nested inside the avatar would be
 * measured against any ancestor carrying a `transform` instead of against the
 * viewport — the same class of bug that had the Log drawer painting over the
 * bottom bar in Session K. Overlays belong at the top of a screen, not inside
 * the control that opens them.
 */
function AvatarMenu({
  profile,
  signedIn,
  onPickFromFilms,
  onUploadFile,
  onRemove,
  onClose,
}: {
  profile: Profile;
  signedIn: boolean;
  onPickFromFilms: () => void;
  onUploadFile: (file: File) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Your picture" onClose={onClose}>
      <p className="mb-4 text-[11px] leading-snug text-dim">
        {signedIn
          ? "A frame from one of your films, or a photo of your own."
          : "A frame from one of your films. Sign in if you would rather upload a photo."}
      </p>

      <button
        onClick={onPickFromFilms}
        className="mb-2 w-full rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99]"
      >
        <span className="block text-sm text-text-hi">Use a frame from a film</span>
        <span className="block text-[11px] leading-snug text-dim">
          Nothing is uploaded. Works whether or not you have an account.
        </span>
      </button>

      {/* Uploads stay behind auth: they are the only option here that needs
          somewhere to put a file. A label wrapping a hidden input is the same
          trick `ImportButton` uses, because a styled button cannot open a file
          picker. */}
      {signedIn && (
        <label className="mb-2 block w-full cursor-pointer rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99]">
          <span className="block text-sm text-text-hi">Upload a photo</span>
          <span className="block text-[11px] leading-snug text-dim">You choose the crop.</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset immediately, so choosing the same file twice fires again
              // — which matters more now that cancelling the cropper is a real
              // outcome and re-picking the same photo is the obvious retry.
              e.target.value = "";
              if (file) onUploadFile(file);
            }}
          />
        </label>
      )}

      {/* Only when there is something to undo. `avatarOf` falls back to the
          account photo and then to the initial, so removing never leaves an
          empty circle. */}
      {profile.avatarUrl && (
        <button
          onClick={onRemove}
          className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm text-dim active:scale-[0.99]"
        >
          Remove it
        </button>
      )}
    </Sheet>
  );
}

function StillPicker({
  film,
  target,
  onClose,
  onPick,
}: {
  film: Film;
  target: StillTarget;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [stills, setStills] = useState<string[] | null>(null);
  const forAvatar = target === "avatar";

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
      <p className="mb-3 text-[11px] leading-snug text-dim">
        {forAvatar
          ? "Choose a frame for your picture."
          : "Choose a frame for the top of your profile."}
      </p>
      {stills === null && <p className="text-[11px] text-dim">Finding frames…</p>}
      {stills?.length === 0 && (
        <p className="text-[11px] leading-snug text-dim">
          TMDb has no frames for this one. Try another film.
        </p>
      )}
      {/* Shown as circles when that is what they are about to become. A frame is
          16:9 and an avatar is a circle, so a wide thumbnail would be picked on
          the strength of a composition that gets cropped away — the same
          complaint that put a cropper in front of uploaded photos. There is no
          cropper here on purpose: these are stills the app chose from TMDb, not
          somebody's own photograph, so the centre is reliably the subject and a
          second decision would be ceremony. */}
      <div className={forAvatar ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-2"}>
        {(stills ?? []).map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className={`overflow-hidden active:scale-[0.97] ${forAvatar ? "rounded-full" : "rounded-lg"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s}
              alt=""
              loading="lazy"
              className="w-full object-cover"
              style={{ aspectRatio: forAvatar ? "1/1" : "16/9" }}
            />
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
  onCard,
}: {
  film?: Film;
  eyebrow: string;
  title: string;
  sub?: string;
  onClick: () => void;
  /**
   * Straight to the shareable card, skipping the sheet.
   *
   * The card renderer is some of the best work in the app and it was four taps
   * from anywhere: profile, tile, sheet, then a button called "Make the card"
   * that you had to already know was there. Nothing on this shelf said cards
   * existed. A tile that can make one now says so on its face.
   */
  onCard?: () => void;
}) {
  return (
    // A div, not a button. The card shortcut is a control INSIDE this tile, and
    // a button inside a button is invalid markup that browsers resolve by
    // dropping one of them — usually the inner one, which is the shortcut.
    <div className="flagship relative w-[172px] flex-shrink-0 text-left">
      <button onClick={onClick} className="block w-full text-left active:scale-[0.98]">
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
      {onCard && (
        <button
          onClick={onCard}
          aria-label={`Make a card for ${title}`}
          className="absolute bottom-2 right-2 z-10 rounded-full border px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.14em] active:scale-95"
          style={{
            color: "var(--gold)",
            borderColor: "color-mix(in srgb, var(--gold) 40%, transparent)",
            background: "color-mix(in srgb, var(--bg) 78%, transparent)",
          }}
        >
          Card
        </button>
      )}
    </div>
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

/**
 * A chapter heading, one level above `Section`.
 *
 * The screen's problem was never its contents — it was that eight blocks all
 * wore the same 10px tracked label, so nothing was subordinate to anything and
 * the page read as a list of unrelated facts about you. There was no way to tell
 * that "Your taste", "Odds and ends" and "Your highest rated" are three angles
 * on ONE claim while "Your tiers" is a different kind of thing entirely.
 *
 * So this is deliberately unlike a Section: the serif face the app uses for
 * numbers and titles, sentence case rather than tracked caps, and a rule that
 * fades out — the same `card-rule` already separating the identity block. Two
 * levels is enough. A third would be the same mistake one rung down.
 */
function Zone({ title }: { title: string }) {
  return (
    <div className="mt-8">
      <div className="card-rule" />
      <h2 className="mt-4 font-serif text-[17px] font-bold leading-none text-text-hi">{title}</h2>
    </div>
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
