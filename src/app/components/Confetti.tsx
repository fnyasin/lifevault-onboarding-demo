"use client";
import { useEffect } from "react";

// Full-screen celebration matched to the Figma "Your vault is ready" mock:
// BIG rectangular sprinkles scattered over the WHOLE screen, dense, not a
// point-burst. Pieces spawn everywhere (plus a band above the
// top so more keep arriving), flutter down with sway and spin, then the
// whole layer fades out quickly. One rAF loop, no library.

const COLORS = [
  "#EA4C89", // pink
  "#F0533F", // red-orange
  "#FF9F2E", // orange
  "#FFD300", // yellow
  "#5CF77F", // green
  "#4AF2FD", // cyan
  "#3B6FE0", // blue
  "#892AB8", // purple
];

// Short and sweet: full sparkle for ~2.6s, then gone by ~3.5s.
const DURATION_MS = 2600;
const FADE_MS = 900;

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export default function Confetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Scale piece count with viewport so large screens stay covered.
    const quantity = Math.round(Math.min(220, Math.max(110, (W * H) / 9000)));

    const layer = document.createElement("div");
    layer.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden;";
    document.body.appendChild(layer);

    const pieces = Array.from({ length: quantity }, () => {
      const el = document.createElement("div");
      // Big Figma-style sprinkles: elongated rounded rectangles.
      const w = rand(7, 13);
      const h = w * rand(1.7, 2.6);
      const x = rand(-20, W + 20);
      // Half start on screen (instant full-screen scatter, like the mock);
      // half rain in from above so it keeps sprinkling.
      const y = Math.random() < 0.5 ? rand(-40, H) : rand(-H, -40);
      const rot = rand(0, 360);
      // Position inline at creation so pieces are scattered on the very first
      // paint, no corner-pile flash before the first animation frame.
      el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:3px;background:${
        COLORS[(Math.random() * COLORS.length) | 0]
      };transform:translate(${x}px,${y}px) rotate(${rot}deg);will-change:transform;`;
      layer.appendChild(el);
      return {
        el,
        x,
        y,
        fall: rand(70, 190),          // px/s downward drift
        swayAmp: rand(15, 55),        // horizontal sway
        swayFreq: rand(0.5, 1.3),     // Hz
        swayPhase: rand(0, Math.PI * 2),
        rot,
        rotSpeed: rand(-140, 140),    // deg/s
        flutterFreq: rand(0.8, 1.8),  // Hz, tumbling "3D" flip
        flutterPhase: rand(0, Math.PI * 2),
      };
    });

    // Fade + removal run on wall-clock timers, NOT inside the rAF loop,
    // rAF throttles in background tabs, and the layer must never linger.
    const fadeTimer = setTimeout(() => {
      layer.style.transition = `opacity ${FADE_MS}ms linear`;
      layer.style.opacity = "0";
    }, DURATION_MS);
    const killTimer = setTimeout(() => layer.remove(), DURATION_MS + FADE_MS + 100);

    let raf = 0;
    const t0 = performance.now();
    function tick(now: number) {
      const t = (now - t0) / 1000;
      if (now - t0 > DURATION_MS + FADE_MS) return; // layer is gone or going
      for (const p of pieces) {
        let py = p.y + p.fall * t;
        // Recycle pieces that fell out the bottom back to the top while active.
        if (py > H + 40) {
          const total = H + 80;
          py = ((py + 40) % total) - 40;
        }
        const px = p.x + Math.sin(t * p.swayFreq * Math.PI * 2 + p.swayPhase) * p.swayAmp;
        const flip = 0.25 + 0.75 * Math.abs(Math.sin(t * p.flutterFreq * Math.PI * 2 + p.flutterPhase));
        p.el.style.transform = `translate(${px}px, ${py}px) rotate(${p.rot + p.rotSpeed * t}deg) scaleY(${flip})`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fadeTimer);
      clearTimeout(killTimer);
      layer.remove();
    };
  }, []);
  return null;
}
