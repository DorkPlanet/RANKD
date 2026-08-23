// Why a film is where it is.
//
// ── The review-shaped hole, filled with something that is not a review ─────
//
// A review is prose ABOUT a film, published publicly. It is Letterboxd's primary
// object and they do it well, and building a worse one would be both obvious and
// pointless. But the appetite behind it is real: a ranking says WHERE something
// sits and nothing about why.
//
// So: a small fixed set of tags, tapped. The model is Uber's driver ratings —
// "was calm", "good conversation" — which work because they cost one tap, need
// no blank page, and produce something you can add up.
//
// ── Adding up is the whole point ───────────────────────────────────────────
//
// Prose cannot be compared. Tags can. Tapped across the films somebody ranks
// highest they become a SIGNATURE — "you rank for cinematography, sam ranks for
// score, neither of you for pacing" — and comparing signatures is the thing this
// app is for. That is not a feature a review could ever deliver, and it only
// works because there is a ranked order underneath to read them against.
//
// ── Fixed vocabulary, deliberately ─────────────────────────────────────────
//
// Free tags would be a second free-text field to moderate, on a surface that
// exists BECAUSE free text is hard. A closed list also means the counts mean the
// same thing for everybody, which is what makes them addable at all.
//
// These live on the `Film`, beside `lock`, because they are the same kind of
// thing: your judgement of a film. That keeps them local, synchronous, backed up
// with everything else, and out of the duel loop.

/**
 * The axes a film can be tagged on.
 *
 * Ten, chosen to be distinct rather than exhaustive. Overlapping options make a
 * signature meaningless — "script" and "dialogue" would split the same vote —
 * and a list long enough to scroll is a list nobody reads to the end of.
 */
export const TAGS = [
  "Cinematography",
  "Score",
  "Performance",
  "Script",
  "Pacing",
  "Ending",
  "Atmosphere",
  "Effects",
  "Ambition",
  "Originality",
] as const;

export type Tag = (typeof TAGS)[number];

/**
 * How many a single film may carry.
 *
 * Three forces a choice, and the choosing is where the signal is. Somebody who
 * can tick everything ticks everything, and a signature built from that says
 * only that they liked the film — which the ranking already said, better.
 */
export const MAX_TAGS = 3;

/** The longest a note may be. One thought, not a paragraph. */
export const NOTE_MAX = 140;

/**
 * How many tagged films before a signature is worth showing.
 *
 * Under this it is not a taste, it is a couple of taps. The same reasoning as
 * `MIN_FOR_LOCKED` in `taste.ts` before it was retired: a shape drawn from too
 * little invites a reading the data cannot support.
 */
export const MIN_FOR_SIGNATURE = 5;

/**
 * How far down the list tags still count toward the signature.
 *
 * A signature answers "what do you rank things HIGHLY for". Counting a tag on
 * your 400th film would let the things you were indifferent to outvote the
 * things you love, purely by being more numerous.
 */
export const SIGNATURE_DEPTH = 50;

/** Only real tags, no duplicates, never more than `MAX_TAGS`. */
export function cleanTags(raw: readonly string[] | undefined): Tag[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Tag[] = [];
  for (const value of raw) {
    if (!isTag(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export function isTag(value: string): value is Tag {
  return (TAGS as readonly string[]).includes(value);
}

/** Trim a note to something one person would read in one go. */
export function cleanNote(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, NOTE_MAX) : undefined;
}

export interface SignatureEntry {
  tag: Tag;
  count: number;
}

/**
 * What somebody ranks for, from the tags on the films they rank highest.
 *
 * Takes films already in rank order, best first — the caller has that ordering
 * and recomputing it here would be a second, possibly disagreeing answer.
 *
 * Returns an empty list rather than a thin one below `MIN_FOR_SIGNATURE`. An
 * honest nothing beats a shape drawn from three taps.
 */
export function signatureOf(ranked: readonly { tags?: string[] }[]): SignatureEntry[] {
  const counts = new Map<Tag, number>();
  let tagged = 0;

  for (const film of ranked.slice(0, SIGNATURE_DEPTH)) {
    const tags = cleanTags(film.tags);
    if (tags.length === 0) continue;
    tagged++;
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  if (tagged < MIN_FOR_SIGNATURE) return [];
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    // Ties broken by the fixed order rather than by insertion, so the same
    // library always produces the same signature.
    .sort((a, b) => b.count - a.count || TAGS.indexOf(a.tag) - TAGS.indexOf(b.tag));
}
