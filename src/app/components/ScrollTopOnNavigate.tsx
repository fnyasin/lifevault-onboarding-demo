"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { assertScrollTop } from "@/lib/scrollReset";

// Every route change lands at the TOP of the page. On phones, client-side
// navigations kept arriving mid-scroll (keyboard dismissal + browser scroll
// restoration carried the old offset onto the new screen, reported on the
// waiting room, the onboarding batch screen, and more). Mounted once in the
// root layout.
export default function ScrollTopOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    // A page REFRESH is restored by the browser AFTER hydration, overriding
    // the scroll-to-top below (Fatimah: waiting room kept opening mid-page).
    // Manual restoration makes every load start at the top, full stop.
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);
  useEffect(() => assertScrollTop(), [pathname]);
  return null;
}
