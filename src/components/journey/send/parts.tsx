import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Calendar,
  Check,
  CircleCheck,
  Download,
  LoaderCircle,
  Mail,
  Maximize2,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";
import { DateField } from "./DateField";
import { GIVEN_BY_OPTIONS, fmtShortDay, fmtShortDayYear, isValidEmail, type DownloadKey, type GivenBy } from "./record";
import { saveRecipientEmail } from "./actions";
import type { SendBlock, SendFlow } from "./useSendFlow";

/**
 * The building blocks of the Send step (mock f7-send, as-panel-c) and the
 * full Finalise page (as-full-c). Panel and page share the behaviour; only
 * the sizes differ (`variant`).
 */

export function SectionLabel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div
      id={id}
      className={cn(
        "mb-2 mt-[18px] flex items-center justify-between text-[12px] font-medium uppercase tracking-[.06em] text-[var(--ds-subtle)]",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  How they get it                                                    */
/* ------------------------------------------------------------------ */

function RadioDot({ on, size }: { on: boolean; size: "panel" | "page" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto mt-0.5 shrink-0 rounded-full border-[1.5px] border-[var(--ds-line-strong)] bg-[var(--ds-surface)] transition-[border-color,border-width] duration-[120ms]",
        size === "panel" ? "size-4" : "size-[18px]",
        on && (size === "panel" ? "border-[5px] border-[var(--ds-ink)]" : "border-[5.5px] border-[var(--ds-ink)]")
      )}
    />
  );
}

function WayCard({
  name,
  value,
  checked,
  disabled,
  onSelect,
  icon,
  title,
  detail,
  variant,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  variant: "panel" | "page";
  children?: ReactNode;
}) {
  const id = useId();
  const page = variant === "page";
  return (
    <div
      data-slot="way-card"
      data-checked={checked || undefined}
      className={cn(
        "relative rounded-[11px] border border-[var(--ds-line)] bg-[var(--ds-surface)] transition-[background-color,border-color,box-shadow] duration-[120ms]",
        page && "rounded-[12px]",
        !disabled && !checked && "hover:bg-[var(--ds-hover)]",
        checked
          ? "border-[var(--ds-ink)] shadow-[inset_0_0_0_1px_var(--ds-ink)] has-[input:focus-visible]:shadow-[inset_0_0_0_1px_var(--ds-ink),var(--ds-focus-ring)]"
          : "has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]",
        disabled && "opacity-[.6]"
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          "flex items-start gap-2.5",
          page ? "gap-3 p-3.5" : "px-3 py-2.5",
          disabled ? "cursor-default" : "cursor-pointer"
        )}
      >
        <input
          id={id}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onSelect()}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center bg-[var(--ds-surface-2)] text-[var(--ds-ink)]",
            page ? "size-[34px] rounded-[9px]" : "size-[30px] rounded-[8px]"
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <b className={cn("block font-medium text-[var(--ds-ink)]", page ? "text-[14.5px]" : "text-[13.5px] leading-[1.3]")}>{title}</b>
          <span
            className={cn(
              "mt-px block break-words text-[var(--ds-muted)]",
              page ? "mt-0.5 text-[13px] leading-[1.45]" : "text-[12px] leading-[1.3]"
            )}
          >
            {detail}
          </span>
        </span>
        <RadioDot on={checked} size={variant} />
      </label>
      {children}
    </div>
  );
}

