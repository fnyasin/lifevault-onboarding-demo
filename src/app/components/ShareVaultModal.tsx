"use client";
// Invite-collaborators modal, adapted to the whole vault. Family admins invite
// FAMILY MEMBERS only, choosing "can view" or "can edit". Edit seats are capped
// per plan; viewers are unlimited. Desktop/tablet: centered card; mobile:
// full-screen.
//
// Demo version: same layout and states as the product, but inert. The access
// list is a fixed sample, and "Invite" never sends anything: it adds a pending
// row locally and says plainly that no email went out.
import { useEffect, useRef, useState } from "react";

// Premium plan: up to 6 Memory Keepers (editors). Viewers are unlimited.
const EDIT_SLOTS: number = 6;

type InviteKind = "member" | "family_admin";

// Figma role wording: viewers "can view", collaborators "can edit".
const KIND_LABEL: Record<InviteKind, string> = {
  member: "can view",
  family_admin: "can edit",
};

// Right-hand text in the access list. The vault creator's DB role is 'admin',
// but to the family they are simply the owner.
const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Owner",
  family_admin: "can edit",
  member: "can view",
  helper: "Helper",
};

type AccessRow = {
  key: string;
  name: string;
  detail: string; // right-hand role text
  you: boolean;
  pending: boolean;
};

