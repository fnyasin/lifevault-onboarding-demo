import Link from "next/link";

const REPO_URL = "https://github.com/fnyasin/lifevault-onboarding-demo";

// The demo's front door: what LifeVault is, what you're about to click
// through, and what's real versus stand-in, before the first screen.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#fafafa] px-5 py-10 [font-family:var(--font-lato),system-ui,sans-serif] sm:px-8 sm:py-14">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col-reverse items-center gap-10 lg:flex-row lg:gap-16">
        <div className="w-full max-w-[560px]">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#3c7a7c]">LifeVault · interactive demo</p>
          <h1 className="mt-3 [font-family:var(--font-gotu),Georgia,serif] text-[32px] leading-[1.12] text-[#1a1a1a] sm:text-[44px]">
            From scanned photos to saved stories.
          </h1>
          <p className="mt-4 text-[16px] leading-[1.55] text-[#1a1a1a]/60 sm:text-[17px]">
            Name the people in your family&rsquo;s old photos, tell the stories behind them, and save it
            all in a private vault. AI suggests the place, date and event from each story, and you
            decide what stays.
          </p>
          <p className="mt-4 text-[16px] leading-[1.55] text-[#1a1a1a]/60 sm:text-[17px]">
            Try it with four sample photos in about two minutes. No account needed. This demo
            doesn&rsquo;t use real AI. The full product does.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/welcome"
              className="inline-flex items-center gap-2 rounded-full bg-[#3c7a7c] px-8 py-3.5 text-[16px] font-bold text-white shadow-[0_10px_24px_rgba(60,122,124,0.28)] transition-all duration-100 hover:bg-[#336a6c] active:scale-[0.99]"
            >
              Start the demo
              <svg width="18" height="14" viewBox="0 0 20 14" fill="none" aria-hidden>
                <path d="M1 7h17M12 1l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <a href={REPO_URL} className="text-[15px] font-bold text-[#1a1a1a]/55 underline underline-offset-2 hover:text-[#1a1a1a]">
              See the code
            </a>
          </div>

          <p className="mt-10 text-[13px] text-[#1a1a1a]/40">
            Designed by Fatimah Yasin. Built with Claude Code.
          </p>
        </div>

        <div className="w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[480px] lg:flex-1">
          {/* The export carries a faint white frame fill; multiply blends it
              into the cream page so no box shows behind the prints. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/onboarding/photo-deck.png" alt="A small stack of old family photos" className="h-auto w-full mix-blend-multiply" />
        </div>
      </div>
    </main>
  );
}
