import Link from "next/link";
import type { MouseEvent } from "react";
import { ALBUM_COLORS, FONT_BODY } from "./tokens";
import { OverflowMenu } from "./OverflowMenu";

// The single shelf tile from Figma, ONE component with a variant prop, used
// for BOTH people and memories (identical anatomy):
//   thumb (rounded square) · name (Lato Bold 15) · "N photos" (Lato Reg 13) · ⋯
// The whole tile is a link to its detail/grid; the ⋯ button floats on the caption
// row and stops propagation so it opens the ContextMenu instead of navigating.
//
// Presentational only: the parent screen owns menu + selection state. A missing
// image falls back to initials (person) or a cream block (memory), never a broken
// <img>. `ring` draws the teal selection ring used by the Merge flow.

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export type TileProps = {
  variant: "person" | "memory";
  name: string;
  count: number;
  imageUrl?: string | null;
  href?: string;
  /** opens the ContextMenu; when omitted the ⋯ affordance is hidden */
  onOverflow?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** whether this tile's ContextMenu is open (drives ⋯ aria-expanded) */
  menuOpen?: boolean;
  aspect?: "square" | "landscape";
  /** teal selection ring (Merge selection state) */
  ring?: boolean;
  /** dim + optional check badge for multi-select pickers */
  selected?: boolean;
  className?: string;
};

export function Tile({
  variant,
  name,
  count,
  imageUrl,
  href,
  onOverflow,
  menuOpen = false,
  aspect = "square",
  ring = false,
  selected = false,
  className = "",
}: TileProps) {
  const aspectClass = aspect === "landscape" ? "aspect-[4/3]" : "aspect-square";

  const thumb = (
    <div
      className={`relative w-full ${aspectClass} overflow-hidden rounded-[15px]`}
      style={{
        background: ALBUM_COLORS.cream,
        boxShadow: ring
          ? `0 0 0 3px ${ALBUM_COLORS.teal}`
          : `inset 0 0 0 1px ${ALBUM_COLORS.divider}`,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-[28px] ${FONT_BODY}`}
          style={{ background: ALBUM_COLORS.avatarBg, color: "#ffffff" }}
        >
          {variant === "person" ? initials(name) : ""}
        </div>
      )}
      {selected && (
        <span
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: ALBUM_COLORS.teal }}
          aria-hidden
        >
          ✓
        </span>
      )}
    </div>
  );

  return (
    <div className={`relative ${FONT_BODY} ${className}`}>
      {href ? (
        <Link href={href} prefetch={true} className="block transition-opacity duration-100 hover:opacity-95">
          {thumb}
        </Link>
      ) : (
        thumb
      )}

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight" style={{ color: ALBUM_COLORS.ink }}>
            {href ? (
              <Link href={href} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </div>
          <div className="mt-0.5 text-[13px] leading-tight" style={{ color: ALBUM_COLORS.muted }}>
            {count} photo{count === 1 ? "" : "s"}
          </div>
        </div>
        {onOverflow && (
          <OverflowMenu
            className="-mr-1 -mt-0.5 shrink-0"
            expanded={menuOpen}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOverflow(e);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Tile;
