import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Mail, UserPlus, Copy, Check, X, Users as UsersIcon } from "lucide-react";
import type { CollaboratorRole, Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { Avatar } from "@/components/ds";
import { Button } from "@/components/ui/button";

const ROLE_HINT: Record<CollaboratorRole, string> = {
  owner: "Full access — only the draft creator",
  editor: "Can edit sections and regenerate",
  reviewer: "Can comment and attest counsel review",
  viewer: "Read-only — can preview and export",
};

/**
 * People management for the editor — combines the invite form and the
 * current roster in a single popover. Anchored from either the topbar
 * Invite button OR the avatar stack (both open the same surface), so we
 * don't need a separate right-rail tab for collaborators.
 */
export function InvitePopover({
  draft,
  trigger,
  defaultOpen,
}: {
  draft: Draft;
  trigger: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const invite = useDraftStore((s) => s.inviteCollaborator);
  const remove = useDraftStore((s) => s.removeCollaborator);
  const updateRole = useDraftStore((s) => s.updateCollaboratorRole);

  const [open, setOpen] = useState(!!defaultOpen);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("reviewer");
  const [copied, setCopied] = useState(false);

  const collaborators = draft.collaborators ?? [];
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const onInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    invite(draft.id, email, role, name || undefined);
    setEmail("");
    setName("");
  };

  const shareLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/editor/${draft.id}?invite=1`
      : "";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[360px] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_10px_24px_rgba(15,17,21,0.10),0_1px_3px_rgba(15,17,21,0.04)] p-4 text-[13px]"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UsersIcon className="size-4 text-[var(--ds-muted)]" />
              <h4 className="text-[13px] font-semibold text-[var(--ds-ink)] m-0">People</h4>
              {collaborators.length > 0 && (
                <span className="text-[11px] text-[var(--ds-muted)]">{collaborators.length + 1}</span>
              )}
            </div>
            <Popover.Close asChild>
              <button
                type="button"
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </Popover.Close>
          </div>

          {/* Invite form */}
          <form onSubmit={onInvite} className="space-y-2">
            <div className="relative">
              <Mail className="size-3.5 text-[var(--ds-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@company.com"
                className="w-full pl-8 pr-2 h-8 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
              />
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name (optional)"
              className="w-full px-2.5 h-8 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                className="flex-1 px-2 h-8 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[12px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
              >
                <option value="editor">Editor</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button type="submit" size="sm" disabled={!valid} className="h-8">
                <UserPlus className="size-3.5" /> Invite
              </Button>
            </div>
            <p className="text-[11px] text-[var(--ds-muted)] leading-relaxed">{ROLE_HINT[role]}</p>
          </form>

          {/* Share link */}
          <div className="mt-3 p-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-medium text-[var(--ds-muted)]">Share link</span>
              <button
                type="button"
                onClick={onCopy}
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Copy share link"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
            </div>
            <div className="text-[11px] text-[var(--ds-body)] font-mono truncate">{shareLink}</div>
          </div>

          {/* Roster */}
          <div className="mt-3 space-y-1.5">
            <RosterRow
              name="You"
              hint="Created this draft"
              role="Owner"
              isOwner
            />
            {collaborators.map((c) => (
              <RosterRow
                key={c.id}
                name={c.name ?? c.email}
                hint={c.name ? c.email : c.status}
                role={c.role}
                avatar={
                  <Avatar
                    seed={c.email}
                    name={c.name}
                    email={c.email}
                    size="md"
                  />
                }
                onChangeRole={(r) => updateRole(draft.id, c.id, r as CollaboratorRole)}
                onRemove={() => remove(draft.id, c.id)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RosterRow({
  name,
  hint,
  role,
  isOwner,
  avatar,
  onChangeRole,
  onRemove,
}: {
  name: string;
  hint: string;
  role: string;
  isOwner?: boolean;
  avatar?: React.ReactNode;
  onChangeRole?: (role: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--ds-line-2)]">
      {avatar ?? <Avatar seed="me" initials="YOU" size="md" />}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[var(--ds-ink)] truncate">{name}</div>
        <div className="text-[11px] text-[var(--ds-muted)] truncate">{hint}</div>
      </div>
      {isOwner ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]">
          Owner
        </span>
      ) : (
        <select
          value={role}
          onChange={(e) => onChangeRole?.(e.target.value)}
          className="text-[11px] px-1.5 h-6 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] focus:outline-none"
        >
          <option value="editor">Editor</option>
          <option value="reviewer">Reviewer</option>
          <option value="viewer">Viewer</option>
        </select>
      )}
      {!isOwner && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line)] hover:text-[var(--ds-ink)]"
          aria-label="Remove"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
