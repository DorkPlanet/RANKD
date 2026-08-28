// The two primitives the owner's profile and a visitor's share.
//
// ── Why these moved and the SCREENS did not ────────────────────────────────
//
// `PublicProfileView`'s header explains, correctly, why it is not `ProfileScreen`
// with a flag: the owner's page is a control surface where every block is a way
// into something, and a visitor can do none of it, so a shared component would be
// a large one with most of itself switched off.
//
// That argument is about the screens. It was never an argument for keeping two
// copies of a stat and a section heading, and the copies had already started to
// drift: the public `Section` had lost the `first` variant, so the first block on
// a visitor's profile drew a rule the owner's did not. Two files claiming in
// their own comments to "match" each other, doing it by hand.
//
// Nothing here holds state or touches storage, so the server component that
// renders a public profile can import it as happily as the client one.

/** A number over a small-caps label. The profile band, and the list's legend. */
export function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="block font-serif text-lg font-bold text-text-hi tabular-nums">
        {n.toLocaleString()}
      </span>
      <span className="block text-label font-bold uppercase tracking-[0.14em] text-dim">{label}</span>
    </>
  );
  // A stat that leads somewhere is a button; one that only reports is not. The
  // visitor's profile has no destinations, which is the whole difference.
  return onClick ? (
    <button onClick={onClick} className="active:scale-95">
      {body}
    </button>
  ) : (
    <div>{body}</div>
  );
}

/**
 * A block, with a rule above it.
 *
 * Sections used to be separated by space alone, which is why the page read as one
 * long run of text: eight headings all the same size with nothing between them,
 * so the eye had no edge to catch on.
 *
 * The rule fades out at both ends rather than running the full width. A hard line
 * is a border and says "these are different things"; a fading one is a breath and
 * says "same page, next idea", which is what these actually are.
 *
 * `first` omits it. A rule under a tab bar that already has a line under it would
 * be two rules a few pixels apart.
 */
export function Section({
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
      <div className="mb-2.5 text-label font-bold uppercase tracking-[0.18em] text-dim">{title}</div>
      {children}
    </section>
  );
}
