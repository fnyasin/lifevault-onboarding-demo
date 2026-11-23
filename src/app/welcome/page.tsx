import NameAFace from "./NameAFace";
import { SAMPLE_PHOTOS } from "@/lib/demo/photos";

// The first moment inside the vault: name the face that shows up most.
export default function WelcomePage() {
  const hero = SAMPLE_PHOTOS[0];
  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      <NameAFace rounds={[{ clusterId: hero.id, photoUrl: hero.url, faceBox: hero.faceBox, cropUrl: null }]} />
    </div>
  );
}
