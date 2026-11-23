"use client";
// StoryCapture, "What's happening in this photo?" The core onboarding step: a
// matte tilted photo on one side, the question and capture surface on the
// other, with a Speak/Type toggle (voice or textarea) plus prompt chips.
// Purely presentational: all state that persists lives in props (story/value
// + handlers); local state only drives the UI mode (speak vs type, recording
// animation) which carries nothing to save. (The product's Starter plan swaps
// the voice surface for a hand-tagging panel; this demo shows Premium only.)
//
// Speak mode is REAL dictation via the browser's speech recognition (Web
// Speech API): words land in the story as you talk. The browser's own speech
// service does the transcription (it may process audio in the vendor's cloud).
// On plans with voice notes, the actual audio is ALSO recorded (one shared
// getUserMedia stream feeding MediaRecorder + the waveform) and, when the
// family member saves the memory, stored in the family's private vault so the
// real voice can be played back later. Nothing uploads until they press Save,
// and the copy says exactly what is kept. Browsers without support simply
// don't get the toggle / the recording.
//
// Demo note: in the product, every platform now records the take and the
// server turns it into words after Finish (see lib/platform.ts). This demo has
// no server, so after Finish it fills in a clearly labelled SAMPLE transcript,
// the same trick the product's own dev harness uses. The recording itself is
// real and plays back on the next screen.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import LiveWaveform from "@/app/components/LiveWaveform";
import { getSpeechRecognition, appendTranscript, formatSeconds, type SpeechRecognitionLike } from "@/lib/dictation";
import { useVoiceRecorder, type VoiceRecording } from "@/lib/useVoiceRecorder";
import { listMics, readMicDeviceId, storeMicDeviceId, type MicDevice } from "@/lib/micDevice";
import { createMicCapture, type MicCapture } from "@/lib/micCapture";
import { isIOSWebKit, trustLiveDictation } from "@/lib/platform";

export type StoryCaptureProps = {
  /** Signed URL for the photo. Falls back to the onboarding placeholder deck. */
  photoUrl?: string;
  /** Current story text (controlled). Empty string renders the empty state. */
  story: string;
  /** Fired on every keystroke in the story textarea. */
  onStoryChange: (value: string) => void;
  /** Optional prompt-chip labels. Defaults to Who's here? / Where was this? / What year? */
  suggestions?: string[];
  /** Primary action, "Save memory" when there's content, else "Continue". */
  onContinue: () => void;
  /** Subtle skip / back-out link. */
  onSkip: () => void;
  /** Disables the primary CTA while the story is being read (AI extraction). */
  busy?: boolean;
  /** Plan-gated (voiceNotesPerPhoto > 0): also record the real audio while
   *  they speak. Off = transcript-only, exactly as before. */
  canRecordVoice?: boolean;
  /** A finished take bubbles up here (held in OnboardingFlow until Save);
   *  null clears it ("start over" resets words and audio together). */
  onVoiceRecorded?: (recording: VoiceRecording | null) => void;
  /** Demo only: fill the story with an example, for visitors who'd rather
   *  not type or talk. */
  onUseExample?: () => void;
  /** Demo only: the sample words that stand in for server transcription. */
  demoTranscript?: string;
};

const DEFAULT_SUGGESTIONS = ["Who's here?", "Where was this?", "What year?"];

// One story limit everywhere: textarea, dictation, API, and the DB comment
// constraint all agree on 4000 characters.
const MAX_STORY_CHARS = 4000;

type DictationState = "idle" | "recording" | "paused";

