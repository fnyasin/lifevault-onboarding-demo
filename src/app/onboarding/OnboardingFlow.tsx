"use client";
// The onboarding stepper: the screens a family walks through the first time
// they enter their vault, right after their photos are scanned.
//
// The batch model: one photo at a time on the Milestone stack. Swipe RIGHT (or
// "I've got a story") → StoryCapture → Summary for that photo. Swipe LEFT (or
// Skip) → next photo. After the whole batch: Celebration, then continue into
// another batch or head to the vault. Saving a memory opens "Share this
// memory", then lands in the vault.
//
// The story: "Continue" on the capture screen reads the words and returns
// place / date / event candidates, the Summary shows that catch for HUMAN
// review (remove or add chips), and only "Save memory" keeps anything. AI
// output is never saved without the person pressing Save.
//
// Demo vs product: the product runs this on the family's own photos (clamped
// to what they actually have, so stock samples are never presented as their
// family), sends the story to Claude, and saves to their private vault. This
// demo runs on four bundled sample photos, suggests chips with a local
// keyword matcher (lib/demo/suggest.ts), and saves to this browser tab only.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assertScrollTop } from "@/lib/scrollReset";
import { projectCaught, removeCaught, addCaught, type SummaryField } from "@/lib/storyCatch";
import type { TagCandidate } from "@/lib/photo-tags";
import type { VoiceRecording } from "@/lib/useVoiceRecorder";
import { SAMPLE_PHOTOS, DEMO_PHOTO_COUNT } from "@/lib/demo/photos";
import { suggestTagsSlowly, exampleStory } from "@/lib/demo/suggest";
import { saveMemory as keepMemory } from "@/lib/demo/session";
import Milestone from "./Milestone";
import Celebration from "./Celebration";
import StoryCapture from "./StoryCapture";
import Summary from "./Summary";
import ShareVaultModal from "@/app/components/ShareVaultModal";

