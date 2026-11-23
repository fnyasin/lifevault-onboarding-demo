"use client";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetSession } from "@/lib/demo/session";

// A slim bar on every screen so nobody mistakes the demo for the product,
// with a way to start over. Both targets are at least 44px tall so they're
// easy to tap on a phone. Its height is published as --top-banner-height so the full-screen photo deck
// and the vault shell can sit below it.
export default function DemoBanner() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--top-banner-height", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--top-banner-height"); };
  }, []);

  function startOver() {
    resetSession();
    router.push("/");
  }

  return (
    <div
      ref={ref}
      className="sticky top-0 z-[45] flex items-center justify-between gap-3 bg-[#1a1a1a] px-4 py-1.5 text-[15px] text-white [font-family:var(--font-lato),system-ui,sans-serif] sm:px-6"
    >
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center font-bold text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        LifeVault demo
      </Link>
      <button
        type="button"
        onClick={startOver}
        className="min-h-[44px] shrink-0 rounded-full border border-white/45 px-5 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Start over
      </button>
    </div>
  );
}
