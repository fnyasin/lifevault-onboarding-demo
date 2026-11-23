"use client";
// Milestone, shown right after the family names their first face.
//
// A celebratory count headline ("23 photos of Dad."), a batch-progress bar, a
// layered photo stack, and a three-button action row (undo / skip / "I've got
// a story"). This is the "keep going through the batch" moment: one photo at a
// time, so nobody faces a wall of 300 scans at once.
//
// Fully presentational: all data and handlers arrive as props. No fetching, no
// AI here, the parent wires those up.
//
// Interaction: the action row never moves (Back dims instead of disappearing),
// and button presses fly the card off in the matching direction, Skip → left,
// "I've got a story" → right, same as the swipe gestures.
//
// (The product also has a Starter-plan variant of this screen; this demo shows
// the Premium flow only.)
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeCardFit, type CardFit } from "@/lib/cardFit";

export type MilestoneProps = {
  /** The person the family just named (interpolated into the copy). */
  personName: string;
  /** How many photos of this person were found. */
  photoCount?: number;
  /** Photo URLs for the stack (front-most first). */
  photoUrls?: string[];
  /** Primary action: "I've got a story". */
  onContinue: () => void;
  /** Advance without a story ("Skip"). */
  onSkip?: () => void;
  /** Step back to the previous photo (undo). */
  onBack?: () => void;
  /** 1-based position within the batch (default 1). */
  batchIndex?: number;
  /** Total photos in the batch (default 10). */
  batchTotal?: number;
  /** Union face boxes aligned with photoUrls. */
  photoFaces?: (FaceBox | null)[];
  /** ORIGINAL-size urls aligned with photoUrls. */
  photoOrigUrls?: (string | undefined)[];
};

const SERIF = "[font-family:var(--font-gotu),Georgia,serif]";

export type FaceBox = { x: number; y: number; w: number; h: number };

// useLayoutEffect on the client (measure BEFORE paint so a cached/preloaded
// photo never flashes an empty card for a frame), useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Mobile only: the immersive milestone is a FIXED, non-scrolling stage pinned
// below the top banner. Locking page scroll while it's mounted
// is what stops iOS Safari's collapsing toolbar from leaving the card parked
// mid-screen, with nothing to scroll, it can't land anywhere but the top.
// Restores on unmount and steps aside on landscape ≥1024 (tablet-landscape +
// desktop), which use the scrolling wide composition. This must mirror EXACTLY
// when the fixed stage is shown (Milestone: `landscape:lg:hidden`), immersive
// shows in portrait (any width) OR any sub-desktop width.
function ImmersiveStageLock() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Complement of the wide comp's `landscape AND min-width:1024`: portrait
    // (phone + tablet held upright) or any width below desktop.
    const mq = window.matchMedia("(orientation: portrait), (max-width: 1023.98px)");
    const html = document.documentElement;
    const body = document.body;
    const clear = () => { html.style.overflow = ""; body.style.overflow = ""; body.style.overscrollBehavior = ""; };
    const apply = () => {
      if (mq.matches) {
        window.scrollTo(0, 0);
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
      } else clear();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); clear(); };
  }, []);
  return null;
}

