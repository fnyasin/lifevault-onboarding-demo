"use client";
// "That's the first ten.", the gentle milestone shown after a batch of names
// is saved during onboarding (Figma desktop and mobile frames).
//
// Presentational only: all copy is derived from props with Figma defaults, and
// the two CTAs are plain handlers. Desktop is a two-column split, a left
// headline + person chip, and a right white celebration card. Below lg the
// left column drops away and the card centers on its own (matches the mobile
// frame, which is card-only).

export default function Celebration({
  personName = "Dad",
  photoUrl,
  photoCount,
  remainingCount,
  batchSize = 10,
  ordinal = "first ten",
  onContinue,
  onSkip,
  busy = false,
}: {
  /** Whose faces were just named, drives the headline + chip + body copy. */
  personName?: string;
  /** Optional avatar for the left-column person chip; falls back to a placeholder. */
  photoUrl?: string;
  /** Total photos of this person; omitted → count-free copy. */
  photoCount?: number;
  /** Photos still left to flip through; omitted/0 → count-free copy. */
  remainingCount?: number;
  /** How many more the primary CTA offers to surface next. */
  batchSize?: number;
  /** Milestone label baked into the card heading, e.g. "first ten". */
  ordinal?: string;
  /** Primary CTA, continue to the next batch of photos. */
  onContinue: () => void;
  /** Secondary text button, stop for now and head into the vault. */
  onSkip?: () => void;
  /** Disables the CTA while the next batch loads. */
  busy?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6 py-12 [font-family:var(--font-lato),system-ui,sans-serif]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        {/* Left column, headline + person chip. Hidden on mobile, where the
            Figma frame shows the celebration card on its own. */}
        <div className="hidden w-full max-w-[520px] lg:block">
          <h1 className="[font-family:var(--font-gotu),Georgia,serif] text-[44px] leading-[1.1] text-[#1a1a1a]">
            {photoCount != null ? `${photoCount} photos of ${personName}.` : `Photos of ${personName}.`}
          </h1>
          <p className="mt-4 text-[18px] leading-[1.5] text-[#1a1a1a]/45">
            Swipe right the moment a photo sparks a story.
          </p>

          {/* Person chip, avatar, name, count, edit affordance. */}
          <div className="mt-8 flex items-center gap-4 rounded-[16px] border border-[#e4e1d8] bg-white px-4 py-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f0eee6]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl ?? "/onboarding/sample-hero.jpg"} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[16px] font-bold text-[#1a1a1a]">{personName}</span>
              <span className="text-[14px] text-[#1a1a1a]/45">
                {photoCount != null ? `${photoCount} photos` : "In your vault"}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-[#1a1a1a]/35">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>

        {/* Right column, the celebration card. Centered and standalone on mobile. */}
        <div className="w-full max-w-[452px] sm:max-w-[468px] lg:max-w-[452px] lg:shrink-0">
          <div className="rounded-[20px] bg-white px-7 pt-6 pb-5 text-center shadow-[0_10px_40px_rgba(0,0,0,0.06)] sm:px-12 sm:pt-11 sm:pb-10 lg:pt-12 lg:pb-12">
            {/* Teal check badge */}
            <div className="mx-auto grid h-[66px] w-[66px] place-items-center rounded-full bg-[#3c7a7c] sm:h-[76px] sm:w-[76px]">
              <svg width="30" height="24" viewBox="0 0 30 24" fill="none" aria-hidden>
                <path d="M3 12.5 11 20 27 3" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h2 className="mt-6 [font-family:var(--font-gotu),Georgia,serif] text-[27px] leading-[1.15] text-[#1a1a1a] sm:text-[32px] lg:text-[36px]">
              That&rsquo;s the {ordinal}.
            </h2>

            <p className="mx-auto mt-3 max-w-[268px] text-[15px] leading-[1.55] text-[#1a1a1a]/45 sm:max-w-[380px] sm:text-[16px] lg:mt-4 lg:max-w-[340px] lg:text-[15px]">
              {remainingCount && remainingCount > 0
                ? `None of these the one? No rush. There are ${remainingCount} more of ${personName} to flip through whenever you’re ready.`
                : "None of these the one? No rush. Flip through more whenever you’re ready."}
            </p>

            <button
              type="button"
              onClick={onContinue}
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#3c7a7c] py-3.5 text-[15px] font-bold text-white transition-all duration-100 enabled:hover:bg-[#336a6c] enabled:active:scale-[0.99] disabled:opacity-60 sm:text-[16px] lg:mt-8 lg:py-4"
            >
              {busy ? "One moment…" : `Show me ${batchSize} more`}
              <svg width="18" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
                <path d="M1 7h17M12 1l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="mt-6 text-[14px] font-bold text-[#1a1a1a]/45 underline-offset-2 transition-colors hover:text-[#1a1a1a]/70 hover:underline sm:text-[15px] lg:text-[14px]"
              >
                I&rsquo;m done for now
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
