"use client";

// The app's bottom sheet, shared by anything that isn't the duel screen's own
// chrome. Same shape as the one inside DuelScreen — grabber, gold title, Done,
// tap-outside to close — pulled out here so screens that aren't the duel can use
// it without importing from it.

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
