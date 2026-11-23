// Browser dictation for the story capture, thin typed wrapper around the Web
// Speech API (SpeechRecognition / webkitSpeechRecognition). Transcription is
// done by the BROWSER's own speech service (which may process the audio in the
// browser vendor's cloud, e.g. Chrome's); this module itself only produces the
// transcript text, which the family member reviews before any save. On plans
// with voice notes, a SEPARATE recorder (useVoiceRecorder) also captures the
// audio and saves it to the family's private vault when they save the memory,
// the copy on the capture screen says so. Feature-detected, unsupported
// browsers simply don't get Speak mode.

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  // Newer Chromium accepts a MediaStreamTrack (spec: start(audioTrack)) so the
  // site can pick the audio source; historically the recognizer captured the
  // SYSTEM-DEFAULT mic no matter what the site chose, the classic silent-AirPods
  // trap. Older engines ignore extra arguments per WebIDL, so passing a track is
  // safe everywhere.
  start(audioTrack?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
};

export type SpeechResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Merge a finalized transcript chunk into the story so far: single space
// between chunks, no leading/trailing whitespace buildup.
export function appendTranscript(existing: string, chunk: string): string {
  const add = chunk.trim();
  if (!add) return existing;
  const base = existing.replace(/\s+$/, "");
  return base ? `${base} ${add}` : add;
}

// mm:ss for the recording timer.
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
