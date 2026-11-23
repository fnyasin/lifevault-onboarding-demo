"use client";
// Records the actual audio while a family member tells a photo's story, so the
// vault keeps the real voice, not just the transcript. One getUserMedia
// stream feeds TWO consumers: the MediaRecorder (the stored blob) and an
// AnalyserNode (the live waveform). The Web Speech recognizer keeps its own
// private mic internally (the spec never exposes its audio), so the net device
// opens stay at two and both share one per-origin mic permission.
//
// Duration is wall-clock (performance.now() accumulated across pause
// segments), never the blob's metadata, which Chrome reports as Infinity for
// streamed WebM. Pause/resume keeps ONE recorder and one final blob; only
// "start over" and "finish" tear the recorder down.
import { useEffect, useRef, useState } from "react";
import {
  pickAudioMime, audioBitsPerSecond, voiceRecordingSupported, isSuspectSilent,
  VOICE_MAX_MS, VOICE_MAX_BYTES,
} from "@/lib/voice";
import { openMicStream } from "@/lib/micDevice";

export type VoiceRecording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Client idempotency key: in the product the storage path derives from
   *  it and the save upserts on it, so a retried save can never duplicate. */
  recordingId: string;
  /** The audio is implausibly small for the duration, the mic almost
   *  certainly delivered silence. Callers should warn instead of saving. */
  suspectSilent?: boolean;
};

type RecorderState = "idle" | "recording" | "paused";

