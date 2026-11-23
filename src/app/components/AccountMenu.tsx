"use client";

// Who am I, visible on every vault screen. The product's version fetches the
// signed-in user and offers Settings and Log out; the demo has no accounts,
// so it shows a fixed "You · Family admin" badge in the same spot.
export default function AccountMenu({
  roleLabel,
  showLabel = false,
}: {
  roleLabel: string;
  /** also render name + role beside the avatar (sidebar style) */
  showLabel?: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg p-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
        Y
      </div>
      {showLabel && (
        <div className="min-w-0 text-left">
          <div className="truncate text-sm font-medium text-zinc-900">You</div>
          <div className="truncate text-xs text-zinc-500">{roleLabel}</div>
        </div>
      )}
    </div>
  );
}