type Phase = "swiping" | "story" | "summary" | "celebration";

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
  const [story, setStory] = useState("");
  const [caught, setCaught] = useState<TagCandidate[]>([]);
  const [catching, setCatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // After a memory saves, the "Share this memory" step opens over the
  // summary: invite family, then continue to the vault.
  const [sharing, setSharing] = useState(false);
  // Invalidates an in-flight extraction when the person leaves the story
  // screen, so a late response can never attach one photo's catch to another.
  const catchGen = useRef(0);
  // The recording of them TELLING this story. Held here until "Save memory".
  const [voiceTake, setVoiceTake] = useState<VoiceRecording | null>(null);
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
  // the top whenever the screen changes (Fatimah, on iPhone: the story screen
  // was opening scrolled down, its header cut off).
  useEffect(() => assertScrollTop(), [phase, i]);

  // Make the browser's Back button step back through the onboarding SCREENS
  // and photos instead of leaving mid-flow. One history sentinel stays armed:
  // Back pops it, we step one screen (or one photo) back, and re-arm. On the
  // very first screen there's nothing to step back to, so Back is allowed to
  // leave (a visitor who arrived from a link must always be able to go back).
  const stepBack = useEffectEvent((): boolean => {
    if (phase === "summary") { setPhase("story"); return true; }
    if (phase === "story") { leaveStoryState(); setPhase("swiping"); return true; }
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

  function photoAt(n: number) {
    return SAMPLE_PHOTOS[n % SAMPLE_PHOTOS.length];
  }

  function finish() {
    setSharing(false);
    // Finishing lands on the PHOTO GRID: the one-time reveal. (In the product,
    // every later login lands on Activity instead.)
    router.push("/vault?welcome=1");
  }

  function leaveStoryState() {
    catchGen.current++;
    setCatching(false);
    setStory("");
    setCaught([]);
    setSaveError(null);
    // One photo's recording can never attach to the next.
    setVoiceTake(null);
  }

  // Move to the next photo in the batch; the batch's end is the celebration.
  // Reads pos.current (not `i`) so it stays correct when called from a stored
  // callback while a previous advance is still animating.
  function advancePhoto() {
    leaveStoryState();
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

  // Story → Summary: read the words for candidates. Extraction is
  // best-effort: any failure just means an empty catch; the flow never blocks.
  async function catchStory() {
    const s = story.trim();
    if (!s) { setCaught([]); setPhase("summary"); return; }
    const gen = ++catchGen.current;
    setCatching(true);
    let tags: TagCandidate[] = [];
    try {
      tags = await suggestTagsSlowly(s, subject);
    } catch { /* extraction is optional: never block the flow */ }
    if (gen !== catchGen.current) return; // they left this story: drop the late catch
    setCaught(tags);
    setCatching(false);
    setPhase("summary");
  }

  // Final save: the product writes the story as a photo comment, uploads the
  // voice note, and adds each kept chip as a photo tag. The demo keeps the
  // same record in this browser tab so the vault can show it.
  function saveMemory(idx: number, after: () => void) {
    const s = story.trim();
    const hasContent = !!s || caught.length > 0 || !!voiceTake;
    if (!hasContent) { after(); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const photo = photoAt(idx);
      keepMemory({
        photoId: photo.id,
        photoUrl: photo.url,
        story: s,
        people: summaryDetails().people,
        tags: caught,
        voiceNoteMs: voiceTake?.durationMs ?? null,
        savedAt: new Date().toISOString(),
      });
      setSaving(false);
      after();
    } catch {
      setSaving(false);
      setSaveError("That didn’t save. Please try again.");
    }
  }

  // What the Summary displays, projected from the caught candidates. The
  // person they named is on every sample photo in the demo, so their chip
  // always shows (the product only shows it on photos they're tagged in).
  function summaryDetails() {
    const p = projectCaught(caught);
    const typed = p.people.map(t => t.value)
      .filter(v => v.toLowerCase() !== subject.toLowerCase());
    return {
      people: [subject, ...typed],
      location: p.location?.value,
      date: p.date?.value,
      tags: p.tags.map(t => t.value),
    };
  }
  // The card in the share step: the headline borrows a place/event/scene tag;
  // the subtitle surfaces the person + a date/era. "+N tags" counts only what's
  // NOT already shown, so a place used in the title isn't double-counted.
  function shareMemoryMeta(idx: number) {
    const byType = (t: string) => caught.find(c => c.tag_type === t)?.value;
    const titleTag = byType("place") ? "place" : byType("event") ? "event" : byType("scene") ? "scene" : null;
    const dateTag = byType("date") ? "date" : byType("era") ? "era" : null;
    const title = (titleTag && byType(titleTag)) || `A memory of ${subject}`;
    const dateBit = dateTag && byType(dateTag);
    const extra = Math.max(0, caught.length - (titleTag ? 1 : 0) - (dateTag ? 1 : 0));
    const subtitle = [subject, dateBit, extra > 0 ? `+${extra} tag${extra === 1 ? "" : "s"}` : null]
      .filter(Boolean).join(" · ");
    return { photoUrl: photoAt(idx).url, title, subtitle };
  }

  const onRemove = (field: SummaryField, value: string) => setCaught(c => removeCaught(c, field, value));
  const onAdd = (field: SummaryField, value: string) => setCaught(c => addCaught(c, field, value));

  switch (phase) {
    case "swiping":
      return (
        <Milestone
          personName={subject}
          photoCount={DEMO_PHOTO_COUNT}
          photoUrls={[photoAt(i).url, photoAt(i + 1).url, photoAt(i + 2).url, photoAt(i + 3).url]}
          batchIndex={i + 1}
          batchTotal={effectiveTotal}
          onContinue={() => { leaveStoryState(); setPhase("story"); }}
          onSkip={advancePhoto}
          onBack={i > 0 ? () => go(pos.current - 1) : undefined}
        />
      );

    case "story":
      return (
        <StoryCapture
          photoUrl={photoAt(i).url}
          story={story}
          onStoryChange={setStory}
          onContinue={catchStory}
          onSkip={() => { catchGen.current++; setCatching(false); setPhase("swiping"); }}
          busy={catching}
          canRecordVoice
          onVoiceRecorded={setVoiceTake}
          onUseExample={() => setStory(exampleStory(photoAt(i).id, subject))}
          demoTranscript={exampleStory(photoAt(i).id, subject)}
        />
      );

    case "summary":
      return (
        <>
          <Summary
            photoUrl={photoAt(i).url}
            story={story.trim() || undefined}
            voiceTake={voiceTake}
            details={summaryDetails()}
            onConfirm={() => saveMemory(i, () => setSharing(true))}
            onRemove={onRemove}
            onAdd={onAdd}
            onBack={() => setPhase("story")}
            saving={saving}
            error={saveError}
          />
          <ShareVaultModal
            open={sharing}
            memory={shareMemoryMeta(i)}
            title="Share this memory"
            subtitle="Invite family to view, or add someone as a collaborator."
            primaryLabel="Skip and continue to vault"
            onClose={finish}
          />
        </>
      );

    default: {
      // celebration: this batch is done
      const seen = (round + 1) * effectiveTotal;
      const remaining = Math.max(DEMO_PHOTO_COUNT - seen, 0);
      return (
        <Celebration
          personName={subject}
          photoUrl={photoAt(0).url}
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
