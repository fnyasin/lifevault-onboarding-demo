"use client";
// Live recording waveform, teal ticker bars driven by an AnalyserNode
// (the recorder's tap on the mic stream); without one it plays a decorative
// ripple. Lifted verbatim from the onboarding recorder so a
// voice note and a story recording feel like the same instrument. It never
// opens its own microphone, see the voice-notes PRD §8.4.
import { useEffect, useRef } from "react";

export default function LiveWaveform({ active, analyser, bars = 56, className = "mt-4 flex h-8 items-center gap-[3px] overflow-hidden" }: {
  active: boolean;
  analyser?: AnalyserNode | null;
  /** bar count, the comments rail uses fewer to fit its width */
  bars?: number;
  className?: string;
}) {
  const barsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active || !analyser) return;
    const el = barsRef.current;
    if (!el) return;
    const data = new Uint8Array(analyser.fftSize);
    const levels = new Array<number>(bars).fill(0);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      levels.push(Math.min(1, peak / 90));
      levels.shift();
      const el2 = el.children;
      for (let i = 0; i < bars && i < el2.length; i++) {
        (el2[i] as HTMLElement).style.height = `${5 + Math.round(levels[i] * 19)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, analyser, bars]);

  const live = active && !!analyser;
  return (
    <div ref={barsRef} className={className} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-[#3c7a7c]/70"
          style={{
            height: "5px",
            animation: active && !live ? `lvBar 820ms ease-in-out ${(i * 61) % 820}ms infinite` : "none",
          }}
        />
      ))}
      <style>{`@keyframes lvBar { 0%, 100% { height: 5px } 50% { height: 24px } }`}</style>
    </div>
  );
}
