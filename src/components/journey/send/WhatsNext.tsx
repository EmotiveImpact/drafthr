import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  FileText,
  FileType,
  LoaderCircle,
  Package,
  Scale,
  Text,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";
import { canSubmitForReview } from "@/lib/permissions";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { useLatestReview } from "@/lib/journey/reviews";
import { listMarketplace } from "@/lib/consultantApi";
import type { Draft, LetterTypeId } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { DateField } from "./DateField";
import { SectionLabel } from "./parts";
import { useSingleDownload } from "./useSendFlow";
import {
  appealCloseDate,
  dateGivenOf,
  employeeRecordFor,
  firstNameOf,
  fmtShortDay,
  getSentRecord,
  recipientOf,
} from "./record";
import { saveAppealDeadline, saveAppealHearing } from "./actions";
import type { ExportFormat } from "./exports";

/**
 * The Sent stage's What's next (mock f8-sent): the appeal window and the
 * appeal hearing (letters with a right of appeal, HR letters only), expert
 * help if an appeal is expected, Download again in four formats, and the
 * next letter for the same person (and matter).
 */

function Row({
  tone,
  icon,
  title,
  detail,
  action,
}: {
  tone: "green" | "amber" | "lilac";
  icon: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-[var(--ds-line-2)] py-[11px] first:border-t-0 first:pt-1">
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px]",
          tone === "green" && "bg-[var(--ds-green-soft)] text-[var(--ds-green-solid)]",
          tone === "amber" && "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
          tone === "lilac" && "bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)]"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 basis-[150px]">
        <b className="block text-[13.5px] font-medium text-[var(--ds-ink)]">{title}</b>
        <span className="mt-px block text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">{detail}</span>
      </div>
      {action && <div className="ml-auto flex shrink-0 items-center gap-1.5 self-center">{action}</div>}
    </div>
  );
}

const ROW_BUTTON =
  "inline-flex h-[26px] max-md:h-9 items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[9px] text-[12px] text-[var(--ds-ink)] no-underline outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:border-[var(--ds-ink)] disabled:pointer-events-none disabled:opacity-[.38]";

/** The lowest price on the marketplace, in pounds, or null when it can't be read. */
function useLowestExpertPrice(enabled: boolean): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listMarketplace({ sort: "price-asc", limit: 1 })
      .then((r) => {
        if (!live || !r.ok) return;
        const p = r.data.consultants[0]?.price;
        if (typeof p === "number" && p > 0) setPrice(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled]);
  return price;
}

