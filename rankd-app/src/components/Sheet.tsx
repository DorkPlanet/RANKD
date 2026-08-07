"use client";

// The app's bottom sheet, used by Profile and Trophies.
//
// DUPLICATE, KNOWINGLY. There is a second sheet in `ui.tsx` that the duel
// screen's panels use. This one existed because the duel's copy was trapped
// inside DuelScreen; that is no longer true, so the reason for the split is
// gone — but the two do not behave identically and merging them would change
// how these screens look:
//
//   ui.tsx    — plays an exit animation before unmounting; the whole sheet
//               scrolls as one.
//   this one  — closes immediately; the body scrolls inside a fixed frame, and
//               a long title truncates rather than wrapping.
//
// The better sheet is arguably a merge of the two (animated exit AND an
// internal scroll region), but that is a visual decision about screens that
// already look the way someone wanted them to, so it is left alone rather than
// quietly unified. Worth doing deliberately in a design pass.

export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="sheet-in flex max-h-[82vh] w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 flex-shrink-0 rounded-full bg-border" />
        <div className="mb-3 flex flex-shrink-0 items-baseline justify-between">
          <span className="min-w-0 truncate font-display text-2xl tracking-wide text-gold">{title}</span>
          <button onClick={onClose} className="ml-3 flex-shrink-0 text-sm font-semibold text-dim active:scale-95">
            Done
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
