"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AccountMenu from "@/app/components/AccountMenu";

// The family-side app shell: a FIXED left sidebar that never
// scrolls, logo, text-only nav (Activity / Vault / Albums), and the profile
// pinned to the bottom, always visible, while only the content column on the
// right scrolls. Mobile gets a sticky pill strip instead of the sidebar.
type NavItem = "activity" | "vault" | "albums";

const TEAL = "#3c7a7c";
const TEAL_TINT = "#eaf2f1";

const NAV: { key: NavItem; label: string; href: string }[] = [
  { key: "activity", label: "Activity", href: "/activity" },
  { key: "vault", label: "Vault", href: "/vault" },
  { key: "albums", label: "Albums", href: "/albums" },
];

// Derive the active nav item from the URL, so the shell can live in a layout
// (which doesn't know which page rendered). An explicit `active` prop still wins.
function activeFromPath(pathname: string): NavItem | null {
  if (pathname.startsWith("/activity")) return "activity";
  if (pathname.startsWith("/albums")) return "albums";
  if (pathname.startsWith("/vault")) return "vault";
  return null;
}

function LogoMark() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: TEAL }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.svg" alt="" className="h-4 w-4" />
    </div>
  );
}

export default function FamilyShell(props: {
  /** Defaults to the URL. */
  active?: NavItem;
  roleLabel?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const activeItem = props.active ?? activeFromPath(pathname ?? "");
  const ariaCurrent = (item: NavItem) => (item === activeItem ? "page" : undefined);

  return (
    // Full height below the demo banner, so only the content column scrolls.
    <div className="flex h-[calc(100dvh-var(--top-banner-height,0px))] overflow-hidden bg-white text-zinc-900">
      {/* Fixed sidebar (md+), never scrolls; profile pinned to the bottom */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col gap-6 border-r border-zinc-200 p-4">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="text-[15px] tracking-tight">Lifevault</span>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ key, label, href }) => {
            const active = key === activeItem;
            return (
              <Link key={key} href={href} aria-current={ariaCurrent(key)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                  active ? "font-medium" : "text-zinc-600 hover:bg-zinc-100"
                }`}
                style={active ? { background: TEAL_TINT, color: TEAL } : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-zinc-100 pt-3">
          <AccountMenu roleLabel={props.roleLabel ?? "Family admin"} showLabel />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile: pill strip + account avatar, replaces the sidebar below md */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-2 md:hidden">
          <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto whitespace-nowrap">
            {NAV.map(({ key, label, href }) => {
              const active = key === activeItem;
              return (
                <Link key={key} href={href} aria-current={ariaCurrent(key)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-[14px] transition-colors duration-100 ${
                    active ? "font-semibold" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                  style={active ? { background: TEAL_TINT, color: TEAL } : undefined}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0">
            <AccountMenu roleLabel={props.roleLabel ?? "Family admin"} />
          </div>
        </div>
        {/* The ONLY scrolling region */}
        <div className="flex-1 overflow-y-auto">{props.children}</div>
      </div>
    </div>
  );
}