/** Add the recipient's address when the letter has none (SEND-11). */
function AddEmail({ flow, variant }: { flow: SendFlow; variant: "panel" | "page" }) {
  const { recipient, draft } = flow;
  const [value, setValue] = useState(recipient.suggestedEmail ?? "");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (recipient.suggestedEmail) setValue((v) => v || recipient.suggestedEmail || "");
  }, [recipient.suggestedEmail]);
  const id = useId();
  const valid = isValidEmail(value);
  const who = recipient.short || "them";
  const save = () => {
    setTouched(true);
    if (!valid) return;
    saveRecipientEmail(draft.id, value);
  };
  return (
    <div className={cn("border-t border-[var(--ds-line-2)]", variant === "page" ? "px-3.5 pb-3.5 pt-3" : "px-3 pb-3 pt-2.5")}>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-[var(--ds-ink)]">
        {recipient.toEmployer ? `Email address for ${who}` : `${who}'s email address`}
      </label>
      <div className="flex gap-1.5">
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={value}
          disabled={flow.working || !flow.canSend}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          aria-invalid={touched && !valid ? true : undefined}
          placeholder="name@company.co.uk"
          className="h-[34px] min-w-0 flex-1 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[13px] text-[var(--ds-ink)] outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] aria-invalid:border-[var(--ds-red-line)] disabled:bg-[var(--ds-surface-2)]"
        />
        <button
          type="button"
          onClick={save}
          disabled={flow.working || !flow.canSend || !value.trim()}
          className="h-[34px] shrink-0 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13px] font-medium text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none disabled:opacity-[.38]"
        >
          Save
        </button>
      </div>
      <p className={cn("m-0 mt-1 text-[12px]", touched && !valid ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-subtle)]")}>
        {touched && !valid
          ? "That email address doesn't look right."
          : recipient.suggestedEmail && value === recipient.suggestedEmail
            ? `From ${who}'s employee record. Save it to use it for this letter.`
            : "Saved on this letter. DraftHR emails only this address."}
      </p>
    </div>
  );
}

function EmailAddress({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  const parts = at > 0 ? [email.slice(0, at + 1), email.slice(at + 1)] : [email];
  const piece = "inline-block max-w-full truncate whitespace-nowrap align-bottom";
  return (
    <span title={email} className="break-normal">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <wbr />}
          <span className={piece}>{p}</span>
        </span>
      ))}
    </span>
  );
}

