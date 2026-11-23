// The demo vault: four sample photos, a few sample notes from fictional family
// members, and whatever the visitor saved during onboarding. Everything the
// vault, activity and albums screens show is derived from here.
import type { ActivityItem } from "@/lib/activity";
import type { TagCandidate } from "@/lib/photo-tags";
import { SAMPLE_PHOTOS, type SamplePhoto } from "./photos";
import type { DemoMemory, DemoSession } from "./session";

/** A note someone in the (fictional) family left on a photo before you arrived. */
type FamilyNote = {
  id: string;
  photoId: string;
  kind: "comment" | "voice";
  actorName: string;
  hoursAgo: number;
  body?: string;
  durationMs?: number;
};

const FAMILY_NOTES: FamilyNote[] = [
  { id: "voice:1", photoId: "sample-portrait-left", kind: "voice", actorName: "Grandma Lou", hoursAgo: 1, durationMs: 42_000 },
  { id: "comment:1", photoId: "sample-wide", kind: "comment", actorName: "Ravi", hoursAgo: 4, body: "Those flares! He wore that shirt to every barbecue that summer." },
  { id: "voice:2", photoId: "sample-portrait-right", kind: "voice", actorName: "Maya", hoursAgo: 3 * 24, durationMs: 78_000 },
  { id: "comment:2", photoId: "sample-hero", kind: "comment", actorName: "Nadia", hoursAgo: 5 * 24, body: "Mum made that dress herself. I still remember the fabric." },
  { id: "voice:3", photoId: "sample-hero", kind: "voice", actorName: "Grandma Lou", hoursAgo: 20 * 24, durationMs: 123_000 },
];

/** One row in the Activity feed or a photo's thread. */
export type FeedItem = ActivityItem & {
  actorName: string;
  thumbUrl: string | null;
  /** True for the memory the visitor saved in this session. */
  mine?: boolean;
};

function photoById(id: string): SamplePhoto | undefined {
  return SAMPLE_PHOTOS.find((p) => p.id === id);
}

function memoryItems(m: DemoMemory): FeedItem[] {
  const thumbUrl = m.photoUrl;
  const items: FeedItem[] = [];
  if (m.story) {
    items.push({ id: `mine:comment:${m.photoId}`, kind: "comment", photoId: m.photoId, actorId: "you", createdAt: m.savedAt, body: m.story, actorName: "You", thumbUrl, mine: true });
  }
  if (m.voiceNoteMs) {
    items.push({ id: `mine:voice:${m.photoId}`, kind: "voice", photoId: m.photoId, actorId: "you", createdAt: m.savedAt, durationMs: m.voiceNoteMs, actorName: "You", thumbUrl, mine: true });
  }
  return items;
}

function noteItems(now: Date): FeedItem[] {
  return FAMILY_NOTES.map((n) => ({
    id: n.id,
    kind: n.kind,
    photoId: n.photoId,
    actorId: n.actorName,
    createdAt: new Date(now.getTime() - n.hoursAgo * 3_600_000).toISOString(),
    body: n.body,
    durationMs: n.durationMs,
    actorName: n.actorName,
    thumbUrl: photoById(n.photoId)?.url ?? null,
  }));
}

/** Everything the family added, newest first. */
export function activityFeed(session: DemoSession, now: Date): FeedItem[] {
  return [...session.memories.flatMap(memoryItems), ...noteItems(now)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** One photo's thread: your story first, then what the family said. */
export function threadFor(photoId: string, session: DemoSession, now: Date): FeedItem[] {
  return activityFeed(session, now).filter((i) => i.photoId === photoId);
}

export function memoryFor(photoId: string, session: DemoSession): DemoMemory | undefined {
  return session.memories.find((m) => m.photoId === photoId);
}

/** People in a photo: the person they named is in every sample photo. */
export function peopleFor(photoId: string, session: DemoSession, subject: string): string[] {
  return memoryFor(photoId, session)?.people ?? [subject];
}

export function tagsFor(photoId: string, session: DemoSession): TagCandidate[] {
  return memoryFor(photoId, session)?.tags ?? [];
}

/**
 * Suggested albums: in the product, Premium groups photos into "Memories"
 * albums from their tags. Here, each event or scene chip the visitor kept
 * becomes an album of the photos that carry it.
 */
export type SuggestedAlbum = { slug: string; title: string; count: number; coverUrl: string };

export function suggestedAlbums(session: DemoSession): SuggestedAlbum[] {
  const byTitle = new Map<string, { photos: Set<string>; cover: string }>();
  for (const m of session.memories) {
    for (const t of m.tags) {
      if (t.tag_type !== "event" && t.tag_type !== "scene") continue;
      const entry = byTitle.get(t.value) ?? { photos: new Set<string>(), cover: m.photoUrl };
      entry.photos.add(m.photoId);
      byTitle.set(t.value, entry);
    }
  }
  return [...byTitle.entries()].map(([title, e]) => ({
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    count: e.photos.size,
    coverUrl: e.cover,
  }));
}

/** Vault search: a photo matches on its story, its chips, its people or the family's notes. */
export function photoMatches(photoId: string, query: string, session: DemoSession, subject: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const m = memoryFor(photoId, session);
  const haystack = [
    m?.story ?? "",
    ...(m?.tags.map((t) => t.value) ?? []),
    ...peopleFor(photoId, session, subject),
    ...FAMILY_NOTES.filter((n) => n.photoId === photoId).map((n) => `${n.actorName} ${n.body ?? ""}`),
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}
