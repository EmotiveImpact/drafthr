import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, MessageSquareWarning, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReviewDialogKind = "submit" | "approve" | "request_changes";

type WorkspaceMember = {
  userId: string;
  email: string;
  legalName: string | null;
  role: string;
};

/** Sentinel option value for the free-text "someone else" reviewer path. */
const OTHER = "__other__";

/**
 * Three-in-one modal for the approval-queue actions. Same shell so the
 * UI feels consistent across the three transitions; the kind prop swaps
 * copy + which fields are required.
 *
 * On "submit" the reviewer field is a WORKSPACE-MEMBER PICKER (so the chosen
 * reviewer can be emailed a review request — the notify endpoint only accepts
 * in-tenant members). Free-text stays available via "Someone else…" for solo
 * workspaces / external names; those simply don't get an email.
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
  onSubmit: (input: { reviewerName: string; body: string; reviewerUserId?: string }) => void;
}) {
  const [reviewerName, setReviewerName] = useState(defaultReviewerName ?? "");
  const [body, setBody] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selected, setSelected] = useState<string>(OTHER);

  useEffect(() => {
    if (!open) {
      setBody("");
      setReviewerName(defaultReviewerName ?? "");
      setSelected(OTHER);
    }
  }, [open, defaultReviewerName]);

  // Load teammates when the submit dialog opens. Best-effort: on failure (or a
  // one-person workspace) the picker collapses to the free-text input.
  useEffect(() => {
    if (!open || kind !== "submit") return;
    let cancelled = false;
    void fetch("/api/workspace/members", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members?: WorkspaceMember[] } | null) => {
        if (cancelled || !data?.members) return;
        setMembers(data.members);
        if (data.members.length > 0) setSelected(data.members[0].userId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, kind]);

  const config = CONFIG[kind];
  const trimmedBody = body.trim();
  const bodyMissing = config.bodyRequired && !trimmedBody;
  const usePicker = kind === "submit" && members.length > 0;
  const pickedMember = usePicker && selected !== OTHER ? members.find((m) => m.userId === selected) : undefined;

  const submit = () => {
    if (bodyMissing) return;
    onSubmit({
      reviewerName: pickedMember
        ? (pickedMember.legalName?.trim() || pickedMember.email)
        : reviewerName.trim(),
      body: trimmedBody,
      reviewerUserId: pickedMember?.userId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-4 text-[13px]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <config.Icon className="size-4 text-[var(--ds-muted)]" />
              <Dialog.Title className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
                {config.title}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-[12.5px] text-[var(--ds-muted)] mb-3 leading-snug">
            {config.lede}
          </Dialog.Description>

          {config.showReviewerName && (
            <div className="mb-3">
              <label className="block text-[11px] font-medium text-[var(--ds-muted)] mb-1">
                Reviewer {kind === "submit" ? "(optional)" : ""}
              </label>
              {usePicker && (
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full text-[13px] px-2.5 h-9 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {(m.legalName?.trim() || m.email) + " · " + m.role}
                    </option>
                  ))}
                  <option value={OTHER}>Someone else…</option>
                </select>
              )}
              {(!usePicker || selected === OTHER) && (
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder={defaultReviewerName ?? "Workspace reviewer"}
                  className={`w-full text-[13px] px-3 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] ${usePicker ? "mt-2" : ""}`}
                />
              )}
              {pickedMember && kind === "submit" && (
                <p className="mt-1.5 text-[11px] text-[var(--ds-muted)]">
                  They'll get an email with a link to this draft.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[var(--ds-muted)] mb-1">
              {config.bodyLabel}
              {config.bodyRequired && <span className="text-[var(--ds-red-fg)]"> *</span>}
            </label>
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={config.bodyPlaceholder}
              rows={4}
              className="w-full text-[13px] px-3 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] resize-y"
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
            <Button
              size="sm"
              onClick={submit}
              disabled={bodyMissing}
              className={config.danger ? "bg-[var(--ds-red-fg)] hover:bg-[var(--ds-red-fg)]/90" : undefined}
            >
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
    Icon: typeof Send;
    bodyLabel: string;
    bodyPlaceholder: string;
    bodyRequired: boolean;
    showReviewerName: boolean;
    danger?: boolean;
  }
> = {
  submit: {
    title: "Submit for approval",
    lede: "Send this draft to a reviewer for sign-off. You can keep editing until they pick it up.",
    cta: "Submit for approval",
    Icon: Send,
    bodyLabel: "Note for the reviewer (optional)",
    bodyPlaceholder: "Anything they should know before approving…",
    bodyRequired: false,
    showReviewerName: true,
  },
  approve: {
    title: "Approve draft",
    lede: "Sign off this draft. After approval the canvas is locked and the letter is clear to send.",
    cta: "Approve",
    Icon: CheckCircle2,
    bodyLabel: "Approval note (optional)",
    bodyPlaceholder: "Anything to flag before the author ships it…",
    bodyRequired: false,
    showReviewerName: true,
  },
  request_changes: {
    title: "Request changes",
    lede: "Push the draft back to the author. They'll see your feedback and can re-submit when ready.",
    cta: "Request changes",
    Icon: MessageSquareWarning,
    bodyLabel: "What needs to change",
    bodyPlaceholder: "Be specific — the author will see this verbatim.",
    bodyRequired: true,
    showReviewerName: true,
    danger: true,
  },
};
