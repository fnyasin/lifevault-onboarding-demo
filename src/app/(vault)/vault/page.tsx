import { Suspense } from "react";
import VaultBrowse from "./VaultBrowse";

// The grid reads ?q= (search) and ?photo= (open a photo) from the URL, so it
// renders in the browser inside a Suspense boundary.
export default function VaultPage() {
  return (
    <Suspense fallback={null}>
      <VaultBrowse />
    </Suspense>
  );
}
