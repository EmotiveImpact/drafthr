/**
 * The preview card on the Needs approval tab (mock approvals `.pv`): who
 * it is waiting for, the letter, its health, what to fix first, the
 * requester's note, who has acted, a note field and the two decisions.
 */
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, CircleCheckBig, Clock } from "lucide-react";
import { HealthRing, Pill, avatarColor, avatarInitials, avatarInk } from "@/components/ds";
import { DIMENSION_LABELS } from "@/lib/finalize/healthChecks";
import { firstName } from "@/lib/journey/reviews";
import { cn } from "@/lib/utils";
import type { ApprovalRow } from "./approvalData";

export const BTN_SM =
  "inline-flex h-8 shrink-0 items-center justify-center gap-[5px] whitespace-nowrap rounded-[8px] border px-[11px] text-[13px] font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)] disabled:pointer-events-none disabled:opacity-40";
export const BTN_SM_GHOST = `${BTN_SM} border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]`;
export const BTN_SM_DARK = `${BTN_SM} border-[var(--ds-accent)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)]`;

export function PersonDot({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const seed = name.trim().toLowerCase() || "?";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size <= 18 ? 8.5 : size <= 26 ? 10.5 : 11,
        background: avatarColor(seed),
        color: avatarInk(seed),
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}

type Props = {
  row: ApprovalRow;
  me: string;
  canAct: boolean;
  forMe: boolean;
  note: string;
  onNote: (v: string) => void;
  noteHint: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
};

export const ApprovalPreview = forwardRef<HTMLTextAreaElement, Props>(function ApprovalPreview(
  { row, me, canAct, forMe, note, onNote, noteHint, onApprove, onRequestChanges },
  noteRef
) {
  const approverFirst = firstName(row.approver) || row.approver;
  const requesterFirst = firstName(row.requester) || row.requester;
  const pill = canAct ? (
    <Pill tone="amber">{forMe ? "Waiting for you" : `Waiting for ${approverFirst}`}</Pill>
  ) : (
    <Pill tone="lilac">{`With ${row.approver === "Workspace reviewer" ? "an approver" : approverFirst}`}</Pill>
  );
  const sub = [row.person, row.matterName ? `${row.matterName.replace(/\s+matter$/i, "")} matter` : undefined]
    .filter(Boolean)
    .join(" · ");
  const shownFixes = row.fixes.slice(0, 3);
  const meIsApprover = forMe && row.approver !== "Workspace reviewer";

  return (
    <section
      aria-label={`Preview: ${row.title}`}
      className="min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        {pill}
        <Link
          to={`/editor/${row.id}`}
          className="inline-flex items-center gap-[5px] rounded-[4px] text-[13px] text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
        >
          Open letter
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <h2 className="ds-title m-0 mt-1.5 text-[24px] leading-tight tracking-[-0.016em] [overflow-wrap:anywhere]">
        {row.title}
      </h2>
      {sub && <p className="m-0 mt-[3px] text-[13px] text-[var(--ds-muted)]">{sub}</p>}

      {row.score != null && (
        <div className="mt-4 flex items-center gap-4 rounded-[12px] bg-[var(--ds-surface-2)] p-3.5">
          <HealthRing score={row.score} variant="big" size={52} stroke={4} />
          <dl className="m-0 flex min-w-0 flex-1 justify-between gap-2">
            {row.dims.map((d) => (
              <div key={d.dimension} className="min-w-0">
                <dt className="text-[12px] text-[var(--ds-muted)]">{DIMENSION_LABELS[d.dimension]}</dt>
                <dd className="m-0 mt-0.5 text-[15px] font-medium text-[var(--ds-ink)]">{Math.round(d.score)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <h3 className="m-0 mt-4 mb-1 flex justify-between text-[13px] font-semibold text-[var(--ds-ink)]">
        Fix this first
        {row.totalChecks > 0 && (
          <span className="font-normal text-[var(--ds-subtle)]">
            {row.fixes.length} of {row.totalChecks} checks
          </span>
        )}
      </h3>
      {shownFixes.length === 0 ? (
        <p className="m-0 py-2 text-[13px] text-[var(--ds-muted)]">Every check passes.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shownFixes.map((f) => (
            <li key={f.id} className="flex items-start gap-2.5 border-t border-[var(--ds-line-2)] py-2 first:border-t-0">
              <span
                className={cn(
                  "mt-px shrink-0 rounded-[5px] px-1.5 py-px text-[11px] font-medium",
                  f.level === "required"
                    ? "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]"
                    : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                )}
              >
                {f.level === "required" ? "Required" : "Advised"}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-[1.35] text-[var(--ds-ink)]">{f.label}</span>
              <Link
                to={f.href}
                aria-label={`Fix: ${f.label}`}
                className="shrink-0 rounded-[7px] border border-[var(--ds-line)] px-2 py-0.5 text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
              >
                Fix
              </Link>
            </li>
          ))}
          {row.fixes.length > shownFixes.length && (
            <li className="border-t border-[var(--ds-line-2)] py-2 text-[12.5px]">
              <Link to={`/editor/${row.id}`} className="rounded-[4px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]">
                {row.fixes.length - shownFixes.length} more in the letter
              </Link>
            </li>
          )}
        </ul>
      )}

      {row.note && (
        <div className="mt-3.5 flex gap-2.5 text-[13px] leading-[1.4] text-[var(--ds-body)]">
          <PersonDot name={row.requester} size={26} />
          <p className="m-0 min-w-0">
            <b className="font-medium text-[var(--ds-ink)]">{row.requester}</b> {`“${row.note}”`}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--ds-muted)]">
        {row.approvedBy.map((n) => (
          <span key={n} className="inline-flex items-center gap-[5px]">
            <CircleCheckBig className="size-3.5" aria-hidden />
            {n} approved
          </span>
        ))}
        <span className="inline-flex items-center gap-[5px]">
          <Clock className="size-3.5" aria-hidden />
          {meIsApprover ? `${me}, you` : row.approver === "Workspace reviewer" ? "Any approver" : row.approver}
        </span>
      </div>

      {canAct && (
        <>
          <label className="sr-only" htmlFor={`apv-note-${row.id}`}>
            Note for {requesterFirst}
          </label>
          <textarea
            ref={noteRef}
            id={`apv-note-${row.id}`}
            rows={1}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder={`Add a note for ${requesterFirst} (optional)`}
            aria-describedby={noteHint ? `apv-hint-${row.id}` : undefined}
            className={cn(
              "mt-3.5 block min-h-[38px] w-full resize-none rounded-[10px] border bg-[var(--ds-surface)] px-3 py-[9px] text-[13.5px] leading-[1.35] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:border-[var(--ds-ink)]",
              noteHint ? "border-[var(--ds-amber-fg)]" : "border-[var(--ds-line)]"
            )}
          />
          {noteHint && (
            <p id={`apv-hint-${row.id}`} className="m-0 mt-1.5 text-[12.5px] text-[var(--ds-amber-fg)]">
              Say what needs to change, then choose Request changes again.
            </p>
          )}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onRequestChanges} className={cn(BTN_SM_GHOST, "h-[38px] rounded-[9px] text-[14px]")}>
              Request changes
            </button>
            <button type="button" onClick={onApprove} className={cn(BTN_SM_DARK, "h-[38px] rounded-[9px] text-[14px]")}>
              <Check className="size-4" aria-hidden />
              Approve
            </button>
          </div>
        </>
      )}
    </section>
  );
});
