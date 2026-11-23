// Fit a photo into the immersive milestone card WITHOUT cropping people out.
//
// The problem (Fatimah, plus an outside code review): family scans are mostly
// LANDSCAPE, the Bumble-style card is a tall PORTRAIT. Plain cover-crop cuts
// people out of their own photo; plain contain makes the photo look small.
//
// The fix is a hierarchy, unified into one scale:
//   1. Zoom to COVER (fills the card) when the whole face group still fits.
//   2. Otherwise zoom only as far as keeps the ENTIRE face box visible, a
//      "safe zoom" between contain and cover; the leftover gaps get a soft
//      brand-tinted blur fill instead of cropping a face.
//   3. No face info → cover at a portrait-friendly focus.
//
// All inputs are in the SAME pixel space: the face box is original-scan
// pixels, so this must be measured against the ORIGINAL image's natural
// dimensions (not the thumbnail).

export type FaceBox = { x: number; y: number; w: number; h: number };

export type CardFit = {
  /** CSS scale applied to the natural image. */
  scale: number;
  /** Absolute offset of the scaled image within the card (px). */
  left: number;
  top: number;
  /** Scaled image size (px). */
  imgW: number;
  imgH: number;
  /** True when the scaled image doesn't fully cover the card, show the
   *  blur/matte fill behind it. */
  gaps: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * @param natW/natH  natural size of the ORIGINAL image (px)
 * @param cardW/cardH  rendered card size (px)
 * @param box  union face box in ORIGINAL pixels, or null
 */
export function computeCardFit(
  natW: number, natH: number, cardW: number, cardH: number, box: FaceBox | null,
): CardFit | null {
  if (!(natW > 0 && natH > 0 && cardW > 0 && cardH > 0)) return null;

  const coverScale = Math.max(cardW / natW, cardH / natH);

  // Without a face box, fill the card and bias the crop slightly high, where
  // faces usually sit in a portrait framing.
  if (!box || !(box.w > 0 && box.h > 0)) {
    const s = coverScale;
    const imgW = natW * s, imgH = natH * s;
    const left = imgW > cardW ? clamp(cardW / 2 - imgW * 0.5, cardW - imgW, 0) : (cardW - imgW) / 2;
    const top = imgH > cardH ? clamp(cardH * 0.42 - imgH * 0.4, cardH - imgH, 0) : (cardH - imgH) / 2;
    return { scale: s, left, top, imgW, imgH, gaps: imgW < cardW || imgH < cardH };
  }

  // Largest scale at which the WHOLE face box still fits inside the card.
  const boxFitScale = Math.min(cardW / box.w, cardH / box.h);
  // Prefer cover; never zoom past where the faces would start to crop.
  const scale = Math.min(coverScale, boxFitScale);

  const imgW = natW * scale, imgH = natH * scale;
  const bcx = (box.x + box.w / 2) * scale;
  const bcy = (box.y + box.h / 2) * scale;

  // Per axis: if the image overflows the card, center on the face box and
  // clamp to the edges (no dead space); if it's smaller than the card on that
  // axis, center it and let the gap show (filled behind).
  let left: number, top: number;
  let gaps = false;
  if (imgW >= cardW) left = clamp(cardW / 2 - bcx, cardW - imgW, 0);
  else { left = (cardW - imgW) / 2; gaps = true; }
  if (imgH >= cardH) top = clamp(cardH / 2 - bcy, cardH - imgH, 0);
  else { top = (cardH - imgH) / 2; gaps = true; }

  return { scale, left, top, imgW, imgH, gaps };
}
