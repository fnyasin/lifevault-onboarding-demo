"use client";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetSession } from "@/lib/demo/session";

// A slim bar on every screen so nobody mistakes the demo for the product:
// sample photos, nothing leaves the browser, and a way to start over. Its
// height is published as --top-banner-height so the full-screen photo deck
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
      className="sticky top-0 z-[45] flex items-center justify-between gap-3 bg-[#1a1a1a] px-4 py-2 text-[12px] text-white/75 [font-family:var(--font-lato),system-ui,sans-serif] sm:px-5 sm:text-[13px]"
    >
      <p className="min-w-0 truncate">
        <Link href="/" className="font-bold text-white hover:underline">LifeVault demo</Link>
        <span className="px-1.5 text-white/30">·</span>
        <span className="hidden sm:inline">Sample photos. Nothing you type leaves this browser.</span>
        <span className="sm:hidden">Sample photos, nothing saved</span>
      </p>
      <button
        type="button"
        onClick={startOver}
        className="shrink-0 rounded-full border border-white/25 px-3 py-1 font-semibold text-white transition-colors hover:bg-white/10"
      >
        Start over
      </button>
    </div>
  );
}