// Full-card photo that keeps the PEOPLE in frame.
// The face box lives in ORIGINAL-scan pixels, so this measures against the
// ORIGINAL image's natural size and applies computeCardFit: fill the card
// (cover) when the whole face group fits, otherwise zoom only as far as keeps
// everyone visible and let a soft blur/matte fill the remainder, never crop
// a face. A tiny blurred thumbnail paints instantly underneath as both a
// low-res placeholder AND the gap fill.
function ImmersivePhoto({ src, thumbSrc, faceBox, alt = "" }: {
  src: string; thumbSrc?: string; faceBox?: FaceBox | null; alt?: string;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<CardFit | null>(null);

  // ONE measurement path: read the image's CURRENT
  // natural size + the card rect and compute the crop together, so a stale
  // dimension can never be paired with a new src. Called on mount (cached =
  // measured before paint), on the image's own load (uncached), and on card
  // resize.
  const measure = useCallback(() => {
    const holder = holderRef.current, img = imgRef.current;
    if (!holder || !img || !img.naturalWidth || !img.naturalHeight) return;
    const r = holder.getBoundingClientRect();
    setFit(computeCardFit(img.naturalWidth, img.naturalHeight, r.width, r.height, faceBox ?? null));
  }, [faceBox]);

  // Reset the crop the instant src changes (BEFORE paint, so the old crop is
  // never shown on the new photo, which would look like a stuck frame), then
  // measure. For a cached/preloaded image this resolves before the first paint.
  useIsoLayoutEffect(() => {
    setFit(null);
    measure();
    const holder = holderRef.current;
    if (!holder) return;
    const ro = new ResizeObserver(measure);
    ro.observe(holder);
    return () => ro.disconnect();
  }, [src, measure]);

  return (
    <div ref={holderRef} className="absolute inset-0 overflow-hidden rounded-[20px] bg-[#e7e2d6]">
      {/* Blurred thumbnail base whenever the sharp original isn't covering the
          card yet, i.e. still measuring/loading (!fit) OR a safe-zoom/letterbox
          fit (gaps). This is the real anti-flash safety net: there's
          never a bare matte frame, even on a preload miss or slow decode. */}
      {thumbSrc && (!fit || fit.gaps) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbSrc} alt="" aria-hidden draggable={false}
          className="absolute inset-0 h-full w-full scale-110 select-none object-cover blur-2xl brightness-[0.82]" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={measure}
        style={fit
          ? { position: "absolute", left: `${fit.left}px`, top: `${fit.top}px`, width: `${fit.imgW}px`, height: `${fit.imgH}px`, maxWidth: "none", visibility: "visible" }
          : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", visibility: "hidden" }}
        className="select-none"
      />
    </div>
  );
}

const BODY = "[font-family:var(--font-lato),system-ui,sans-serif]";

// One white-matte photo card in the stack. Center-positioned by percentages of
// the stack box so the whole composition scales; the photo fills the card
// edge-to-edge (object-cover), never a small image floating in a bigger box.
function StackCard({
  src, alt = "", x, y, w, aspect, rotate, z, scale = 1,
}: {
  /** Photo for this card; omitted → neutral matte blank (never a stock photo). */
  src?: string;
  alt?: string;
  x: number;      // card center, % of stack width
  y: number;      // card center, % of stack height
  w: number;      // card width, % of stack width
  aspect: string; // CSS aspect-ratio, e.g. "428 / 324"
  rotate: number; // degrees
  z: number;
  scale?: number;
}) {
  return (
    <div
      className="absolute rounded-[12px] border-[7px] border-white bg-white shadow-[0px_2px_5px_rgba(0,0,0,0.08),0px_10px_22px_rgba(0,0,0,0.2)] sm:border-[8px] lg:border-[10px]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        aspectRatio: aspect,
        transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
        zIndex: z,
      }}
    >
      {src ? (
        // Signed URLs are short-lived, so plain img (skip the optimizer).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full rounded-[4px] object-cover" />
      ) : (
        <div className="h-full w-full rounded-[4px] bg-[#e7e2d6]" />
      )}
    </div>
  );
}

// How far (px) the card must travel horizontally to count as a swipe.
const SWIPE_THRESHOLD = 90;
// Tinder-feel timing: the card takes its time leaving (no fade, it slides
// fully off-screen), and the next card is already waiting in the same frame.
const EXIT_MS = 460;
// Every card carries a PERMANENT per-photo lean, consecutive photos alternate
// a gentle clockwise / counter-clockwise tilt, like prints laid down by hand.
// A card keeps its own lean when it promotes from "next up" to hero, so the
// deck never straightens a photo as it comes forward, it just slides in,
// already tilted. `index` is 0-based within the batch.
const REST_TILT = (index: number) => (index % 2 === 0 ? 2 : -2.11);
const NEXT_SCALE = 1;

