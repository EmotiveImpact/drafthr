import { useState } from "react";
import { Copy, Mail, UserPlus, X, Check } from "lucide-react";
import type { Collaborator, CollaboratorRole, Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { Avatar } from "@/components/ds";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<CollaboratorRole, string> = {
  owner: "Owner",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

const ROLE_HINT: Record<CollaboratorRole, string> = {
  owner: "Full access. Only the person who created the draft.",
  editor: "Can edit sections and redraft them",
  reviewer: "Can comment and record counsel review",
  viewer: "Read only. Can preview and export.",
};

const field =
  "h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]";

const iconBtn =
  "grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

/**
 * Panel for managing the people on a draft: invite by email with a role,
 * copy the share link, change or remove each person. Invitees are stored on
 * the draft.
 */
export function CollaboratorsPanel({ draft }: { draft: Draft }) {
  const invite = useDraftStore((s) => s.inviteCollaborator);
  const remove = useDraftStore((s) => s.removeCollaborator);
  const updateRole = useDraftStore((s) => s.updateCollaboratorRole);

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

  const shareLink = `${window.location.origin}/editor/${draft.id}?invite=1`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused: nothing to show */
    }
  };

  return (
    <div className="h-full overflow-auto p-4 text-[13.5px] text-[var(--ds-body)]">
      <div className="mb-2 flex items-center gap-2">
        <UserPlus className="size-4 text-[var(--ds-muted)]" />
        <span className="font-medium text-[var(--ds-ink)]">People on this letter</span>
      </div>
      <p className="m-0 mb-4 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
        Invite colleagues, counsel or HR partners to edit, review or just view this draft.
      </p>

      <form onSubmit={onInvite} className="mb-3 flex flex-col gap-2">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ds-subtle)]" />
          <input
            type="email"
            aria-label="Email address"
            placeholder="email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(field, "pl-8")}
          />
        </div>
        <input
          aria-label="Display name (optional)"
          placeholder="Display name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
        <div className="flex gap-2">
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as CollaboratorRole)}
            className={cn(field, "min-w-0 flex-1 px-2.5")}
          >
            <option value="editor">{ROLE_LABEL.editor}</option>
            <option value="reviewer">{ROLE_LABEL.reviewer}</option>
            <option value="viewer">{ROLE_LABEL.viewer}</option>
          </select>
          <button
            type="submit"
            disabled={!valid}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-[var(--ds-accent)] px-3.5 text-[13.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <UserPlus className="size-3.5" /> Invite
          </button>
        </div>
        <span className="text-[12px] leading-relaxed text-[var(--ds-muted)]">{ROLE_HINT[role]}</span>
      </form>

      <div className="mb-3 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-2.5">
        <div className="mb-1 text-[12px] font-medium text-[var(--ds-muted)]">Share link</div>
        <div className="flex items-center gap-2">
          <span className="ds-mono min-w-0 flex-1 truncate text-[12px] text-[var(--ds-muted)]">{shareLink}</span>
          <button type="button" onClick={onCopy} aria-label="Copy share link" className={iconBtn}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-[var(--ds-line)] p-2.5">
        <Avatar seed="me" initials="YOU" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--ds-ink)]">You</div>
          <div className="text-[12px] text-[var(--ds-muted)]">Created this draft</div>
        </div>
        <span className="rounded-[6px] bg-[var(--ds-amber-bg)] px-2 py-0.5 text-[12px] font-medium text-[var(--ds-amber-fg)]">Owner</span>
      </div>

      {collaborators.length === 0 ? (
        <p className="m-0 py-4 text-center text-[12.5px] text-[var(--ds-muted)]">No one else yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {collaborators.map((c) => (
            <CollaboratorRow
              key={c.id}
              collaborator={c}
              onRemove={() => remove(draft.id, c.id)}
              onRoleChange={(r) => updateRole(draft.id, c.id, r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollaboratorRow({
  collaborator,
  onRemove,
  onRoleChange,
}: {
  collaborator: Collaborator;
  onRemove: () => void;
  onRoleChange: (role: CollaboratorRole) => void;
}) {
  const active = collaborator.status === "active";
  return (
    <div className="rounded-[10px] border border-[var(--ds-line)] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar seed={collaborator.email} name={collaborator.name} email={collaborator.email} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[var(--ds-ink)]">{collaborator.name ?? collaborator.email}</div>
          {collaborator.name && <div className="truncate text-[12px] text-[var(--ds-muted)]">{collaborator.email}</div>}
        </div>
        <button type="button" onClick={onRemove} aria-label="Remove" className={iconBtn}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <select
          aria-label={`Role for ${collaborator.name ?? collaborator.email}`}
          value={collaborator.role}
          onChange={(e) => onRoleChange(e.target.value as CollaboratorRole)}
          className="h-7 rounded-[7px] bg-transparent px-1.5 text-[12.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <option value="editor">{ROLE_LABEL.editor}</option>
          <option value="reviewer">{ROLE_LABEL.reviewer}</option>
          <option value="viewer">{ROLE_LABEL.viewer}</option>
        </select>
        <span
          className={cn(
            "rounded-[6px] px-2 py-0.5 text-[12px] font-medium",
            active ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]" : "bg-[var(--ds-surface-2)] text-[var(--ds-muted)]"
          )}
        >
          {active ? "Active" : "Invited"}
        </span>
      </div>
    </div>
  );
}
