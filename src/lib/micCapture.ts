// ONE microphone capture for everything on the story screen. On iOS, a
// page's SECOND getUserMedia stream can mute the first, so the dictation recognizer, the voice-note recorder, and the
// waveform/health analyser must all feed off a single stream. This manager
// owns that stream and its health:
//
//   - navigator.audioSession "play-and-record" is set when available
//     (experimental WebKit API; progressive enhancement, never a dependency)
//   - health = track mute/unmute events (route-interruption clue) plus RMS
//     from an AnalyserNode, and RMS only counts while the AudioContext is
//     RUNNING (a suspended context reads flat zeros and must not be mistaken
//     for a dead mic)
//   - a fresh stream that stays silent (headset route died mid-switch, the
//     Bluetooth/HFP failure) is torn down, the OS route is given ~1s to
//     settle, and capture is re-acquired; the second retry drops the stored
//     device preference for plain `audio: true`; after that we give up and
//     the UI shows the device-agnostic guidance
//
// Consumers rebind on every onStream (initial, reacquired, switched): the
// recognizer restarts with the new track, the recorder rebuilds on the new
// stream. Nothing here is device-brand-specific.
import { openMicStream, readMicDeviceId, storeMicDeviceId } from "./micDevice";

export type CaptureHandle = {
  stream: MediaStream;
  track: MediaStreamTrack | null;
  analyser: AnalyserNode | null;
  deviceLabel: string;
};

export type StreamReason = "initial" | "reacquired" | "switched";

export type MicCaptureEvents = {
  /** A live stream is ready (initial, after re-acquisition, or after a device switch). */
  onStream: (h: CaptureHandle, reason: StreamReason) => void;
  /** The stream stayed silent through all retries, show guidance. */
  onDead: () => void;
  /** getUserMedia itself failed (permission, no device, …). */
  onError: (e: unknown) => void;
  /** Sticky voice-energy flag flipped true (real audio observed). */
  onHeardAudio?: () => void;
  /** Sticky noise-floor flag: the stream is ALIVE (peak ≥ 1) even if nobody
   *  has spoken yet, distinguishes "quiet room" from "dead route". */
  onSignal?: () => void;
};

export type MicCaptureDeps = {
  open: (plain?: boolean) => Promise<MediaStream>;
  createContext: () => AudioContext | null;
  /** ms of running-context silence on a fresh stream before re-acquiring */
  silenceMs: number;
  /** ms to let the OS audio route settle before re-opening */
  settleMs: number;
  /** RMS sampling interval */
  sampleMs: number;
  /** ms a muted track gets to recover (unmute / route settle) before the
   *  mute counts toward teardown, transient mutes are normal during route
   *  switches and usually end in an `unmute`, not a dead stream. */
  muteGraceMs: number;
  maxRetries: number;
};

function defaultDeps(): MicCaptureDeps {
  return {
    open: (plain?: boolean) => {
      if (plain) return navigator.mediaDevices.getUserMedia({ audio: true });
      return openMicStream();
    },
    createContext: () => {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        return Ctx ? new Ctx() : null;
      } catch {
        return null;
      }
    },
    silenceMs: 2500,
    settleMs: 1000,
    sampleMs: 400,
    muteGraceMs: 1200,
    maxRetries: 2,
  };
}

