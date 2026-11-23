"use client";
import { useSyncExternalStore } from "react";
import OnboardingFlow from "./OnboardingFlow";
import { subjectName } from "@/lib/demo/session";

const noSubscribe = () => () => {};

// The name lives in this tab's sessionStorage, so it can only be read in the
// browser. The server renders the cream backdrop; the flow mounts on the client.
export default function OnboardingPage() {
  const subject = useSyncExternalStore(noSubscribe, () => subjectName(), () => null);
  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      {subject && <OnboardingFlow subject={subject} />}
    </div>
  );
}
