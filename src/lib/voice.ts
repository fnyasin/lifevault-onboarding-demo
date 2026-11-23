// Voice-note capture helpers: the pure logic behind useVoiceRecorder, split
// out so mime selection and caps are unit-testable without a browser. In the
// product the recording is saved to the family's PRIVATE vault; in this demo
// it only ever lives in memory.

// Caps, enforced client-side with graceful auto-stop (the product enforces
// the size cap on the server too).
export const VOICE_MAX_MS = 5 * 60 * 1000;        // 5 minutes
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;  // 10 MB

// Feature-detection ladder: first supported wins. Chrome/Edge/Firefox land on
// webm/ogg Opus; Safari (no webm) lands on mp4/AAC.
const MIME_LADDER = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
];

type IsTypeSupported = (mime: string) => boolean;

function browserIsTypeSupported(): IsTypeSupported | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return (m) => MediaRecorder.isTypeSupported(m);
}

// The mime we'll record with, or "" when nothing on the ladder is supported
// (the recording affordance should then quietly disappear; typing still
// works).
export function pickAudioMime(isSupported: IsTypeSupported | null = browserIsTypeSupported()): string {
  if (!isSupported) return "";
  return MIME_LADDER.find((m) => { try { return isSupported(m); } catch { return false; } }) ?? "";
}

// Spoken word doesn't need music bitrates: 32 kbps Opus / 64 kbps AAC.
export function audioBitsPerSecond(mime: string): number {
  return mime.includes("opus") || mime.startsWith("audio/webm") || mime.startsWith("audio/ogg")
    ? 32_000
    : 64_000;
}

// Whether this browser can record at all (MediaRecorder + a supported format
// + microphone access API). Purely a capability check, no permission prompt.
export function voiceRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickAudioMime() !== ""
  );
}

// A finished take whose audio is implausibly small for its duration almost
// certainly captured digital silence (dead route / wrong default mic, the
// Logitech-webcam case that forced the mic picker). Real speech at our opus
// bitrate runs ~4 bytes/ms; true silence compresses to well under 1. Takes
// under 1.5s are exempt, tiny blobs are legitimate there.
export function isSuspectSilent(bytes: number, durationMs: number): boolean {
  if (durationMs < 1500) return false;
  return bytes < durationMs * 2;
}
