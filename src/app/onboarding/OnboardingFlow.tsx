"use client";
// The onboarding stepper: the screens a family walks through the first time
// they enter their vault, right after their photos are scanned.
//
// The batch model: one photo at a time on the Milestone stack. Swipe LEFT (or
// Skip) → next photo. After the whole batch: Celebration, then continue into
// another batch or head to the vault.
//
// Demo vs product: the product runs this on the family's own photos (clamped
// to what they actually have, so stock samples are never presented as their
// family). This demo runs on four bundled sample photos and never fetches.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assertScrollTop } from "@/lib/scrollReset";
import { SAMPLE_PHOTOS, DEMO_PHOTO_COUNT } from "@/lib/demo/photos";
import Milestone from "./Milestone";
import Celebration from "./Celebration";

type Phase = "swiping" | "celebration";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const asWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

export type OnboardingFlowProps = {
  /** The person the vault is mostly about: fills every headline. */
  subject: string;
  /** Photos per batch before the celebration moment. */
  batchTotal?: number;
};

export default function OnboardingFlow({
  subject,
  batchTotal = SAMPLE_PHOTOS.length,
}: OnboardingFlowProps) {
  const router = useRouter();

  const [i, setI] = useState(0); // 0-based position within the batch
  const [phase, setPhase] = useState<Phase>("swiping");
  const [round, setRound] = useState(0); // how many batches they've finished
  // Ref mirror of `i`: Milestone stores advance callbacks briefly (the card
  // flies off first, the action fires after), so rapid presses would otherwise
  // run stale closures and advance one photo instead of two.
  const pos = useRef(0);
  function go(n: number) {
    pos.current = n;
    setI(n);
  }

  // Each onboarding SCREEN is a `phase` (+ photo index `i`) inside ONE route,
  // so the global route-change scroll reset never fires between them. Reset to
  // the top whenever the screen changes (Fatimah, on iPhone: screens were
  // opening scrolled down, their header cut off).
  useEffect(() => assertScrollTop(), [phase, i]);

  // Make the browser's Back button step back through the onboarding SCREENS
  // and photos instead of leaving mid-flow. One history sentinel stays armed:
  // Back pops it, we step one screen (or one photo) back, and re-arm. On the
  // very first screen there's nothing to step back to, so Back is allowed to
  // leave (a visitor who arrived from a link must always be able to go back).
  const stepBack = useEffectEvent((): boolean => {
    if (phase === "celebration") { setPhase("swiping"); return true; }
    if (pos.current > 0) { go(pos.current - 1); return true; }
    return false; // first photo of the deck: let Back leave
  });
  useEffect(() => {
    window.history.pushState({ lvOnboarding: 1 }, "");
    const onPop = () => {
      if (stepBack()) window.history.pushState({ lvOnboarding: 1 }, "");
      else window.history.back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const effectiveTotal = Math.max(1, Math.min(batchTotal, SAMPLE_PHOTOS.length));

  function photoAt(n: number): string | undefined {
    return SAMPLE_PHOTOS[n % SAMPLE_PHOTOS.length]?.url;
  }

  function finish() {
    // The vault lands in a later step of this demo; until then, start over.
    router.push("/");
  }

  // Move to the next photo in the batch; the batch's end is the celebration.
  // Reads pos.current (not `i`) so it stays correct when called from a stored
  // callback while a previous advance is still animating.
  function advancePhoto() {
    const next = pos.current + 1;
    if (next >= effectiveTotal) {
      setPhase("celebration");
      return;
    }
    go(next);
    setPhase("swiping");
  }

  // "Show me N more": the product fetches the next window of the family's
  // photos. The demo only has four, so it deals the same deck again.
  function nextBatch() {
    setRound(r => r + 1);
    go(0);
    setPhase("swiping");
  }

  switch (phase) {
    case "swiping":
      return (
        <Milestone
          personName={subject}
          photoCount={DEMO_PHOTO_COUNT}
          photoUrls={[photoAt(i), photoAt(i + 1), photoAt(i + 2), photoAt(i + 3)].filter((u): u is string => !!u)}
          batchIndex={i + 1}
          batchTotal={effectiveTotal}
          // Story capture arrives in the next step of this demo; for now a
          // right swipe moves on like a skip.
          onContinue={advancePhoto}
          onSkip={advancePhoto}
          onBack={i > 0 ? () => go(pos.current - 1) : undefined}
        />
      );

    default: {
      // celebration: this batch is done
      const seen = (round + 1) * effectiveTotal;
      const remaining = Math.max(DEMO_PHOTO_COUNT - seen, 0);
      return (
        <Celebration
          personName={subject}
          photoUrl={photoAt(0)}
          photoCount={DEMO_PHOTO_COUNT}
          remainingCount={remaining}
          batchSize={effectiveTotal}
          ordinal={`${round === 0 ? "first" : "next"} ${asWord(effectiveTotal)}`}
          onContinue={nextBatch}
          onSkip={finish}
        />
      );
    }
  }
}
