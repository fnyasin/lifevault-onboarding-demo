// Stand-in for the product's story extraction. In LifeVault, the story goes to
// Claude (a small, fast model) with a JSON schema (STORY_TAG_JSON_SCHEMA), and
// the result runs through normalizeStoryTags before a person ever sees it.
//
// A public demo shouldn't call a paid model or hold an API key, so this is a
// small keyword matcher that runs in the browser. It returns the same shape
// through the same normalizer, which is all the review screen needs: the point
// of the demo is the human-review step, not the extraction itself.
//
// Like the product's prompt: no people's names (naming is its own approval
// flow), short Title Case values, and fewer, safer guesses over many.
import { normalizeStoryTags, type TagCandidate } from "@/lib/photo-tags";

const EVENTS: [RegExp, string][] = [
  [/\bengage(?:d|ment)\b/i, "Engagement"],
  [/\bwedding\b|\bgot married\b/i, "Wedding"],
  [/\bhoneymoon\b/i, "Honeymoon"],
  [/\bbirthday\b/i, "Birthday"],
  [/\banniversary\b/i, "Anniversary"],
  [/\bgraduat(?:ion|ed)\b/i, "Graduation"],
  [/\bfirst day of school\b/i, "First Day of School"],
  [/\bmoving day\b|\bmoved in\b|\bnew house\b/i, "Moving Day"],
  [/\bstory time\b|\breading (?:out loud|aloud)\b/i, "Story Time"],
  [/\bpicnic\b/i, "Picnic"],
  [/\breunion\b/i, "Reunion"],
  [/\bchristmas\b/i, "Christmas"],
  [/\beid\b/i, "Eid"],
  [/\bdiwali\b/i, "Diwali"],
  [/\bhanukkah\b/i, "Hanukkah"],
  [/\bthanksgiving\b/i, "Thanksgiving"],
  [/\beaster\b/i, "Easter"],
  [/\bnew year\b/i, "New Year"],
  [/\bvacation\b|\broad trip\b|\bholiday\b/i, "Vacation"],
  [/\bbaptism\b|\bchristening\b/i, "Baptism"],
  [/\bretire(?:d|ment)\b/i, "Retirement"],
];

const SCENES: [RegExp, string][] = [
  [/\b(?:photo )?studio\b/i, "Photo Studio"],
  [/\blibrary\b/i, "Library"],
  [/\bbeach\b/i, "Beach"],
  [/\blake\b/i, "Lake"],
  [/\bbackyard\b|\bback yard\b/i, "Backyard"],
  [/\bgarden\b/i, "Garden"],
  [/\bkitchen\b/i, "Kitchen"],
  [/\bliving room\b/i, "Living Room"],
  [/\bporch\b/i, "Front Porch"],
  [/\bchurch\b/i, "Church"],
  [/\bmosque\b/i, "Mosque"],
  [/\bfarm\b/i, "Farm"],
  [/\bpark\b/i, "Park"],
  [/\bsnow\b/i, "Snow Day"],
  [/\bbridge\b/i, "Stone Bridge"],
];

