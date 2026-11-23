"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Confetti from "@/app/components/Confetti";
import ShareVaultModal from "@/app/components/ShareVaultModal";
import { SAMPLE_PHOTOS } from "@/lib/demo/photos";
import { readSession, resetSession, subscribeSession, subjectName, writeSession } from "@/lib/demo/session";
import { memoryFor, photoMatches, threadFor } from "@/lib/demo/vault";
import MemorySheet from "./MemorySheet";

// The family vault: every photo, as a masonry grid. Finishing onboarding lands
// here ONCE as the reveal (confetti); in the product, later visits land on
// Activity instead.
//
// Demo version: the four sample photos, searchable by the stories and chips
// saved in this tab. Upload, delete, download, straighten and save-to-album
// are product features that need the real vault, so they're left out.

type Tile = {
  id: string;
  thumbUrl: string;
  width: number;
  height: number;
};

const TEAL = "#3c7a7c";

// Column masonry: whole photos of varying heights stacked in N columns
// (4 desktop / 3 tablet / 2 mobile). Balanced by shortest-column packing
// (using each photo's aspect ratio) so columns stay even, and each tile's box
// is sized up front so images don't jump as they lazy-load. 4px between
// photos everywhere (Fatimah): dense, Apple-Photos-like.
const GAP = 4;

// Pinterest-style tile clamp for the 2-column phone grid: a landscape photo
// crops UP to a chunky near-square tile (never a short strip), and a very tall
// scan stops at 1.6× the column width.
const PHONE_MIN_HW = 0.9;
const PHONE_MAX_HW = 1.6;

function tileHeightFor(t: Tile, colCount: number, colWidth: number): number {
  const natural = colWidth / (t.width / t.height);
  if (colCount > 2) return natural;
  return Math.min(Math.max(natural, colWidth * PHONE_MIN_HW), colWidth * PHONE_MAX_HW);
}

// Thresholds are on the GRID width (content area, minus the fixed sidebar):
// ~1096 desktop → 4, ~530 tablet → 3, phones → 2.
function columnCountFor(width: number): number {
  return width >= 850 ? 4 : width >= 500 ? 3 : 2;
}

type MasonryItem = { tile: Tile; height: number };

// Every tile carries a row under the photo (7px gap + 24px row).
const TILE_FOOTER = 31;

