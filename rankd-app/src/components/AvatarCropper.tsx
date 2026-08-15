"use client";

// Choosing which part of a photograph is you.
//
// The upload used to square-crop from the centre and go. That is a guess, and it
// is wrong for most photographs — faces sit off-centre, phones shoot 4:3, and a
// group shot has no correct centre at all. This is the screen that stops the app
// deciding on your behalf.
//
// ── The geometry, because this is where croppers go wrong ──────────────────
//
// One square viewport of `VIEWPORT` CSS pixels, with a circular mask drawn over
// it. The image is positioned by a translation `(tx, ty)` and a scale `s`, both
// in viewport space, and the INVARIANT is that the image always covers the
// viewport completely: `tx <= 0`, `ty <= 0`, `tx >= VIEWPORT - displayedWidth`,
// `ty >= VIEWPORT - displayedHeight`.
//
// Enforcing that on every change is what makes the crop safe. Without it you can
// drag a corner inward and upload an avatar with a transparent wedge in it —
// which no amount of clamping at render time can fix afterwards, because by then
// the picture has been written.
//
// `s` starts at the COVER scale (the smaller image dimension exactly fills the
// viewport) and only ever goes up, so the invariant is satisfiable at every zoom.

import { useEffect, useMemo, useRef, useState } from "react";

import { AVATAR_SIZE, cropAvatar, decodeImage, uploadAvatar, type CropBox } from "@/lib/avatar";

/** The square the crop is chosen in. The circle is inscribed in it. */
const VIEWPORT = 264;
/** How far in you can push a picture. Past this a 256px avatar is mush anyway. */
const MAX_ZOOM = 4;

interface View {
  /** Pixels of the image per pixel of the viewport. */
  s: number;
  tx: number;
  ty: number;
}

/** Hold the image over the whole viewport, whatever just changed. */
function clamp(v: View, w: number, h: number): View {
  const dw = w * v.s;
  const dh = h * v.s;
  return {
    s: v.s,
    tx: Math.min(0, Math.max(VIEWPORT - dw, v.tx)),
    ty: Math.min(0, Math.max(VIEWPORT - dh, v.ty)),
  };
}

/** The scale at which the smaller side exactly fills the viewport. */
const coverScale = (w: number, h: number) => VIEWPORT / Math.min(w, h);

