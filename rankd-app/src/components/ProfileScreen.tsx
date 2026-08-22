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

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, Header, tierCounts } from "./DuelScreen";
import { FilmPicker } from "./FilmPicker";
import { rankedFilms } from "@/lib/ladder";
import { isPlaced } from "@/lib/lock";
import { buildList } from "@/lib/list";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import Sheet from "./Sheet";
import { peopleIn } from "@/lib/people";
import {
  autoCollections,
  avatarOf,
  fingerprint,
  MAX_PINNED,
  MAX_PINNED_PEOPLE,
  personKey,
  publicName,
  superlatives,
  topPeople,
  type Identity,
  type Profile,
} from "@/lib/profile";
import { fetchAccount, type Me } from "@/lib/account";
import { FollowCounts } from "./FollowCounts";
import { AvatarCropper } from "./AvatarCropper";
import { loadLists, subjectOf, type SavedList } from "@/lib/lists";
import SavedListSheet from "./SavedListSheet";
import LiveCardSheet from "./LiveCardSheet";
import { liveViews } from "@/lib/card/live";
import { subjectEyebrow, subjectKey, subjectTitle, type RankSubject } from "@/lib/subject";
import { achievements, nextUp } from "@/lib/achievements";
import {
  biggestDisagreement,
  biggestMove,
  lockedShape,
  shuffledShape,
  tasteFor,
  tasteShape,
} from "@/lib/taste";
import { loadLog, type Judgement } from "@/lib/log";
import { notesFor } from "@/lib/notes";
import { GenreRing } from "./GenreRing";
import { Passport } from "./Passport";
import { TasteChart } from "./TasteChart";
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

/**
 * The two halves of a profile, in order.
 *
 * The names are the user's and they draw the real line: **taste is what the data
 * says about you, results are what you chose.** The shape, the genres, the
 * countries, the tiers — none of those were decided, they were measured. The
 * cards, the saved rankings, the people you rate highest and the badges are all
 * things you sat through duels to produce.
 *
 * "What you like" and "What you've made" missed that, and the second one got
 * worse when the people moved in: nobody MADE a favourite director.
 *
 * Three was one too many. "Where it stands" held a single tier chart, which is
 * the detailed version of the counts already in the band at the top, so it read
 * as an empty page you had to visit to find out was empty. It moved in with the
 * rest of what is measured, and the page lost a tab rather than gaining filler
 * to justify one.
 */
// Results first, taste second. The user's call, and it holds up: the taste
// panel is derived — the app telling you about yourself — while the results
// panel is what you MADE. Landing on the thing you made is the better greeting,
// and it is the half you would show somebody.
const PANELS = ["Your results", "Your taste"] as const;

/** Matches the sheets. One easing across the app or the motion reads as two apps. */
const EASE = "cubic-bezier(0.2, 0.8, 0.3, 1)";

/** Past this fraction of the width, letting go turns the page rather than snapping back. */
const TURN_AT = 0.22;

interface Collection {
  title: string;
  blurb: string;
  films: Film[];
  numbered?: boolean;
}

