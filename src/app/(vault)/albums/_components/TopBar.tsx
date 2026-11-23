import Link from "next/link";
import type { ReactNode } from "react";
import { ALBUM_COLORS, FONT_HEADING, FONT_BODY } from "./tokens";

// The content header for each Albums screen: an optional back
// link, a Gotu title, an optional subtitle ("The Johnson Family · 312 photos"),
// and an optional action slot on the right (the New button, a Sort control). It
// lives INSIDE the FamilyShell content column, the app chrome (sidebar / mobile
// nav / account) comes from FamilyShell, so this is only the page heading.
export function TopBar({
  title,
  subtitle,
  backHref,
  backLabel = "Albums",
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${FONT_BODY} ${className}`}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-[14px] transition-opacity duration-100 hover:opacity-70"
          style={{ color: ALBUM_COLORS.tealText }}
        >
          <span aria-hidden className="text-[17px] leading-none">
            ‹
          </span>
          {backLabel}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className={`text-[26px] leading-tight sm:text-[30px] ${FONT_HEADING}`} style={{ color: ALBUM_COLORS.ink }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13.5px]" style={{ color: ALBUM_COLORS.muted }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default TopBar;