// The hero photo card, draggable like a deck of prints. Follows the pointer,
// tilts with the drag, and past the threshold slides off and commits: right =
// "I've got a story", left = skip. Under the threshold it springs back with a
// little bounce. Stamps fade in on the photo as you drag (and show during a
// button-triggered exit) so the gesture explains itself, Tinder-style.
function DraggableHero({
  src, alt, onSwipeRight, onSwipeLeft, leave = 0, restTilt = 2, immersive = false, faceBox = null, origSrc, photoOverlay,
}: {
  src?: string;
  alt: string;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  /** Externally-triggered fly-off (button presses): 1 = right, -1 = left. */
  leave?: 0 | 1 | -1;
  /** This photo's permanent lean in degrees, the card rests here. */
  restTilt?: number;
  /** Full-bleed Bumble-style card: fills its container, no white matte. */
  immersive?: boolean;
  /** Union face box (original pixels), centers the immersive cover crop. */
  faceBox?: FaceBox | null;
  /** Signed ORIGINAL url, the immersive crop measures against it. */
  origSrc?: string;
  /** Content that rides ON the card (name + scrim) so it flies off WITH the
   *  photo on a swipe, instead of the photo sliding under a fixed layer. */
  photoOverlay?: React.ReactNode;
}) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false, leaving: 0 as 0 | 1 | -1 });
  const start = useRef<{ x: number; y: number } | null>(null);
  // The live horizontal offset, read when the pointer lets go. Kept in a ref
  // so deciding the swipe never happens inside a state updater (React may run
  // updaters twice in development, which fired the callback twice).
  const dxRef = useRef(0);
  // A button press and a drag both end the same way: the card leaves.
  const leaving = leave !== 0 ? leave : drag.leaving;

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
    start.current = { x: e.clientX, y: e.clientY };
    dxRef.current = 0;
    setDrag(d => ({ ...d, active: true }));
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || leaving) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    dxRef.current = dx;
    setDrag(d => ({ ...d, dx, dy }));
  }
  function onPointerEnd() {
    if (!start.current || leaving) return;
    start.current = null;
    // Committing a swipe fires the callback SYNCHRONOUSLY, the parent owns
    // the fly-then-act timing (flyThenRun), so a swipe and a button press can
    // never double-schedule against each other. The internal `leaving` only
    // drives this card's exit animation.
    const dx = dxRef.current;
    if (dx > SWIPE_THRESHOLD && onSwipeRight) {
      setDrag(d => ({ ...d, active: false, leaving: 1 }));
      queueMicrotask(onSwipeRight);
      return;
    }
    if (dx < -SWIPE_THRESHOLD && onSwipeLeft) {
      setDrag(d => ({ ...d, active: false, leaving: -1 }));
      queueMicrotask(onSwipeLeft);
      return;
    }
    setDrag({ dx: 0, dy: 0, active: false, leaving: 0 });
  }

  const flyX = (typeof window !== "undefined" && window.innerWidth) || 1200;
  // Exit: slide fully off-screen (opacity stays 1, like tossing a card), with
  // a capped tilt and a touch of downward drift. Otherwise: follow the drag.
  const dx = leaving ? leaving * flyX * 1.1 : drag.dx;
  const dy = leaving ? drag.dy + 40 : drag.dy;
  // The card sits at its permanent lean (restTilt) from the first frame, no
  // entrance "straighten", and dragging adds a little tilt toward the throw.
  const tilt = leaving ? leaving * 22 : restTilt + drag.dx / 18;
  const rightHint = leaving === 1 ? 1 : Math.min(1, Math.max(0, drag.dx - 8) / SWIPE_THRESHOLD);
  const leftHint = leaving === -1 ? 1 : Math.min(1, Math.max(0, -drag.dx - 8) / SWIPE_THRESHOLD);
  // Exits get the long toss; releasing a drag below the threshold springs the
  // card back to its lean with a gentle overshoot.
  const transition = drag.active
    ? "none"
    : leaving
      ? `transform ${EXIT_MS}ms cubic-bezier(0.2, 0.65, 0.4, 1)`
      : "transform 300ms cubic-bezier(0.2, 0.9, 0.35, 1.2)";

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className={`absolute ${
        immersive
          ? "overflow-hidden rounded-[20px] bg-[#e7e2d6] shadow-[0px_10px_26px_rgba(0,0,0,0.22)]"
          : "rounded-[12px] border-[7px] border-white bg-white shadow-[0px_2px_5px_rgba(0,0,0,0.08),0px_10px_22px_rgba(0,0,0,0.2)] sm:border-[8px] lg:border-[10px]"
      } ${
        onSwipeRight || onSwipeLeft ? (drag.active ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{
        left: immersive ? "50%" : "49.9%",
        top: immersive ? "50%" : "49.7%",
        width: immersive ? "100%" : "97.3%",
        ...(immersive ? { height: "100%" } : { aspectRatio: "428 / 324" }),
        zIndex: 30,
        touchAction: "none",
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${tilt}deg)`,
        transition,
      }}
    >
      {src ? (
        immersive ? (
          // Face-aware fit: fill the card when the group fits, safe-zoom +
          // soft fill when it doesn't, nobody cut out of their own photo.
          <ImmersivePhoto src={origSrc ?? src} thumbSrc={src} faceBox={origSrc ? faceBox : null} alt={alt} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} draggable={false} className="h-full w-full select-none rounded-[4px] object-cover" />
        )
      ) : (
        <div className={`h-full w-full bg-[#e7e2d6] ${immersive ? "rounded-[20px]" : "rounded-[4px]"}`} />
      )}
      {immersive && photoOverlay && (
        <div className="pointer-events-none absolute inset-0 z-10">{photoOverlay}</div>
      )}
      {/* Tinder-style stamps: fade in with the drag, hold during the exit. */}
      {(onSwipeRight || onSwipeLeft) && (
        <>
          <span
            aria-hidden
            style={{ opacity: rightHint }}
            className="absolute left-5 top-5 -rotate-12 rounded-[10px] border-[3px] border-[#3c7a7c] bg-white/85 px-4 py-1.5 text-[22px] font-extrabold tracking-wide text-[#3c7a7c] shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          >
            I&rsquo;ve got a story
          </span>
          <span
            aria-hidden
            style={{ opacity: leftHint }}
            className="absolute right-5 top-5 rotate-12 rounded-[10px] border-[3px] border-[#1a1a1a]/45 bg-white/85 px-4 py-1.5 text-[22px] font-extrabold tracking-wide text-[#1a1a1a]/55 shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          >
            Skip
          </span>
        </>
      )}
    </div>
  );
}

