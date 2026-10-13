import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, MessageSquareWarning, Stamp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfileStore } from "@/lib/profile";

export type ReviewDialogKind = "submit" | "approve" | "request_changes";

type WorkspaceMember = {
  userId: string;
  email: string;
  legalName: string | null;
  role: string;
};

/** Sentinel option value for the free-text "someone else" approver path. */
const OTHER = "__other__";

/**
 * One dialog for the approval actions: send for approval, approve, request
 * changes. The kind swaps the copy and which fields are required.
 *
 * On "submit" the approver is picked from the workspace's members (so they
 * can be emailed: the notify endpoint only accepts members). "Someone else"
 * stays available for one-person workspaces; they are not emailed.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  kind,
  defaultReviewerName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  kind: ReviewDialogKind;
  defaultReviewerName?: string;
  onSubmit: (input: { reviewerName: string; body: string; reviewerUserId?: string; reviewerRole?: string }) => void;
}) {
  const [reviewerName, setReviewerName] = useState(kind === "submit" ? "" : defaultReviewerName ?? "");
  const [body, setBody] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selected, setSelected] = useState<string>(OTHER);
  // The person sending it never approves their own letter: they are left
  // out of the approver list, and nothing is prefilled with their name.
  const myEmail = useProfileStore((st) => st.profile.personal.email?.trim().toLowerCase() ?? "");
  const prefill = kind === "submit" ? "" : defaultReviewerName ?? "";

  useEffect(() => {
    if (!open) {
      setBody("");
      setReviewerName(prefill);
      setSelected(OTHER);
    }
  }, [open, prefill]);

  // Load teammates when the submit dialog opens. Best-effort: on failure (or
  // a one-person workspace) the picker collapses to the free-text input.
  useEffect(() => {
    if (!open || kind !== "submit") return;
    let cancelled = false;
    void fetch("/api/workspace/members", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members?: WorkspaceMember[] } | null) => {
        if (cancelled || !data?.members) return;
        const others = data.members.filter((m) => !myEmail || m.email.trim().toLowerCase() !== myEmail);
        setMembers(others);
        if (others.length > 0) setSelected(others[0].userId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, kind, myEmail]);

  const config = CONFIG[kind];
  const trimmedBody = body.trim();
  const bodyMissing = config.bodyRequired && !trimmedBody;
  const usePicker = kind === "submit" && members.length > 0;
  const pickedMember = usePicker && selected !== OTHER ? members.find((m) => m.userId === selected) : undefined;

  const nameMissing = kind === "submit" && !pickedMember && !reviewerName.trim();
  const submit = () => {
    if (bodyMissing || nameMissing) return;
    onSubmit({
      reviewerName: pickedMember ? pickedMember.legalName?.trim() || pickedMember.email : reviewerName.trim(),
      body: trimmedBody,
      reviewerUserId: pickedMember?.userId,
      reviewerRole: pickedMember?.role,
    });
    onOpenChange(false);
  };

  const field =
    "w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] focus:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-scrim)]" />
        <Dialog.Content className="ds-rise-in fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 text-[13.5px] shadow-[var(--ds-shadow-xl)]">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <config.Icon className="size-4 text-[var(--ds-muted)]" />
              <Dialog.Title className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">{config.title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-[13px] leading-snug text-[var(--ds-muted)]">{config.lede}</Dialog.Description>

          {config.showReviewerName && (
            <div className="mb-3">
              <label htmlFor="review-dialog-person" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-ink)]">
                {kind === "submit" ? "Approver" : "Your name"}
              </label>
              {usePicker && (
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger id="review-dialog-person" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {(m.legalName?.trim() || m.email) + " · " + m.role}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Someone else…</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(!usePicker || selected === OTHER) && (
                <input
                  id={usePicker ? undefined : "review-dialog-person"}
                  aria-label={usePicker ? "Approver's name" : undefined}
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder={kind === "submit" ? "Approver's name" : defaultReviewerName ?? "Your name"}
                  className={`${field} h-9 ${usePicker ? "mt-2" : ""}`}
                />
              )}
              {pickedMember && kind === "submit" && (
                <p className="m-0 mt-1.5 text-[12px] text-[var(--ds-muted)]">They'll get an email with a link to this letter.</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="review-dialog-body" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-ink)]">
              {config.bodyLabel}
              {config.bodyRequired && <span className="text-[var(--ds-red-fg)]"> *</span>}
            </label>
            <textarea
              id="review-dialog-body"
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={config.bodyPlaceholder}
              rows={4}
              className={`${field} resize-y py-2`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" onClick={submit} disabled={bodyMissing || nameMissing} variant={config.danger ? "destructive" : "default"}>
              {config.cta}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const CONFIG: Record<
  ReviewDialogKind,
  {
    title: string;
    lede: string;
    cta: string;
    Icon: typeof Stamp;
    bodyLabel: string;
    bodyPlaceholder: string;
    bodyRequired: boolean;
    showReviewerName: boolean;
    danger?: boolean;
  }
> = {
  submit: {
    title: "Send for approval",
    lede: "Ask a teammate to approve this letter. Editing pauses while it is with them.",
    cta: "Send for approval",
    Icon: Stamp,
    bodyLabel: "Note for the approver (optional)",
    bodyPlaceholder: "Anything they should know before approving",
    bodyRequired: false,
    showReviewerName: true,
  },
  approve: {
    title: "Approve letter",
    lede: "Approve this letter. It stays locked and is ready to send.",
    cta: "Approve",
    Icon: CheckCircle2,
    bodyLabel: "Approval note (optional)",
    bodyPlaceholder: "Anything to flag before it goes out",
    bodyRequired: false,
    showReviewerName: true,
  },
  request_changes: {
    title: "Request changes",
    lede: "Send the letter back to its author with your feedback. They can send it again when it's ready.",
    cta: "Request changes",
    Icon: MessageSquareWarning,
    bodyLabel: "What needs to change",
    bodyPlaceholder: "Be specific. The author sees this as you write it.",
    bodyRequired: true,
    showReviewerName: true,
    danger: true,
  },
};
