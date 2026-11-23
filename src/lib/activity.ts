// Pure logic for the Activity feed: bucketing by recency and display labels.
// No data fetching here, so it stays testable on its own.

export type ActivityItem = {
  id: string;
  kind: "comment" | "voice";
  photoId: string;
  actorId: string | null;
  createdAt: string;
  body?: string;
  durationMs?: number;
};

export type GroupLabel = "Today" | "This week" | "Earlier";
export type ActivityGroup = { label: GroupLabel; items: ActivityItem[] };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function labelFor(createdAt: string, now: Date): GroupLabel {
  const d = new Date(createdAt);
  if (sameCalendarDay(d, now)) return "Today";
  if (now.getTime() - d.getTime() < WEEK_MS) return "This week";
  return "Earlier";
}

export function groupByRecency(items: ActivityItem[], now: Date): ActivityGroup[] {
  const buckets: Record<GroupLabel, ActivityItem[]> = {
    Today: [],
    "This week": [],
    Earlier: [],
  };
  for (const it of items) buckets[labelFor(it.createdAt, now)].push(it);
  return (Object.keys(buckets) as GroupLabel[])
    .map((label) => ({ label, items: buckets[label] }))
    .filter((g) => g.items.length > 0);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function timeLabel(createdAt: string, now: Date): string {
  const d = new Date(createdAt);
  if (sameCalendarDay(d, now)) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (now.getTime() - d.getTime() < WEEK_MS) {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
