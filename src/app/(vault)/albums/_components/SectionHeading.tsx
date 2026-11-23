import Link from "next/link";
import { ALBUM_COLORS, FONT_HEADING } from "./tokens";

// A shelf heading like Apple Photos: "People" / "Memories" with a "›" chevron
// that opens the view-all grid for that shelf. Gotu serif, ink. When `href` is
// omitted it renders as a plain heading (no chevron), e.g. an "All photos"
// section on a detail page.
export function SectionHeading({
  title,
  href,
  viewAllLabel = "See all",
}: {
  title: string;
  href?: string;
  viewAllLabel?: string;
}) {
  // Real heading (h2) so screen-reader users can navigate the shelves by heading.
  // When there's a view-all target the whole heading is a link (h2 > a is valid).
  return (
    <h2 className={`py-1 text-[22px] leading-none ${FONT_HEADING}`} style={{ color: ALBUM_COLORS.ink }}>
      {href ? (
        <Link
          href={href}
          aria-label={`${title}, ${viewAllLabel}`}
          className="group inline-flex items-center gap-1.5 transition-opacity duration-100 hover:opacity-70"
        >
          {title}
          <span
            aria-hidden
            className="translate-y-[1px] transition-transform duration-100 group-hover:translate-x-0.5"
            style={{ color: ALBUM_COLORS.muted }}
          >
            ›
          </span>
        </Link>
      ) : (
        title
      )}
    </h2>
  );
}

export default SectionHeading;