function pounds(n: number): string {
  return `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function AppealRows({ draft, close, canAct }: { draft: Draft; close: string; canAct: boolean }) {
  const employees = useDraftStore((s) => s.employees);
  const recipient = recipientOf(draft, employeeRecordFor(draft, employees));
  const who = recipient.short || "they";
  const hearing = (draft.answers as Record<string, unknown>)?.appealHearingDate;
  const hearingDate = typeof hearing === "string" && /^\d{4}-\d{2}-\d{2}$/.test(hearing) ? hearing : null;
  const dateGiven = dateGivenOf(draft) ?? undefined;
  // The Calendar lists answers.appealDeadline; say "in your calendar" only when it is there.
  const inCalendar = (draft.answers as Record<string, unknown>)?.appealDeadline === close;

  const review = useLatestReview(draft.id);
  const expert =
    review && review.kind === "expert" && review.reviewer?.name
      ? {
          first: firstNameOf(review.reviewer.name),
          consultantId: review.reviewer.consultantId,
          price: typeof review.pricePence === "number" && review.pricePence > 0 ? review.pricePence / 100 : null,
        }
      : null;
  const lowest = useLowestExpertPrice(!expert?.price);
  const price = expert?.price ?? lowest;

  const expertHref = expert?.consultantId
    ? `/consultants?draft=${encodeURIComponent(draft.id)}&expert=${encodeURIComponent(expert.consultantId)}`
    : `/consultants?draft=${encodeURIComponent(draft.id)}`;

  return (
    <div data-slot="whats-next-appeal">
      <Row
        tone="green"
        icon={<CalendarCheck className="size-4" />}
        title={`Appeal window closes ${fmtShortDay(close)}`}
        detail={
          inCalendar
            ? draft.matterId
              ? "In your calendar and the matter."
              : "In your calendar."
            : "Not in your calendar yet."
        }
        action={
          !inCalendar && canAct ? (
            <button type="button" className={ROW_BUTTON} onClick={() => saveAppealDeadline(draft.id, close)}>
              <CalendarPlus aria-hidden className="size-[13px]" />
              Add to calendar
            </button>
          ) : undefined
        }
      />
      <Row
        tone="amber"
        icon={<CalendarPlus className="size-4" />}
        title={hearingDate ? `Appeal hearing ${fmtShortDay(hearingDate)}` : "Appeal hearing"}
        detail={hearingDate ? "In your calendar." : `Only if ${who} appeals`}
        action={
          canAct ? (
            hearingDate ? (
              <>
                <DateField
                  value={hearingDate}
                  min={dateGiven}
                  onChange={(v) => saveAppealHearing(draft.id, v)}
                  label="Change the appeal hearing date"
                  align="end"
                >
                  <button type="button" className={ROW_BUTTON} aria-label="Change the appeal hearing date">
                    Change
                  </button>
                </DateField>
                <button
                  type="button"
                  className={ROW_BUTTON}
                  aria-label="Clear the appeal hearing date"
                  onClick={() => saveAppealHearing(draft.id, null)}
                >
                  Clear
                </button>
              </>
            ) : (
              <DateField
                value={null}
                min={dateGiven}
                onChange={(v) => saveAppealHearing(draft.id, v)}
                label="Pick a date for the appeal hearing"
                align="end"
              >
                <button type="button" className={ROW_BUTTON} aria-label="Pick a date for the appeal hearing">
                  <Calendar aria-hidden className="size-[13px]" />
                  Pick a date
                </button>
              </DateField>
            )
          ) : undefined
        }
      />
      <Row
        tone="lilac"
        icon={<Scale className="size-4" />}
        title="Expecting an appeal?"
        detail={
          expert
            ? `${expert.first} can prepare you${price ? `, from ${pounds(price)}` : ""}`
            : `A DraftHR expert can prepare you${price ? `, from ${pounds(price)}` : ""}`
        }
        action={
          <Link to={expertHref} className={ROW_BUTTON}>
            {expert ? `Ask ${expert.first}` : "Find an expert"}
          </Link>
        }
      />
    </div>
  );
}

const AGAIN: Array<{ format: ExportFormat; label: string; icon: ReactNode }> = [
  { format: "pdf", label: "PDF", icon: <FileText aria-hidden className="size-[15px]" /> },
  { format: "docx", label: "Word", icon: <FileType aria-hidden className="size-[15px]" /> },
  { format: "txt", label: "Plain text", icon: <Text aria-hidden className="size-[15px]" /> },
  { format: "pack", label: "Evidence pack", icon: <Package aria-hidden className="size-[15px]" /> },
];

function DownloadAgain({ draft }: { draft: Draft }) {
  const { download, busy, gate } = useSingleDownload(draft);
  return (
    <>
      <SectionLabel className="mb-2 mt-4">Download again</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5" data-slot="download-again">
        {AGAIN.map((a) => (
          <button
            key={a.format}
            type="button"
            onClick={() => download(a.format)}
            disabled={busy !== null}
            aria-busy={busy === a.format || undefined}
            className="flex h-[34px] max-md:h-10 min-w-0 items-center gap-2 rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-left text-[13px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:pointer-events-none [&_svg]:text-[var(--ds-subtle)]"
          >
            {busy === a.format ? <LoaderCircle aria-hidden className="size-[15px] animate-spin" /> : a.icon}
            <span className="truncate">{a.label}</span>
          </button>
        ))}
      </div>
      {gate}
    </>
  );
}

/** Answers that carry the same person (and employer) into a new letter. */
function carryOver(draft: Draft): Record<string, unknown> {
  const e = draft.employee ?? ({} as Draft["employee"]);
  const er = draft.employer ?? ({} as Draft["employer"]);
  const a = (draft.answers ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    jurisdiction: draft.context?.jurisdiction,
    ukRegion: draft.context?.ukRegion,
    usState: draft.context?.usState,
    employeeLegalName: e.legalName || undefined,
    employeePreferredName: e.preferredName || undefined,
    employeeJobTitle: e.jobTitle || undefined,
    employeeDepartment: e.department || undefined,
    employeeAddress: e.address || undefined,
    employeeEmail: e.email || (typeof a.employeeEmail === "string" ? a.employeeEmail : undefined),
    employeeStartDate: e.startDate || undefined,
    linkedEmployeeId: typeof a.linkedEmployeeId === "string" ? a.linkedEmployeeId : undefined,
    employerLegalName: er.legalName || undefined,
    employerAddress: er.address || undefined,
  };
  if (draft.mode === "employee") {
    out.recipientName = er.signatoryName || undefined;
    out.recipientTitle = er.signatoryTitle || undefined;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out;
}

function NextLetter({ draft, appealable }: { draft: Draft; appealable: boolean }) {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const matter = useDraftStore((s) => (draft.matterId ? s.matters[draft.matterId] : undefined));
  const person = draft.mode === "employee" ? "" : firstNameOf(draft.employee?.preferredName || draft.employee?.legalName);
  const types = useMemo(() => {
    const j = draft.context?.jurisdiction ?? "UK";
    return letterCatalogByMode(draft.mode).filter((m) => (j === "UK" ? !m.usOnly : !m.ukOnly));
  }, [draft.mode, draft.context?.jurisdiction]);

  const start = (letterType: LetterTypeId) => {
    const store = useDraftStore.getState();
    const answers = { ...prefillsFromProfile(profile, draft.mode), ...carryOver(draft) };
    const id = store.createDraft(letterType, answers as never, draft.mode);
    if (matter) store.assignDraftToMatter(id, matter.id);
    nav(`/editor/${id}`);
  };

  const title = matter ? "Next letter in this matter" : person ? `Next letter for ${person}` : "Next letter";
  const detail = appealable
    ? "Start it now, or when an appeal arrives"
    : person
      ? `Starts with ${person}'s details${matter ? ` in ${matter.name}` : ""}`
      : `Starts with the same details${matter ? ` in ${matter.name}` : ""}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="next-letter"
          className="mt-2.5 flex w-full items-center gap-3 rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-[11px] text-left outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:shadow-[var(--ds-focus-ring)] data-[state=open]:border-[var(--ds-ink)]"
        >
          <span
            aria-hidden
            className="relative h-[30px] w-6 shrink-0 rounded-[3px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-thumb)]"
          >
            <span className="absolute left-[5px] top-[6px] size-1.5 bg-[var(--ds-tint-lavender)]" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13.5px] font-medium text-[var(--ds-ink)]">{title}</b>
            <span className="block text-[12px] text-[var(--ds-muted)]">{detail}</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-[var(--ds-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[320px] w-[260px] overflow-y-auto">
        <DropdownMenuLabel className="text-[12px] font-medium text-[var(--ds-subtle)]">
          {person ? `Start a letter for ${person}` : "Start a letter"}
        </DropdownMenuLabel>
        {types.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => start(t.id)}>
            {t.shortTitle}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WhatsNext({ draft }: { draft: Draft }) {
  const role = useProfileStore((s) => s.profile.workspaceRole);
  const canAct = canSubmitForReview(role);
  const rec = getSentRecord(draft);
  const close =
    draft.mode === "employee" ? null : (rec?.appealDeadline ?? appealCloseDate(draft, dateGivenOf(draft)));
  return (
    <div data-slot="whats-next" className="flex flex-col">
      {close && <AppealRows draft={draft} close={close} canAct={canAct} />}
      <DownloadAgain draft={draft} />
      {canAct && <NextLetter draft={draft} appealable={!!close} />}
    </div>
  );
}
