"use client";
// "Here's what I caught", the story we captured, summarized into structured
// details (people, place, date, event) beside the matte photo. This is the human-approval moment for the
// AI's catch: every chip can be removed, each section can take a typed
// addition, and NOTHING becomes official until "Save memory". People chips are
// display-only: person names never come from extraction (face-naming has its
// own approval flow).
import { useEffect, useState } from "react";
import { formatSeconds } from "@/lib/dictation";
import type { VoiceRecording } from "@/lib/useVoiceRecorder";

type Details = {
  date?: string;
  location?: string;
  people?: string[];
  tags?: string[];
};

export type SummaryField = "location" | "date" | "tags";

export default function Summary({
  photoUrl,
  story,
  voiceTake,
  details,
  onConfirm,
  onRemove,
  onAdd,
  onBack,
  saving = false,
  error,
}: {
  /** Signed URL for the photo; falls back to the bundled sample photo. */
  photoUrl?: string;
  /** The story text, shown as the caption under the photo. */
  story?: string;
  /** The just-recorded voice (still in memory, saves with the memory). */
  voiceTake?: VoiceRecording | null;
  /** The details we caught. Any field may be empty. */
  details: Details;
  /** Confirm + persist the memory (the teal "Save memory" CTA). */
  onConfirm: () => void;
  /** Remove a caught chip (the × on place/date/event chips). */
  onRemove?: (field: SummaryField, value: string) => void;
  /** Add a typed value into a section (the inline "+ add" inputs). */
  onAdd?: (field: SummaryField, value: string) => void;
  /** Go back a step. When omitted, the footer "Back" affordance is hidden. */
  onBack?: () => void;
  /** Disable the CTA while saving. */
  saving?: boolean;
  /** Save failure message, shown beside the CTA. */
  error?: string | null;
}) {
  const people = details.people ?? [];
  const tags = details.tags ?? [];

  // The take lives only in memory until "Save memory", play it from a blob
  // URL, revoked when the take changes or the screen unmounts.
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!voiceTake) return;
    const url = URL.createObjectURL(voiceTake.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the object URL is an outside resource tied to this blob's lifetime
    setVoiceUrl(url);
    return () => { URL.revokeObjectURL(url); setVoiceUrl(null); };
  }, [voiceTake]);

  return (
    <main className="flex min-h-screen flex-col bg-[#fafafa] [font-family:var(--font-lato),system-ui,sans-serif]">
      {/* Scrollable content, leaves room for the sticky footer bar. */}
      <div className="mx-auto w-full max-w-[1240px] flex-1 px-6 pt-6 pb-40 sm:px-10 sm:pt-10 lg:pt-14 lg:pb-32">
        {/* Header */}
        <header className="max-w-[640px]">
          <h1 className="[font-family:var(--font-gotu),Georgia,serif] text-[30px] leading-[1.1] text-[#1a1a1a] sm:text-[40px] lg:text-[52px]">
            Here&rsquo;s what I caught
          </h1>
          <p className="mt-3 text-[13px] leading-[1.5] text-[#1a1a1a]/45 sm:text-[14px] lg:text-[16px]">
            Remove anything I got wrong, add what I missed, then save. Nothing is
            official until you say so.
          </p>
        </header>

        {/* Two columns: photo (left) + details (right). Stacks below lg. */}
        <div className="mt-8 flex flex-col gap-5 sm:gap-6 lg:mt-12 lg:flex-row lg:items-start lg:gap-16">
          {/* Matte tilted photo card */}
          {/* Below lg the card centers at ~75% of the column (Figma tablet/mobile
              frames 443/444-4912); at lg it keeps the fixed 460px desktop column. */}
          {/* Mobile photo matches the story screen's 310px matte (Fatimah). */}
          <div className="mx-auto w-full max-w-[310px] shrink-0 sm:w-3/4 sm:max-w-[440px] lg:mx-0 lg:w-[460px] lg:max-w-none">
            {/* Leans counter-clockwise 2.11° to match the story-capture card
                (the page prior in the flow), the Figma. */}
            <div className="-rotate-[2.11deg] rounded-[16px] border-[10px] border-white bg-white shadow-[0_12px_5px_rgba(0,0,0,0.10),0_21px_21px_rgba(0,0,0,0.09),0_28px_47px_rgba(0,0,0,0.05)]">
              {/* Signed URLs are short-lived, so plain img (no Next optimizer caching). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl ?? "/onboarding/sample-hero.jpg"}
                alt={story || "The photo we caught"}
                className="max-h-[420px] w-full rounded-[8px] object-cover"
              />
            </div>
          </div>

          {/* Details list */}
          <div className="w-full max-w-[620px] lg:flex-1 lg:pt-1">
            {/* Voice note, hear the take before saving it. */}
            {voiceTake && voiceUrl && (
              <section className="border-b border-[#e4e1d8] py-7">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">
                  Voice note
                  <span className="ml-2 normal-case tracking-normal text-[#1a1a1a]/35">
                    {formatSeconds(voiceTake.durationMs / 1000)}
                  </span>
                </p>
                <audio
                  controls
                  controlsList="nodownload"
                  src={voiceUrl}
                  className="mt-3 h-10 w-full max-w-[420px]"
                >
                  Your browser can&rsquo;t play this recording here. It will
                  still be saved with the memory.
                </audio>
                <p className="mt-2 text-[13px] text-[#1a1a1a]/45">
                  Kept with this memory. In this demo it never leaves your browser.
                </p>
              </section>
            )}

            {/* People, display-only: names come from face-naming, never from AI. */}
            {people.length > 0 && (
              <section className="border-b border-[#e4e1d8] py-7">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">
                  People
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {people.map((name, i) => (
                    <PersonChip key={`${name}-${i}`} name={name} />
                  ))}
                </div>
              </section>
            )}

            <DetailSection
              label="Place"
              field="location"
              addLabel="add place"
              onAdd={onAdd}
            >
              {details.location && (
                <Chip label={details.location} onRemove={onRemove && (() => onRemove("location", details.location!))} />
              )}
            </DetailSection>

            <DetailSection
              label="Date"
              field="date"
              addLabel="add date"
              onAdd={onAdd}
            >
              {details.date && (
                <Chip label={details.date} onRemove={onRemove && (() => onRemove("date", details.date!))} />
              )}
            </DetailSection>

            <DetailSection
              label="Event"
              field="tags"
              addLabel="add tag"
              onAdd={onAdd}
              last
            >
              {tags.map((tag, i) => (
                <Chip key={`${tag}-${i}`} label={tag} onRemove={onRemove && (() => onRemove("tags", tag))} />
              ))}
            </DetailSection>
          </div>
        </div>
      </div>

      {/* Sticky footer bar: Back (left) · Save memory (right) */}
      <footer className="sticky bottom-0 z-10 border-t border-[#e4e1d8] bg-[#fafafa]/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-2.5 sm:px-10 sm:py-5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a1a]/60 transition-colors hover:text-[#1a1a1a]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M10 3.5 5.5 8 10 12.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back
            </button>
          ) : (
            // Keeps the CTA right-aligned when there's no Back affordance.
            <span aria-hidden />
          )}
          <div className="flex items-center gap-4">
            {error && (
              <p role="alert" className="text-[13px] font-medium text-[#e4534b]">{error}</p>
            )}
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="rounded-[14px] bg-[#3c7a7c] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(60,122,124,0.28)] transition-all duration-100 enabled:hover:bg-[#336a6c] enabled:active:scale-[0.99] disabled:opacity-60 sm:px-8 sm:py-3.5 sm:text-[16px]"
            >
              {saving ? "Saving…" : error ? "Try again" : "Save memory"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ---------- sub-parts (inlined to keep this file standalone) ---------- */

// One labelled detail row: uppercase label, a wrap of chips + an inline "add"
// input, and a hairline divider below (unless it's the last row).
function DetailSection({
  label,
  field,
  addLabel,
  onAdd,
  last = false,
  children,
}: {
  label: string;
  field: SummaryField;
  addLabel: string;
  onAdd?: (field: SummaryField, value: string) => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  function commit() {
    const v = value.trim();
    if (v && onAdd) onAdd(field, v);
    setValue("");
    setAdding(false);
  }

  return (
    <section className={`py-7 ${last ? "" : "border-b border-[#e4e1d8]"}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {children}
        {onAdd && (adding ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setValue(""); setAdding(false); }
            }}
            onBlur={commit}
            placeholder={`${addLabel}…`}
            aria-label={addLabel}
            className="w-[180px] rounded-full border border-[#3c7a7c]/60 bg-white px-3.5 py-2 text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#1a1a1a]/30 focus:border-[#3c7a7c] sm:text-[15px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[14px] font-semibold text-[#3c7a7c] transition-colors hover:text-[#336a6c] sm:text-[15px]"
          >
            + {addLabel}
          </button>
        ))}
      </div>
    </section>
  );
}

// A caught chip: small teal dot + label + remove ×.
function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#e4e1d8] bg-white py-1.5 pl-3 pr-2 text-[14px] text-[#1a1a1a] sm:py-2 sm:pl-3.5 sm:pr-2.5 sm:text-[15px]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3c7a7c]" />
      <span className="whitespace-nowrap">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#1a1a1a]/35 transition-colors hover:bg-[#f0eee6] hover:text-[#1a1a1a]/60 sm:h-5 sm:w-5"
        >
          <CloseIcon />
        </button>
      )}
    </span>
  );
}

// A person chip: avatar circle + name. Display-only on this screen.
function PersonChip({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#e4e1d8] bg-white py-1.5 pl-1.5 pr-3 text-[14px] text-[#1a1a1a] sm:text-[15px]">
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfe7e6] text-[12px] font-semibold text-[#3c7a7c] sm:h-7 sm:w-7 sm:text-[13px]"
      >
        {initial}
      </span>
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
