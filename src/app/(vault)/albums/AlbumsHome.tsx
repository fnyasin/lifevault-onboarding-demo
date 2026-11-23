"use client";
import { useSyncExternalStore } from "react";
import { TopBar } from "./_components/TopBar";
import { SectionHeading } from "./_components/SectionHeading";
import { Tile } from "./_components/Tile";
import { ALBUM_COLORS, FONT_BODY } from "./_components/tokens";
import { SAMPLE_PHOTOS, DEMO_PHOTO_COUNT } from "@/lib/demo/photos";
import { readSession, subscribeSession, subjectName } from "@/lib/demo/session";
import { suggestedAlbums } from "@/lib/demo/vault";

// Albums home: People and Memories shelves, like Apple Photos.
//
// In the product, People come from face grouping the family confirms, and
// Premium suggests Memories albums from photo tags. The demo shows the person
// you named, a few sample family members, and a Memories album for every event
// or scene chip you kept, so the chips you reviewed visibly organise the vault.

// Sample family members, fictional. No photos of them in the demo, so their
// tiles fall back to initials (the product does the same before a face is picked).
const SAMPLE_PEOPLE = [
  { name: "Grandma Lou", count: 62 },
  { name: "Maya", count: 48 },
  { name: "Ravi", count: 39 },
];

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className={`text-[14px] ${FONT_BODY}`} style={{ color: ALBUM_COLORS.muted }}>
      {children}
    </p>
  );
}

export default function AlbumsHome() {
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);
  if (!session) return null; // sessionStorage is browser-only: render after mount
  const subject = subjectName(session);
  const memories = suggestedAlbums(session);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-5 py-7 sm:px-8">
      <TopBar title="Albums" subtitle={`Your family vault · ${SAMPLE_PHOTOS.length} photos`} />

      <section className="mt-8 space-y-4">
        <SectionHeading title="People" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <Tile variant="person" name={subject} count={DEMO_PHOTO_COUNT} imageUrl={SAMPLE_PHOTOS[0].url} href="/vault" />
          {SAMPLE_PEOPLE.map((p) => (
            <Tile key={p.name} variant="person" name={p.name} count={p.count} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <SectionHeading title="Memories" />
        {memories.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {memories.map((a) => (
              <Tile
                key={a.slug}
                variant="memory"
                aspect="landscape"
                name={a.title}
                count={a.count}
                imageUrl={a.coverUrl}
                href={`/vault?q=${encodeURIComponent(a.title)}`}
              />
            ))}
          </div>
        ) : (
          <Muted>We suggest albums from moments like birthdays and graduations once photos are tagged.</Muted>
        )}
      </section>
    </main>
  );
}