// Live dictation driver. Finalized phrases are appended to the story via
// onFinal; the in-flight (interim) phrase is exposed separately so the
// transcript can show it lighter. Chrome ends sessions on silence, while
// "recording" we quietly restart so it feels continuous.
//
// The recognizer's mic track comes from OUTSIDE via getTrack, the shared
// mic-capture manager (lib/micCapture.ts) owns the ONE getUserMedia stream
// that also feeds the recorder and the waveform. this
// hook must never open its own stream: a page's second getUserMedia can mute
// the first on iOS. If getTrack yields nothing, the recognizer falls back to
// its own internal capture (the pre-existing desktop behavior).
function useDictation(onFinal: (chunk: string) => void, getTrack: () => MediaStreamTrack | null) {
  const Ctor = useMemo(() => getSpeechRecognition(), []);
  // Live Web Speech runs ONLY where start(track) genuinely works (desktop
  // Chromium), everywhere else the recognizer opens a
  // SECOND mic capture against the shared stream and WebKit mutes one of
  // them (the iPhone total-failure root cause). On those platforms this hook
  // is just the take's state machine + clock; words come from server-side
  // transcription after Finish.
  const live = useMemo(() => !!Ctor && trustLiveDictation(), [Ctor]);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const keepAlive = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const getTrackRef = useRef(getTrack);
  getTrackRef.current = getTrack;
  const [state, setState] = useState<DictationState>("idle");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  // On-screen diagnostics: did the RECOGNIZER hear any energy (sound) or
  // recognizable speech (speech)? are results arriving? `device` is the mic
  // track we handed it (e.g. "AirPods Pro").
  const [diag, setDiag] = useState({ audio: false, sound: false, speech: false, results: 0, restarts: 0, lastError: "", device: "" });
  // Generation counter: any lifecycle action (finish, pause, another begin,
  // unmount) bumps it so a stale recognizer can't resurrect itself.
  const genRef = useRef(0);
  const [noVoiceHint, setNoVoiceHint] = useState(false);

  // If we've been "recording" a few seconds with zero results, the mic likely
  // isn't reaching us (wrong device / muted) or the browser's speech service is
  // unreachable, surface that + point at Type, instead of a silent empty box.
  useEffect(() => {
    // Words arriving clears the hint too, a mid-recording mic switch stays
    // in "recording", so leaving "recording" can't be the only clear path.
    // Record-then-transcribe mode expects NO live words, never hint there.
    if (!live || state !== "recording" || diag.results > 0) { setNoVoiceHint(false); return; }
    const t = setTimeout(() => setNoVoiceHint(true), 7000);
    return () => clearTimeout(t);
  }, [live, state, diag.results]);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Never leave a recognizer running after the screen unmounts. (The mic
  // stream belongs to the capture manager, which the component stops.)
  useEffect(() => () => { genRef.current++; keepAlive.current = false; recRef.current?.abort(); }, []);

  function begin() {
    // Replace any live recognizer so two can never run at once.
    keepAlive.current = false;
    recRef.current?.abort();
    ++genRef.current;
    setMicError(null);
    setDiag({ audio: false, sound: false, speech: false, results: 0, restarts: 0, lastError: "", device: "" });
    // Clear the in-flight phrase too, "Start over" reset everything EXCEPT
    // the lingering interim text, which made it look like nothing restarted.
    setInterim("");

    // Hand the SHARED stream's track to the recognizer (Chromium honors
    // start(track); other engines ignore the extra argument and capture on
    // their own, the pre-existing behavior).
    const track = getTrackRef.current();
    if (track) {
      const label = track.label || "unknown mic";
      setDiag(d => ({ ...d, device: label }));
      if (typeof console !== "undefined") console.info("[lifevault dictation] mic device:", label);
    }

    if (!live) {
      // Record-then-transcribe platform: NO recognizer, constructing one
      // here is exactly what killed the iPhone (second capture → mute).
      // The state machine + clock still run; the recorder captures the take.
      setState("recording");
      return;
    }
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    const startRec = () => rec.start(track && track.readyState === "live" ? track : undefined);
    // EVERY handler ignores events from a replaced recognizer, a stale
    // instance ("Start over") must not restart itself, corrupt the shared
    // diagnostics, or flash errors over the live one.
    rec.onresult = (e) => {
      if (recRef.current !== rec) return;
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript);
        else live += r[0].transcript;
      }
      setInterim(live);
      setDiag(d => ({ ...d, results: d.results + 1 }));
    };
    // Lifecycle events (not on SpeechRecognitionLike, typed loosely) tell us if
    // the mic even opened, whether the recognizer heard ANY energy (sound), and
    // whether it heard recognizable speech.
    const recEvents = rec as unknown as { onaudiostart: (() => void) | null; onsoundstart: (() => void) | null; onspeechstart: (() => void) | null };
    recEvents.onaudiostart = () => { if (recRef.current === rec) setDiag(d => ({ ...d, audio: true })); };
    recEvents.onsoundstart = () => { if (recRef.current === rec) setDiag(d => ({ ...d, sound: true })); };
    recEvents.onspeechstart = () => { if (recRef.current === rec) setDiag(d => ({ ...d, speech: true })); };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      setDiag(d => ({ ...d, restarts: d.restarts + 1 }));
      if (!keepAlive.current) return;
      // Chrome ends sessions on silence, restart so it feels continuous. A
      // failed restart must NOT die silently (it used to leave the UI stuck on
      // "Recording" forever): retry once after a beat, then surface the stall.
      try { startRec(); } catch {
        setTimeout(() => {
          if (recRef.current !== rec || !keepAlive.current) return;
          try { startRec(); } catch {
            keepAlive.current = false;
            setState("idle");
            setMicError("The microphone stopped. Tap the mic to keep going, or use Type.");
          }
        }, 400);
      }
    };
    rec.onerror = (e) => {
      if (recRef.current !== rec) return;
      // Surface the real error. A silent failure (very common on Safari, or when
      // the browser's cloud speech service is unreachable) otherwise just looks
      // like "nothing happens", this makes it diagnosable.
      if (typeof console !== "undefined") console.warn("[lifevault dictation] error:", e.error);
      setDiag(d => ({ ...d, lastError: e.error || "?" }));
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        keepAlive.current = false;
        setState("idle");
        setMicError("The microphone is blocked. Allow mic access in your browser, or use Type instead.");
      } else if (e.error === "network") {
        setMicError("Live transcription couldn't reach this browser's speech service. It may be blocked on this browser or network. You can still use Type, or try Chrome.");
      } else if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        setMicError(`Live transcription hit an error (${e.error}). If it keeps happening, use Type. Chrome is the most reliable for dictation.`);
      }
      // no-speech / aborted → onend restarts while recording
    };
    recRef.current = rec;
    keepAlive.current = true;
    try {
      if (typeof console !== "undefined") console.info("[lifevault dictation] starting recognizer, lang:", rec.lang);
      startRec();
      setState("recording");
    } catch (err) {
      // never swallow this, a start(track) rejection would
      // otherwise be indistinguishable from "nothing happened".
      if (typeof console !== "undefined") console.error("[lifevault dictation] start failed:", err);
      setDiag(d => ({ ...d, lastError: `start: ${(err as Error)?.name ?? String(err)}` }));
      keepAlive.current = false;
      setMicError("Couldn’t start the microphone. Use Type instead.");
    }
  }

  return {
    // Live dictation where trusted; elsewhere the hook still runs the take
    // (record-then-transcribe), so the Speak surface stays available.
    supported: live || !!Ctor,
    live,
    state,
    interim,
    seconds,
    micError,
    diag,
    noVoiceHint,
    start: () => { setSeconds(0); begin(); },
    resume: () => { begin(); },
    pause: () => { genRef.current++; keepAlive.current = false; recRef.current?.stop(); setInterim(""); setState("paused"); },
    finish: () => { genRef.current++; keepAlive.current = false; recRef.current?.stop(); setInterim(""); setState("idle"); },
  };
}

type Dictation = ReturnType<typeof useDictation>;

// The mic picker's surface, list of inputs, the saved choice, the switch
// handler (which reopens live capture on the new device), plus the shared
// stream's health signals for the two-variant guidance message.
export type MicControls = {
  list: MicDevice[];
  current: string | null;
  onSwitch: (deviceId: string) => void;
  /** Sticky: the shared stream carried real voice energy this take. */
  heardVoice: boolean;
  /** Sticky: the stream showed a live noise floor, the mic route works,
   *  the person just hasn't spoken (yet). Softens the guidance. */
  alive: boolean;
  /** The stream stayed silent through every re-acquisition attempt. */
  dead: boolean;
  /** getUserMedia failed outright (permission etc.). */
  errorText: string | null;
  /** Neutral FYI after an automatic recovery, names the mic actually in
   *  use now, so the copy never implies a dead headset was fixed. */
  notice: string | null;
};