export function createMicCapture(events: MicCaptureEvents, deps: MicCaptureDeps = defaultDeps()) {
  let stream: MediaStream | null = null;
  let track: MediaStreamTrack | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let rmsTimer: ReturnType<typeof setInterval> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let heard = false;
  let sawSignal = false;
  // TWO independent death signals (one counter let a flapping dead route
  // starve detection forever by resetting it):
  let silentFor = 0; // ms of RUNNING-context digital silence, RMS ticks only
  let mutedFor = 0;  // ms the track has been continuously muted
  let trackMuted = false;
  let retries = 0;
  let gen = 0;
  let stopped = false;

  function teardownStream() {
    if (rmsTimer) { clearInterval(rmsTimer); rmsTimer = null; }
    track?.removeEventListener("mute", onMute);
    track?.removeEventListener("unmute", onUnmute);
    track?.removeEventListener("ended", onEnded);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    track = null;
    ctx?.close().catch(() => {});
    ctx = null;
    analyser = null;
  }

  function onMute() {
    // A muted track means the source can't provide data, a route
    // interruption clue, but per spec a TEMPORARY one (route switches fire
    // transient mute/unmute pairs). The tick accrues `mutedFor` while this
    // flag holds; sustained mute past `muteGraceMs` re-acquires.
    trackMuted = true;
  }

  function onUnmute() {
    // The source resumed, a transient mute recovered. This deliberately
    // does NOT touch the RMS counter: a dead route that flaps mute/unmute
    // must not be able to starve real-death detection by resetting it.
    trackMuted = false;
    mutedFor = 0;
  }

  function onEnded() {
    // The track ended OUTSIDE our own teardown (listeners are removed before
    // we stop tracks), headset battery died, device unplugged. Definitive:
    // re-acquire immediately, even on a stream that had carried voice.
    reacquire();
  }

  function startHealthMonitor() {
    if (!ctx || !analyser) return; // no context → no detection (behaves like before)
    const buf = new Uint8Array(analyser.fftSize);
    heard = false;
    sawSignal = false;
    silentFor = 0;
    mutedFor = 0;
    trackMuted = false;
    const myGen = gen;
    rmsTimer = setInterval(() => {
      if (stopped || myGen !== gen || !analyser || !ctx) return;
      if (ctx.state !== "running") {
        // Suspended context reads zeros that mean NOTHING about the mic,
        // keep nudging it awake and don't count this interval as silence.
        ctx.resume().catch(() => {});
        return;
      }
      // Sustained mute is checked BEFORE the heard guard: mute is hardware
      // evidence the source stopped (a person pausing fires no mute event),
      // so even a stream that carried voice re-acquires when its route dies.
      if (trackMuted) {
        mutedFor += deps.sampleMs;
        if (mutedFor >= deps.muteGraceMs) { reacquire(); return; }
      }
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = Math.abs(buf[i] - 128);
        if (d > peak) peak = d;
      }
      if (peak > 0 && !sawSignal) { sawSignal = true; events.onSignal?.(); }
      if (peak > 8) {
        if (!heard) { heard = true; events.onHeardAudio?.(); }
        silentFor = 0;
        return;
      }
      if (heard) return; // a working mic that went quiet is just a pause
      // DEAD route vs QUIET ROOM: a live mic always carries a noise floor
      // (peak ≥ 1 in byte time-domain data); a dead headset route delivers
      // digital silence, exactly zero. Only TRUE zero counts toward
      // re-acquisition, or a person thinking before they speak would get
      // their working mic torn down.
      if (peak > 0) { silentFor = 0; return; }
      silentFor += deps.sampleMs;
      if (silentFor >= deps.silenceMs) reacquire();
    }, deps.sampleMs);
  }

  async function acquire(reason: StreamReason, plain = false): Promise<void> {
    const myGen = ++gen;
    try {
      // Progressive enhancement: WebKit's AudioSession API tells iOS this
      // page records, harmless no-op elsewhere.
      try {
        const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
        if (session) session.type = "play-and-record";
      } catch { /* experimental API, never required */ }

      const s = await deps.open(plain);
      if (stopped || myGen !== gen) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      track = s.getAudioTracks()[0] ?? null;
      track?.addEventListener("mute", onMute);
      track?.addEventListener("unmute", onUnmute);
      track?.addEventListener("ended", onEnded);

      ctx = deps.createContext();
      if (ctx) {
        try {
          ctx.resume().catch(() => {});
          analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(s).connect(analyser);
        } catch { analyser = null; }
      }
      startHealthMonitor();
      events.onStream(
        { stream: s, track, analyser, deviceLabel: track?.label ?? "" },
        reason
      );
    } catch (e) {
      if (!stopped && myGen === gen) events.onError(e);
    }
  }

  function reacquire() {
    if (stopped) return;
    retries += 1;
    teardownStream();
    gen++; // cancel in-flight work against the dead stream
    if (retries > deps.maxRetries) {
      events.onDead();
      return;
    }
    // Give the OS audio route (Bluetooth HFP negotiation) time to settle
    // before asking again; the LAST retry drops the stored device preference
    // entirely, plain `audio: true`, in case the preference is the problem.
    const plain = retries >= deps.maxRetries;
    settleTimer = setTimeout(() => {
      if (!stopped) void acquire("reacquired", plain);
    }, deps.settleMs);
  }

  return {
    start(): Promise<void> {
      // Clean slate: a pending settle re-acquire or a
      // still-live stream from a previous life must not survive into a new
      // take, a stale timer would double-acquire and leak a hot mic, and
      // its stale listeners would corrupt the new stream's counters.
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      teardownStream();
      stopped = false;
      retries = 0;
      return acquire("initial");
    },
    stop() {
      stopped = true;
      gen++;
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      teardownStream();
    },
    async switchDevice(deviceId: string | null) {
      storeMicDeviceId(deviceId);
      retries = 0;
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      teardownStream();
      await acquire("switched");
    },
    getTrack: () => track,
    sawSignal: () => sawSignal,
    getStream: () => stream,
    getAnalyser: () => analyser,
    heardAudio: () => heard,
    currentDeviceId: () => readMicDeviceId(),
  };
}

export type MicCapture = ReturnType<typeof createMicCapture>;