/** The two ways (a radio group). Panel: stacked; page: side by side. */
export function WayCards({ flow, variant = "panel" }: { flow: SendFlow; variant?: "panel" | "page" }) {
  const name = useId();
  const { prefs, recipient, emailEnabled, canSend, working } = flow;
  const page = variant === "page";
  const who = recipient.short || "them";
  const lockedOut = working || !canSend;
  const iconSize = page ? "size-[18px]" : "size-4";

  // The address breaks only after the "@", never mid-domain, and gets no
  // full stop after it; a part too long for the card is shortened, with the
  // whole address on hover (SEND-X7).
  const emailDetail = recipient.email ? (
    <>
      {page ? "Sent to " : "To "}
      <EmailAddress email={recipient.email} />
    </>
  )
    : recipient.name
      ? `No email for ${who} yet`
      : "No email address yet";

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">How will {recipient.short || "they"} get it</legend>
      <div className={cn(page ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2" : "flex flex-col gap-1.5")}>
        <WayCard
          name={name}
          value="self"
          checked={prefs.way === "self"}
          disabled={lockedOut}
          onSelect={() => flow.update({ way: "self" })}
          icon={<Download aria-hidden className={iconSize} />}
          title="Download and send it yourself"
          detail={page ? "Hand it over, post it or email it from your own inbox." : "Hand it over, post it or email it from your inbox"}
          variant={variant}
        />
        {emailEnabled && (
          <WayCard
            name={name}
            value="email"
            checked={prefs.way === "email"}
            disabled={lockedOut}
            onSelect={() => flow.update({ way: "email" })}
            icon={<Mail aria-hidden className={iconSize} />}
            title="Email it from DraftHR"
            detail={emailDetail}
            variant={variant}
          >
            {prefs.way === "email" && !recipient.email && recipient.name && <AddEmail flow={flow} variant={variant} />}
          </WayCard>
        )}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  Given by and date given                                            */
/* ------------------------------------------------------------------ */

const FIELD_LABEL = "mb-1 block text-[12px] font-medium text-[var(--ds-ink)]";

export function GivenByField({
  flow,
  variant = "panel",
  className,
}: {
  flow: SendFlow;
  variant?: "panel" | "page";
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn(FIELD_LABEL, variant === "page" && "text-[13px]")}>
        Given by
      </label>
      <Select
        value={flow.prefs.givenBy}
        onValueChange={(v) => flow.update({ givenBy: v as GivenBy })}
        disabled={flow.working || !flow.canSend}
      >
        <SelectTrigger
          id={id}
          className={cn(
            "w-full min-w-0 rounded-[8px] px-2.5 py-0 text-[13px] data-[size=default]:h-[34px]",
            variant === "page" ? "rounded-[9px] text-[14px] data-[size=default]:h-10" : "max-md:data-[size=default]:h-10"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {GIVEN_BY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DateGivenField({
  flow,
  variant = "panel",
  className,
}: {
  flow: SendFlow;
  variant?: "panel" | "page";
  className?: string;
}) {
  const id = useId();
  const today = todayDateOnly();
  const display = variant === "page" ? fmtShortDayYear(flow.prefs.dateGiven) : fmtShortDay(flow.prefs.dateGiven);
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn(FIELD_LABEL, variant === "page" && "text-[13px]")}>
        Date given
      </label>
      <DateField
        id={id}
        value={flow.prefs.dateGiven}
        onChange={(v) => flow.update({ dateGiven: v > today ? today : v < flow.minDate ? flow.minDate : v })}
        max={today}
        min={flow.minDate}
        disabled={flow.working || !flow.canSend}
        label={`Date given, ${display}`}
        display={display}
        triggerClassName={variant === "page" ? "h-10 rounded-[9px] text-[14px]" : "max-md:h-10"}
      />
      {flow.futureDate && (
        <p className="m-0 mt-1 text-[12px] text-[var(--ds-red-fg)]">The date given can't be later than today.</p>
      )}
      {flow.earlyDate && (
        <p className="m-0 mt-1 text-[12px] text-[var(--ds-red-fg)]">
          The date given can't be before {fmtShortDay(flow.minDate)}.
        </p>
      )}
    </div>
  );
}

/** Email chosen: the date is today, set by DraftHR (SEND-13). */
export function EmailDateNote({ className }: { className?: string }) {
  return (
    <p className={cn("m-0 mt-3 flex items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]", className)}>
      <Calendar aria-hidden className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
      DraftHR emails it now and records today, {fmtShortDay(todayDateOnly())}, as the date given.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  What to download (panel chips)                                     */
/* ------------------------------------------------------------------ */

export function CheckBox({ on, size = 14 }: { on: boolean; size?: 14 | 18 }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center border-[1.5px] text-[var(--ds-on-accent)] transition-colors duration-[120ms]",
        size === 14 ? "size-3.5 rounded-[4px]" : "size-[18px] rounded-[5px]",
        on ? "border-[var(--ds-ink)] bg-[var(--ds-ink)]" : "border-[var(--ds-line-strong)] bg-[var(--ds-surface)]"
      )}
    >
      {on && <Check strokeWidth={3} className={size === 14 ? "size-2.5" : "size-3"} />}
    </span>
  );
}

function evidenceChipLabel(n: number): string {
  if (n <= 0) return "Evidence pack";
  return `Evidence pack, ${n} ${n === 1 ? "file" : "files"}`;
}

export function DownloadChips({ flow }: { flow: SendFlow }) {
  const n = flow.draft.evidence?.length ?? 0;
  const items: Array<{ key: DownloadKey; label: string }> = [
    { key: "pdf", label: "PDF" },
    { key: "docx", label: "Word" },
    { key: "pack", label: evidenceChipLabel(n) },
    { key: "audit", label: "Audit record" },
  ];
  const disabled = flow.working || !flow.canSend;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Files to download">
      {items.map(({ key, label }) => {
        const on = flow.prefs.downloads[key];
        return (
          <label
            key={key}
            className={cn(
              // 28px tall, as in the mock (f7 .inc), so the four chips and the counsel line fit above the button (SEND-X30).
              "relative inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--ds-line)] px-[9px] py-[5px] max-md:min-h-10 text-[12.5px] leading-4 text-[var(--ds-ink)] transition-colors duration-[120ms]",
              on ? "bg-[var(--ds-surface-2)]" : "bg-[var(--ds-surface)]",
              disabled ? "cursor-default opacity-[.6]" : "cursor-pointer hover:bg-[var(--ds-surface-3)]",
              "has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]"
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              disabled={disabled}
              onChange={(e) => flow.update({ downloads: { ...flow.prefs.downloads, [key]: e.target.checked } })}
            />
            <CheckBox on={on} />
            {label}
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Counsel note, reasons, errors, the button                          */
/* ------------------------------------------------------------------ */

function fmtReviewDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtShortDayYear(v) : v;
}

/** High-risk letters: say before the click that counsel sign-off is needed (SEND-39). */
export function CounselNote({ flow, className }: { flow: SendFlow; className?: string }) {
  if (!flow.counselRequired) return null;
  if (flow.attestation) {
    return (
      <p className={cn("m-0 mt-3 flex items-center gap-2 text-[12.5px] text-[var(--ds-green-fg)]", className)}>
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        Counsel sign-off: {flow.attestation.reviewedBy}, {fmtReviewDate(flow.attestation.reviewedOn)}
      </p>
    );
  }
  return (
    <p className={cn("m-0 mt-3 flex items-start gap-2 text-[12.5px] leading-[1.45] text-[var(--ds-amber-fg)]", className)}>
      <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" />
      Counsel sign-off is needed for this letter. You'll be asked who reviewed it first.
    </p>
  );
}

export function BlockLine({ block, className }: { block: SendBlock | null; className?: string }) {
  if (!block) return null;
  return (
    <p
      data-slot="send-block"
      className={cn("m-0 mt-3 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]", className)}
    >
      {block.reason}
      {block.fix && (
        <>
          {" "}
          <Link
            to={block.fix.href}
            className="rounded-[4px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            {block.fix.label}
          </Link>
        </>
      )}
    </p>
  );
}

export function EmailErrorBox({ flow, className }: { flow: SendFlow; className?: string }) {
  if (!flow.emailError || flow.prefs.way !== "email") return null;
  return (
    <div
      role="alert"
      className={cn(
        "mt-3 rounded-[10px] border border-[var(--ds-amber-bd)] bg-[var(--ds-amber-soft)] px-3 py-2.5 text-[12.5px] leading-[1.45] text-[var(--ds-amber-fg)]",
        className
      )}
    >
      {flow.emailError}
      <button
        type="button"
        onClick={() => flow.update({ way: "self" })}
        className="ml-1 rounded-[4px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        Download it instead
      </button>
    </div>
  );
}

/** The one primary action: "Download and mark as sent" / "Send email to <name>". */
export function SendButton({
  flow,
  onSent,
  className,
  size = "panel",
  blocked,
}: {
  flow: SendFlow;
  onSent?: () => void;
  className?: string;
  size?: "panel" | "page";
  /** Extra reason to hold the button (the full page's counsel sign-off). */
  blocked?: boolean;
}) {
  const disabled = !!flow.block || flow.working || !!blocked;
  // Nothing ticked: the button only records the send, so no download icon (SEND-X12).
  const Icon = flow.prefs.way === "email" ? Send : flow.markOnly ? CircleCheck : Download;
  return (
    <button
      type="button"
      data-slot="send-button"
      aria-busy={flow.working || undefined}
      disabled={disabled}
      onClick={() => {
        if (!blocked) flow.send({ onSent });
      }}
      className={cn(
        "inline-flex w-full items-center justify-center gap-[7px] rounded-[10px] bg-[var(--ds-accent)] px-4 text-[14.5px] font-medium text-[var(--ds-on-accent)] outline-none transition-[background-color,box-shadow] duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none",
        flow.working ? "disabled:opacity-90" : "disabled:opacity-[.38]",
        size === "panel" ? "mt-4 h-[42px]" : "h-[38px] w-auto",
        className
      )}
    >
      {flow.working ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
      ) : (
        <Icon aria-hidden className="size-4" />
      )}
      {flow.working ? flow.workingLabel : flow.buttonLabel}
    </button>
  );
}

/** "Open full page" under the Send step (mock as-panel-c `.full`). */
export function OpenFullPageCard({ draftId, className }: { draftId: string; className?: string }) {
  return (
    <Link
      to={`/editor/${draftId}/finalize`}
      data-slot="open-full-page"
      className={cn(
        "mt-3.5 flex items-center gap-2.5 rounded-[11px] border border-dashed border-[var(--ds-line-strong)] px-3 py-2.5 text-[12.5px] text-[var(--ds-muted)] no-underline outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)]",
        className
      )}
    >
      <Maximize2 aria-hidden className="size-[15px] shrink-0 text-[var(--ds-subtle)]" />
      <span className="min-w-0 flex-1 leading-[1.3]">
        <b className="block text-[13px] font-medium text-[var(--ds-ink)]">Open full page</b>
        Choose evidence files, add a cover note, build a bundle
      </span>
      <ArrowUpRight aria-hidden className="size-[15px] shrink-0 text-[var(--ds-ink)]" />
    </Link>
  );
}
