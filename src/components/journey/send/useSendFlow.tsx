import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getFlag } from "@/lib/flags";
import { canSubmitForReview } from "@/lib/permissions";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { runHealthChecks, type HealthCheck } from "@/lib/finalize/healthChecks";
import { todayDateOnly } from "@/lib/date-only";
import type { Draft } from "@/lib/letters/types";
import { HighRiskExportGate } from "@/components/editor/HighRiskExportGate";
import {
  earliestDateGiven,
  employeeRecordFor,
  fmtDayMonYear,
  getSendPrefs,
  isValidEmail,
  recipientOf,
  type Recipient,
  type SendPrefs,
  type SentRecord,
} from "./record";
import { FORMAT_LABEL, runExport, type Attestation, type ExportFormat, type ExportOptions } from "./exports";
import { markLetterSent, saveSendPrefs } from "./actions";
import { emailLetterFromDraftHR } from "./email";

/**
 * The counsel sign-off gate for high-risk letters (the existing
 * HighRiskExportGate dialog). `ensure(run)` runs straight away with the
 * stored attestation, or opens the dialog first; confirming stores the
 * attestation on the letter (answers._counselReview, the record the counsel
 * pill and the full page use) and carries on. Cancelling does nothing.
 */
export function useCounselGate(draft: Draft | undefined) {
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const [pending, setPending] = useState<((att: Attestation | undefined) => void) | null>(null);
  const required = draft ? exportRequiresCounselGate(draft) : false;
  const stored = (draft?.answers as Record<string, unknown> | undefined)?._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  const attestation: Attestation | undefined =
    stored?.reviewedBy && stored.reviewedOn ? { reviewedBy: stored.reviewedBy, reviewedOn: stored.reviewedOn } : undefined;

  const ensure = (run: (att: Attestation | undefined) => void) => {
    if (!required) return run(undefined);
    if (attestation) return run(attestation);
    setPending(() => run);
  };

  const gate: ReactNode =
    draft && required ? (
      <HighRiskExportGate
        draft={draft}
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={(review) => {
          const run = pending;
          setPending(null);
          const fresh = useDraftStore.getState().drafts[draft.id] ?? draft;
          updateAnswers(draft.id, { ...fresh.answers, _counselReview: { ...review, attestedAt: Date.now() } });
          run?.(review);
        }}
      />
    ) : null;

  return { required, attestation, ensure, gate, gateOpen: pending !== null };
}

/** Record one finished download in the letter's exports (or, for the audit record, its timeline). */
export function recordDownload(draftId: string, format: ExportFormat, att: Attestation | undefined, actorName?: string) {
  const store = useDraftStore.getState();
  if (format === "audit") {
    store.recordTimelineEvent(draftId, {
      kind: "exported",
      title: "Downloaded the audit record",
      actorName,
      meta: { format: "audit", reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn },
    });
    return;
  }
  store.recordExport(draftId, { format, reviewedBy: att?.reviewedBy, reviewedOn: att?.reviewedOn });
}