export default function ProfileScreen({
  films,
  profile,
  me,
  wasShape,
  onProfile,
  onMe,
  onFindPeople,
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
  /**
   * Your public identity. Lives on the account rather than the device now, so
   * it is handed down rather than read from storage. See lib/profile.ts.
   */
  me: Me;
  /** What the previous sitting amounted to, or null when there is nothing to say. */
  /** The taste shape when this sitting began. Absent on a first sitting. */
  wasShape?: Record<string, number>;
  onProfile: (p: Profile) => void;
  /** Change the public half. Optimistic in `AppShell`; the write is its job. */
  onMe: (patch: Partial<Me>) => void;
  /** Open the people search. Lives in the shell's overlay slot. */
  onFindPeople: () => void;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onList: () => void;
  onTrophies: () => void;
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
}) {
  // Which of the three zones is showing. See the tab bar for why.
  const [tab, setTab] = useState<0 | 1>(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const goTo = (next: 0 | 1) => setTab(next);

  // ── The drag ───────────────────────────────────────────────────────────────
  //
  // A gesture that starts inside a shelf belongs to the shelf. Panel two scrolls
  // sideways in places, and without this every flick at the end of a shelf would
  // be ambiguous — the reader would have no way to know whether they were about
  // to reach the next poster or the next page.
  //
  // `axis` is decided ONCE, on the first few pixels of movement, and then held.
  // Deciding per-frame lets a diagonal drag flicker between scrolling the page
  // and turning it, which feels broken in a way that is hard to name.
  const touch = useRef<{ x: number; y: number; inShelf: boolean; axis: null | "x" | "y" } | null>(null);

  const slideTo = (px: number, animate: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform 0.3s ${EASE}` : "none";
    el.style.transform = `translateX(calc(${tab * -100}% + ${px}px))`;
  };
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
  // ── The people, and the ones you chose ──────────────────────────────────
  //
  // `topPeople` takes the pins so somebody outside the computed top few still
  // appears and floats — the widening lives in `profile.ts` beside the ranking
  // it overrides, rather than being re-applied here.
  const pinnedPeople = useMemo(() => profile.pinnedPeople ?? [], [profile.pinnedPeople]);
  const people = useMemo(() => topPeople(films, pinnedPeople), [films, pinnedPeople]);
  // Newest pin last and the cap enforced on WRITE, not by disabling the button.
  // The profile is what the rule is about, so the rule lives where the profile
  // is written — the same reasoning as the saved-ranking pins further down.
  const [pickingPeople, setPickingPeople] = useState(false);
  const togglePerson = (role: "director" | "actor", name: string) => {
    const key = personKey(role, name);
    const next = pinnedPeople.includes(key)
      ? pinnedPeople.filter((k) => k !== key)
      : [...pinnedPeople, key].slice(-MAX_PINNED_PEOPLE);
    onProfile({ ...profile, pinnedPeople: next });
  };
  const print = useMemo(() => fingerprint(films), [films]);
  const facts = useMemo(() => superlatives(films), [films]);
  const autos = useMemo(() => autoCollections(ranked, print, people), [ranked, print, people]);
  const badges = useMemo(() => achievements(films), [films]);
  const taste = useMemo(() => tasteFor(films), [films]);

  // Named observations, not measurements.
  //
  // The first version of this reported percentages and was inert: a tendency
  // with nothing in it to picture and nothing to disagree with. `notes.ts`
  // holds the rule these follow now — a note must NAME something, and it must
  // be able to be wrong about you.
  //
  // Needs the log, so it arrives with `rankd` below rather than on the first
  // paint. Until it does the section simply is not there, which is the same
  // answer a library too thin to say anything about gets.
  const [logRows, setLogRows] = useState<Judgement[] | null>(null);
  const notes = useMemo(() => notesFor(films, logRows ?? []), [films, logRows]);
  // ── The two shapes ──────────────────────────────────────────────────────
  //
  // Both are pure functions of the library now, so they are computed here
  // rather than awaited. The old blue line needed the whole belief fit — the
  // expensive one — and arrived late; it also turned out to be the gold line
  // recomputed, because a soft lock's score IS its belief order. See the header
  // of `taste.ts`.
  //
  // Gold is what you locked, blue is what Rankd shuffled. `lockedShape` returns
  // null below ten films, and then the gold line falls back to your whole
  // placed list and the caption says why.
  const genres = useMemo(() => taste.map((a) => a.genre), [taste]);
  const locked = useMemo(() => lockedShape(films, genres) ?? undefined, [films, genres]);
  const rankd = useMemo(() => shuffledShape(films, genres), [films, genres]);
  useEffect(() => {
    let dead = false;
    void loadLog().then((log) => {
      if (!dead) setLogRows(log);
    });
    return () => {
      dead = true;
    };
  }, []);
  // Where you and Rankd part company, for the caption.
  // Where what you locked parts company with what Rankd placed. Only says
  // anything once there are enough locks for the gold line to be real.
  const disagree = useMemo(
    () => (locked ? biggestDisagreement(locked, rankd) : null),
    [locked, rankd],
  );
  // What shifted since the sitting began. Null when nothing did, so the caption
  // falls back to explaining the chart rather than announcing a non-event.
  const moved = useMemo(
    () => (wasShape ? biggestMove(wasShape, tasteShape(films, genres)) : null),
    [wasShape, films, genres],
  );
  const earned = badges.filter((b) => b.got).length;
  // The one you are closest to. See `nextUp` for why nearest is a fraction
  // rather than a remainder.
  const next = useMemo(() => nextUp(badges), [badges]);

  const placed = useMemo(() => ranked.filter(isPlaced), [ranked]);
  const hero = placed[0];
  const topTen = placed.slice(0, 10);
  // `bannerFilm` lived here to label the pill that floated on the banner
  // ("Change scene" against "Pick a scene"). The pill is gone and the sheet asks
  // the question now, off `profile.bannerStill`, which is the thing that
  // actually records a choice. Resolving a whole Film to word one button was
  // always more work than the answer needed.

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

  // One way in, used by every tappable fact on this page. Sorted best-first,
  // because a set of films opened from "your decade" is a small ranking and
  // arriving at it in library order would waste the ranking you made.
  const show = (title: string, blurb: string, films: Film[]) =>
    setOpen({ title, blurb, films: [...films].sort((a, b) => b.score - a.score), numbered: true });

  /** The decade a film belongs to, as the profile labels them. */
  const decadeOf = (f: Film): string =>
    /^\d{4}$/.test(f.year ?? "") ? `${Math.floor(Number(f.year) / 10) * 10}s` : "";

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

      <div
        // overflow-x hidden as well as y: setting one axis to auto makes the
        // other compute to auto rather than visible, so the off-screen pane
        // could be scrolled to sideways and the page would drift off its own
        // gutter. The track is what moves; the scroller must not.
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = {
            x: t.clientX,
            y: t.clientY,
            inShelf: !!(e.target as HTMLElement).closest?.(".overflow-x-auto"),
            axis: null,
          };
        }}
        onTouchMove={(e) => {
          const start = touch.current;
          if (!start || start.inShelf) return;
          const t = e.touches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (start.axis === null) {
            // Not enough movement to tell yet. Waiting costs nothing and
            // guessing costs the gesture.
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }
          if (start.axis !== "x") return;
          // Resist at the ends rather than refusing, so the edge is felt.
          const off = (tab === 0 && dx > 0) || (tab === 1 && dx < 0) ? dx * 0.25 : dx;
          slideTo(off, false);
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start || start.inShelf || start.axis !== "x") return;
          const dx = e.changedTouches[0].clientX - start.x;
          const width = trackRef.current?.clientWidth ?? 1;
          const turn = Math.abs(dx) > width * TURN_AT;
          const next = (turn ? (dx < 0 ? Math.min(1, tab + 1) : Math.max(0, tab - 1)) : tab) as 0 | 1;
          // Always animate back to a whole page, whether that is the next one or
          // the one it started on.
          slideTo(0, true);
          if (next !== tab) setTab(next);
        }}
      >
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
          {/* The "Pick a scene" pill used to float here. It was the only control
              in the app parked on top of its own artwork, and it competed with
              the picture for the one corner the eye lands on. Both the banner
              and the avatar are answers to "how does my profile look", so they
              are asked in one place now: tap the picture. */}
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
                identity={me}
                accountImage={accountImage}
                onOpen={() => setAvatarMenu(true)}
              />
            </span>
            {/* ── The name they CHOSE ────────────────────────────────────
                This used to show `display_name`, which arrives from Google at
                sign-in and which nobody ever agreed to. A profile captioned by
                whatever your email provider happens to hold is exactly what
                claiming a handle was supposed to end.

                Not a button, because a handle is permanent. The bio underneath
                is still the way into the edit sheet, and its placeholder has
                always been the thing that invites the tap. */}
            {/* No `@`. It is a sigil for ADDRESSING somebody, and this is the
                one page where you are not being addressed. On your own profile
                the name is a title, so it is set like one. The `@` still leads
                the field in `HandleGate`, where it says what kind of thing you
                are typing, and it belongs anywhere a handle is quoted in a
                sentence. */}
            <span className="mt-3 block max-w-full truncate font-display text-[26px] leading-none tracking-wide text-gold">
              {publicName(me)}
            </span>
            {/* Nothing else goes under it. A second line held the display name,
                which on a real account read "Jarrad Bishop (UnknownEntity)"
                directly beneath the same words in gold: the provider's value,
                printed twice, neither chosen here. See `publicName`. */}

            {/* Your own counts, which only existed on other people's profiles
                until now. This is the first place anybody looks for them. Only
                once a handle exists, since there is nothing to count before. */}
            {me.handle && (
              <span className="mt-2 block">
                <FollowCounts handle={me.handle} />
              </span>
            )}
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
          {/* Rules, not a box.
              A rounded panel round four numbers made them look like a widget
              embedded in the page rather than part of it, and it was the last
              bordered thing left up here after the rest of the de-boxing. The
              app says this with a hairline everywhere else.

              ── Above the bio, not below it ─────────────────────────────────
              The bio used to sit directly under the name and the counters came
              after it, which is the order every social profile uses — picture,
              name, a paragraph about yourself.

              DUELS and RANKED are the two words on this screen that no other
              film app can print, because no other film app ranks. Putting them
              first means the thing directly under your name is the thing only
              this app does, rather than a paragraph that could belong anywhere.
              A profile that reads as somebody's ranking rather than somebody's
              page is the whole differentiation, and it costs nothing to say so
              in the running order. */}
          <div className="mt-4 border-y border-border py-3.5">
            {/* Even columns rather than a left-packed row.
                Four numbers of different widths on a `gap` read as ragged, and
                the block sits under a centred name and a centred picture — so
                the one thing on the band that was not centred was the band. */}
            <div className="grid grid-cols-4 text-center">
              <Stat n={model.total} label="Films" onClick={onList} />
              <Stat n={model.placedCount} label="Ranked" onClick={onList} />
              <Stat n={print.duels} label="Duels" onClick={onDuel} />
              <Stat n={earned} label="Badges" onClick={onTrophies} />
            </div>

            {/* A gold "start ranking" button lived here and was cut on sight.
                The nav's RNK cell already does this from every screen, and a
                second, louder route to the same place made the profile look
                like it was selling the game back to you. The Duels counter
                above is still a link into it for anyone who wants one. */}
          </div>

          {/* The bio, now BELOW the band rather than between the name and it.
              Its own control, since it no longer shares a tap target with the
              name — both open the same editor, which is the point.

              `whitespace-pre-line` so the line breaks somebody typed survive to
              the page. Without it a bio written as three lines came back as one
              paragraph and the formatting looked broken rather than absent. */}
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit your bio"
            className="mt-3.5 block w-full active:opacity-70"
          >
            <span className="mx-auto block max-w-[280px] whitespace-pre-line text-center font-serif text-sub italic leading-snug text-dim">
              {me.bio || "Add a line about your taste"}
            </span>
          </button>


          {/* ── The way to somebody else ────────────────────────────────────
            On the profile rather than in the header, whose two corners are
            already spoken for by Settings and the trophy case, and rather than
            on the Activity nav cell, which is reserved for the feed and would
            have to mean something different once that lands.

            It sits under your own name because that is where the question comes
            up: this screen is the one that says who you are, and "who else is
            here" is the next thing you want to know. */}
        <button
          onClick={onFindPeople}
          className="mx-auto mt-4 block rounded-full px-4 py-1.5 text-label font-extrabold tracking-[0.14em] text-dim active:scale-95"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          FIND PEOPLE
        </button>

        {/* ── Three pages, not one scroll ──────────────────────────────────
              The zones were always the right grouping. The problem was that all
              three were stacked, so the page ran to eight sections and nothing
              broke it up — which is exactly how it read.

              A tab keeps the grouping and throws away the length. It also puts
              every sideways-scrolling shelf under one heading, where flicking
              through posters is the actual job, instead of ambushing you with
              four of them on the way down.

              The identity block above stays put on all three: it is who this is,
              not one of the three things being said about them. */}
          {/* Underlined text, tapped or swiped.
              Pills read as buttons for something that should be flickable, and
              a heading with dots beside it never said the other page existed.
              A label that dims when it is not the one you are on says both: it
              is a control and a position at once, which is why every app that
              pages sideways ends up here.

              The rule stands under the WORD, not the cell, so the mark is the
              width of the thing it belongs to rather than of a column nobody
              drew. */}
          <div className="mt-6 flex gap-6 border-b border-border">
            {PANELS.map((label, i) => (
              <button
                key={label}
                onClick={() => goTo(i as 0 | 1)}
                className="-mb-px pb-2.5 text-sub transition-colors"
                style={{
                  color: tab === i ? "var(--text-hi)" : "var(--dim)",
                  borderBottom: `2px solid ${tab === i ? "var(--gold)" : "transparent"}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          </div>

          {/* ── One track, two panes, dragged ────────────────────────────────
              Both panels are mounted and sitting side by side, and the track
              slides. That is the only way a swipe can FOLLOW the finger:
              rendering one panel at a time means there is nothing to the right
              of the screen to pull into view, so the best it can do is play an
              animation after you let go — which is what it did, and what read
              as a jump.

              The transform is written straight to the node while dragging
              rather than held in state. A state update per touchmove is sixty
              re-renders a second of a page this size, and the value is a
              property of the DOM for the duration of the gesture anyway.

              Panel one keeps the gutter it used to inherit; panel two does not
              want one, because its shelves run full-bleed on purpose. */}
          <div
            ref={trackRef}
            className="flex"
            style={{ transform: `translateX(${tab * -100}%)`, transition: `transform 0.3s ${EASE}` }}
          >
            <div className="w-full flex-shrink-0">
        <div className="px-6">
        {/* The people, moved out of What you like.
            They sat with the taste data, which is where they came from, but
            they read as one more derived readout there. Here they are what
            they actually are: a thing with a name and a face on it that you
            would show somebody, which is what everything else on this panel
            is too. Renamed to cover both halves of that. */}
        {(people.directors.length > 0 || people.actors.length > 0) && (
          <Section title="Who you rate highest">
            {/* One control for the whole section, not one per row.
                Whoever you choose here goes to the top and stays, and anybody
                you don't choose is still worked out from your ratings — so the
                list is never empty and never only the maths. */}
            <button
              onClick={() => setPickingPeople(true)}
              className="mb-2 block text-label font-extrabold tracking-[0.14em] text-dim active:opacity-70"
            >
              CHANGE ›
            </button>
            {/* Two groups, each labelled once.
                The role used to sit on every row, which meant reading the word
                ACTOR four times to learn one thing. A heading says it once and
                the rows underneath are free to be names. */}
            {people.directors.length > 0 && (
              <>
                <div className="mb-1 text-label font-extrabold tracking-[0.16em] text-dim">
                  DIRECTORS
                </div>
                <div className="mb-4">
                  {people.directors.map((d) => (
                    <PersonCard
                      key={d.name}
                      p={d}
                      chosen={pinnedPeople.includes(personKey("director", d.name))}
                      onClick={() =>
                        setOpen({
                          title: d.name,
                          blurb: "Every film of theirs in your library, your favourite first.",
                          films: filmsOf(d.name, true),
                        })
                      }
                    />
                  ))}
                </div>
              </>
            )}
            {people.actors.length > 0 && (
              <>
                <div className="mb-1 text-label font-extrabold tracking-[0.16em] text-dim">ACTORS</div>
                <div>
                  {people.actors.map((a) => (
                    <PersonCard
                      key={a.name}
                      p={a}
                      chosen={pinnedPeople.includes(personKey("actor", a.name))}
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
              </>
            )}
          </Section>
        )}
        </div>

        {/* ── WHAT YOU'VE MADE ─────────────────────────────────────────────
            Both shelves under one heading. They are the same kind of object —
            a set of films with a name — and the only difference is whether the
            app derived it or you sat through the duels for it. That distinction
            is already carried by each card's eyebrow, so it does not also need
            two unrelated-looking headers. */}
        {/* ── Collections ─────────────────────────────────────────────────
            The same treatment as the cards below — a two-up grid in the gutter,
            no shelf — and deliberately a different object inside it.

            Cards are a row: a thumbnail beside a name, because what matters is
            WHICH ranking and how many are in it. A collection is a way into
            artwork, so it keeps the wide poster wash and leads with the image.
            Same skeleton, different flesh, which is what stops two adjacent
            grids reading as one long undifferentiated list.

            It was a shelf because user-made lists were going to join it. They
            did, and they went somewhere better. */}
        {hero && (
          <div className="px-6">
            <Section title="Collections" first>
              <div className="grid grid-cols-2 gap-2.5">
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
                {/* Everything else here is derived rather than curated. */}
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
            </Section>
          </div>
        )}

        {/* ── The things you can actually hand somebody ───────────────────
            Two shelves became one list.

            "Straight from your list" and "Your rankings" were separate sections
            scrolling sideways in parallel, which made them look like different
            kinds of object. They are not. Both are an ordered set of films with
            a name, both open a sheet, and both end at the same three card
            designs — the only difference is whether the app derived the order or
            you sat through the duels for it, and each row's eyebrow already says
            which.

            Rows rather than tiles, for the reason the whole page is being
            de-boxed: a 172px poster tile is a container the list screen does not
            have, and four shelves of them was most of why this page read as
            belonging to a different app. A row with a thumbnail is exactly what
            the list screen already is.

            Vertical, so the count is visible. A shelf hides how many there are
            behind the right-hand edge, which for the one part of the app that
            makes something is precisely the wrong thing to hide. */}
        {(live.length > 0 || savedLists.length > 0) && (
          <div className="px-6">
            <Section title="Cards you can make">
              {/* Two per row.
                  Single file was right when the row had to prove it was not a
                  poster tile, and wrong once there are ten of them: a set of
                  small, similar things reads faster side by side than as a
                  column you scroll. Two is the most that fits without the title
                  truncating to nothing at 375px. */}
              <div className="grid grid-cols-2 gap-x-3">
              {live.map(({ subject, films: top }) => (
                <ExportRow
                  key={subjectKey(subject)}
                  film={top[0]}
                  eyebrow={subjectEyebrow(subject).toUpperCase()}
                  title={subjectTitle(subject)}
                  sub={`${top.length} film${top.length === 1 ? "" : "s"}`}
                  onClick={() => setOpenLive(subject)}
                />
              ))}
              {shelf.map(({ list, top, pinned }) => (
                <ExportRow
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
                  // films to compare — and offering the shortcut on a row that
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
            </Section>
          </div>
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
              <span className="text-label font-extrabold tracking-[0.18em] text-dim">TROPHY CASE</span>
              <span className="text-label text-dim tabular-nums">
                {earned} of {badges.length} ›
              </span>
            </button>
            {/* Wrapped, not scrolled, and unboxed.
                A bordered pill each, on a shelf, meant the badge count was
                hidden past the right edge of a row of little rounded boxes —
                for the one section whose entire point is how many you have.
                Wrapping shows all of them at once and the border comes off with
                the rest of the boxes on this page. The star is enough of a mark
                to tell one apart from body text. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-6">
              {badges
                .filter((b) => b.got)
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={onTrophies}
                    className="flex items-center gap-1.5 text-sub active:opacity-70"
                  >
                    <span className="text-sub text-gold">★</span>
                    <span className="whitespace-nowrap text-text">{b.name}</span>
                  </button>
                ))}
            </div>
            {/* ── The one you are nearly at ─────────────────────────────────
                The case above is a record: it can only tell you what you have
                already done. This is the half that pulls, and it is one line
                because a list of everything you have NOT done is a chore rather
                than an invitation.

                Hollow star against the solid ones above, so the row reads as
                "not yet" at a glance without needing the word. */}
            {next && (
              <button
                onClick={onTrophies}
                className="mt-2 flex w-full items-baseline gap-1.5 px-6 text-left active:opacity-70"
              >
                <span className="text-sub text-dim">☆</span>
                <span className="min-w-0 flex-1 truncate text-sub text-dim">{next.how}</span>
                <span className="flex-shrink-0 text-label tabular-nums text-gold">{next.progress}</span>
              </button>
            )}
          </section>
        )}

            </div>
            <div className="w-full flex-shrink-0 px-6">
          {/* ── WHAT YOU LIKE ───────────────────────────────────────────────
              The thesis. Three blocks that were peers of everything else on the
              screen — the fingerprint, the odds and ends, the people — now sit
              under one heading, because they are one argument made three ways
              and the page never said so. */}
          {/* Who you are, in four lines that the ranking can't tell you. */}
          <Section title="Your taste" first>
            <div className="space-y-1.5">
              {print.homeTier !== undefined && (
                <Line
                  label="You live at"
                  value={starsFor(print.homeTier)}
                  gold
                  onClick={() =>
                    show(
                      starsFor(print.homeTier!),
                      "Everything you rated this.",
                      ranked.filter((f) => f.rating === print.homeTier),
                    )
                  }
                />
              )}
              {print.genre && (
                <Line
                  label="You keep returning to"
                  value={print.genre.name}
                  note={`${print.genre.count} films`}
                  onClick={() =>
                    show(
                      print.genre!.name,
                      "Your best first.",
                      ranked.filter((f) => f.genres?.includes(print.genre!.name)),
                    )
                  }
                />
              )}
              {people.subgenre && (
                <Line
                  label="More precisely"
                  value={people.subgenre.name}
                  note={`${people.subgenre.count} films`}
                  onClick={() =>
                    show(
                      people.subgenre!.name,
                      "Your best first.",
                      ranked.filter((f) => f.keywords?.includes(people.subgenre!.name)),
                    )
                  }
                />
              )}
              {print.decade && (
                <Line
                  label="Your decade"
                  value={print.decade.label}
                  note={`${print.decade.count} films`}
                  onClick={() =>
                    show(
                      print.decade!.label,
                      "Your best first.",
                      ranked.filter((f) => decadeOf(f) === print.decade!.label),
                    )
                  }
                />
              )}
              {/* Not a way in. "Even-handed" describes HOW you rate rather than
                  WHAT you rated, so there is no set of films behind it — and a
                  control that opens your whole library is not an answer. */}
              {print.generosity && (
                <Line
                  label="As a rater you're"
                  value={print.generosity.label}
                  note={`${print.generosity.mean.toFixed(2)}★ average`}
                />
              )}
            </div>
            {!print.genre && (
              <p className="mt-2 text-label leading-snug text-dim">
                Genres arrive with artwork — browse your list and this sharpens up.
              </p>
            )}
          </Section>

          {/* The shape, above the lines that describe it in words.
              It plots mean POSITION per genre, never win rate and never how much
              of a genre you've seen — see the header of `taste.ts` for why both
              of those are wrong. Renders nothing below three axes, so a thin
              library is simply the four lines it always was.

              TWO POPULATIONS, not two orders. Gold is what you locked, blue is
              what Rankd shuffled. It used to be your order against Rankd's over
              the same films, which is the same order twice — a soft lock's score
              IS its belief order — so the chart drew one line on top of another.
              Caught on a phone with 1 locked film and 234 shuffled: "they
              overlap the exact same." */}
          {taste.length >= 3 && (
            <Section title="Your shape">
              {/* No blue line until there is a gold one to compare it WITH.
                  Without enough locks, gold is your whole placed list and blue
                  is the shuffled part of it — nearly the same films, so nearly
                  the same outline, which is the overlap that started all this.
                  One honest line beats two that agree by construction. */}
              <TasteChart axes={taste} was={wasShape} rankd={locked ? rankd : undefined} locked={locked} />
              {/* A key, because three outlines need one. Only the ones actually
                  drawn appear: offering a legend entry for a line that is not
                  on the chart is how a reader starts hunting for it.

                  The gold entry changes with what gold IS. Below ten locked
                  films there is no locked shape and the gold line is your whole
                  placed list, so calling it LOCKED would be naming something
                  that is not on the chart. */}
              <div className="mt-1 flex justify-center gap-3 text-label tracking-[0.08em] text-dim">
                <span className="text-gold">● {locked ? "LOCKED" : "YOUR LIST"}</span>
                {locked && <span className="text-accent">● SHUFFLED</span>}
                {moved && <span>◌ WHERE YOU STARTED</span>}
              </div>
              <p className="mt-1.5 text-center text-label leading-snug text-dim">
                {!locked
                  ? "Lock ten films and this splits into what you settled against what Rankd did."
                  : moved
                  ? `${moved.genre} moved this sitting.`
                  : disagree
                    ? `You rate ${disagree.genre} ${disagree.youHigher ? "higher" : "lower"} than your duels do.`
                    : "How high each genre sits in your order."}
              </p>
            </Section>
          )}

          {/* ── What your list says about you ────────────────────────────
              Everything above this comes off the library, which means anyone
              holding the Letterboxd export could compute it. These come off the
              ORDER and the duel log, so they are the first things on this page
              about the reader rather than their collection.

              Sentences, not a label-and-value row. The subjects are film titles,
              and a title in a value column truncates — "Cannibal Corpse:
              Centuries of Torme…" was the live version of that. Wrapping prose
              with the named thing set brighter reads at one weight the whole way
              down, which three type sizes per row never did. */}
          {notes.length > 0 && (
            <Section title="What your list says">
              <div className="space-y-2.5">
                {notes.map((n) => (
                  <p key={n.id} className="text-sub leading-snug text-text">
                    {n.before} <span className="text-gold">{n.subject}</span>
                    {/* No space before a full stop or a comma. A note whose tail
                        begins with punctuation would otherwise read "the 2020s ."
                        — which it did, on the first render of this. */}
                    {/^[.,;:!?]/.test(n.after) ? n.after : ` ${n.after}`}
                  </p>
                ))}
              </div>
            </Section>
          )}

          {/* Two panes, one swipe apart. See the header of GenreRing. */}
          <Section title="Your library">
            <GenreRing
              films={films}
              onPick={(g) => show(g, "Your best first.", ranked.filter((f) => f.genres?.includes(g)))}
            />
          </Section>

          {/* ── THE LEDGER ───────────────────────────────────────────────────
              Last, and deliberately. This is the most detailed thing on the page
              and the least likely to be why anyone opened it — so it is what you
              arrive at by scrolling to the end, not what you wade through.

              One chart doing two jobs. The bar's length is how many films are in
              the tier — the shape of your taste — and the solid part is how many
              have a position. Deliberately NOT "locked": the gold counts hard and
              soft locks alike (`isPlaced`), and "locked" is the app's word for
              the hard half alone. See the legend in `ListScreen`. Two separate charts of the same ten tiers was one
              chart too many, and no other app can draw this one because no other
              app knows the difference between owning a film and placing it. */}
          <div className="px-6">
            <Section title="Your tiers">
              <div className="space-y-2">
                {tiers.map((t) => (
                  <button key={t.tier} onClick={onList} className="flex w-full items-center gap-3 active:scale-[0.99]">
                    {/* 56px, not 46: five stars at `text-sub` measure 54 and the old box was
                        cut for them at 11px. The type scale made them bigger and this
                        was the one place in the app that noticed. */}
                    <span className="w-[56px] flex-shrink-0 text-left text-sub text-gold">
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
                    <span className="w-[58px] flex-shrink-0 text-right text-label text-dim tabular-nums">
                      {t.placed}/{t.total}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-label leading-snug text-dim">
                Bar length is how many films you&rsquo;ve seen at that rating. The gold is how many have a position.
              </p>
            </Section>
          </div>

          {/* Lines, not boxes.
              A bordered box per fact made eight equal-weight panels with nothing
              subordinate to anything, which is most of why this page read as a
              stack of unrelated readouts. The app's own language is a hairline
              rule and a tracked-caps label; these facts now use it like
              everything else does. */}
          {/* Wrapping, not truncating. `Line` clips its value to one row, which
              is right for "even-handed" and wrong for a film title — the live
              page read "Cannibal Corpse: Centuries of Torme…". These values are
              titles, so they take the same treatment as the notes below and the
              page ends up at one weight throughout. */}
          {facts.length > 0 && (
            <Section title="Odds and ends">
              <div className="space-y-2.5">
                {facts.map((f) => (
                  <p key={f.label} className="text-sub leading-snug text-text">
                    {f.label} <span className="text-gold">{f.value}</span>
                    {f.note ? <span className="text-dim"> · {f.note}</span> : null}
                  </p>
                ))}
              </div>
            </Section>
          )}

          {/* Where they were made. Renders nothing until the credits sweep has
              been round, so it appears by itself rather than needing anybody to
              do something. See the header of Passport for why it is not yet a
              map. */}
          <Section title="Your world">
            <Passport
              films={films}
              onPick={(code) =>
                show(code, "Everything you've seen from there.", ranked.filter((f) => f.countries?.includes(code)))
              }
            />
          </Section>
            </div>
          </div>

      </div>

      <BottomNav screen="profile" onSettings={onSettings} onModes={onDuel} onList={onList} onProfile={() => {}} logging={logging} onToggleLog={onToggleLog} />

      {/* Closes itself on the way through. `onInfo` opens a film card in
          `AppShell`, which renders over this sheet rather than inside it, so
          passing the handler straight through left two stacked panels and a
          reader who had to dismiss them one at a time. One overlay at a time is
          the rule everywhere; a screen handing off to the shell is where it was
          being quietly broken. */}
      {pickingPeople && (
        <PeoplePicker
          films={films}
          chosen={pinnedPeople}
          onToggle={(role, name) => togglePerson(role, name)}
          onClose={() => setPickingPeople(false)}
        />
      )}

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

      {editing && <EditIdentity me={me} onSave={onMe} onClose={() => setEditing(false)} />}


      {avatarMenu && (
        <AvatarMenu
          identity={me}
          signedIn={signedIn}
          hasBanner={!!profile.bannerStill}
          onClose={() => setAvatarMenu(false)}
          onPickFromFilms={() => {
            setAvatarMenu(false);
            setPickingFor("avatar");
          }}
          onPickBanner={() => {
            setAvatarMenu(false);
            setPickingFor("banner");
          }}
          onUploadFile={(file) => {
            setAvatarMenu(false);
            setPendingAvatar(file);
          }}
          onRemove={() => {
            setAvatarMenu(false);
            // Null, not blank. An empty string is still a value, and absence is
            // the state `avatarOf` reads as "fall back to the account photo,
            // then to the initial".
            onMe({ avatarUrl: null });
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
            // /api/avatar has already written the row. This only catches the
            // screen up, so the new picture does not wait for the next open.
            onMe({ avatarUrl: url });
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
            // The banner stays on the device and the avatar does not, which is
            // the whole split: a banner says something about this library, a
            // picture says who you are. Two calls now, not one.
            if (stillsFor.target === "banner") {
              onProfile({ ...profile, bannerFilmId: stillsFor.film.id, bannerStill: url });
            } else {
              onMe({ avatarUrl: url });
            }
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
  identity,
  accountImage,
  onOpen,
}: {
  identity: Identity;
  accountImage: string | null;
  onOpen: () => void;
}) {
  // The file waiting to be cropped. Picking one no longer uploads it — see
  // `AvatarCropper` for why centre-cropping on the user's behalf was wrong.
  const avatar = avatarOf(identity, accountImage);
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
  identity,
  signedIn,
  hasBanner,
  onPickFromFilms,
  onPickBanner,
  onUploadFile,
  onRemove,
  onClose,
}: {
  identity: Identity;
  signedIn: boolean;
  hasBanner: boolean;
  onPickFromFilms: () => void;
  onPickBanner: () => void;
  onUploadFile: (file: File) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    // The banner joined this sheet when its own floating pill was removed. One
    // question, asked once: how does your profile look. Two controls in two
    // places for the two halves of the same answer was the thing that was wrong.
    <Sheet title="Your picture and banner" onClose={onClose}>
      <p className="mb-4 text-sub leading-snug text-dim">
        {signedIn
          ? "A frame from one of your films, or a photo of your own."
          : "A frame from one of your films. Sign in if you would rather upload a photo."}
      </p>

      <button
        onClick={onPickFromFilms}
        className="mb-2 w-full rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99]"
      >
        <span className="block text-sm text-text-hi">Use a frame from a film</span>
        <span className="block text-sub leading-snug text-dim">
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
          <span className="block text-sub leading-snug text-dim">You choose the crop.</span>
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
      {identity.avatarUrl && (
        <button
          onClick={onRemove}
          className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm text-dim active:scale-[0.99]"
        >
          Remove it
        </button>
      )}

      {/* ── The banner ────────────────────────────────────────────────────────
          Below the picture and behind a rule, because it is the same question
          asked about a different part of the page rather than a third way to
          set your avatar. The rule is the app's usual "same page, next idea"
          treatment, matching `Section`. */}
      <div className="rule-fade my-5" />
      <button
        onClick={onPickBanner}
        className="w-full rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99]"
      >
        <span className="block text-sm text-text-hi">
          {hasBanner ? "Change the scene up top" : "Pick a scene for up top"}
        </span>
        <span className="block text-sub leading-snug text-dim">
          A frame from one of your films, across the width of your profile.
        </span>
      </button>
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
      <p className="mb-3 text-sub leading-snug text-dim">
        {forAvatar
          ? "Choose a frame for your picture."
          : "Choose a frame for the top of your profile."}
      </p>
      {stills === null && <p className="text-sub text-dim">Finding frames…</p>}
      {stills?.length === 0 && (
        <p className="text-sub leading-snug text-dim">
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


// ── A fact you can act on ──────────────────────────────────────────────────
//
// Every one of these lines names a set of films — the genre you keep returning
// to, the decade you live in, the tier you rate most at — and until now naming
// them was all they did. You could read that you have a hundred and forty
// documentaries and have no way to see them.
//
// The value is the control, not the whole row. The label is a question
// ("Your decade") and the value is the answer ("1970s"); only the answer has
// films behind it, and making the question tappable would be offering a way in
// to something that is not there.
//
// Underlined in the border colour rather than given a chevron or a colour of
// its own. The page is deliberately short of objects and this is a hint, not a
// button — the same treatment the film card already uses for a person's name.
function Line({
  label,
  value,
  note,
  gold,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  gold?: boolean;
  onClick?: () => void;
}) {
  const tone = gold ? "text-gold" : "text-text-hi";
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-shrink-0 text-sub text-dim">{label}</span>
      {onClick ? (
        <button
          onClick={onClick}
          className={`min-w-0 truncate text-body ${tone} underline decoration-border underline-offset-4 active:opacity-70`}
        >
          {value}
        </button>
      ) : (
        <span className={`min-w-0 truncate text-body ${tone}`}>{value}</span>
      )}
      {note && <span className="ml-auto flex-shrink-0 text-label text-dim">{note}</span>}
    </div>
  );
}

// Narrow enough that several sit side by side and you can tell there are more.
/**
 * One thing you can turn into a card, as a row.
 *
 * The list screen is poster, title, number — so this is poster, title, number,
 * and the profile stops being the one page in the app with its own furniture.
 * `MiniCard` survives for Collections, where a wide poster wash is doing real
 * work because that shelf IS browsing artwork.
 *
 * The card shortcut is a control INSIDE the row, so the row is a div with a
 * button in it rather than a button: a button inside a button is invalid markup
 * and browsers resolve it by dropping one, usually the inner one.
 */
function ExportRow({
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
  onCard?: () => void;
}) {
  return (
    <div className="flex gap-2.5 border-b border-border/60 py-2.5">
      <button onClick={onClick} className="flex min-w-0 flex-1 gap-2.5 text-left active:opacity-70">
        {/* Smaller than the list screen's poster on purpose: two of these share
            a 375px row, so `list-poster` at 54px would leave the title about
            forty pixels to truncate inside. */}
        {film?.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.poster}
            alt=""
            aria-hidden
            className="h-[50px] w-[36px] flex-shrink-0 rounded-[4px] object-cover"
            style={{ objectPosition: "center top" }}
          />
        ) : (
          <span
            className="h-[50px] w-[36px] flex-shrink-0 rounded-[4px]"
            style={{ background: "var(--border)" }}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[7.5px] font-extrabold tracking-[0.18em] text-dim">
            {eyebrow}
          </span>
          <span className="mt-0.5 block truncate font-display text-body leading-tight tracking-wide text-text-hi">
            {title}
          </span>
          {sub && <span className="block truncate text-label text-dim">{sub}</span>}
          {/* Inline rather than a pill on the right. A bordered button in a
              163px cell takes the width the title needs, and this page is being
              de-boxed anyway. Rendered inside the label's column so it lines up
              under the thing it belongs to. */}
          {onCard && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onCard();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                onCard();
              }}
              className="mt-1 block text-label font-extrabold tracking-[0.14em] text-gold active:opacity-60"
            >
              MAKE CARD
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

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
    <div className="flagship relative w-full text-left">
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
          <span className="block text-label font-extrabold tracking-[0.2em] text-dim">{eyebrow}</span>
          <span className="mt-1 block truncate font-display text-title leading-tight tracking-wide text-text-hi">
            {title}
          </span>
          {sub && <span className="mt-0.5 block truncate text-label text-dim">{sub}</span>}
        </span>
      </button>
      {onCard && (
        <button
          onClick={onCard}
          aria-label={`Make a card for ${title}`}
          className="absolute bottom-2 right-2 z-10 rounded-full border px-2 py-1 text-label font-extrabold uppercase tracking-[0.14em] active:scale-95"
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
        <p className="mb-3 flex-shrink-0 text-sub leading-snug text-dim">{c.blurb}</p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {c.films.map((f, i) => (
            <button
              key={f.id}
              onClick={() => onInfo(f)}
              className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
            >
              {c.numbered && (
                <span className="w-5 flex-shrink-0 text-right font-serif text-body font-bold text-gold tabular-nums">
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
                <span className="block text-label text-dim">{f.year}</span>
              </span>
              <span className="flex-shrink-0 text-sub text-gold">{starsFor(f.rating)}</span>
            </button>
          ))}
          {c.films.length === 0 && <p className="text-sub text-dim">Nothing in here yet.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * One person you rate highly, as a row.
 *
 * ── Why this stopped being a card ──────────────────────────────────────────
 *
 * It was a bordered tile in a two-up grid, and there is exactly one director.
 * So the top row held a director and a hole, every time, for everybody — a gap
 * that could never be filled because the data has one of the first thing and
 * several of the second. A grid was the wrong container for a list that is
 * 1-then-N by construction.
 *
 * Rows do not care how many there are. They also drop the border, which is the
 * same de-boxing the stats band and the odds and ends have already had: the
 * duel and list screens say everything with type and a hairline, and four
 * different rounded rectangles on one page was most of why this one read as
 * belonging to a different app.
 *
 * The rating sits right, tabular, so the column lines up down the page and can
 * be compared without reading — which is the only reason the number is there.
 */
// ── The row ────────────────────────────────────────────────────────────────
//
// A star sat here for one build, to pin somebody to the top. It came out on
// sight: "the star doesn't make sense — I would rather be able to replace the
// directors and actors myself."
//
// The instinct was right and the star was the wrong shape for it. Seven stars
// is seven controls on rows you were trying to READ, and starring is a vote for
// something already on the list — where what was wanted is the ability to put
// somebody ON it. One "Change" control on the section does that with no per-row
// furniture at all, so the row is a row again.
function PersonCard({
  p,
  chosen,
  onClick,
}: {
  p: { name: string; count: number; avg: number };
  /** You picked this one, rather than the ratings picking it. */
  chosen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-baseline gap-3 border-b border-border/60 py-2.5 text-left last:border-0 active:opacity-70"
    >
      {/* A gold name says you chose this one. No icon and no badge: the app
          already uses gold for "you did this" on every list row, so the same
          colour says the same thing here without adding an object to look at. */}
      <span className={`min-w-0 flex-1 truncate text-body ${chosen ? "text-gold" : "text-text-hi"}`}>
        {p.name}
      </span>
      <span className="flex-shrink-0 text-sub tabular-nums text-gold">{p.avg.toFixed(1)}★</span>
      <span className="w-[58px] flex-shrink-0 whitespace-nowrap text-right text-label tabular-nums text-dim">
        {p.count} film{p.count === 1 ? "" : "s"}
      </span>
    </button>
  );
}


/**
 * Choose who sits at the top of the people list.
 *
 * Everyone in the library, not just the ones the ratings already surfaced —
 * putting somebody ON the list is the whole point, and a picker that only
 * offered the current occupants would be a re-ordering tool.
 *
 * Sorted by how many of their films you have, because that is the order you
 * would look for a name in. Not by average: the maths is what you are here to
 * override.
 */
function PeoplePicker({
  films,
  chosen,
  onToggle,
  onClose,
}: {
  films: Film[];
  chosen: readonly string[];
  onToggle: (role: "director" | "actor", name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const all = useMemo(() => peopleIn(films).sort((a, b) => b.count - a.count), [films]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
    // Capped, because a big library holds thousands of names and a list that
    // long is not a picker. Search is the way to anything past the cap.
    return hits.slice(0, 60);
  }, [all, q]);
  const full = chosen.length >= MAX_PINNED_PEOPLE;

  return (
    <Sheet title="Who goes up top" onClose={onClose}>
      <p className="mb-3 text-sub leading-snug text-dim">
        Pick up to {MAX_PINNED_PEOPLE}. Anyone you don&rsquo;t pick is still worked out from your
        ratings.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search names"
        className="mb-3 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sub text-text-hi outline-none placeholder:text-dim"
      />
      <div className="max-h-[46vh] overflow-y-auto">
        {shown.map((p) => {
          const key = personKey(p.role, p.name);
          const on = chosen.includes(key);
          return (
            <button
              key={key}
              onClick={on || !full ? () => onToggle(p.role, p.name) : undefined}
              className={`flex w-full items-baseline gap-3 border-b border-border/60 py-2.5 text-left last:border-0 ${
                on || !full ? "active:opacity-70" : "opacity-40"
              }`}
            >
              <span className={`min-w-0 flex-1 truncate text-sub ${on ? "text-gold" : "text-text-hi"}`}>
                {p.name}
              </span>
              <span className="flex-shrink-0 text-label uppercase tracking-[0.12em] text-dim">
                {p.role}
              </span>
              <span className="w-[52px] flex-shrink-0 text-right text-label tabular-nums text-dim">
                {p.count}
              </span>
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sub text-dim">Nothing matches.</p>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="active:scale-95">
      <span className="block font-serif text-lg font-bold text-text-hi tabular-nums">{n}</span>
      <span className="block text-label font-extrabold tracking-[0.14em] text-dim">{label.toUpperCase()}</span>
    </button>
  );
}

/**
 * A block, with a rule above it.
 *
 * Sections used to be separated by space alone, which is why the page read as
 * one long run of text: eight headings all the same size with nothing between
 * them, so the eye had no edge to catch on.
 *
 * The rule fades out at both ends rather than running the full width. A hard
 * line is a border and says "these are different things"; a fading one is a
 * breath and says "same page, next idea", which is what these actually are. It
 * is also the treatment the old zone heading used, so the app already had an
 * answer to this before the zone headings were removed.
 *
 * `first` omits it. A rule under a tab bar that already has a line under it
 * would be two rules a few pixels apart.
 */
function Section({
  title,
  first,
  children,
}: {
  title: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={first ? "mt-6" : "mt-7"}>
      {!first && <div className="rule-fade mb-6" />}
      <div className="mb-2.5 text-label font-extrabold tracking-[0.18em] text-dim">{title.toUpperCase()}</div>
      {children}
    </section>
  );
}


function EditIdentity({
  me,
  onSave,
  onClose,
}: {
  me: Me;
  onSave: (patch: Partial<Me>) => void;
  onClose: () => void;
}) {
  // ── The name field is gone ──────────────────────────────────────────────
  //
  // Rankd has one name and you chose it at the gate. Editing a SECOND one here
  // is what produced a profile headed JARRAD BISHOP (UNKNOWNENTITY) with the
  // same words repeated underneath. See `publicName` in lib/profile.ts.
  //
  // The handle itself is deliberately not editable here either: it is claimed
  // once, and a link somebody has already shared has to keep working.
  const [bio, setBio] = useState(me.bio ?? "");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="sheet-in w-full max-w-md rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <span className="mb-1.5 block font-display text-2xl tracking-wide text-gold">
          {publicName(me)}
        </span>
        {/* The sheet is headed by the name rather than by the word "You", which
            is both warmer and the only place the handle now needs restating. */}
        <p className="mb-4 text-sub leading-snug text-dim">Say something about your taste.</p>
        {/* 300 characters and four rows, not 120 and two.
            The old field was sized for the placeholder — "a line about your
            taste" — and people do not write one line. Worse, it accepted line
            breaks and the display then collapsed them, so anyone who tried to
            structure a longer bio watched it come back as one run-on sentence.
            `whitespace-pre-line` on the display is the other half of this fix
            and neither half works alone. */}
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={300}
          rows={4}
          placeholder="A line about your taste"
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm leading-snug text-text-hi outline-none placeholder:text-dim"
        />
        {/* Only once it is worth knowing. A counter from zero is pressure to
            fill it; a counter near the ceiling is useful information. */}
        {bio.length > 220 && (
          <p className="mt-1 text-right text-label text-dim">{300 - bio.length} left</p>
        )}
        <p className="mt-3 text-label leading-snug text-dim">
          Tap your picture to change it or the scene behind you.
        </p>
        <button
          onClick={() => {
            // The one field this sheet owns. A patch rather than a whole
            // object, so editing a bio cannot carry a stale avatar back with it.
            onSave({ bio: bio.trim() || null });
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
