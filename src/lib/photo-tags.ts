// Pure helpers for photo tags: the shapes and the rules, no React, no network,
// so they can be unit-tested in isolation.

// person/group are HUMAN-only types (typed by hand on the product's Starter
// plan); extraction and suggestions never produce them.
export type TagType = "event" | "place" | "date" | "era" | "scene" | "other" | "person" | "group";

export const TAG_TYPE_LABEL: Record<TagType, string> = {
  event: "Event",
  place: "Place",
  date: "Date",
  era: "Time period",
  scene: "Scene",
  other: "Tag",
  person: "Person",
  group: "Group",
};

// ---- parse the writing on the back into structured tag candidates ----------

export type TagCandidate = { tag_type: TagType; value: string };

const EVENT_KEYWORDS: Record<string, string> = {
  birthday: "Birthday", wedding: "Wedding", graduation: "Graduation",
  christmas: "Christmas", eid: "Eid", anniversary: "Anniversary",
  vacation: "Vacation", holiday: "Holiday", easter: "Easter",
  thanksgiving: "Thanksgiving", reunion: "Reunion", baptism: "Baptism",
};

const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+((?:18|19|20)\d{2})\b/i;
const YEAR_RE = /\b((?:18|19|20)\d{2})\b/;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// Turn "Maya's 5th birthday, June 1994" into [{event:'Birthday'},{date:'June 1994'}].
// Conservative on purpose: a human confirms these, so we'd rather miss than mislabel.
export function parseBackText(text: string | null | undefined): TagCandidate[] {
  const out: TagCandidate[] = [];
  const s = (text ?? "").trim();
  if (!s) return out;

  for (const [keyword, label] of Object.entries(EVENT_KEYWORDS)) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(s)) {
      out.push({ tag_type: "event", value: label });
      break;
    }
  }

  const monthMatch = s.match(MONTH_RE);
  if (monthMatch) {
    out.push({ tag_type: "date", value: `${cap(monthMatch[1])} ${monthMatch[2]}` });
  } else {
    const yearMatch = s.match(YEAR_RE);
    if (yearMatch) out.push({ tag_type: "date", value: yearMatch[1] });
  }

  return out;
}

// ---- "tell its story" → tag candidates (Claude extraction) -----------------
//
// In the product, the story goes to Claude with this JSON schema as a
// structured-output contract, and whatever comes back runs through
// normalizeStoryTags before a person ever sees it. The demo's local matcher
// (lib/demo/suggest.ts) returns the same shape through the same normalizer.

// The JSON shape we ask Claude for. Person names are intentionally NOT extracted here,
// people are named through the face-approval flow ("never auto-name a face"), so the model
// is told to leave names out and we only keep the non-person tag types.
const STORY_TAG_TYPES: TagType[] = ["event", "place", "date", "era", "scene", "other"];

export const STORY_TAG_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tag_type: { type: "string", enum: STORY_TAG_TYPES },
          value: { type: "string" },
        },
        required: ["tag_type", "value"],
      },
    },
  },
  required: ["tags"],
} as const;

const MAX_STORY_TAGS = 12;
const MAX_TAG_VALUE_LEN = 80;

// Validate + clean whatever the model returned: keep only known tag types, trim values,
// drop empties, cap length, dedupe (case-insensitive by type+value), cap the count.
// A human still confirms every one of these, but we never want to surface junk.
export function normalizeStoryTags(raw: unknown): TagCandidate[] {
  const tags = (raw as { tags?: unknown })?.tags;
  if (!Array.isArray(tags)) return [];
  const out: TagCandidate[] = [];
  const seen = new Set<string>();
  for (const item of tags) {
    const tag_type = (item as { tag_type?: unknown })?.tag_type;
    const rawValue = (item as { value?: unknown })?.value;
    if (typeof tag_type !== "string" || !(STORY_TAG_TYPES as string[]).includes(tag_type)) continue;
    if (typeof rawValue !== "string") continue;
    const value = rawValue.trim().slice(0, MAX_TAG_VALUE_LEN).trim();
    if (!value) continue;
    const key = `${tag_type}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tag_type: tag_type as TagType, value });
    if (out.length >= MAX_STORY_TAGS) break;
  }
  return out;
}
