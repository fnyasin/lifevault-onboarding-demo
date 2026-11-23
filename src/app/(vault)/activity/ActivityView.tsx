"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ShareVaultModal from "@/app/components/ShareVaultModal";
import { formatDuration, groupByRecency, timeLabel } from "@/lib/activity";
import { readSession, subscribeSession } from "@/lib/demo/session";
import { activityFeed, type FeedItem } from "@/lib/demo/vault";

const TEAL = "#3c7a7c";

// Family Activity feed: what the family is adding (stories + voice notes),
// grouped by recency. Tapping an item opens that photo. In the product this is
// where every login after the first lands. The demo mixes the memory you just
// saved with a few sample notes from a fictional family.
export default function ActivityView() {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);

  // Only known on the client (sessionStorage + the viewer's clock).
  const now = useMemo(() => (session ? new Date() : null), [session]);
  const items = useMemo(() => (session && now ? activityFeed(session, now) : []), [session, now]);
  const groups = useMemo(() => (now ? groupByRecency(items, now) : null), [items, now]);

  const open = (photoId: string) => router.push(`/vault?photo=${encodeURIComponent(photoId)}`);

  const newComments = items.filter((i) => i.kind === "comment").length;
  const subtitle = newComments === 0
    ? "No new comments"
    : `${newComments} new comment${newComments === 1 ? "" : "s"}`;

  return (
    <>
      {/* Header: Gotu title + "N new comments" + Invite, no divider */}
      <header className="flex items-start justify-between gap-3 px-5 pt-6 pb-4 md:px-8">
        <div>
          <h1 className="text-[32px] leading-tight text-[#1a1a1a] [font-family:var(--font-gotu)]">Activity</h1>
          <p className="mt-0.5 text-sm text-[#8a857c]">{session ? subtitle : " "}</p>
        </div>
        <button onClick={() => setInviteOpen(true)}
          className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 active:scale-[0.98] transition-all duration-100">
          Invite
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-6">
        {groups === null || now === null ? null : groups.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-10 text-center text-sm text-zinc-500">
            Nothing here yet. When someone adds a comment or a voice note to a photo, it shows up here.
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: TEAL }}>
                  {group.label}
                </h2>
                <ul className="space-y-2">
                  {group.items.map((item) => {
                    const it = item as FeedItem;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => open(it.photoId)}
                          className="flex w-full items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition-colors duration-100 hover:bg-zinc-50"
                        >
                          <span aria-hidden
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
                            {it.actorName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-zinc-600">
                              <span className="font-semibold text-zinc-900">{it.actorName}</span>
                              {it.kind === "voice" ? " added a voice note" : it.mine ? " added a story" : " added a comment"}
                              {" · "}
                              {it.mine ? "just now" : timeLabel(it.createdAt, now)}
                            </span>
                            {it.kind === "voice" ? (
                              <span className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-1.5 pr-3 text-xs text-zinc-600">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: TEAL }}>
                                  <svg viewBox="0 0 10 10" className="ml-px h-2.5 w-2.5 fill-white" aria-hidden>
                                    <path d="M2 1.2v7.6L8.4 5z" />
                                  </svg>
                                </span>
                                Voice note · {formatDuration(it.durationMs ?? 0)}
                              </span>
                            ) : (
                              <span className="mt-1 line-clamp-2 block text-sm text-zinc-700">
                                &ldquo;{it.body}&rdquo;
                              </span>
                            )}
                          </span>
                          {it.thumbUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={it.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="pt-1 text-center text-xs text-zinc-400">You&rsquo;re all caught up.</p>
          </div>
        )}
      </div>

      <ShareVaultModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
