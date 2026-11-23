// One shared microphone-device preference for everything that opens the mic
// (dictation + voice-note recorder), so both always listen to the SAME input.
//
// Why this exists: browsers hand getUserMedia the system-default input, which
// is often not the mic the person expects, the real-world case that forced
// this was Chrome picking a Logitech webcam's (silent) mic while the person
// spoke into her laptop. The picker writes the choice here; both capture hooks
// read it; a vanished device self-heals back to the default.

import { isIOSWebKit } from "./platform";

const KEY = "lv_mic_device";

export type MicDevice = { deviceId: string; label: string };

export function readMicDeviceId(): string | null {
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function storeMicDeviceId(deviceId: string | null): void {
  try {
    if (deviceId) window.localStorage.setItem(KEY, deviceId);
    else window.localStorage.removeItem(KEY);
  } catch { /* storage disabled, the session still uses the live choice */ }
}

// Open the mic honoring the stored choice. `exact` so a remembered device
// can't silently fall back to the wrong one. Failure handling is by CAUSE:
// device gone (unplugged, different machine) → forget the choice and use the
// default; permission problems → rethrow (the default would fail identically,
// and the choice isn't at fault); anything else (device busy in another app,
// transient) → use the default THIS time but keep the choice for next time.
export async function openMicStream(): Promise<MediaStream> {
  // iOS owns input routing: a deviceId constraint can't really steer it, a
  // stale stored id (or one synced from a desktop session) can pin a dead
  // route, and the reopen a switch triggers is itself a capture hazard
  //. Always plain audio:true there, and drop any pref.
  if (isIOSWebKit()) {
    storeMicDeviceId(null);
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
  const id = readMicDeviceId();
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } } });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "OverconstrainedError" || name === "NotFoundError") storeMicDeviceId(null);
      else if (name === "NotAllowedError" || name === "SecurityError") throw e;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // No stored choice → the OS default. If that default is an iPhone
  // "Continuity" mic (silent or drops when the phone locks, the failure
  // class behind the silent voice notes), prefer the machine's built-in mic
  // instead. Best-effort: any failure keeps the original stream.
  try {
    const label = stream.getAudioTracks()[0]?.label ?? "";
    if (/iphone|continuity/i.test(label)) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const builtIn = devices.find(
        d => d.kind === "audioinput" && /macbook|built.?in/i.test(d.label) && d.deviceId && d.deviceId !== "default"
      );
      if (builtIn) {
        const better = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: builtIn.deviceId } } });
        stream.getTracks().forEach(t => t.stop());
        storeMicDeviceId(builtIn.deviceId); // stick, so every surface agrees
        return better;
      }
    }
  } catch { /* keep the default stream */ }
  return stream;
}

// Audio inputs available to pick from. Labels are only populated once the
// origin holds mic permission, call this after a successful getUserMedia.
export async function listMics(): Promise<MicDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
    .map(d => ({ deviceId: d.deviceId, label: d.label }));
}