// Always add the next photo to the currently-shortest column.
function packColumns(tiles: Tile[], colCount: number, colWidth: number, gap: number): MasonryItem[][] {
  const cols: MasonryItem[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array(colCount).fill(0);
  for (const t of tiles) {
    const h = tileHeightFor(t, colCount, colWidth);
    let min = 0;
    for (let i = 1; i < colCount; i++) if (heights[i] < heights[min]) min = i;
    cols[min].push({ tile: t, height: h });
    heights[min] += h + TILE_FOOTER + gap;
  }
  return cols;
}

const ALL_TILES: Tile[] = SAMPLE_PHOTOS.map((p) => ({ id: p.id, thumbUrl: p.url, width: 700, height: 900 }));

export default function VaultBrowse() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);
  const subject = session ? subjectName(session) : "";
  const query = params.get("q") ?? "";
  const openPhoto = params.get("photo");

  const [searchText, setSearchText] = useState(query);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // The reveal: confetti and a saved-memory toast, once, on arrival from
  // onboarding. Finishing onboarding leaves a one-time flag in the demo
  // session (not the URL, so a refresh or a shared link never replays it).
  // It's captured into state here (the "adjust state during render" pattern)
  // and cleared, so this visit keeps the moment and the next one doesn't.
  const [celebrate, setCelebrate] = useState(false);
  if (session?.revealPending && !celebrate) setCelebrate(true);
  useEffect(() => {
    if (session?.revealPending) writeSession({ revealPending: false });
  }, [session?.revealPending]);

  // Re-sync the box when the URL's query changes (Back/forward, album links),
  // the "adjust state on prop change" pattern (no effect).
  const [syncedQuery, setSyncedQuery] = useState(query);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setSearchText(query);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Close the + menu on an outside click.
  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-lv-menu]")) return;
      setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addMenuOpen]);

  const [containerWidth, setContainerWidth] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const tiles = useMemo(
    () => (session ? ALL_TILES.filter((t) => photoMatches(t.id, query, session, subject)) : []),
    [session, query, subject],
  );

  // Track the grid's own width (not the window) so columns fill it exactly.
  useEffect(() => {
    const measure = () => {
      const w = gridRef.current?.clientWidth ?? 0;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tiles.length, session]);

  const colCount = containerWidth > 0 ? columnCountFor(containerWidth) : 2;
  const colWidth = containerWidth > 0 ? (containerWidth - GAP * (colCount - 1)) / colCount : 0;
  const columns = useMemo(
    () => (containerWidth > 0 ? packColumns(tiles, colCount, colWidth, GAP) : []),
    [tiles, colCount, colWidth, containerWidth],
  );

  function runSearch(next: string) {
    const q = next.trim();
    router.push(q ? `/vault?q=${encodeURIComponent(q)}` : "/vault");
  }
  function openDetail(photoId: string) {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    qs.set("photo", photoId);
    router.push(`/vault?${qs.toString()}`, { scroll: false });
  }
  function closeDetail() {
    router.push(query ? `/vault?q=${encodeURIComponent(query)}` : "/vault", { scroll: false });
  }
  const notInDemo = (what: string) => setToast(`${what} is turned off in this demo`);

  const menuItem = "block w-full whitespace-nowrap px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 transition-colors duration-100";

  if (!session) return null; // sessionStorage is browser-only: render after mount

  const renderTile = (t: Tile, height: number) => {
    const mine = !!memoryFor(t.id, session);
    const notes = threadFor(t.id, session, new Date()).length;
    return (
      <div key={t.id} className="w-full">
        <button
          type="button"
          aria-label="Open photo"
          className={`block w-full overflow-hidden rounded-[15px] bg-zinc-100 ${mine && celebrate ? "ring-[3px] ring-[#3c7a7c] ring-offset-2" : ""}`}
          style={{ height }}
          onClick={() => openDetail(t.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </button>
        {/* The row under each photo: who's added to it. */}
        <div className="mt-[7px] flex h-6 items-center gap-2 px-1 text-[12px]">
          {mine && (
            <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "#eaf2f1", color: TEAL }}>
              Your story
            </span>
          )}
          {notes > 0 && (
            <span className="inline-flex items-center gap-1 text-[#8a857c]">
              <svg viewBox="0 0 20 20" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                <path d="M3.5 4.5h13v8h-7l-3.5 3v-3h-2.5z" strokeLinejoin="round" />
              </svg>
              {notes}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {celebrate && <Confetti />}

      {/* Header: title + count. Desktop/tablet show Invite + Upload buttons;
          mobile collapses them into a single + menu. */}
      <header className="flex items-start justify-between gap-3 px-5 pt-6 pb-4 md:px-8">
        <div>
          <h1 className="text-[32px] leading-tight text-[#1a1a1a] [font-family:var(--font-gotu)]">Vault</h1>
          <p className="mt-0.5 text-sm text-[#8a857c]">{ALL_TILES.length} photos</p>
        </div>

        {/* Desktop / tablet */}
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={() => setInviteOpen(true)}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-bold hover:bg-zinc-50 active:scale-[0.98] transition-all duration-100"
            style={{ color: TEAL }}>
            Invite
          </button>
          <button onClick={() => notInDemo("Uploading")}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white active:scale-[0.98] transition-all duration-100"
            style={{ background: TEAL }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Upload
          </button>
        </div>

        {/* Mobile: single + menu */}
        <div className="relative md:hidden" data-lv-menu>
          <button aria-label="Add"
            onClick={() => setAddMenuOpen(o => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm active:scale-95 transition-transform"
            style={{ background: TEAL }}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              <button className={menuItem} onClick={() => { setAddMenuOpen(false); setInviteOpen(true); }}>Add collaborators</button>
              <button className={menuItem} onClick={() => { setAddMenuOpen(false); notInDemo("Uploading"); }}>Add photos</button>
            </div>
          )}
        </div>
      </header>

      {/* Search: teaches by example. Matches the stories and chips saved here. */}
      <div className="flex items-center gap-2 px-5 pb-5 md:px-8">
        <form
          className="relative flex-1 md:max-w-[440px]"
          role="search"
          onSubmit={(e) => { e.preventDefault(); runSearch(searchText); }}
        >
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search a person, place, event"
            aria-label="Search the vault"
            enterKeyHint="search"
            className="w-full rounded-lg border border-transparent bg-[#eceae5] py-2.5 pl-[38px] pr-3 text-[16px] text-zinc-800 placeholder:text-zinc-500 focus:border-zinc-300 focus:bg-white focus:outline-none lg:text-sm"
          />
        </form>
      </div>

      <ShareVaultModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* Phones get a slim gutter (Pinterest-style, photos nearly full-bleed). */}
      <main className="px-2 pb-10 sm:px-5 md:px-8">
        {tiles.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-zinc-200 p-10 text-center">
            <p className="text-sm font-medium text-zinc-800">No photos match your search</p>
            <button onClick={() => { setSearchText(""); runSearch(""); }}
              className="mt-2 text-sm font-medium" style={{ color: TEAL }}>
              Clear search
            </button>
          </div>
        ) : (
          <div ref={gridRef} style={{ display: "flex", gap: GAP }}>
            {columns.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP }}>
                {col.map(({ tile, height }) => renderTile(tile, height))}
              </div>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-[13px] text-[#8a857c]">
          In LifeVault, every scanned photo lands here. This demo has four.
        </p>
        {/* The end of the demo's journey, so the way to try it again lives
            here rather than in a bar over every screen. */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => { resetSession(); router.push("/"); }}
            className="min-h-[44px] rounded-full border border-zinc-300 px-5 text-[15px] font-semibold transition-colors hover:bg-zinc-50"
            style={{ color: TEAL }}
          >
            Start the demo again
          </button>
        </div>
      </main>

      {openPhoto && SAMPLE_PHOTOS.some((p) => p.id === openPhoto) && (
        <MemorySheet photoId={openPhoto} session={session} subject={subject} onClose={closeDetail} />
      )}

      {celebrate && session.memories.length > 0 && (
        <div role="status" className="lv-toast pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full px-5 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: TEAL }}>
          Your memory is saved in the vault
        </div>
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