// Dictation + audio recording driven as ONE control surface, so the words and
// the voice can never drift out of lockstep (pause pauses both, finish ends
// both, start-over resets both).
export type VoiceControls = {
  enabled: boolean;
  analyser: AnalyserNode | null;
  error: string | null;
  autoStopped: boolean;
  /** Record-then-transcribe platforms: the finished take is being turned
   *  into words server-side right now. */
  transcribing: boolean;
  /** Post-transcription outcome worth telling the person (couldn't hear
   *  words / service off / failed), the voice note itself is always kept. */
  transcribeNote: string | null;
  start: () => void;
  resume: () => void;
  pause: () => void;
  finish: () => void;
  startOver: () => void;
};

export default function StoryCapture({
  photoUrl,
  story,
  onStoryChange,
  suggestions = DEFAULT_SUGGESTIONS,
  onContinue,
  onSkip,
  busy = false,
  canRecordVoice = false,
  onVoiceRecorded,
  onUseExample,
  demoTranscript,
}: StoryCaptureProps) {
  // Premium capture mode, Speak first (the Figma opens on the mic);
  // "type" reveals the textarea instead. Falls back to type when unsupported.
  const [mode, setMode] = useState<"speak" | "type">("speak");

  // ONE shared microphone stream (lib/micCapture.ts) feeds the recognizer,
  // the recorder, and the waveform, a page's second
  // getUserMedia can MUTE the first on iOS, so the old two-stream setup could
  // create the very silence it was diagnosing. The manager also owns stream
  // health: silent-headset routes (Bluetooth HFP) are re-acquired after the
  // OS route settles; if that fails twice, captureDead drives the guidance.
  const captureRef = useRef<MicCapture | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [heardVoice, setHeardVoice] = useState(false);
  // Ref mirror for capture callbacks (created once, state reads there are
  // stale closures).
  const heardVoiceRef = useRef(false);
  const [streamAlive, setStreamAlive] = useState(false);
  const [captureDead, setCaptureDead] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  // The take's ORIGINAL mic (set on initial/switched only), recovery copy
  // compares against what the user thinks of as "my mic", not whatever
  // stream happened to come before (a double failover must not end on
  // "we reconnected it" while a different device records).
  const lastLabelRef = useRef("");
  // Recovery notice held back until the new stream PROVES alive (onSignal),
  // announcing "reconnected" over a still-dead stream would contradict the
  // guidance box that's about to appear.
  const pendingNoticeRef = useRef<string | null>(null);
  // What the take is DOING right now, readable from capture callbacks without
  // stale-closure risk.
  const takeModeRef = useRef<"idle" | "recording" | "paused">("idle");

  // Live dictation: finalized phrases append to the story. The ref carries the
  // freshest text so back-to-back finals never clobber each other (recognition
  // events can arrive faster than renders).
  const storyRef = useRef(story);
  useLayoutEffect(() => { storyRef.current = story; }, [story]);
  const dict = useDictation((chunk) => {
    // Same cap as typing, a long dictation must stay saveable.
    const next = appendTranscript(storyRef.current, chunk).slice(0, MAX_STORY_CHARS);
    storyRef.current = next;
    onStoryChange(next);
  }, () => captureRef.current?.getTrack() ?? null);

  // Record-then-transcribe: in the product the finished take goes to the
  // server for transcription and the words land in the story box for review.
  // The demo has no server, so a sample transcript stands in (see header).
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeNote, setTranscribeNote] = useState<string | null>(null);
  // A finished take is CONTENT: when transcription is unavailable (or fails)
  // the story text stays empty, and Continue must not dead-end a person who
  // just recorded their voice (Fatimah hit exactly this on iPhone). The
  // parent's save path already treats a voice note as content.
  const [hasVoiceTake, setHasVoiceTake] = useState(false);
  const lastTakeRef = useRef<VoiceRecording | null>(null);
  // Generation guard (same class as OnboardingFlow's catchGen): a Start over,
  // a new take, or leaving the screen must invalidate an in-flight
  // transcription, a late response landing through storyRef could otherwise
  // resurrect discarded words, or clobber ANOTHER photo's story after Back.
  // Only the CURRENT generation may write.
  const transcribeGenRef = useRef(0);
  async function transcribeTake(r: VoiceRecording) {
    const gen = ++transcribeGenRef.current;
    const current = () => gen === transcribeGenRef.current;
    lastTakeRef.current = r;
    setTranscribing(true);
    setTranscribeNote(null);
    try {
      // Demo: no transcription server. Keep the beat the product has ("Writing
      // your words down…"), then drop in the sample words, labelled as such.
      await new Promise((r) => setTimeout(r, 1200));
      if (!current()) return; // take was reset / replaced / screen left
      const words = demoTranscript?.trim() ?? "";
      if (words) {
        const next = appendTranscript(storyRef.current, words).slice(0, MAX_STORY_CHARS);
        storyRef.current = next;
        onStoryChange(next);
        setTranscribeNote("Demo: these are sample words, not a transcript of your recording. In LifeVault, your own words appear here after you tap Finish. Your recording is real and plays back on the next screen.");
      } else {
        setTranscribeNote("Your voice note is kept for this memory. This demo can't turn speech into text, so please type the story below.");
      }
    } finally {
      if (current()) setTranscribing(false);
    }
  }

  const rec = useVoiceRecorder({
    // Recorder failure copy must be honest per platform: on record-then-
    // transcribe platforms a dead recorder means NO words at all.
    transcribeAfter: !dict.live,
    onComplete: (r) => {
      // Only a real take replaces the held recording, an instant Finish
      // (empty blob) must not wipe a good earlier take.
      if (r) { onVoiceRecorded?.(r); setHasVoiceTake(true); }
      // Caps auto-stop the recorder; end the dictation with it, and release
      // the WHOLE take (mode + capture manager), or the mic stays hot on the
      // idle surface after a 5-minute auto-stop.
      // On a user Finish this is a no-op: voice.finish already did it.
      takeModeRef.current = "idle";
      captureRef.current?.stop();
      captureRef.current = null;
      setAnalyser(null);
      if (dict.state !== "idle") dict.finish();
      // No live dictation on this platform → the words come from the server.
      if (r && !dict.live) void transcribeTake(r);
    },
  });
  const voiceOn = canRecordVoice && rec.supported;
  // Ref mirrors for the capture manager's callbacks (created once, so plain
  // reads there would be stale closures). Synced after every render.
  const voiceOnRef = useRef(voiceOn);
  const dictRef = useRef(dict);
  const recRef2 = useRef(rec);
  useLayoutEffect(() => {
    voiceOnRef.current = voiceOn;
    dictRef.current = dict;
    recRef2.current = rec;
  });

  function ensureCapture(): MicCapture {
    if (captureRef.current) return captureRef.current;
    const cap = createMicCapture({
      onStream: (h, reason) => {
        setAnalyser(h.analyser);
        setCaptureDead(false);
        setCaptureError(null);
        if (reason === "reacquired") {
          // A dead-from-the-start route produced only SILENT salvage, drop
          // it, or longer-wins arbitration can hand the silent stretch to
          // Finish over a shorter good take.
          // A take that HAD voice keeps its salvage: those words were real.
          if (!heardVoiceRef.current && voiceOnRef.current) recRef2.current.discardPartial();
          // Honest recovery copy: we found A working mic,
          // we did not fix the one that died.
          pendingNoticeRef.current =
            h.deviceLabel && h.deviceLabel !== lastLabelRef.current
              ? `Your mic stopped sending audio, so we switched to ${h.deviceLabel}.`
              : "Your mic went quiet, so we reconnected it.";
        } else {
          lastLabelRef.current = h.deviceLabel;
          pendingNoticeRef.current = null;
        }
        if (reason === "initial") {
          // First stream of the take, start both consumers fresh.
          dictRef.current.start();
          if (voiceOnRef.current) void recRef2.current.start(h.stream);
          takeModeRef.current = "recording";
          return;
        }
        // Re-acquired or switched mid-take: rebind consumers to the NEW
        // stream, but never yank a PAUSED take back into recording.
        if (takeModeRef.current !== "recording") return;
        dictRef.current.resume();
        if (voiceOnRef.current) {
          recRef2.current.discard(); // silent take being escaped; also cancels a pending old-stream start
          void recRef2.current.start(h.stream);
        }
      },
      onDead: () => {
        pendingNoticeRef.current = null;
        setMicNotice(null);
        setCaptureDead(true);
      },
      onError: () => {
        setCaptureError("The microphone is blocked or unavailable. Allow mic access in your browser, or tap Type instead.");
        // Recognizer-internal capture still works on desktop Chrome without
        // our stream, let dictation try on its own rather than dead-ending.
        // ONLY where live dictation is trusted: on iOS this
        // fallback would recreate the exact capture contention that killed
        // voice, and without a stream there is nothing to record anyway.
        if (dictRef.current.live) {
          dictRef.current.start();
          takeModeRef.current = "recording";
        }
      },
      onHeardAudio: () => { heardVoiceRef.current = true; setHeardVoice(true); },
      onSignal: () => {
        setStreamAlive(true);
        if (pendingNoticeRef.current) {
          setMicNotice(pendingNoticeRef.current);
          pendingNoticeRef.current = null;
        }
      },
    });
    captureRef.current = cap;
    return cap;
  }

  // The screen unmounting must release the mic AND orphan any in-flight
  // transcription (its late resolve would otherwise write photo A's words
  // into photo B's story via the frozen closure).
  useEffect(() => () => {
    transcribeGenRef.current++;
    captureRef.current?.stop();
  }, []);

  const voice: VoiceControls = {
    enabled: voiceOn,
    analyser,
    error: rec.error,
    autoStopped: rec.autoStopped,
    transcribing,
    transcribeNote,
    start: () => {
      transcribeGenRef.current++; // an in-flight transcription belongs to a dead take now
      setTranscribing(false);
      heardVoiceRef.current = false;
      setHeardVoice(false);
      setStreamAlive(false);
      setCaptureDead(false);
      setMicNotice(null);
      setTranscribeNote(null);
      pendingNoticeRef.current = null;
      if (voiceOn) rec.discardPartial(); // fresh take, old salvage dies with it
      void ensureCapture().start(); // consumers start in onStream("initial")
    },
    resume: () => {
      takeModeRef.current = "recording";
      dict.resume();
      if (voiceOn) {
        if (rec.state === "paused") { rec.resume(); return; }
        const stream = captureRef.current?.getStream();
        if (stream) void rec.start(stream);
        else if (!captureRef.current) void rec.start();
        // Manager exists but is mid-recovery (settle window): WAIT for its
        // onStream to rebind, self-opening here would put a second
        // getUserMedia stream on the page, the exact iOS mute hazard.
      }
    },
    pause: () => {
      takeModeRef.current = "paused";
      dict.pause();
      if (voiceOn) rec.pause();
    },
    finish: () => {
      takeModeRef.current = "idle";
      dict.finish();
      if (voiceOn) void rec.finish();
      captureRef.current?.stop();
      captureRef.current = null;
      setAnalyser(null);
    },
    startOver: () => {
      transcribeGenRef.current++; // stale words must never land in the fresh take
      setTranscribing(false);
      setHasVoiceTake(false);
      onStoryChange("");
      onVoiceRecorded?.(null); // words and audio reset together
      heardVoiceRef.current = false;
      setHeardVoice(false);
      setStreamAlive(false);
      setMicNotice(null);
      setTranscribeNote(null);
      pendingNoticeRef.current = null;
      if (voiceOn) rec.discardPartial(); // the reset take's salvage too
      const stream = captureRef.current?.getStream();
      if (stream) {
        dict.start();
        if (voiceOn) { if (rec.state === "idle") void rec.start(stream); else rec.restart(); }
        takeModeRef.current = "recording";
      } else {
        void ensureCapture().start();
      }
    },
  };

  // Mic picker, the escape hatch for "the browser opened the wrong mic".
  // Choice persists via micDevice.ts; the capture manager re-opens on it and
  // both consumers rebind through onStream("switched").
  const [mics, setMics] = useState<MicDevice[]>([]);
  // This screen only ever renders in the browser, so the saved choice can be
  // read up front.
  const [micId, setMicId] = useState<string | null>(() => readMicDeviceId());
  useEffect(() => {
    if (dict.state === "idle") return;
    // iOS owns input routing, a picker can't actually switch it, and the
    // re-acquisition a switch triggers is itself a capture hazard. The
    // recording card shows a read-only route indicator instead.
    if (isIOSWebKit()) return;
    let cancelled = false;
    // Re-read the saved id with the list: the manager self-heals (clears a
    // vanished device) invisibly to React; without this the select would keep
    // showing a device that isn't in use (or a blank value matching no option).
    listMics().then(list => {
      if (cancelled) return;
      setMics(list);
      setMicId(readMicDeviceId());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [dict.state, dict.diag.device]);

  function switchMic(deviceId: string) {
    setMicId(deviceId || null);
    heardVoiceRef.current = false;
    setHeardVoice(false);
    setStreamAlive(false);
    setMicNotice(null);
    pendingNoticeRef.current = null;
    // The manager stores the preference, re-opens, and onStream("switched")
    // rebinds the recognizer + recorder. Falls back to storing only if no
    // take is live (next take picks it up).
    if (captureRef.current) void captureRef.current.switchDevice(deviceId || null);
    else storeMicDeviceId(deviceId || null);
  }

  const hasContent = story.trim().length > 0 || hasVoiceTake;
  // the Figma: the story screen's CTA is always "Continue", saving
  // happens on the next screen, after the human reviews the catch.
  const primaryLabel = "Continue";
  // A take in flight (recording OR paused) must be Finished first, moving on
  // mid-take would silently drop the voice note (Fatimah: disable Continue
  // until Finish is pressed; it also LOOKED broken when it ignored clicks).
  const takeInFlight = dict.state !== "idle" || transcribing;

  return (
    <main className="flex min-h-screen flex-col bg-[#fafafa] [font-family:var(--font-lato),system-ui,sans-serif]">
      {/* Scrolling body, footer pins beneath. */}
      <div className="flex-1">
        {/* Mobile: bigger photo (310px matte) + 4px more air before the text
            (gap-4 → gap-5), sized so "Tap to start talking" stays in view. */}
        <div className="mx-auto flex w-full max-w-[700px] flex-col items-center gap-5 px-5 pt-6 pb-12 sm:gap-12 sm:px-6 sm:pt-10 lg:max-w-[1180px] lg:flex-row lg:items-start lg:gap-16 lg:py-20">
          {/* Matte tilted photo card */}
          <div className="order-1 w-full max-w-[310px] sm:max-w-[560px] lg:sticky lg:top-20 lg:flex-1">
            {/* Tilts counter-clockwise (top edge rises to the right), matching
                the Figma at 2.11°, the opposite lean from the Summary and
                name-a-face cards, which tilt clockwise. */}
            <div className="-rotate-[2.11deg] rounded-[16px] border-[10px] border-white bg-white shadow-[0_12px_5px_rgba(0,0,0,0.10),0_21px_21px_rgba(0,0,0,0.09),0_28px_47px_rgba(0,0,0,0.05)]">
              {/* Photo fills the matte card edge-to-edge (Figma). Signed URLs are
                  short-lived → plain img; no URL → bundled sample photo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl ?? "/onboarding/sample-hero.jpg"}
                alt="The photo you're adding a memory to"
                className="max-h-[250px] w-full rounded-[8px] object-cover sm:max-h-[520px]"
              />
            </div>
          </div>

          {/* Capture column */}
          <div className="order-2 w-full text-center lg:max-w-[560px] lg:flex-1 lg:text-left">
            <h1 className="mx-auto max-w-[250px] [font-family:var(--font-gotu),Georgia,serif] text-[26px] leading-[1.15] text-[#1a1a1a] sm:max-w-[345px] sm:text-[36px] sm:leading-[1.12] lg:mx-0 lg:max-w-none lg:text-[46px] lg:leading-[1.08]">
              What&rsquo;s happening in this photo?
            </h1>
            <p className="mx-auto mt-2 max-w-[250px] text-[13px] leading-[1.3] text-[#1a1a1a]/45 sm:mt-2.5 sm:max-w-[345px] sm:text-[14px] lg:mx-0 lg:mt-4 lg:max-w-[420px] lg:text-[16px] lg:leading-[1.5]">
              Talk like you&apos;re telling a friend. The little details are the ones worth
              keeping.
            </p>

            <PremiumCapture
              mode={mode}
              setMode={setMode}
              dict={dict}
              voice={voice}
              mic={{ list: mics, current: micId, onSwitch: switchMic, heardVoice, alive: streamAlive, dead: captureDead, errorText: captureError, notice: micNotice }}
              story={story}
              onStoryChange={onStoryChange}
              suggestions={suggestions}
              onUseExample={onUseExample}
            />
          </div>
        </div>
      </div>

      {/* Sticky footer: Back on the left, primary on the right */}
      <footer className="sticky bottom-0 border-t border-[#e4e1d8] bg-[#fafafa]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-5 py-2.5 sm:px-10 sm:py-4 lg:px-6">
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a1a]/70 transition-colors hover:text-[#1a1a1a]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M10 3.5 5.5 8l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>

          <button
            type="button"
            onClick={onContinue}
            disabled={!hasContent || busy || takeInFlight}
            title={takeInFlight ? "Tap Finish on your recording first" : undefined}
            className={`flex items-center gap-2 rounded-[14px] px-6 py-2.5 text-[15px] font-semibold text-white transition-all duration-100 enabled:active:scale-[0.99] sm:px-7 sm:py-3.5 sm:text-[16px] ${
              hasContent && !busy && !takeInFlight
                ? "bg-[#3c7a7c] hover:bg-[#336a6c]"
                : busy
                  ? "cursor-wait bg-[#a9c3c1]"
                  : "cursor-not-allowed bg-[#c9c9c9]"
            }`}
          >
            {busy ? "Reading your story…" : transcribing ? "Writing your words down…" : takeInFlight ? "Finish your recording first" : primaryLabel}
            <svg width="18" height="16" viewBox="0 0 18 16" fill="none" aria-hidden>
              <path
                d="M2 8h13m0 0-5-5m5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Premium: Speak / Type toggle → mic surface or textarea + prompt chips */
/* ------------------------------------------------------------------ */

function PremiumCapture({
  mode,
  setMode,
  dict,
  voice,
  mic,
  story,
  onStoryChange,
  suggestions,
  onUseExample,
}: {
  mode: "speak" | "type";
  setMode: (m: "speak" | "type") => void;
  dict: Dictation;
  voice: VoiceControls;
  mic: MicControls;
  story: string;
  onStoryChange: (v: string) => void;
  suggestions: string[];
  onUseExample?: () => void;
}) {
  // Speak needs EITHER live dictation OR a recorder whose take we can
  // transcribe server-side. iOS Chrome/Firefox (WKWebView shells) have NO
  // speech engine at all, but they record fine, so hiding Speak there would
  // cut the exact platforms this architecture serves. And without either
  // source of words, Speak is a dead end.
  const speakAvailable = dict.live ? dict.supported : voice.enabled;
  const effectiveMode = speakAvailable ? mode : "type";

  function switchTo(m: "speak" | "type") {
    if (m === "type" && dict.state !== "idle") voice.finish(); // ends dictation AND the recording
    setMode(m);
  }

  return (
    <div className="mt-6 sm:mt-14 lg:mt-7">
      {/* Segmented Speak / Type toggle */}
      {speakAvailable && (
        <div className="inline-flex items-center gap-1 rounded-full border border-[#e4e1d8] bg-white p-1">
          <SegmentButton active={effectiveMode === "speak"} onClick={() => switchTo("speak")}>
            <MicGlyph className="h-[15px] w-[15px]" />
            Speak
          </SegmentButton>
          <SegmentButton active={effectiveMode === "type"} onClick={() => switchTo("type")}>
            <PencilGlyph className="h-[14px] w-[14px]" />
            Type
          </SegmentButton>
        </div>
      )}

      {effectiveMode === "speak" ? (
        <SpeakSurface dict={dict} voice={voice} mic={mic} story={story} onStoryChange={onStoryChange} />
      ) : (
        <div className={speakAvailable ? "mt-6" : ""}>
          <StoryTextarea story={story} onStoryChange={onStoryChange} />
          {/* Switching to Type mid-take finishes the recording, its
              transcription still lands here; don't let it happen invisibly. */}
          {voice.transcribing && (
            <p role="status" className="mt-3 flex items-center gap-2 rounded-[10px] bg-[#f2efe8] px-3.5 py-2.5 text-left text-[13px] font-medium text-[#1a1a1a]/70">
              <span aria-hidden className="h-[9px] w-[9px] animate-pulse rounded-full bg-[#3c7a7c]" />
              Writing your words down&hellip;
            </p>
          )}
          {voice.transcribeNote && !voice.transcribing && (
            <p role="status" className="mt-3 rounded-[10px] bg-[#f2efe8] px-3.5 py-2.5 text-left text-[13px] font-medium leading-[1.5] text-[#1a1a1a]/70">
              {voice.transcribeNote}
            </p>
          )}
        </div>
      )}

      {/* Prompt chips, only on the empty, not-yet-recording surface; once words exist the transcript takes the room. */}
      {!story.trim() && dict.state === "idle" && (
        <div className="hidden sm:mt-6 sm:block lg:mt-8">
          <p className="text-[13px] text-[#1a1a1a]/45">Not sure where to start? Try&hellip;</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2.5 lg:justify-start">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  switchTo("type");
                  onStoryChange(story ? `${story} ${s} ` : `${s} `);
                }}
                className="rounded-full border border-[#e4e1d8] bg-white px-4 py-2 text-[14px] font-semibold text-[#1a1a1a] transition-colors hover:border-[#3c7a7c] hover:text-[#3c7a7c]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Demo only: a ready-made story for visitors who'd rather not type or
          talk. Shows on every breakpoint (the prompt chips hide on phones). */}
      {onUseExample && !story.trim() && dict.state === "idle" && (
        <p className="mt-5 text-[13px] text-[#1a1a1a]/45 lg:mt-6">
          In a hurry?{" "}
          <button
            type="button"
            onClick={() => { switchTo("type"); onUseExample(); }}
            className="font-semibold text-[#3c7a7c] underline underline-offset-2 hover:no-underline"
          >
            Use an example story
          </button>
        </p>
      )}
    </div>
  );
}

function SpeakSurface({
  dict,
  voice,
  mic,
  story,
  onStoryChange,
}: {
  dict: Dictation;
  voice: VoiceControls;
  mic: MicControls;
  story: string;
  onStoryChange: (v: string) => void;
}) {
  // Keep the newest words in view as the live transcript grows.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [story, dict.interim]);
  // IDLE: the big "Tap to start talking" mic. Once words
  // exist they sit in an editable box below, ready to polish or add to.
  if (dict.state === "idle") {
    return (
      <div className="mt-6 lg:mt-8">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5 lg:justify-start">
          <span className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full bg-[#3c7a7c]/12 sm:h-[104px] sm:w-[104px]">
            <button
              type="button"
              onClick={voice.start}
              aria-label="Tap to start talking"
              className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#3c7a7c] text-white transition-transform hover:scale-[1.04] active:scale-[0.97]"
            >
              <MicGlyph className="h-7 w-7" />
            </button>
          </span>
          <span className="text-[16px] font-semibold text-[#1a1a1a] sm:text-[19px]">
            {story ? "Tap to keep talking" : "Tap to start talking"}
          </span>
        </div>
        {/* Mobile-only nudge, replaces the prompt chips,
            which are hidden below sm. */}
        <p className="mt-3 text-[13px] text-[#1a1a1a]/45 sm:hidden">
          Just talk like you&rsquo;re telling a friend.
        </p>
        {dict.micError && (
          <p role="alert" className="mt-4 text-[14px] font-medium text-[#e4534b]">{dict.micError}</p>
        )}
        {voice.error && (
          <p role="alert" className="mt-2 text-[14px] font-medium text-[#d99a2b]">{voice.error}</p>
        )}
        {mic.errorText && !dict.micError && (
          <div role="alert" className="mx-auto mt-4 max-w-[420px] rounded-[10px] border border-[#e4534b] bg-[#e4534b]/5 px-3.5 py-2.5 text-left text-[13px] font-medium leading-[1.5] text-[#c8362e] lg:mx-0">
            {mic.errorText}
          </div>
        )}
        {mic.dead && !mic.errorText && !dict.micError && (
          <div role="alert" className="mx-auto mt-4 max-w-[420px] rounded-[10px] border border-[#e4534b] bg-[#e4534b]/5 px-3.5 py-2.5 text-left text-[13px] font-medium leading-[1.5] text-[#c8362e] lg:mx-0">
            Your microphone isn&apos;t sending audio. Try reconnecting or removing your
            headphones and tapping the mic again. Or tap <b>Type</b> above instead.
          </div>
        )}
        {voice.transcribing && (
          <p role="status" className="mx-auto mt-4 flex max-w-[420px] items-center justify-center gap-2 rounded-[10px] bg-[#f2efe8] px-3.5 py-2.5 text-[13px] font-medium text-[#1a1a1a]/70 lg:mx-0 lg:justify-start">
            <span aria-hidden className="h-[9px] w-[9px] animate-pulse rounded-full bg-[#3c7a7c]" />
            Writing your words down&hellip;
          </p>
        )}
        {voice.transcribeNote && !voice.transcribing && (
          <p role="status" className="mx-auto mt-4 max-w-[420px] rounded-[10px] bg-[#f2efe8] px-3.5 py-2.5 text-left text-[13px] font-medium leading-[1.5] text-[#1a1a1a]/70 lg:mx-0">
            {voice.transcribeNote}
          </p>
        )}
        {story && (
          <div className="mt-6">
            <StoryTextarea story={story} onStoryChange={onStoryChange} rows={5} />
          </div>
        )}
      </div>
    );
  }

  // PAUSED: a slim status bar and the transcript opened up
  // as an editable text box, "Pause to edit" means exactly that.
  if (dict.state === "paused") {
    return (
      <div className="mt-6">
        <div className="flex flex-col gap-3 rounded-[14px] border border-[#e4e1d8] bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between sm:py-2.5 sm:pl-4 sm:pr-2.5">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-[#1a1a1a]">
            <PauseGlyph className="h-[13px] w-[13px] text-[#d99a2b]" />
            Paused
            <span className="font-normal text-[#1a1a1a]/40">&middot; {formatSeconds(dict.seconds)}</span>
          </span>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:gap-2">
            <PillButton onClick={voice.resume}>
              <PlayGlyph className="h-[12px] w-[12px]" />
              Resume
            </PillButton>
            <PillButton solid onClick={voice.finish}>
              <CheckGlyph className="h-[12px] w-[12px]" />
              Finish
            </PillButton>
          </div>
        </div>
        {voice.autoStopped && (
          <p className="mt-3 text-[13px] font-medium text-[#d99a2b]">
            The recording reached its limit and was wrapped up. Everything up
            to here is kept.
          </p>
        )}
        <div className="mt-4">
          <StoryTextarea story={story} onStoryChange={onStoryChange} rows={6} />
        </div>
      </div>
    );
  }

  // RECORDING: status + timer up top, waveform, controls in
  // the bottom row (Start over / Pause to edit left, Finish right), then the
  // "What I'm hearing" panel where the NEWEST words read strongest.
  return (
    <div className="mt-6">
      <div className="rounded-[16px] border border-[#e4e1d8] bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-[#1a1a1a]">
            <span aria-hidden className="h-[9px] w-[9px] animate-pulse rounded-full bg-[#e4534b]" />
            Recording
          </span>
          <span className="text-[14px] text-[#1a1a1a]/45">{formatSeconds(dict.seconds)}</span>
        </div>

        {/* Waveform, with a recorder running the bars follow the real mic
            signal; without one they fall back to the decorative ripple. */}
        <LiveWaveform active={dict.state === "recording"} analyser={voice.analyser} />
        {/* Mic picker, only when there's actually a choice to make. Switching
            reopens capture on the new device without leaving the recording.
            Left-aligned with the Start over button below (Fatimah). The old
            on-screen diagnostic line is gone; its signals live on in the
            two-variant error below and the console logs. */}
        {mic.list.length === 0 && dict.diag.device && (
          // iOS: no picker (the OS owns routing; switching was itself a
          // capture hazard), a calm indicator of what we're listening
          // through instead.
          <p className="mt-2 text-left text-[12px] font-semibold text-[#1a1a1a]/55">
            Listening through {dict.diag.device}
          </p>
        )}
        {mic.list.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="lv-mic-picker" className="text-[12px] font-semibold text-[#1a1a1a]/55">
              Mic
            </label>
            <select
              id="lv-mic-picker"
              value={mic.current ?? ""}
              onChange={(e) => mic.onSwitch(e.target.value)}
              className="max-w-[260px] truncate rounded-[8px] border border-[#e4e1d8] bg-white px-2 py-1 text-[12px] text-[#1a1a1a]/75 outline-none focus:border-[#3c7a7c]"
            >
              <option value="">System default</option>
              {mic.list.map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <PillButton onClick={voice.startOver}>
              <RestartGlyph className="h-[13px] w-[13px]" />
              Start over
            </PillButton>
            <PillButton onClick={voice.pause}>
              <PauseGlyph className="h-[12px] w-[12px]" />
              Pause to edit
            </PillButton>
          </div>
          <PillButton solid onClick={voice.finish} className="w-full sm:w-auto">
            <CheckGlyph className="h-[12px] w-[12px]" />
            Finish
          </PillButton>
        </div>
        {dict.micError && (
          <p role="alert" className="mt-4 text-[14px] font-medium text-[#e4534b]">{dict.micError}</p>
        )}
        {mic.errorText && !dict.micError && (
          <div role="alert" className="mt-4 rounded-[10px] border border-[#e4534b] bg-[#e4534b]/5 px-3.5 py-2.5 text-[13px] font-medium leading-[1.5] text-[#c8362e]">
            {mic.errorText}
          </div>
        )}
        {mic.notice && !mic.dead && !mic.errorText && !dict.micError && (
          // Recovery FYI, not an error, the take is running again. Honest
          // about WHICH mic is live now (it may not be the headset).
          <p role="status" className="mt-4 rounded-[10px] bg-[#f2efe8] px-3.5 py-2.5 text-left text-[13px] font-medium leading-[1.5] text-[#1a1a1a]/70">
            {mic.notice}
          </p>
        )}
        {(mic.dead || (dict.noVoiceHint && !dict.micError && !mic.errorText)) && (
          // Inline ERROR treatment (red outline, like every other error in the
          // app), a failure state, not a tip. TWO diagnoses (direction
          // matters): if the SHARED stream carried voice
          // energy, the mic is fine and the transcription path is stuck; if
          // even we heard silence (including after the manager's automatic
          // re-acquisitions), the headset route itself isn't sending audio.
          <div role="alert" className="mt-4 rounded-[10px] border border-[#e4534b] bg-[#e4534b]/5 px-3.5 py-2.5 text-[13px] font-medium leading-[1.5] text-[#c8362e]">
            {mic.heardVoice && !mic.dead ? (
              <>
                We can hear your voice, but the browser isn&apos;t turning it into words. Its
                speech service may be stuck. Tap <b>Start over</b> to retry, or tap <b>Type</b> above
                to write the story instead.
              </>
            ) : mic.alive && !mic.dead ? (
              // The stream carries a live noise floor, the mic WORKS, we just
              // haven't caught a voice. Don't accuse the hardware.
              <>
                Your mic is on, but we haven&apos;t caught your voice yet. Try speaking a
                little louder or moving closer to the microphone. Or tap <b>Type</b> above to
                write the story instead.
              </>
            ) : (
              <>
                This microphone{dict.diag.device ? <> (<b>{dict.diag.device}</b>)</> : null} isn&apos;t
                sending audio to the browser. Try reconnecting your headset,{" "}
                {mic.list.length > 1
                  ? <>choosing another mic in the <b>Mic</b> menu above,</>
                  : <>checking it isn&apos;t muted,</>}
                {" "}or removing headphones and tapping <b>Start over</b>. Or tap <b>Type</b> above instead.
              </>
            )}
          </div>
        )}
        {voice.error && (
          <p role="alert" className="mt-2 text-[14px] font-medium text-[#d99a2b]">{voice.error}</p>
        )}
      </div>

      {/* Live transcript (Chromium desktop), earlier words settle back, the
          words landing right now read strongest. On
          record-then-transcribe platforms the same panel promises the words
          honestly: they arrive after Finish, from the recording. */}
      <div className="mt-6">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40 lg:text-left">
          {dict.live ? <>What I&apos;m hearing</> : <>Your story</>}
        </p>
        <div ref={transcriptRef} className="mt-4 max-h-[120px] overflow-y-auto rounded-[12px] bg-[#f2efe8] px-5 py-4 text-left text-[15px] leading-[1.6] sm:max-h-[170px] lg:mt-2 lg:max-h-[200px]">
          {story || dict.interim ? (
            <p className="whitespace-pre-wrap text-[#1a1a1a]/45">
              {story}
              {dict.interim && (
                <span className="font-semibold text-[#1a1a1a]">{story ? " " : ""}{dict.interim}</span>
              )}
            </p>
          ) : (
            <p className="text-[#1a1a1a]/35">
              {dict.live
                ? <>Your words will appear here as you talk&hellip;</>
                : <>Talk freely. We&apos;ll write your words down when you tap Finish.</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function StoryTextarea({
  story,
  onStoryChange,
  rows = 6,
}: {
  story: string;
  onStoryChange: (v: string) => void;
  rows?: number;
}) {
  const MAX = 4000;
  return (
    <div className="rounded-[16px] bg-white p-1 text-left shadow-[0_10px_40px_rgba(0,0,0,0.06)] ring-1 ring-[#3c7a7c]/60 focus-within:ring-2 focus-within:ring-[#3c7a7c]">
      <textarea
        value={story}
        onChange={(e) => onStoryChange(e.target.value.slice(0, MAX))}
        rows={rows}
        placeholder="Start typing your memory. Talk like you’re telling a friend."
        className="block w-full resize-none bg-transparent px-5 pt-4 text-[17px] leading-[1.5] text-[#1a1a1a] outline-none placeholder:text-[#1a1a1a]/30"
      />
      <div className="px-5 pb-3 text-right text-[13px] text-[#1a1a1a]/35">
        {story.length.toLocaleString()} / {MAX.toLocaleString()}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${
        active ? "bg-[#3c7a7c] text-white" : "text-[#1a1a1a]/70 hover:text-[#1a1a1a]"
      }`}
    >
      {children}
    </button>
  );
}

function PillButton({
  children,
  onClick,
  solid,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  solid?: boolean;
  /** Extra layout classes (e.g. full-width on mobile). Appended last so they win. */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
        solid
          ? "bg-[#3c7a7c] text-white hover:bg-[#336a6c]"
          : "border border-[#e4e1d8] bg-white text-[#1a1a1a] hover:border-[#3c7a7c]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* Inline glyphs (kept local so the file is self-contained) */

function MicGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" />
      <path
        d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 2.5 13.5 4.5 5 13H3v-2l8.5-8.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 10" fill="none" aria-hidden>
      <path
        d="M1 5.2 4.2 8.4 11 1.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 2.5 10 6l-7 3.5v-7Z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="2.5" y="2" width="2.5" height="8" rx="1" fill="currentColor" />
      <rect x="7" y="2" width="2.5" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

function RestartGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2M11 1v3H8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