export function AvatarCropper({
  file,
  onCancel,
  onUploaded,
}: {
  file: File;
  onCancel: () => void;
  onUploaded: (url: string) => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A plain object URL for display. The bitmap is for measuring and for the
  // final draw; an <img> is what the browser can composite cheaply while
  // somebody drags it around.
  //
  // DERIVED, not state. Holding it in state meant setting it synchronously
  // inside the effect below, which is a cascading render for a value that is a
  // pure function of `file` — there is nothing to synchronise. Revoking still
  // needs an effect, because that is the cleanup half.
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  // Live pointers, so one finger pans and two pinch. Keyed by pointerId because
  // a second finger landing must not be mistaken for the first one teleporting.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ dist: number; s: number; mx: number; my: number } | null>(null);

  useEffect(() => {
    let dead = false;
    let made: ImageBitmap | null = null;
    void decodeImage(file)
      .then((bm) => {
        if (dead) {
          bm.close();
          return;
        }
        made = bm;
        setBitmap(bm);
        const s = coverScale(bm.width, bm.height);
        // Centred to begin with. That is a fine STARTING point — it is only
        // wrong as a final answer, which is what this screen exists to fix.
        setView(
          clamp({ s, tx: (VIEWPORT - bm.width * s) / 2, ty: (VIEWPORT - bm.height * s) / 2 }, bm.width, bm.height),
        );
      })
      .catch(() => !dead && setError("That image could not be read."));
    return () => {
      dead = true;
      made?.close();
    };
  }, [file]);

  const mid = (ps: { x: number; y: number }[]) => ({
    x: (ps[0].x + ps[1].x) / 2,
    y: (ps[0].y + ps[1].y) / 2,
  });
  const dist = (ps: { x: number; y: number }[]) => Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);

  /**
   * Zoom about a fixed point of the VIEWPORT, so the thing under the fingers
   * stays under the fingers. Anchoring at the centre instead is a few lines
   * shorter and feels subtly wrong the moment anyone pinches off-centre.
   */
  const zoomAbout = (v: View, next: number, px: number, py: number, w: number, h: number): View =>
    clamp({ s: next, tx: px - ((px - v.tx) / v.s) * next, ty: py - ((py - v.ty) / v.s) * next }, w, h);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && view) {
      const ps = [...pointers.current.values()];
      const m = mid(ps);
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      gesture.current = { dist: dist(ps), s: view.s, mx: m.x - box.left, my: m.y - box.top };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!view || !bitmap) return;
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const ps = [...pointers.current.values()];
    if (ps.length >= 2 && gesture.current) {
      const g = gesture.current;
      const base = coverScale(bitmap.width, bitmap.height);
      const next = Math.min(base * MAX_ZOOM, Math.max(base, (g.s * dist(ps)) / (g.dist || 1)));
      setView((v) => (v ? zoomAbout(v, next, g.mx, g.my, bitmap.width, bitmap.height) : v));
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    setView((v) => (v ? clamp({ s: v.s, tx: v.tx + dx, ty: v.ty + dy }, bitmap.width, bitmap.height) : v));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const setZoom = (z: number) => {
    if (!bitmap || !view) return;
    const base = coverScale(bitmap.width, bitmap.height);
    // The slider zooms about the middle of the circle, which is where the
    // subject is by definition once it has been positioned.
    setView((v) => (v ? zoomAbout(v, base * z, VIEWPORT / 2, VIEWPORT / 2, bitmap.width, bitmap.height) : v));
  };

  /** The viewport square, expressed in the source image's own pixels. */
  const boxOf = (v: View): CropBox => ({ x: -v.tx / v.s, y: -v.ty / v.s, size: VIEWPORT / v.s });

  const confirm = async () => {
    if (!bitmap || !view || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, type } = await cropAvatar(bitmap, boxOf(view));
      onUploaded(await uploadAvatar(blob, type));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That could not be uploaded.");
      setBusy(false);
    }
  };

  const base = bitmap ? coverScale(bitmap.width, bitmap.height) : 1;
  const zoom = view ? view.s / base : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="sheet-in w-full max-w-md rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <span className="mb-1 block font-display text-2xl tracking-wide text-gold">Your picture</span>
        <p className="mb-4 text-[11px] leading-snug text-dim">Drag to move it. Pinch or use the slider to zoom.</p>

        {/* The stage. `touch-action: none` so the browser does not claim the
            drag for scrolling before the handlers see it — the same reason the
            duel screen's posters set it. */}
        <div
          className="relative mx-auto overflow-hidden"
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none", background: "var(--bg)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {view && bitmap && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: bitmap.width * view.s,
                height: bitmap.height * view.s,
                transform: `translate(${view.tx}px, ${view.ty}px)`,
                maxWidth: "none",
              }}
            />
          )}
          {/* The mask is drawn OVER the image rather than clipping it, so you can
              see what is being cut off and drag it in deliberately. A crop you
              cannot see the edges of is a crop you have to guess at. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "color-mix(in srgb, var(--bg) 72%, transparent)",
              WebkitMaskImage: "radial-gradient(circle at center, transparent 0 49.5%, #000 50%)",
              maskImage: "radial-gradient(circle at center, transparent 0 49.5%, #000 50%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--gold) 60%, transparent)" }}
          />
        </div>

        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          aria-label="Zoom"
          disabled={!bitmap}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="mt-4 w-full"
          style={{ accentColor: "var(--gold)" }}
        />

        {error && <p className="mt-2 text-[11px] leading-snug text-gold">{error}</p>}

        <button
          onClick={confirm}
          disabled={!bitmap || busy}
          className="mt-3 w-full rounded-full py-3 text-sm font-bold active:scale-[0.99] disabled:opacity-40"
          style={{ color: "#1c1405", background: "var(--gold)" }}
        >
          {busy ? "Uploading…" : "Use this picture"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="mt-2 w-full py-2 text-center text-xs font-semibold text-dim active:scale-95 disabled:opacity-40"
        >
          Cancel
        </button>
        <p className="mt-3 text-center text-[10px] text-dim">
          Saved at {AVATAR_SIZE}×{AVATAR_SIZE}
        </p>
      </div>
    </div>
  );
}
