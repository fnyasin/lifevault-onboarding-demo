// The demo's only "database": this browser tab's sessionStorage.
//
// In the product, naming a face and saving a memory go to the family's private
// vault. Here nothing leaves the browser, nothing is shared between visitors,
// and closing the tab forgets everything. Every read and write is wrapped so a
// private window (where storage can throw) still runs the whole flow from an
// in-memory copy.

import type { TagCandidate } from "@/lib/photo-tags";

const KEY = "lv-demo:v1";

/** A memory saved on the review screen: the story plus the chips they kept. */
export type DemoMemory = {
  photoId: string;
  photoUrl: string;
  story: string;
  people: string[];
  tags: TagCandidate[];
  /** Length of the voice note, if they recorded one (the audio itself stays in memory). */
  voiceNoteMs: number | null;
  savedAt: string;
};

export type DemoSession = {
  /** The name the visitor gave the face on the welcome screen. */
  subject: string | null;
  /** Memories saved during onboarding, newest first. */
  memories: DemoMemory[];
};

const EMPTY: DemoSession = { subject: null, memories: [] };

let memory: DemoSession = EMPTY;

export function readSession(): DemoSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) memory = { ...EMPTY, ...(JSON.parse(raw) as Partial<DemoSession>) };
  } catch {
    // private mode or blocked storage: keep the in-memory copy
  }
  return memory;
}

export function writeSession(patch: Partial<DemoSession>): DemoSession {
  memory = { ...readSession(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // private mode or blocked storage: the in-memory copy still works
  }
  return memory;
}

/** Save (or replace) the memory for one photo. */
export function saveMemory(m: DemoMemory): DemoSession {
  const rest = readSession().memories.filter((x) => x.photoId !== m.photoId);
  return writeSession({ memories: [m, ...rest] });
}

/** Who the flow is about. Falls back to a gentle default if they skipped naming. */
export function subjectName(s: DemoSession = readSession()): string {
  return s.subject?.trim() || "Grandma";
}
