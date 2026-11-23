"use client";
// "Someone here is loved.", the first moment inside the vault. In the product
// this surfaces the most-recurring face (face clustering, biggest cluster
// first), the family names it, and that name goes straight into the person's
// story swipe (/onboarding). In the demo the face is pre-marked on a sample
// photo and the name only lives in this browser tab.
//  - Name a face          → straight to the story flow for that person.
//  - Skip to someone else → the next most-surfaced face (or onboarding if none).
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { writeSession } from "@/lib/demo/session";

type Box = { x: number; y: number; w: number; h: number };
type Round = { clusterId: string; photoUrl: string; faceBox: Box | null; cropUrl: string | null };

const TEAL = "#3c7a7c";
// Brackets are WHITE (Fatimah: easier to spot against the photo); the stem
// stays teal with the tag.
const BRACKET = "#ffffff";

// The photo card (Fatimah's redesign): the FULL photo,
// everyone in it, nothing cropped or zoomed (blowing up the tiny face crop
// looked blurry), with teal viewfinder brackets and a "Who's this?" tag
// pinned on the target face. bounding_box is in ORIGINAL-pixel space; the
// image renders at its natural aspect, so one scale factor maps it onto the
// screen. FALLBACK (HEIC/no original → no trustworthy box): the old 3:2
// face-crop fill, no marker.
function PhotoWithFaceMarker({ round }: { round: Round }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const box = round.faceBox;
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number; cw: number; ch: number } | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img || !box || !img.naturalWidth || !img.naturalHeight || !img.clientWidth) { setRect(null); return; }
    const sx = img.clientWidth / img.naturalWidth;
    const sy = img.clientHeight / img.naturalHeight;
    // The detection box hugs the face, let the brackets breathe around it.
    const padX = box.w * 0.24;
    const padY = box.h * 0.28;
    const x = Math.max(0, (box.x - padX) * sx);
    const y = Math.max(0, (box.y - padY) * sy);
    setRect({
      x,
      y,
      w: Math.min(img.clientWidth - x, (box.w + padX * 2) * sx),
      h: Math.min(img.clientHeight - y, (box.h + padY * 2) * sy),
      cw: img.clientWidth,
      ch: img.clientHeight,
    });
  }, [box]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    return () => ro.disconnect();
  }, [measure]);

  if (!box) {
    // Fallback, the tight face crop filling a 3:2 card, as before.
    return (
      <div className="aspect-[3/2] overflow-hidden rounded-[8px] bg-[#e7e2d6]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={round.cropUrl ?? round.photoUrl}
          alt="The face we'd love you to name"
          className="h-full w-full object-cover"
          style={{ objectPosition: "50% 42%" }}
        />
      </div>
    );
  }

  // Marker geometry, bracket arms scale gently with the face so a small face
  // on mobile isn't swallowed by fixed-size corners; the tag drops below on a
  // little stem, flipping above when the face sits at the photo's bottom edge.
  const arm = rect ? Math.max(10, Math.min(16, rect.w * 0.24)) : 16;
  const thick = 3.5;
  const stemH = 12;
  const tagH = 30;
  const below = rect ? rect.y + rect.h + stemH + tagH + 4 <= rect.ch : true;
  const tagCx = rect ? Math.min(Math.max(rect.x + rect.w / 2, 56), rect.cw - 56) : 0;

  const corner = (top: boolean, left: boolean) =>
    rect && (
      <>
        <span
          aria-hidden
          className="absolute rounded-[1.5px]"
          style={{
            background: BRACKET, width: arm, height: thick,
            left: left ? rect.x : undefined, right: left ? undefined : rect.cw - rect.x - rect.w,
            top: top ? rect.y : undefined, bottom: top ? undefined : rect.ch - rect.y - rect.h,
          }}
        />
        <span
          aria-hidden
          className="absolute rounded-[1.5px]"
          style={{
            background: BRACKET, width: thick, height: arm,
            left: left ? rect.x : undefined, right: left ? undefined : rect.cw - rect.x - rect.w,
            top: top ? rect.y : undefined, bottom: top ? undefined : rect.ch - rect.y - rect.h,
          }}
        />
      </>
    );

  return (
    <div className="relative overflow-hidden rounded-[8px] bg-[#e7e2d6] leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={round.photoUrl}
        alt="A photo from your family's vault. The marked face is who we'd love you to name."
        onLoad={measure}
        // Natural aspect ALWAYS (no object-fit cropping): the element box must
        // equal the displayed image or the marker math drifts. Width/height
        // both auto, capped by the column and a viewport-friendly height.
        className="block h-auto w-auto max-w-full rounded-[8px]"
        style={{ maxHeight: "min(62vh, 560px)" }}
      />
      {rect && (
        <>
          {corner(true, true)}
          {corner(true, false)}
          {corner(false, true)}
          {corner(false, false)}
          <span
            aria-hidden
            className="absolute w-[2px]"
            style={{
              background: TEAL,
              height: stemH,
              left: rect.x + rect.w / 2 - 1,
              top: below ? rect.y + rect.h + 2 : rect.y - stemH - 2,
            }}
          />
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-[#e4e1d8] bg-[#fcfcfc] px-3 py-[7px] text-[13px] font-bold leading-none text-[#1a1a1a] shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
            style={{ left: tagCx, top: below ? rect.y + rect.h + stemH + 2 : rect.y - stemH - tagH - 2 }}
          >
            Who&apos;s this?
          </span>
        </>
      )}
    </div>
  );
}