// A few named places the matcher recognizes on sight, plus "the lake house"
// style phrases. Anything else capitalized after "in / at / near" is a guess
// the person can remove on the next screen.
const KNOWN_PLACES = [
  "Vancouver", "Victoria", "Calgary", "Edmonton", "Saskatoon", "Regina", "Winnipeg",
  "Toronto", "Ottawa", "Montreal", "Quebec City", "Halifax", "St. John's",
  "Seattle", "Portland", "San Francisco", "Los Angeles", "Chicago", "New York", "Boston",
  "London", "Manchester", "Dublin", "Edinburgh", "Paris", "Rome", "Lisbon", "Madrid",
  "Berlin", "Amsterdam", "Lahore", "Karachi", "Islamabad", "Delhi", "Mumbai", "Dhaka",
  "Manila", "Hong Kong", "Tokyo", "Seoul", "Sydney", "Melbourne", "Auckland",
  "Cairo", "Lagos", "Nairobi", "Mexico City", "High Park", "Stanley Park",
  "Central Park", "Niagara Falls", "Banff",
];
const HOME_PLACES = /\bthe (lake house|cottage|cabin|beach house|farmhouse|old house|new house|family home)\b/i;
const NOT_PLACES = new Set([
  "I", "The", "A", "My", "Our", "We", "He", "She", "They", "It", "This", "That",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Spring", "Summer", "Fall",
  "Autumn", "Winter", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "Christmas", "Easter", "Eid", "Diwali", "Thanksgiving",
  "Grandma", "Grandpa", "Mom", "Mum", "Dad", "Nana", "Papa",
]);

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_YEAR = new RegExp(`\\b(${MONTHS})\\.?\\s+(?:of\\s+)?((?:18|19|20)\\d{2})\\b`, "i");
const SEASON_YEAR = /\b(spring|summer|fall|autumn|winter)\s+(?:of\s+)?((?:18|19|20)\d{2})\b/i;
const YEAR = /\b((?:18|19|20)\d{2})\b/;
const DECADE = /\b(?:(early|mid|late)[- ])?((?:18|19|20)\d)0'?s\b/i;
// "the 80s", "early '60s": two-digit decades read as the 1900s.
const SHORT_DECADE = /(?:\b(early|mid|late)[- ])?(?:\B'|\b)([2-9])0'?s\b/i;
const WORD_DECADE: [RegExp, string][] = [
  [/\bthe forties\b/i, "1940s"], [/\bthe fifties\b/i, "1950s"], [/\bthe sixties\b/i, "1960s"],
  [/\bthe seventies\b/i, "1970s"], [/\bthe eighties\b/i, "1980s"], [/\bthe nineties\b/i, "1990s"],
];

const title = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function findPlace(story: string, exclude: string[]): string | null {
  for (const p of KNOWN_PLACES) {
    if (new RegExp(`\\b${p.replace(/[.']/g, "\\$&")}\\b`).test(story)) return p;
  }
  const home = story.match(HOME_PLACES);
  if (home) return title(`the ${home[1]}`);
  const lower = exclude.map((e) => e.toLowerCase());
  const re = /\b(?:in|at|near|from)\s+((?:[A-Z][a-z']+)(?:\s+[A-Z][a-z']+){0,2})/g;
  for (const m of story.matchAll(re)) {
    const words = m[1].split(/\s+/);
    if (NOT_PLACES.has(words[0].replace(/'s$/, ""))) continue;
    if (lower.some((e) => m[1].toLowerCase().includes(e))) continue;
    return m[1];
  }
  return null;
}

function findDate(story: string): TagCandidate | null {
  const my = story.match(MONTH_YEAR);
  if (my) return { tag_type: "date", value: `${cap(my[1])} ${my[2]}` };
  const sy = story.match(SEASON_YEAR);
  if (sy) return { tag_type: "date", value: `${cap(sy[1])} ${sy[2]}` };
  const dec = story.match(DECADE);
  if (dec) return { tag_type: "era", value: `${dec[1] ? cap(dec[1]) + " " : ""}${dec[2]}0s` };
  const short = story.match(SHORT_DECADE);
  if (short) return { tag_type: "era", value: `${short[1] ? cap(short[1]) + " " : ""}19${short[2]}0s` };
  for (const [re, v] of WORD_DECADE) if (re.test(story)) return { tag_type: "era", value: v };
  const y = story.match(YEAR);
  if (y) return { tag_type: "date", value: y[1] };
  return null;
}

/** Read a story and return tag candidates for the person to review. */
export function suggestTags(story: string, subject: string): TagCandidate[] {
  const s = story.trim();
  if (!s) return [];
  const out: TagCandidate[] = [];

  const events = EVENTS.filter(([re]) => re.test(s)).slice(0, 2);
  for (const [, v] of events) out.push({ tag_type: "event", value: v });

  const place = findPlace(s, [subject]);
  if (place) out.push({ tag_type: "place", value: place });

  const date = findDate(s);
  if (date) out.push(date);

  for (const [re, v] of SCENES) {
    if (out.length >= 6) break;
    if (!re.test(s)) continue;
    // "High Park" already says park; don't repeat it as a scene.
    if (place && place.toLowerCase().includes(v.toLowerCase().split(" ")[0])) continue;
    out.push({ tag_type: "scene", value: v });
  }

  return normalizeStoryTags({ tags: out });
}

/**
 * Pretend network: the product waits on a model call here, and the screen
 * shows "Reading your story…" while it does. A short pause keeps that beat.
 */
export function suggestTagsSlowly(story: string, subject: string, ms = 1100): Promise<TagCandidate[]> {
  return new Promise((resolve) => setTimeout(() => resolve(suggestTags(story, subject)), ms));
}

/** One example story per sample photo, for visitors who'd rather not type. */
export function exampleStory(photoId: string, subject: string): string {
  switch (photoId) {
    case "sample-hero":
      return `This is ${subject}'s engagement portrait, taken at a little photo studio in Halifax in the spring of 1961. The dress was sewn by hand the week before.`;
    case "sample-portrait-right":
      return "Sunday story time at the public library in Toronto, sometime in the late 1950s. Everyone got to pick one book.";
    case "sample-portrait-left":
      return "The first warm day of summer 1958 at High Park, right by the old stone bridge. Nobody wanted to go home.";
    case "sample-wide":
      return "Moving day at the new house in Winnipeg, summer of 1974. That shirt went everywhere that year.";
    default:
      return `A favourite photo of ${subject}, from the summer of 1965 at the lake house.`;
  }
}
