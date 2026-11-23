// Placeholder landing while the demo screens come together.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6 py-12 [font-family:var(--font-lato),system-ui,sans-serif]">
      <div className="w-full max-w-[560px] rounded-[16px] bg-white p-10 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#3c7a7c]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" className="h-5 w-5" />
        </div>
        <h1 className="mt-6 [font-family:var(--font-gotu),Georgia,serif] text-[32px] leading-[1.15] text-[#1a1a1a]">
          LifeVault
        </h1>
        <p className="mt-3 text-[15px] leading-[1.55] text-[#1a1a1a]/55">
          A private home for your family&rsquo;s photos and the stories behind them.
        </p>
      </div>
    </main>
  );
}