/** One format downloaded on its own (Download again, the full page's exports). */
export function useSingleDownload(draft: Draft | undefined) {
  const gate = useCounselGate(draft);
  const actor = useActorName();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const download = (format: ExportFormat, opts?: ExportOptions) => {
    if (!draft || busy) return;
    gate.ensure(async (att) => {
      setBusy(format);
      try {
        const fresh = useDraftStore.getState().drafts[draft.id] ?? draft;
        await runExport(fresh, format, att, opts);
        recordDownload(draft.id, format, att, actor);
      } catch (err) {
        toast.error(`${FORMAT_LABEL[format]} export failed`, {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(null);
      }
    });
  };
  return { download, busy, gate: gate.gate, counselRequired: gate.required, attestation: gate.attestation };
}

export function useActorName(): string | undefined {
  return useProfileStore((s) => s.profile.personal.preferredName?.trim() || s.profile.personal.legalName?.trim() || undefined);
}

export type SendBlock = {
  reason: string;
  /** A way to fix it. */
  fix?: { label: string; href: string };
};

export type SendFlow = {
  draft: Draft;
  prefs: SendPrefs;
  update: (patch: Partial<SendPrefs>) => void;
  recipient: Recipient;
  emailEnabled: boolean;
  canSend: boolean;
  /** The files the button will download, in order. */
  formats: ExportFormat[];
  /** Why the button is disabled, or null. */
  block: SendBlock | null;
  futureDate: boolean;
  /** The earliest date given allowed (the day it was approved), YYYY-MM-DD. */
  minDate: string;
  /** The date given is before the letter was approved. */
  earlyDate: boolean;
  /** Nothing to download: the button only records the send. */
  markOnly: boolean;
  counselRequired: boolean;
  attestation: Attestation | undefined;
  working: boolean;
  workingLabel: string | null;
  buttonLabel: string;
  emailError: string | null;
  clearEmailError: () => void;
  failingChecks: HealthCheck[];
  send: (opts?: { onSent?: () => void }) => void;
  gate: ReactNode;
};

/**
 * The Send step's state and its one action, shared by the panel (mock f7)
 * and the full Finalise page (as-full-c): the saved choices, what the button
 * says and does, and why it may be disabled.
 *
 * Download and mark as sent: every ticked file downloads (each recorded as an
 * export); if any fails, a toast names it and the letter is NOT marked as
 * sent. Then the marked-sent event is recorded with how and when it was
 * given. Email it from DraftHR: the server sends it; only on success is the
 * letter marked as sent (today, "Email from DraftHR"). High-risk letters
 * pass the counsel gate first either way.
 */
export function useSendFlow(draftId: string, variant: "panel" | "page" = "panel"): SendFlow | null {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const employees = useDraftStore((s) => s.employees);
  const role = useProfileStore((s) => s.profile.workspaceRole);
  const actor = useActorName();
  const [emailEnabled] = useState(() => getFlag("emailLetters"));
  const [working, setWorking] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const gate = useCounselGate(draft);

  const derived = useMemo(() => {
    if (!draft) return null;
    const prefs = getSendPrefs(draft);
    const recipient = recipientOf(draft, employeeRecordFor(draft, employees));
    const checks = runHealthChecks(draft);
    return { prefs, recipient, failing: checks.filter((c) => c.severity === "fail") };
  }, [draft, employees]);

  if (!draft || !derived) return null;
  const { prefs, recipient, failing } = derived;
  const way = emailEnabled ? prefs.way : "self";
  const canSend = canSubmitForReview(role);
  const today = todayDateOnly();
  const futureDate = prefs.dateGiven > today;
  const minDate = earliestDateGiven(draft);
  const earlyDate = prefs.dateGiven < minDate;

  const formats: ExportFormat[] =
    way === "email"
      ? []
      : variant === "page"
        ? [
            ...(prefs.includeLetter ? [prefs.letterFormat] : []),
            ...(prefs.downloads.pack ? (["pack"] as const) : []),
            ...(prefs.downloads.audit ? (["audit"] as const) : []),
          ]
        : (["pdf", "docx", "pack", "audit"] as const).filter((k) => prefs.downloads[k]);

  let block: SendBlock | null = null;
  if (!canSend) block = { reason: "Only editors can send letters." };
  else if (!recipient.name)
    block = {
      reason: recipient.toEmployer ? "Add who the letter is for first." : "Add the recipient's name first.",
      fix: { label: "Edit details", href: `/editor/${draft.id}` },
    };
  else if (failing.length > 0)
    block = {
      reason: `Resolve the blocking checks to mark this as sent. ${failing[0].label}${failing.length > 1 ? ` and ${failing.length - 1} more` : ""}.`,
      fix: { label: "Fix", href: failing[0].actionRoute === "evidence" ? `/editor/${draft.id}/evidence` : `/editor/${draft.id}` },
    };
  else if (way === "self" && futureDate) block = { reason: "The date given can't be later than today." };
  else if (way === "self" && earlyDate)
    block = {
      reason: `The date given can't be before ${fmtDayMonYear(minDate)}, when the letter was ${
        (draft.approvals ?? []).some((a) => a.decision === "approved") ? "approved" : "started"
      }.`,
    };
  else if (way === "email" && !recipient.email)
    block = { reason: `Add ${recipient.short || "the recipient"}'s email address first.` };

  const sendWord = recipient.short || "them";
  const buttonLabel =
    way === "email" ? `Send email to ${sendWord}` : formats.length === 0 ? "Mark as sent" : "Download and mark as sent";
  const workingLabel = working;

  const update = (patch: Partial<SendPrefs>) => {
    if (working) return;
    if (patch.way) setEmailError(null);
    saveSendPrefs(draft.id, patch);
  };

  const send = (opts?: { onSent?: () => void }) => {
    if (working || block) return;
    gate.ensure(async (att) => {
      const fresh = useDraftStore.getState().drafts[draft.id] ?? draft;
      if (way === "email") {
        const to = recipient.email;
        if (!to || !isValidEmail(to)) return;
        setEmailError(null);
        setWorking("Sending");
        try {
          const res = await emailLetterFromDraftHR(draft.id, to);
          if (!res.ok) {
            setEmailError(res.message);
            toast.error("The email didn't go", { description: res.message });
            return;
          }
          markLetterSent(draft.id, {
            way: "email",
            givenBy: "email",
            dateGiven: todayDateOnly(),
            downloaded: [],
            attestation: att,
            emailedTo: to,
            emailedName: recipient.name,
            emailId: res.id,
            actorName: actor,
          });
          opts?.onSent?.();
        } finally {
          setWorking(null);
        }
        return;
      }

      setWorking(
        formats.length === 0 ? "Marking as sent" : formats.length === 1 ? `Preparing ${FORMAT_LABEL[formats[0]]}` : "Preparing files"
      );
      const done: SentRecord["downloaded"] = [];
      try {
        for (const f of formats) {
          try {
            await runExport(fresh, f, att, {
              excludeEvidence: variant === "page" ? prefs.excludedEvidence : undefined,
              coverNote: variant === "page" ? prefs.coverNote : undefined,
              // The audit record goes out with this send, so it records it
              // (how and when it was given) though the sent record is saved
              // just after the files (SEND-29).
              audit: {
                pendingSend: { way: "self", givenBy: prefs.givenBy, dateGiven: prefs.dateGiven, actorName: actor },
              },
            });
          } catch (err) {
            toast.error(`${FORMAT_LABEL[f]} export failed`, {
              description: err instanceof Error ? err.message : String(err),
            });
            return; // Not marked as sent; the files that did download stay recorded.
          }
          recordDownload(draft.id, f, att, actor);
          done.push(f);
        }
        markLetterSent(draft.id, {
          way: "self",
          givenBy: prefs.givenBy,
          dateGiven: prefs.dateGiven,
          downloaded: done,
          attestation: att,
          actorName: actor,
        });
        opts?.onSent?.();
      } finally {
        setWorking(null);
      }
    });
  };

  return {
    draft,
    prefs: { ...prefs, way },
    update,
    recipient,
    emailEnabled,
    canSend,
    formats,
    block,
    futureDate,
    minDate,
    earlyDate,
    markOnly: way === "self" && formats.length === 0,
    counselRequired: gate.required,
    attestation: gate.attestation,
    working: working !== null,
    workingLabel,
    buttonLabel,
    emailError,
    clearEmailError: () => setEmailError(null),
    failingChecks: failing,
    send,
    gate: gate.gate,
  };
}