function initialOf(name: string) {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

// The invite backend wants a name for the email greeting, but the dialog only
// asks for an email, derive a friendly one from the local
// part ("rosa.bellini" → "Rosa Bellini"); invitees set their real name when
// they accept.
function nameFromEmail(email: string): string {
  const local = email.trim().split("@")[0]?.split("+")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email.trim();
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function ShareVaultModal({
  open,
  onClose,
  title = "Invite your family",
  subtitle = "Invite family to view, or add someone as a collaborator.",
  memory,
  primaryLabel = "Done",
  vaultPath = "/vault",
  allowEditInvites = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Onboarding "Share this memory": show the just-saved
   *  memory as the context card instead of the whole-vault card. */
  memory?: { photoUrl?: string | null; title: string; subtitle: string };
  /** Primary button label, "Done" for vault sharing, "Skip and continue to
   *  vault" in the onboarding share step. */
  primaryLabel?: string;
  /** Where "Copy link" points. */
  vaultPath?: string;
  /** false = the caller may only invite viewers (family members inviting family;
   *  the backend enforces the same). Hides the can-view/can-edit selector. */
  allowEditInvites?: boolean;
}) {
  const vaultName = "Your family vault";
  // The sample access list: just you, the owner. Invites made here are added
  // as pending rows so the list reacts, but they never leave the browser.
  const [access, setAccess] = useState<AccessRow[]>([
    { key: "you", name: "You", detail: ROLE_LABEL.admin, you: true, pending: false },
  ]);
  const editUsed = access.filter(r => r.pending && r.detail.endsWith(KIND_LABEL.family_admin)).length;

  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<InviteKind>("member");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [copiedVaultLink, setCopiedVaultLink] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  const editSlots = EDIT_SLOTS;
  const editFull = editUsed >= editSlots;

  // Fresh state each time it opens (the "adjust state on prop change"
  // pattern, no effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setSent(null);
      setCopiedVaultLink(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    // Autofocus is a desktop nicety only: on phones, focusing an input makes
    // the browser zoom straight into the field before the person has even
    // seen the modal (Fatimah). Mobile sees the full sheet first, the zoom
    // happens naturally when they tap the field to type.
    if (window.matchMedia("(min-width: 640px) and (pointer: fine)").matches) {
      emailRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleInvite() {
    if (!email.trim().includes("@")) return;
    if (kind === "family_admin" && editFull) {
      setError(`All ${editSlots} collaborator ${editSlots === 1 ? "spot is" : "spots are"} used. Invite them to view instead.`);
      return;
    }
    setError(null);
    // Demo: nothing is sent. The product creates the invite on the server and
    // emails a private join link.
    const who = email.trim();
    setAccess(rows => [
      ...rows,
      { key: `invite-${who}-${rows.length}`, name: nameFromEmail(who), detail: `Invited · ${KIND_LABEL[kind]}`, you: false, pending: true },
    ]);
    setSent(who);
    setEmail("");
  }

  async function copyVaultLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${vaultPath}`);
      setCopiedVaultLink(true);
      setTimeout(() => setCopiedVaultLink(false), 2000);
    } catch { /* clipboard blocked: nothing to do */ }
  }

  if (!open) return null;

  const peopleCount = access.filter(r => !r.pending).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/45 sm:p-4"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Mobile: full-screen sheet. sm+: centered 480px card. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-vault-title"
        className="flex h-full max-h-full w-full flex-col gap-[18px] overflow-y-auto bg-white px-5 pb-[30px] pt-[34px] [font-family:var(--font-lato),system-ui,sans-serif] sm:h-auto sm:max-h-[calc(100vh-48px)] sm:w-[480px] sm:max-w-full sm:rounded-[24px] sm:px-10 sm:shadow-[0_18px_25px_rgba(0,0,0,0.22)]"
      >
        {/* Header: title · copy link · close. On mobile the copy/close cluster
            sits on its own row ABOVE the title. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="share-vault-title"
            className="order-2 [font-family:var(--font-gotu),Georgia,serif] text-[26px] leading-tight text-[#1a1a1a] sm:order-1 lg:text-[22px]"
          >
            {title}
          </h2>
          <div className="order-1 flex items-center gap-3 self-end sm:order-2 sm:self-auto">
            <button
              type="button"
              onClick={copyVaultLink}
              className="text-[15px] font-bold text-[#3c7a7c] hover:text-[#336a6c] transition-colors duration-100 sm:text-[14px]"
            >
              {copiedVaultLink ? "Copied ✓" : "Copy link"}
            </button>
            <button
              type="button"
              // pointerDown, not click: with the keyboard open on a phone,
              // the first tap dismissed the keyboard, the layout shifted, and
              // the click landed elsewhere, the X "didn't work" while typing.
              // pointerDown fires BEFORE the reflow. preventDefault stops the
              // synthetic click from double-firing.
              onPointerDown={(e) => { e.preventDefault(); onClose(); }}
              onClick={(e) => e.preventDefault()}
              aria-label="Close"
              className="grid h-11 w-11 place-items-center rounded-full text-[#717171] hover:bg-[#f6f1e8] transition-colors duration-100 sm:h-9 sm:w-9"
            >
              {/* 24px X on phones, 20px on desktop. */}
              <svg className="h-6 w-6 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <p className="text-[14px] leading-snug text-[#717171]">
          {subtitle}
        </p>

        {/* Context card: the just-saved MEMORY in the onboarding share step, otherwise the whole-vault card. */}
        {memory ? (
          <div className="flex w-full items-center gap-3 rounded-[12px] bg-[#f6f1e8] p-2.5">
            <div className="size-[46px] shrink-0 overflow-hidden rounded-[8px] bg-[#deebeb]">
              {memory.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={memory.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-[18px] font-bold text-[#3c7a7c]">♡</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-[#1a1a1a]">{memory.title}</p>
              <p className="truncate text-[12px] text-[#717171]">{memory.subtitle}</p>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-[12px] bg-[#f6f1e8] px-3 py-2.5">
            <div className="grid size-[46px] shrink-0 place-items-center rounded-[8px] bg-[#deebeb]">
              <span className="text-[18px] font-bold text-[#3c7a7c]">
                {initialOf(vaultName)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-[#1a1a1a]">
                {vaultName}
              </p>
              <p className="text-[12px] text-[#717171]">
                {`${peopleCount} ${peopleCount === 1 ? "person has" : "people have"} access`}
              </p>
            </div>
          </div>
        )}

        {/* Single invite row, email + role, per the Figma. Mobile stacks
            the Invite button full-width (448:4912). */}
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[#d9d6d1] bg-white py-[5px] pl-[14px] pr-[6px] focus-within:border-[#3c7a7c] transition-colors duration-100">
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleInvite();
                }}
                placeholder="Add people by email"
                aria-label="Add people by email"
                className="min-w-0 flex-1 py-[6px] text-[14px] text-[#1a1a1a] placeholder:text-[#717171] focus:outline-none"
              />
              {allowEditInvites ? (
                <select
                  value={kind}
                  onChange={e => setKind(e.target.value as InviteKind)}
                  aria-label="Invite as"
                  className="shrink-0 cursor-pointer rounded-[6px] bg-transparent py-[6px] pr-1 text-[13px] font-bold text-[#1a1a1a] focus:outline-none"
                >
                  <option value="member">{KIND_LABEL.member}</option>
                  <option value="family_admin" disabled={editFull}>
                    {KIND_LABEL.family_admin}
                    {editFull ? " (full)" : ""}
                  </option>
                </select>
              ) : (
                <span className="shrink-0 py-[6px] pr-1 text-[13px] font-bold text-[#717171]">{KIND_LABEL.member}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleInvite}
              disabled={!email.trim().includes("@")}
              className="w-full shrink-0 rounded-full bg-[#3c7a7c] px-[22px] py-[13px] text-[14px] font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[#336a6c] enabled:active:scale-[0.98] transition-all duration-100 sm:w-auto"
            >
              Invite
            </button>
          </div>
          {/* Edit-seat meter, only worth showing once seats are in play */}
          {(editUsed > 0 || editFull) && (
            <p className="text-[12px] text-[#717171]">
              {Math.min(editUsed, editSlots)} of {editSlots} collaborator{" "}
              {editSlots === 1 ? "spot" : "spots"} used
              {editFull ? ". New invites can view." : ""}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-[#e4534b]">
              {error}
            </p>
          )}
          {sent && (
            <p role="status" className="rounded-[10px] bg-[#f6f1e8] px-3 py-2 text-[13px] leading-snug text-[#717171]">
              <span className="font-bold text-[#3c7a7c]">Demo: no email was sent.</span>{" "}
              In LifeVault, {sent} would get a private link to join this vault.
            </p>
          )}
        </div>

        {/* Who has access */}
        <p className="text-[11px] font-bold tracking-[0.8px] text-[#717171]">
          WHO HAS ACCESS
        </p>
        <div className="flex w-full flex-col gap-0.5">
          {access.map(row => (
              <div key={row.key} className="flex items-center justify-between py-[7px]">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-full ${
                      row.pending ? "bg-[#edebe5]" : "bg-[#deebeb]"
                    }`}
                  >
                    <span
                      className={`text-[13px] font-bold ${
                        row.pending ? "text-[#717171]" : "text-[#3c7a7c]"
                      }`}
                    >
                      {initialOf(row.name)}
                    </span>
                  </div>
                  <p className="truncate text-[14px] text-[#1a1a1a]">{row.name}</p>
                </div>
                <p className="shrink-0 pl-3 text-[13px] text-[#717171]">{row.detail}</p>
              </div>
            ))}
          {/* General access, always true for a Lifevault: private, invite-only */}
          <div className="flex items-center justify-between py-[7px]">
            <div className="flex items-center gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edebe5]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="10" width="16" height="10" rx="2" stroke="#717171" strokeWidth="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#717171" strokeWidth="2" />
                </svg>
              </div>
              <p className="text-[14px] text-[#1a1a1a]">Only invited people</p>
            </div>
          </div>
        </div>

        {/* Primary action, closes the modal (in onboarding: continue to vault) */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full border-[1.5px] border-[#3c7a7c] py-[13px] text-[15px] font-bold text-[#3c7a7c] hover:bg-[#deebeb]/40 active:scale-[0.99] transition-all duration-100"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