export default function NameAFace({ rounds }: { rounds: Round[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = rounds[i] ?? null;

  // Straight into the story flow (milestone → story → summary).
  function goToStory() {
    // Dismiss the keyboard FIRST, its collapse racing the next screen is
    // what kept landing the milestone mid-scroll on iPhones.
    (document.activeElement as HTMLElement | null)?.blur?.();
    router.push("/onboarding");
  }

  // Skip = show the next most-surfaced face; out of faces → into the story flow.
  function skipToNext() {
    setName("");
    setError(null);
    if (i + 1 < rounds.length) setI(v => v + 1);
    else goToStory();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!round || !name.trim()) return;
    setBusy(true); setError(null);
    // The product saves the name as official metadata for this face cluster.
    // The demo keeps it in the tab so every headline after this uses it.
    writeSession({ subject: name.trim().slice(0, 40) });
    setBusy(false);
    // Named, into THEIR story swipe ("23 photos of Grandma").
    goToStory();
  }

  if (!round) return null;

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12 [font-family:var(--font-lato),system-ui,sans-serif]">
      {/* Giant faint "Welcome home" drifting right-to-left, W leading so it reads
          forward as it passes. Stills under reduced motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="lv-welcome absolute left-0 top-1/2 whitespace-nowrap leading-none text-black/[0.03] [font-family:var(--font-gotu),Georgia,serif]"
          style={{ fontSize: "clamp(280px, 72vh, 800px)" }}
        >
          Welcome home
        </span>
      </div>
      <style>{`
        @keyframes lvWelcome {
          0%   { transform: translate(100vw, -50%); }
          100% { transform: translate(-100%, -50%); }
        }
        .lv-welcome { transform: translate(100vw, -50%); animation: lvWelcome 180s linear infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .lv-welcome { animation: none; transform: translate(-6%, -50%); }
        }
      `}</style>

      {/* -mt-3: nudge the whole composition up 12px on phones (Fatimah). */}
      <div className="relative z-10 mx-auto -mt-3 flex w-full max-w-[1240px] flex-col-reverse items-center gap-[30px] md:gap-11 lg:mt-0 lg:flex-row lg:items-center lg:gap-20">
        {/* Copy + input */}
        {/* mt-1: title + everything under it sits 4px lower on phones (Fatimah). */}
        <div className="mt-1 w-full max-w-[520px] text-center lg:mt-0 lg:max-w-[440px] lg:text-left">
          <h1 className="mx-auto max-w-[422px] [font-family:var(--font-gotu),Georgia,serif] text-[27px] leading-[1.15] text-[#1a1a1a] md:text-[38px] lg:mx-0 lg:max-w-none lg:text-[46px]">
            Someone here is loved.
          </h1>
          <p className="mt-3.5 text-[16px] leading-[1.3] text-[#606171] md:text-[20px] lg:mt-3">We found the same face, year after year.</p>

          <p className="mt-6 text-[15px] text-[#717171] lg:mt-8">Who&apos;s this?</p>
          <form onSubmit={onSubmit} className="mt-2">
            <div className="flex items-center gap-2 rounded-[14px] border-[1.5px] border-[#e4e1d8] bg-white py-1.5 pl-5 pr-1.5 focus-within:border-[#3c7a7c]">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                aria-label="Who's this?"
                className="w-full bg-transparent py-2 text-[18px] text-[#1a1a1a] outline-none"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                aria-label="Save name"
                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[#3c7a7c] text-white disabled:opacity-40 enabled:hover:bg-[#336a6c] transition-colors"
              >
                <svg width="14" height="12" viewBox="0 0 12 10" fill="none" aria-hidden>
                  <path d="M1 5.2 4.2 8.4 11 1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>
          {error && <p role="alert" className="mt-3 text-[13px] font-medium text-[#e4534b]">{error}</p>}

          {/* 15px links on every breakpoint (13px was too small to tap/read
              on phones; the Figma uses 15). */}
          <p className="mt-[22px] text-[15px] text-[#717171] lg:mt-6">
            {/* Only offer "someone else" when there IS another surfaced face,
                otherwise the link used to silently jump out of the naming screen. */}
            {i + 1 < rounds.length && (
              <button type="button" onClick={skipToNext} disabled={busy} className="underline underline-offset-2 hover:no-underline">Skip to someone else</button>
            )}
          </p>
        </div>

        {/* Matte photo card, the FULL photo with the target face marked
            (Figma). Shrink-wraps the image so portrait photos get a
            snug matte instead of a wide empty one. */}
        <div className="flex w-full max-w-[500px] justify-center lg:max-w-[720px] lg:flex-1">
          <div className="inline-block rotate-[2.11deg] rounded-[16px] border-[10px] border-white bg-white shadow-[0_12px_5px_rgba(0,0,0,0.10),0_21px_21px_rgba(0,0,0,0.09),0_28px_47px_rgba(0,0,0,0.05)]">
            <PhotoWithFaceMarker key={round.clusterId} round={round} />
          </div>
        </div>
      </div>

    </main>
  );
}
