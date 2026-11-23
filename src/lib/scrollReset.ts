// Land the user at the TOP of a new screen, for real, on iOS.
//
// A single scrollTo(0,0) on navigation loses on iPhones: the on-screen
// keyboard from the PREVIOUS screen (e.g. the name-a-face input) is still
// collapsing while the next screen mounts, and when the collapse finishes,
// which can be well after any fixed timeout, Safari restores the old scroll
// offset over our reset. The reliable signal is the visualViewport resize
// the collapse fires, so we re-assert on those for the first ~1.2s, plus a
// few timed fallbacks for reflows that don't resize the viewport (late
// photo loads, font swaps).
//
// Returns a cleanup function: call it when the screen changes again.
export function assertScrollTop(): () => void {
  const toTop = () => window.scrollTo(0, 0);
  toTop();
  const raf = requestAnimationFrame(toTop);
  const t1 = setTimeout(toTop, 250);
  const t2 = setTimeout(toTop, 650);
  const vv = window.visualViewport;
  const until = Date.now() + 1200;
  const onResize = () => { if (Date.now() < until) toTop(); };
  vv?.addEventListener("resize", onResize);
  const stop = setTimeout(() => vv?.removeEventListener("resize", onResize), 1300);
  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(stop);
    vv?.removeEventListener("resize", onResize);
  };
}
