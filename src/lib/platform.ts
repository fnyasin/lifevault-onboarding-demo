// Which voice architecture does this browser get? Learned from the iPhone
// voice failure: live Web Speech dictation runs ONLY
// where SpeechRecognition.start(track) is genuinely supported (desktop
// Chromium 133+). Everywhere else, every iOS browser (all WebKit), Android
// Chrome (recorder starves the recognizer, documented), desktop Safari
// (Siri-backed recognizer opens its own capture inside WebKit's one-capture
// arbitration), the recognizer would open a SECOND microphone capture while
// the shared stream holds the first, and WebKit's documented model mutes one
// of them. Those platforms record the take and transcribe it server-side
// after Finish instead.

type NavLike = Pick<Navigator, "userAgent"> & Partial<Pick<Navigator, "platform" | "maxTouchPoints">>;

function nav(): NavLike | undefined {
  return typeof navigator !== "undefined" ? navigator : undefined;
}

/** iPhone/iPod/iPad, including iPadOS 13+, which masquerades as a desktop
 *  Mac ("MacIntel") but betrays itself with a multi-touch screen. */
export function isIOSWebKit(n: NavLike | undefined = nav()): boolean {
  if (!n) return false;
  const platform = n.platform ?? "";
  if (/iP(hone|od|ad)/.test(platform)) return true;
  if (platform === "MacIntel" && (n.maxTouchPoints ?? 0) > 1) return true;
  return /iPad|iPhone|iPod/.test(n.userAgent);
}

/** Live "transcribes as you talk" dictation is DISABLED on every platform
 *  (Fatimah, 2026-07-13): the product experience should be identical everywhere:
 *  talk first, then transcribe after Finish, so desktop matches mobile. This
 *  also routes desktop through the same MediaRecorder mic path as mobile, fixing
 *  desktop's mic pickup (the SpeechRecognition path opened its own capture and
 *  wasn't reliably grabbing the mic). Kept as a single toggle so live dictation
 *  can be re-enabled per-platform later if desired.
 *
 *  (Technically live dictation only ever worked on desktop Chromium: Chrome,
 *  Edge, Brave, Opera. iOS, Android and desktop Safari never trusted it.) */
export function trustLiveDictation(): boolean {
  return false;
}
