// Design tokens for the Albums area, lifted from the Figma "Albums" page and
// its primitives. The app has no Tailwind theme config, so the Albums brand
// values live here and every Albums primitive reads from one place.

export const ALBUM_COLORS = {
  teal: "#3c7a7c", // primary brand: buttons, logo, selected ring
  tealText: "#2f6a6c", // active nav text / accent on the teal tint
  tealTint: "#eaf2f1", // active pill / selected chip background
  ink: "#1a1a1a", // headings + tile name
  // "N photos" counts + subtitles. Darkened from the Figma #8a857c to #726c63 so
  // 13-14px body text clears WCAG AA (4.5:1) on white/cream, the lighter value
  // measured 3.67:1. Revert to #8a857c if pixel-matching Figma matters more.
  muted: "#726c63",
  muted2: "#717171", // card body copy
  muted3: "#6b6862", // inactive nav labels
  cream: "#fafafa", // section / card surface
  borderWarm: "#e4e1d8", // sidebar + field border
  borderCard: "#d8d4ca", // dashed create-card border
  divider: "#ece9e2", // hairline dividers
  avatarBg: "#c9c2b4", // fallback avatar background
  danger: "#b23b3b", // destructive menu items (Hide / Delete)
} as const;

export const ALBUM_RADII = { tile: 14, card: 12, button: 10, nav: 9 } as const;

// Font-family utility classes. The fonts themselves are wired as CSS variables in
// web/src/app/layout.tsx (Gotu = serif headings, Lato = body/labels/buttons).
export const FONT_HEADING = "[font-family:var(--font-gotu)]";
export const FONT_BODY = "[font-family:var(--font-lato)]";
