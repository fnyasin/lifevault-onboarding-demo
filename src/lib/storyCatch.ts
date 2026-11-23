// Mapping between the story-extraction candidates (TagCandidate[]) and the
// onboarding Summary screen's sections. The candidate list is the single
// source of truth; the Summary displays a projection of it:
//   PEOPLE ← 'person' candidates
//   PLACE  ← the first 'place' candidate
//   DATE   ← the first 'date' candidate, else the first 'era'
//   EVENT  ← everything else (event / scene / other / group, plus extra
//            places/dates)
// Extraction never produces 'person': in the product, person names are only
// ever typed by hand (Starter plan) or come from face-naming, which has its
// own approval flow.
import type { TagCandidate } from "./photo-tags";

export type SummaryField = "location" | "date" | "tags";

export type CaughtProjection = {
  people: TagCandidate[];
  location?: TagCandidate;
  date?: TagCandidate;
  tags: TagCandidate[];
};

export function projectCaught(caught: TagCandidate[]): CaughtProjection {
  const people = caught.filter(t => t.tag_type === "person");
  const location = caught.find(t => t.tag_type === "place");
  const date = caught.find(t => t.tag_type === "date") ?? caught.find(t => t.tag_type === "era");
  // Everything not already shown above. People are excluded here so a typed
  // name shows under PEOPLE only, it used to fall through into EVENT too.
  const tags = caught.filter(t => t !== location && t !== date && !people.includes(t));
  return { people, location, date, tags };
}

// Remove the candidate the Summary displayed in `field` with `value`.
// Works by identity against the projection, so a second place that rendered
// under EVENT is removed from there, not the one shown under PLACE.
export function removeCaught(caught: TagCandidate[], field: SummaryField, value: string): TagCandidate[] {
  const p = projectCaught(caught);
  let target: TagCandidate | undefined;
  if (field === "location") target = p.location?.value === value ? p.location : undefined;
  else if (field === "date") target = p.date?.value === value ? p.date : undefined;
  else target = p.tags.find(t => t.value === value);
  if (!target) return caught;
  return caught.filter(t => t !== target);
}

const FIELD_TYPE = { location: "place", date: "date", tags: "event" } as const;
const MAX_VALUE_LEN = 80;

// Add a human-typed value into the right section. Dedupe (case-insensitive by
// type + value) so re-adding an existing chip is a no-op.
export function addCaught(caught: TagCandidate[], field: SummaryField, rawValue: string): TagCandidate[] {
  const value = rawValue.trim().slice(0, MAX_VALUE_LEN).trim();
  if (!value) return caught;
  const tag_type = FIELD_TYPE[field];
  const key = `${tag_type}|${value.toLowerCase()}`;
  if (caught.some(t => `${t.tag_type}|${t.value.toLowerCase()}` === key)) return caught;
  return [...caught, { tag_type, value }];
}
