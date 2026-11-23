"use client";
import { useEffect, useMemo } from "react";
import { formatDuration, timeLabel } from "@/lib/activity";
import { TAG_TYPE_LABEL } from "@/lib/photo-tags";
import { SAMPLE_PHOTOS } from "@/lib/demo/photos";
import type { DemoSession } from "@/lib/demo/session";
import { peopleFor, tagsFor, threadFor } from "@/lib/demo/vault";

// One photo, opened from the vault or the activity feed: the photo, who's in
// it, its tags, and the thread of stories and voice notes. Same palette and
// chips as the product's photo viewer, cut down to what the demo can show:
// the product's viewer also takes new comments and voice notes, plays them,
// and lets the family edit tags.

const C = {
  bg: "#fbfaf8", // photo stage
  rail: "#fafafa",
  ink: "#1a1a1a",
  muted: "#6b6862",
  body: "#4a4843",
  teal: "#3c7a7c",
  line: "#e5e3db",
  pill: "#f3f1ec",
} as const;

// Warm avatar palette (teal / sage / clay / tan).
const AVATARS = ["#3c7a7c", "#8b9e97", "#be9b80", "#c9c2b4", "#8a857c"];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.42) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const LABEL = "text-[11px] font-bold uppercase tracking-[0.6px]";

export default function MemorySheet({
  photoId,
  session,
  subject,
  onClose,
}: {
  photoId: string;
  session: DemoSession;
  subject: string;
  onClose: () => void;
}) {
  const photo = SAMPLE_PHOTOS.find((p) => p.id === photoId);
  const now = useMemo(() => new Date(), []);
  const people = peopleFor(photoId, session, subject);
  const tags = tagsFor(photoId, session);
  const thread = threadFor(photoId, session, now);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/55 md:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Photo details"
        className="flex h-full w-full flex-col overflow-y-auto bg-white [font-family:var(--font-lato),system-ui,sans-serif] md:h-[min(760px,100%)] md:max-w-[1080px] md:flex-row md:overflow-hidden md:rounded-[20px] md:shadow-[0_18px_40px_rgba(0,0,0,0.25)]"
      >
        {/* Photo stage */}
        <div className="relative flex shrink-0 items-center justify-center p-4 md:flex-1 md:p-8" style={{ background: C.bg }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="max-h-[52vh] w-auto max-w-full rounded-[10px] object-contain md:max-h-full" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[#717171] shadow-sm transition-colors hover:bg-white md:hidden"
          >
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Rail: people, tags, thread */}
        <div className="flex w-full flex-col gap-6 border-t px-5 py-6 md:w-[380px] md:shrink-0 md:overflow-y-auto md:border-l md:border-t-0 md:px-6" style={{ background: C.rail, borderColor: C.line }}>
          <div className="hidden justify-end md:flex">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-2 grid h-9 w-9 place-items-center rounded-full text-[#717171] transition-colors hover:bg-[#f0eee6]"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <section>
            <p className={LABEL} style={{ color: C.muted }}>People in this photo</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {people.map((name) => (
                <span key={name} className="inline-flex items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 text-[14px] font-bold" style={{ borderColor: C.line, color: C.ink }}>
                  <Avatar name={name} size={26} />
                  {name}
                </span>
              ))}
            </div>
          </section>

          <section>
            <p className={LABEL} style={{ color: C.muted }}>Tags</p>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={`${t.tag_type}-${t.value}`}
                    title={TAG_TYPE_LABEL[t.tag_type]}
                    className="inline-flex items-center rounded-full px-4 py-2 text-[14px] font-bold"
                    style={{ background: "#e9f1f0", color: C.teal }}
                  >
                    {t.value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[14px] leading-snug" style={{ color: C.muted }}>
                No tags yet. In LifeVault, tags come from the stories the family tells.
              </p>
            )}
          </section>

          <section>
            <p className={LABEL} style={{ color: C.muted }}>Stories</p>
            {thread.length === 0 ? (
              <p className="mt-2 text-[14px]" style={{ color: C.muted }}>Nobody has added a story yet.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {thread.map((it) => (
                  <li key={it.id} className="flex items-start gap-3">
                    <Avatar name={it.actorName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]" style={{ color: C.muted }}>
                        <span className="font-bold" style={{ color: C.ink }}>{it.actorName}</span>
                        {" · "}
                        {it.mine ? "just now" : timeLabel(it.createdAt, now)}
                      </p>
                      {it.kind === "voice" ? (
                        <span title="Voice notes play back in LifeVault. The sample notes here have no audio." className="mt-1.5 inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-[13px]" style={{ background: C.pill, color: C.body }}>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: C.teal }}>
                            <svg viewBox="0 0 10 10" className="ml-px h-2.5 w-2.5 fill-white" aria-hidden><path d="M2 1.2v7.6L8.4 5z" /></svg>
                          </span>
                          Voice note · {formatDuration(it.durationMs ?? 0)}
                        </span>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-[1.5]" style={{ color: C.body }}>{it.body}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