export function useVoiceRecorder(opts?: {
  /** Fires whenever a recording completes, Finish button, auto-stop at the
   *  caps, whatever. Null means the take was empty (no voice note). */
  onComplete?: (recording: VoiceRecording | null) => void;
  /** True on record-then-transcribe platforms: the recording IS the words,
   *  so failure copy must not claim "your words are still being written
   *  down" (that's only true where live dictation runs alongside). */
  transcribeAfter?: boolean;
}) {
  const onCompleteRef = useRef(opts?.onComplete);
  onCompleteRef.current = opts?.onComplete;
  const transcribeAfter = !!opts?.transcribeAfter;
  const [state, setState] = useState<RecorderState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the caps force a stop, so the UI can explain the cutoff.
  const [autoStopped, setAutoStopped] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  // False when start() received an EXTERNAL stream (the shared mic-capture
  // manager owns those tracks, a page must not open a
  // second getUserMedia stream on iOS, and must never stop tracks it doesn't
  // own). True only on the legacy self-opened path.
  const ownsStreamRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bytesRef = useRef(0);
  const segStartRef = useRef<number | null>(null); // performance.now() at start/resume
  const accMsRef = useRef(0);                      // completed segments
  const finishResolveRef = useRef<((r: VoiceRecording | null) => void) | null>(null);
  // getUserMedia is async (a permission prompt can sit open for seconds). A
  // Finish/start-over/unmount during that window bumps the generation so the
  // pending start(), when it finally resolves, releases the stream and bails
  // instead of opening a mic against a UI that already moved on.
  const startGenRef = useRef(0);
  // The in-flight start's promise. A new start() WAITS for it and re-checks,
  // bailing outright would leave the recorder permanently dead when a device
  // switch cancels the pending open and immediately asks for a fresh one.
  const startPendingRef = useRef<Promise<void> | null>(null);
  // Audio salvaged from an INVOLUNTARY stop (the track died under the
  // recorder). Held, not surfaced: if a rebound recorder later finishes with
  // a longer take, that take wins; if nothing better ever arrives, Finish
  // returns this instead of silently losing what the person already said.
  const pendingPartialRef = useRef<VoiceRecording | null>(null);

  function elapsedMs(): number {
    return accMsRef.current + (segStartRef.current != null ? performance.now() - segStartRef.current : 0);
  }

  function closeSegment() {
    if (segStartRef.current != null) {
      accMsRef.current += performance.now() - segStartRef.current;
      segStartRef.current = null;
    }
  }

  function teardown() {
    recorderRef.current = null;
    chunksRef.current = [];
    bytesRef.current = 0;
    segStartRef.current = null;
    accMsRef.current = 0;
    if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ownsStreamRef.current = false;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setAnalyser(null);
  }

  // Never leave the mic open after the screen unmounts.
  useEffect(() => () => {
    startGenRef.current++;
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    teardown();
  }, []);

  function micMessage(e: unknown): string {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      return "The microphone is blocked, allow mic access in your browser to record your voice.";
    if (name === "NotFoundError")
      return "No microphone was found on this device.";
    if (name === "NotReadableError")
      return transcribeAfter
        ? "The microphone is busy in another app, close it and tap the mic again, or tap Type instead."
        : "The microphone is busy in another app, your words are still being written down.";
    return transcribeAfter
      ? "Voice recording couldn’t start, tap Type to write the story instead."
      : "Voice recording couldn’t start, your words are still being written down.";
  }

  // Build a recorder on the shared stream. Bad mimes throw from the
  // constructor on some browsers, so it's wrapped.
  function buildRecorder(stream: MediaStream): MediaRecorder | null {
    const mime = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime || undefined,
        audioBitsPerSecond: audioBitsPerSecond(mime),
      });
    } catch {
      try { rec = new MediaRecorder(stream); } catch { return null; }
    }
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        bytesRef.current += e.data.size;
      }
      // Caps: auto-stop gracefully at 5 min / 10 MB (fires ~1/s via timeslice).
      if (recorderRef.current === rec && rec.state === "recording" &&
          (elapsedMs() >= VOICE_MAX_MS || bytesRef.current >= VOICE_MAX_BYTES)) {
        setAutoStopped(true);
        void finish();
      }
    };
    rec.onstop = () => {
      if (recorderRef.current !== rec) return; // a discarded ("start over") recorder, let it die silently
      if (finishResolveRef.current === null && !ownsStreamRef.current) {
        // INVOLUNTARY stop on a manager-owned stream: the track died under
        // the recorder (manager tore down a dead route, or the headset
        // battery/connection gave out), which makes MediaRecorder fire stop
        // on its own. Nobody asked to finish, so don't complete, but don't
        // throw the audio away either: a rebind may never come (a track can
        // end without the manager noticing), and this partial may be the
        // whole story the person told. Hold it; Finish arbitrates later.
        // (Every intentional stop, Finish button, the caps, goes through
        // finish(), which registers finishResolveRef BEFORE rec.stop().)
        closeSegment();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || pickAudioMime() || "audio/webm" });
        const durationMs = Math.round(accMsRef.current);
        if (blob.size > 0 && durationMs > 0) {
          pendingPartialRef.current = { blob, mimeType: blob.type, durationMs, recordingId: crypto.randomUUID(), suspectSilent: isSuspectSilent(blob.size, durationMs) };
        }
        teardown();
        setState("idle");
        return;
      }
      // An involuntary stop on the LEGACY self-owned path never ran
      // closeSegment (nothing called finish), close it here or a never-
      // paused take reads durationMs 0 and real audio gets discarded.
      closeSegment();
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || pickAudioMime() || "audio/webm" });
      const durationMs = Math.round(accMsRef.current);
      let result: VoiceRecording | null =
        blob.size > 0 && durationMs > 0
          ? { blob, mimeType: blob.type, durationMs, recordingId: crypto.randomUUID(), suspectSilent: isSuspectSilent(blob.size, durationMs) }
          : null; // instant Finish / empty recording → no voice note
      // If an earlier stretch of this take was salvaged from an involuntary
      // stop, the LONGER audio wins (they can't be stitched, separate
      // recorder sessions produce separate containers).
      const held = pendingPartialRef.current;
      pendingPartialRef.current = null;
      if (held && held.durationMs > (result?.durationMs ?? 0)) result = held;
      const resolve = finishResolveRef.current;
      finishResolveRef.current = null;
      teardown();
      setState("idle");
      resolve?.(result);
      onCompleteRef.current?.(result);
    };
    return rec;
  }

  async function start(externalStream?: MediaStream) {
    // Guard on refs, not React state, a stored callback could call this
    // before a setState("idle") has rendered. An in-flight start is awaited
    // (then re-checked) so rapid double-taps still open ONE stream, but a
    // start right after a cancellation isn't swallowed.
    if (!voiceRecordingSupported()) return;
    while (startPendingRef.current) { await startPendingRef.current; }
    if (recorderRef.current || streamRef.current) return;
    const run = doStart(externalStream);
    startPendingRef.current = run;
    try { await run; } finally { startPendingRef.current = null; }
  }

  async function doStart(externalStream?: MediaStream) {
    const gen = ++startGenRef.current;
    setError(null);
    setAutoStopped(false);
    try {
      // Preferred path: the SHARED stream from the mic-capture manager (one
      // getUserMedia for recorder + recognizer + waveform, a page's second
      // stream can mute the first on iOS). The manager
      // owns those tracks and the analyser. Self-opening remains only as the
      // legacy path for callers without a manager.
      const stream = externalStream ?? (await openMicStream());
      if (gen !== startGenRef.current) {
        // The UI moved on (Finish / start over / unmount) while the permission
        // prompt was open, release a stream WE opened, keep nothing.
        if (!externalStream) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      ownsStreamRef.current = !externalStream;
      // Waveform tap, only on the self-opened path; with a shared stream the
      // manager's analyser drives the waveform.
      if (!externalStream) {
        try {
          const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) {
            const ctx = new Ctx();
            // Track BEFORE wiring so teardown() owns the context even when
            // createMediaStreamSource throws, otherwise each retry leaks a
            // running AudioContext (same finding as the dictation energy tap).
            ctxRef.current = ctx;
            ctx.resume().catch(() => {}); // Safari starts suspended; close() can race resume()
            const node = ctx.createAnalyser();
            node.fftSize = 256;
            ctx.createMediaStreamSource(stream).connect(node);
            setAnalyser(node);
          }
        } catch { /* no waveform is fine, recording still works */ }
      }

      const rec = buildRecorder(stream);
      if (!rec) { setError(micMessage(null)); teardown(); return; }
      chunksRef.current = [];
      bytesRef.current = 0;
      accMsRef.current = 0;
      recorderRef.current = rec;
      rec.start(1000); // timeslice: chunks land ~1/s, so caps can react
      segStartRef.current = performance.now();
      setState("recording");
    } catch (e) {
      if (gen === startGenRef.current) {
        setError(micMessage(e));
        teardown();
      }
    }
  }

  function pause() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    try { rec.pause(); } catch { return; }
    closeSegment();
    setState("paused");
  }

  function resume() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "paused") return;
    try { rec.resume(); } catch { return; }
    segStartRef.current = performance.now();
    setState("recording");
  }

  // "Start over": discard the recorder + chunks but KEEP the stream and
  // analyser, and start a fresh recorder, no new permission prompt.
  function restart() {
    pendingPartialRef.current = null; // "start over" resets salvage too
    const stream = streamRef.current;
    const old = recorderRef.current;
    recorderRef.current = null; // detach BEFORE stop so onstop ignores it
    try { old?.stop(); } catch { /* already stopped */ }
    chunksRef.current = [];
    bytesRef.current = 0;
    accMsRef.current = 0;
    segStartRef.current = null;
    setAutoStopped(false);
    if (!stream) { setState("idle"); void start(); return; }
    const rec = buildRecorder(stream);
    if (!rec) { teardown(); setState("idle"); return; }
    recorderRef.current = rec;
    rec.start(1000);
    segStartRef.current = performance.now();
    setState("recording");
  }

  // Stop and assemble the final blob. Resolves null for an empty recording.
  function finish(): Promise<VoiceRecording | null> {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      // A finish is ALREADY in flight (the caps auto-stop raced this tap:
      // stop() flips state synchronously, onstop hasn't run yet). Tearing
      // down here would wipe the chunks before onstop assembles the blob,
      // piggyback on the pending resolution instead.
      if (rec && finishResolveRef.current) {
        return new Promise((resolve) => {
          const prev = finishResolveRef.current;
          finishResolveRef.current = (r) => { prev?.(r); resolve(r); };
        });
      }
      startGenRef.current++; // cancels a start() still waiting on the mic prompt
      teardown();
      setState("idle");
      // No live recorder, but a take salvaged from an involuntary stop may
      // be waiting, Finish must return the person's words, not null.
      const held = pendingPartialRef.current;
      pendingPartialRef.current = null;
      if (held) {
        onCompleteRef.current?.(held);
        return Promise.resolve(held);
      }
      return Promise.resolve(null);
    }
    closeSegment();
    return new Promise((resolve) => {
      finishResolveRef.current = resolve;
      try { rec.stop(); } catch {
        finishResolveRef.current = null;
        teardown();
        setState("idle");
        resolve(null);
      }
    });
  }

  // Abandon everything (leaving the screen), nothing is kept.
  function discard() {
    startGenRef.current++; // cancels a start() still waiting on the mic prompt
    const old = recorderRef.current;
    recorderRef.current = null;
    try { old?.stop(); } catch { /* already stopped */ }
    teardown();
    setState("idle");
  }

  // A NEW take begins (start over / fresh take), drop salvage from the old
  // one so it can never win the longer-take arbitration against fresh audio.
  function discardPartial() {
    pendingPartialRef.current = null;
  }

  return {
    supported: voiceRecordingSupported(),
    state,
    analyser,
    error,
    autoStopped,
    start,
    pause,
    resume,
    restart,
    finish,
    discard,
    discardPartial,
  };
}
