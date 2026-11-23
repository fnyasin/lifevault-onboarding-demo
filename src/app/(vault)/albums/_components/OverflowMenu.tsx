import type { ButtonHTMLAttributes } from "react";
import { ALBUM_COLORS } from "./tokens";

// The "⋯" affordance from Figma (more-horiz-round-24px). A 24px round
// button that opens the ContextMenu. Presentational only, the parent screen owns
// the open/close state and passes onClick. On a Tile it sits top-right of the
// caption; on the person-detail header it sits in the action row.
export function OverflowMenu({
  className = "",
  tone = "onLight",
  expanded,
  ...rest
}: {
  className?: string;
  /** onLight = dark dots for cream/white surfaces; onImage = white dots over a photo scrim */
  tone?: "onLight" | "onImage";
  /** whether the ContextMenu it controls is currently open (aria-expanded) */
  expanded?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const color = tone === "onImage" ? "#ffffff" : ALBUM_COLORS.muted;
  return (
    <button
      type="button"
      aria-label="More options"
      aria-haspopup="menu"
      aria-expanded={expanded}
      className={`inline-flex size-6 items-center justify-center rounded-full transition-colors duration-100 hover:bg-black/5 ${className}`}
      {...rest}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="4" cy="10" r="1.6" fill={color} />
        <circle cx="10" cy="10" r="1.6" fill={color} />
        <circle cx="16" cy="10" r="1.6" fill={color} />
      </svg>
    </button>
  );
}

export default OverflowMenu;