// Layered stack of tilted matte photos, the Figma composition
// (a 440×516 box) with a true Tinder deck at its heart: the NEXT photo waits
// directly behind the hero in the SAME frame, at that photo's own permanent
// lean, so when the top card slides off, the one underneath is already there,
// same shape, same place, same tilt, and never straightens as it takes over.
// The angled portrait cards behind are the composition's decoration and show
// photos further down the line. Slots without a real photo render neutral
// matte blanks (never stock photos). `swipeKey` remounts the hero per photo.
function PhotoStack({
  urls, alt, onSwipeRight, onSwipeLeft, swipeKey, leave = 0, baseIndex = 0,
  immersive = false, children, faces, origUrls, photoOverlay,
}: {
  urls: string[];
  alt: string;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  swipeKey?: string | number;
  /** Fly the hero off without a drag (button presses): 1 = right, -1 = left. */
  leave?: 0 | 1 | -1;
  /** 0-based index of the hero photo within the batch, drives the per-photo lean. */
  baseIndex?: number;
  /** Bumble-style phone treatment (Fatimah): ONE full-bleed photo card, no
   *  fanned pile, no tilt, no matte, with the overlay (headline + actions)
   *  passed as children and rendered ON the photo. The next photo waits
   *  directly behind, full-frame, so swipes still reveal it seamlessly. */
  immersive?: boolean;
  children?: React.ReactNode;
  /** Union face boxes aligned with urls, steers the immersive crops. */
  faces?: (FaceBox | null)[];
  /** Signed ORIGINAL urls aligned with urls, measured for the immersive crop. */
  origUrls?: (string | undefined)[];
  /** On-card overlay (name + scrim) that rides with the hero on a swipe. */
  photoOverlay?: React.ReactNode;
}) {
  // Warm the NEXT originals so a promoted hero paints immediately instead of
  // flashing its placeholder while the full-res image downloads.
  const preloadKey = (origUrls ?? []).join("|");
  useEffect(() => {
    if (!immersive || typeof window === "undefined") return;
    for (const u of [origUrls?.[1], origUrls?.[2], origUrls?.[3]]) {
      if (u) { const im = new window.Image(); im.src = u; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, preloadKey]);

  if (immersive) {
    return (
      <div className="relative h-full w-full">
        {urls[1] ? (
          <ImmersivePhoto
            src={origUrls?.[1] ?? urls[1]}
            thumbSrc={urls[1]}
            faceBox={origUrls?.[1] ? (faces?.[1] ?? null) : null}
          />
        ) : (
          <div className="absolute inset-0 z-10 rounded-[20px] bg-[#e7e2d6]" />
        )}
        <DraggableHero
          key={swipeKey ?? "hero"}
          src={urls[0]}
          alt={alt}
          onSwipeRight={onSwipeRight}
          onSwipeLeft={onSwipeLeft}
          leave={leave}
          restTilt={0}
          immersive
          faceBox={faces?.[0] ?? null}
          origSrc={origUrls?.[0]}
          photoOverlay={photoOverlay}
        />
        <div className="pointer-events-none absolute inset-0 z-40">{children}</div>
      </div>
    );
  }
  return (
    <div className="relative mx-auto w-full max-w-[352px] lg:max-w-[470px]" style={{ aspectRatio: "440 / 516" }}>
      {/* Decorative depth, the wide matte peeking below stays neutral. */}
      <StackCard x={52.4} y={45.2} w={91.8} aspect="404 / 304" rotate={-2} z={0} />
      {/* Decorative angle cards, static blank mattes, for stack depth only.
          They deliberately DON'T carry photos: when they showed shifting photos,
          the background appeared to churn on every swipe, which read as
          distracting. Only the hero + the next-up card carry real photos. */}
      <StackCard x={49.9} y={42.9} w={68.6} aspect="302 / 400" rotate={-9} z={10} />
      <StackCard x={51.6} y={52} w={68.6} aspect="302 / 400" rotate={9} z={20} />
      {/* Next up, same frame as the hero, at THAT photo's permanent lean so
          it doesn't shift when it promotes. */}
      <StackCard
        src={urls[1]}
        x={49.9} y={49.7} w={97.3} aspect="428 / 324"
        rotate={REST_TILT(baseIndex + 1)} scale={NEXT_SCALE} z={25}
      />
      <DraggableHero
        key={swipeKey ?? "hero"}
        src={urls[0]}
        alt={alt}
        onSwipeRight={onSwipeRight}
        onSwipeLeft={onSwipeLeft}
        leave={leave}
        restTilt={REST_TILT(baseIndex)}
      />
    </div>
  );
}

// Segmented batch-progress bar (Figma: 10 dashes, filled up to the current one).
function BatchProgress({ index, total }: { index: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const safeIndex = Math.min(Math.max(index, 1), safeTotal);
  return (
    <div className="mx-auto w-full max-w-[220px] text-center sm:max-w-[276px] lg:max-w-[320px]">
      <p className={`text-[13px] font-bold text-[#1a1a1a]/45 sm:text-[14px] lg:text-[13px] lg:font-normal ${BODY}`}>
        {safeIndex} of {safeTotal}
        <span className="hidden sm:inline"> in this batch</span>
      </p>
      <div className="mt-2.5 flex gap-[3px] sm:gap-1 lg:gap-1.5">
        {Array.from({ length: safeTotal }).map((_, n) => (
          <span
            key={n}
            className={`h-[4px] flex-1 rounded-full lg:h-[3px] ${n < safeIndex ? "bg-[#3c7a7c]" : "bg-[#e4e1d8]"}`}
          />
        ))}
      </div>
    </div>
  );
}

// Round action button used in the footer row. Disabled buttons
// keep their exact footprint (dim, not gone) so the row NEVER shifts, you can
// park the mouse on Skip and keep pressing.
function CircleButton({
  label, onClick, variant = "plain", icon, disabled = false,
  sizeClasses = "h-[62px] w-[62px]",
  hideLabelBelowLg = false,
  hideLabel = false,
}: {
  label: string;
  onClick?: () => void;
  variant?: "plain" | "primary";
  icon: React.ReactNode;
  disabled?: boolean;
  /** Responsive circle diameter. Defaults to the uniform desktop 62px. */
  sizeClasses?: string;
  /** Figma tablet/mobile frames leave Back unlabeled; aria-label still names it. */
  hideLabelBelowLg?: boolean;
  /** Immersive deck: icons sit on the photo, no visible labels at all. */
  hideLabel?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <div className={`relative flex flex-col items-center ${disabled ? "opacity-30" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`grid ${sizeClasses} place-items-center rounded-full transition-all duration-100 enabled:active:scale-[0.96] disabled:cursor-default ${
          primary
            ? "bg-[#3c7a7c] text-white shadow-[0_10px_24px_rgba(60,122,124,0.28)] enabled:hover:bg-[#336a6c]"
            : "border border-[#e4e1d8] bg-white text-[#1a1a1a]/55 shadow-[0_6px_16px_rgba(0,0,0,0.05)] enabled:hover:text-[#1a1a1a]"
        }`}
      >
        {icon}
      </button>
      {/* Below lg the label hangs under the circle without adding to the row's
          height, so the differently-sized circles share one centre line
          (Figma). At lg it returns to the flow, desktop layout unchanged. */}
      {!hideLabel && (
        <span
          className={`absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[12px] lg:static lg:translate-x-0 lg:text-[13px] ${
            hideLabelBelowLg ? "hidden lg:block" : ""
          } ${BODY} ${primary ? "font-semibold text-[#3c7a7c]" : "text-[#1a1a1a]/45"}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default function Milestone({
  personName,
  photoCount,
  photoUrls,
  onContinue,
  onSkip,
  onBack,
  batchIndex = 1,
  batchTotal = 10,
  photoFaces,
  photoOrigUrls,
}: MilestoneProps) {
  const urls = photoUrls?.filter(Boolean) ?? [];
  const photoAlt = `A photo of ${personName} we found in your vault`;

  // Button-triggered fly-off (Skip → left, "I've got a story" → right): the
  // card animates out, THEN the action fires. Pressing again mid-flight
  // flushes the pending action first, so rapid presses never lose a click.
  const [leave, setLeave] = useState<0 | 1 | -1>(0);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; action: () => void } | null>(null);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer); }, []);

  function flyThenRun(dir: 1 | -1, action?: () => void) {
    if (!action) return;
    if (pending.current) {
      clearTimeout(pending.current.timer);
      const prev = pending.current;
      pending.current = null;
      setLeave(0);
      prev.action(); // advance the in-flight card immediately
    }
    setLeave(dir);
    // Commit slightly before the exit animation finishes so the promotion of
    // the next card overlaps the tail of the toss, one continuous motion.
    const timer = setTimeout(() => {
      pending.current = null;
      setLeave(0);
      action();
    }, EXIT_MS - 80);
    pending.current = { timer, action };
  }

  // Count-free headline when we don't know the number yet
  const headline =
    photoCount != null
      ? `${photoCount} photo${photoCount === 1 ? "" : "s"} of ${personName}.`
      : `Photos of ${personName}.`;
  return (
    // NO min-h-screen on phones: the immersive card is already sized to the
    // viewport (100svh − chrome), so forcing the main to a FULL 100vh on top of
    // the ~44px top banner made the page 44px taller than the screen, that
    // overflow is what left the top scrolled off (Fatimah, iPhone), and no
    // scroll-reset can fix an over-tall page. Let the page be exactly its
    // content on mobile; desktop keeps min-h-screen.
    <main className={`bg-[#fafafa] ${BODY} px-6 pt-4 pb-10 lg:min-h-screen lg:pt-10 lg:py-0`}>
      {/* PHONE (Fatimah, Bumble reference): one immersive full-bleed photo,
          no dashes, no pile, headline and the three actions float ON the
          photo over a bottom scrim. Swipe mechanics unchanged. Tablet and
          desktop keep the approved composition below. */}
      {/* Fixed, non-scrolling stage pinned below the top banner: its
          height is the true visible area (fixed inset-x + bottom-0 tracks iOS's
          dynamic toolbar), so the card can never open scrolled mid-screen. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[460px] overflow-hidden p-2.5 landscape:lg:hidden"
        style={{ top: "var(--top-banner-height, 0px)" }}
      >
        <ImmersiveStageLock />
        <PhotoStack
          immersive
          urls={urls}
          faces={photoFaces}
          origUrls={photoOrigUrls}
          alt={photoAlt}
          onSwipeRight={() => flyThenRun(1, onContinue)}
          onSwipeLeft={() => flyThenRun(-1, onSkip)}
          swipeKey={batchIndex}
          leave={leave}
          baseIndex={batchIndex - 1}
          photoOverlay={
            // Rides WITH the photo (flies off on a swipe): the scrim + the name.
            <>
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-[40%] rounded-b-[20px] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <h1 className={`${SERIF} absolute inset-x-0 bottom-[80px] px-5 text-[27px] leading-[1.12] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]`}>
                {headline}
              </h1>
            </>
          }
        >
          {/* Stays FIXED (deck controls, not part of any one photo): the action
              row, kept close to the bottom edge so more of the photo shows
              (Fatimah). */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-2">
            <div className="pointer-events-auto flex items-center justify-between">
              <CircleButton
                label="Back"
                onClick={onBack}
                disabled={!onBack}
                hideLabel
                sizeClasses="h-[46px] w-[46px]"
                icon={
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 14 4 9l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 9h9a7 7 0 0 1 0 14h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              />
              <div className="flex items-center gap-4">
                <CircleButton
                  label="Skip"
                  onClick={() => flyThenRun(-1, onSkip)}
                  hideLabel
                  sizeClasses="h-[56px] w-[56px]"
                  icon={
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  }
                />
                <CircleButton
                  label="I've got a story"
                  onClick={() => flyThenRun(1, onContinue)}
                  variant="primary"
                  hideLabel
                  sizeClasses="h-[66px] w-[66px]"
                  icon={
                    <svg className="h-[28px] w-[28px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z"
                        fill="currentColor"
                      />
                    </svg>
                  }
                />
              </div>
            </div>
          </div>
        </PhotoStack>
      </div>

      <div className="mx-auto hidden min-h-screen max-w-[1180px] flex-col items-center gap-8 landscape:lg:flex landscape:lg:flex-row landscape:lg:items-center landscape:lg:gap-16">
        {/* Left copy column (desktop). Below lg the copy leads: headline →
            subline (tablet only) → batch progress, matching the frames. */}
        <div className="w-full max-w-[540px] text-center lg:text-left">
          <h1
            className={`${SERIF} text-[23px] leading-[1.12] text-[#1a1a1a] sm:text-[30px] lg:text-[56px] lg:leading-[1.08]`}
          >
            {headline}
          </h1>
          <p className="mx-auto mt-2 hidden max-w-[420px] text-[16px] leading-[1.5] text-[#1a1a1a]/45 sm:block lg:mx-0 lg:mt-4 lg:text-[18px]">
            Swipe right the moment a photo sparks a story.
          </p>
          {/* Below lg the progress sits with the copy, under the headline/subline.
              Desktop keeps it above the deck in the right column. */}
          <div className="mt-2 sm:mt-6 lg:hidden">
            <BatchProgress index={batchIndex} total={batchTotal} />
          </div>
        </div>

        {/* Right column: progress (desktop) + photo stack + action row */}
        <div className="flex w-full max-w-[600px] flex-col items-center lg:flex-1">
          <div className="hidden w-full lg:block">
            <BatchProgress index={batchIndex} total={batchTotal} />
          </div>

          <div className="mt-0 w-full lg:mt-6">
            <PhotoStack
              urls={urls}
              alt={photoAlt}
              onSwipeRight={() => flyThenRun(1, onContinue)}
              onSwipeLeft={() => flyThenRun(-1, onSkip)}
              swipeKey={batchIndex}
              leave={leave}
              baseIndex={batchIndex - 1}
            />
          </div>

          {/* Action row, all three buttons always render (Back dims when
              there's nothing to undo) so nothing ever shifts under the mouse. */}
          <div className="mt-6 flex items-center justify-center gap-8 pb-8 sm:mt-8 sm:gap-10 lg:mt-4 lg:pb-0">
            <CircleButton
              label="Back"
              onClick={onBack}
              disabled={!onBack}
              sizeClasses="h-[44px] w-[44px] sm:h-[50px] sm:w-[50px] lg:h-[62px] lg:w-[62px]"
              hideLabelBelowLg
              icon={
                <svg className="h-5 w-5 lg:h-[22px] lg:w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 14 4 9l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 9h9a7 7 0 0 1 0 14h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            />
            <CircleButton
              label="Skip"
              onClick={() => flyThenRun(-1, onSkip)}
              sizeClasses="h-[58px] w-[58px] sm:h-[64px] sm:w-[64px] lg:h-[62px] lg:w-[62px]"
              icon={
                <svg className="h-6 w-6 lg:h-[22px] lg:w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              }
            />
            <CircleButton
              label="I've got a story"
              onClick={() => flyThenRun(1, onContinue)}
              variant="primary"
              sizeClasses="h-[70px] w-[70px] sm:h-[78px] sm:w-[78px] lg:h-[62px] lg:w-[62px]"
              icon={
                <svg className="h-[30px] w-[30px] lg:h-6 lg:w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 14.5v-9Z"
                    fill="currentColor"
                  />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </main>
  );
}
