import type { FaceBox } from "@/lib/cardFit";

// The four sample photos the demo runs on, exported from the Figma mockups.
// In the product these are the family's own scans, served as short-lived
// signed URLs; here they're static files in /public.
export type SamplePhoto = {
  id: string;
  url: string;
  /** Face box in the photo's own pixel space (700x900), when we have one. */
  faceBox: FaceBox | null;
};

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  // The welcome screen marks the woman's face in this one: hairline to chin.
  // (The screen adds its own breathing room around the box.)
  { id: "sample-hero", url: "/onboarding/sample-hero.jpg", faceBox: { x: 408, y: 228, w: 112, h: 162 } },
  { id: "sample-portrait-right", url: "/onboarding/sample-portrait-right.jpg", faceBox: null },
  { id: "sample-portrait-left", url: "/onboarding/sample-portrait-left.jpg", faceBox: null },
  { id: "sample-wide", url: "/onboarding/sample-wide.jpg", faceBox: null },
];

/** How many photos of the named person the "scan" found (drives the headline). */
export const DEMO_PHOTO_COUNT = 23;
