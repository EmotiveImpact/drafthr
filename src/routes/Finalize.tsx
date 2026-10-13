import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CornerDownLeft,
  Download,
  File,
  FileText,
  FileType2,
  Package,
  Scale,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import { formatDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import type { Draft } from "@/lib/letters/types";
import { recipientNameFor } from "@/lib/letters/display";
import { useJourney } from "@/lib/journey/stage";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader, type Crumb } from "@/components/ds/PageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { runHealthChecks, computeHealthScore, type HealthCheck } from "@/lib/finalize/healthChecks";
import { PlanStep, PlanSteps, Pill } from "@/components/finalize/Plan";
import { sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { useSendFlow, useSingleDownload, type SendFlow } from "@/components/journey/send/useSendFlow";
import {
  BlockLine,
  CheckBox,
  DateGivenField,
  EmailErrorBox,
  GivenByField,
  SendButton,
  WayCards,
} from "@/components/journey/send/parts";
import {
  appealCloseDate,
  dateGivenOf,
  fmtShortDayYear,
  getSentRecord,
  sentBannerText,
} from "@/components/journey/send/record";
import type { ExportFormat } from "@/components/journey/send/exports";

/**
 * Finalise and send, the full page (mock as-full-c), opened from the Send
 * step's "Open full page" or the letter's overflow menu.
 *
 * Header band: Letters › matter › letter, "Finalise and send", the lede and
 * Back to the letter (plus the Export menu: every format on its own, without
 * marking the letter as sent). Left: the letter as exported, scaled, with
 * Approved by, checks and Health chips and what you're sending. Right: three
 * numbered cards (how they get it, what to download with the evidence items
 * and a covering note, how it was given), then the counsel sign-off for
 * high-risk letters, the ready-to-send checklist, and the second-opinion
 * offer. A footer bar holds Cancel and "Download and mark as sent", which
 * goes back to the letter where the Sent moment plays.
 *
 * Uses the same saved choices and the same send as the Send step
 * (components/journey/send), so the two always agree.
 */

const FORMAT_ITEMS: Array<{
  id: ExportFormat;
  label: string;
  ext: string;
  hint: string;
  icon: typeof FileText;
  iconCls: string;
}> = [
  { id: "pdf", label: "PDF", ext: ".pdf", hint: "Print-ready", icon: FileText, iconCls: "text-[var(--ds-red-fg)]" },
  { id: "docx", label: "Word", ext: ".docx", hint: "Editable", icon: FileText, iconCls: "text-[var(--ds-blue-fg)]" },
  { id: "txt", label: "Plain text", ext: ".txt", hint: "No formatting", icon: FileType2, iconCls: "text-[var(--ds-muted)]" },
  {
    id: "pack",
    label: "Evidence pack",
    ext: ".zip",
    hint: "Letter, evidence, summary and audit file",
    icon: Package,
    iconCls: "text-[var(--ds-violet-fg)]",
  },
  {
    id: "audit",
    label: "Audit record",
    ext: ".txt",
    hint: "Who drafted, checked and approved it",
    icon: ScrollText,
    iconCls: "text-[var(--ds-blue-fg)]",
  },
];

function approvedBy(draft: Draft): string | null {
  if (draft.reviewStatus !== "approved" && !(draft.exports ?? []).some((e) => e.format === "marked-sent")) return null;
  const entry = (draft.approvals ?? []).filter((a) => a.decision === "approved").pop();
  const name = entry?.reviewerName?.trim();
  return name && !/^workspace reviewer$/i.test(name) ? name : "";
}

/**
 * The editor layout locks the page to the window and hides overflow; the
 * normal layout scrolls the window. Scroll this page itself only when it
 * sits in a box that does not scroll, so the sticky preview and footer work
 * either way.
 */
function useSelfScroll(ref: React.RefObject<HTMLElement | null>): boolean {
  const [self, setSelf] = useState(false);
  useLayoutEffect(() => {
    let el = ref.current?.parentElement ?? null;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (s.overflowY === "hidden" || s.overflow === "hidden") {
        setSelf(true);
        return;
      }
      el = el.parentElement;
    }
  }, [ref]);
  return self;
}

export function Finalize() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const matter = useDraftStore((s) => (draft?.matterId ? s.matters[draft.matterId] : undefined));
  const journey = useJourney(draftId);
  const flow = useSendFlow(draftId ?? "", "page");
  const exportsHook = useSingleDownload(draft);
  const rootRef = useRef<HTMLDivElement>(null);
  const selfScroll = useSelfScroll(rootRef);

  const checks = useMemo<HealthCheck[]>(() => (draft ? runHealthChecks(draft) : []), [draft]);
  const scoreData = useMemo(() => computeHealthScore(checks), [checks]);

  if (!draft || !draftId || !flow || !journey) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <p className="m-0 text-[14.5px] text-[var(--ds-muted)]">Draft not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4" /> Back home
        </Button>
      </div>
    );
  }

  const meta = getLetterMeta(draft.letterType);
  const letterTitle = draft.title ?? meta.title;
  const approver = approvedBy(draft);
  const isSent = journey.stage === "sent";
  const counselMissing = flow.counselRequired && !flow.attestation;
  const backHref = `/editor/${draft.id}`;
  const first = flow.recipient.short;

  const crumbs: Crumb[] = [
    { label: "Letters", href: "/letters" },
    ...(matter ? [{ label: matter.name, href: `/matters/${matter.id}` }] : []),
    { label: letterTitle, href: backHref },
  ];

  const lede: ReactNode = isSent ? (
    <>
      <b>Sent.</b> {first ? `${first} has` : "They have"} this letter. The exports stay here if you need them again.
    </>
  ) : approver !== null ? (
    <>
      {approver ? `Approved by ${approver}.` : "Approved."} Choose how {first || "they"} {first ? "gets" : "get"} it
      and what to keep with it. DraftHR records the date for the appeal window.
    </>
  ) : (
    <>
      Not approved yet ({journey.statusLabel.toLowerCase()}). Choose how {first || "they"} {first ? "gets" : "get"} it
      and what to keep with it. DraftHR records the date for the appeal window.
    </>
  );

  const exportedFormats = new Set<string>((draft.exports ?? []).map((e) => e.format));
  const auditDone = (draft.timeline ?? []).some((t) => (t.meta as Record<string, unknown> | undefined)?.format === "audit");

  const exportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={buttonVariants({ variant: "outline" })} aria-label="Export">
          <Download className="size-4" />
          <span className="hidden sm:inline">Export</span>
          <ChevronDown className="size-4 text-[var(--ds-subtle)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel className="text-[12px] font-normal text-[var(--ds-muted)]">
          {counselMissing ? "Add the counsel sign-off to export" : "Download this letter as"}
        </DropdownMenuLabel>
        {FORMAT_ITEMS.map((a) => {
          const done = a.id === "audit" ? auditDone : exportedFormats.has(a.id);
          return (
            <DropdownMenuItem
              key={a.id}
              disabled={counselMissing || exportsHook.busy !== null}
              onSelect={() => exportsHook.download(a.id)}
              className="gap-2.5 py-2"
            >
              <a.icon className={cn("size-4", a.iconCls)} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] text-[var(--ds-ink)]">{a.label}</span>
                <span className="truncate text-[11.5px] text-[var(--ds-muted)]">{a.hint}</span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {done && <Check aria-label="Downloaded" className="size-3.5 text-[var(--ds-green-fg)]" />}
                <span className="ds-mono text-[11px] text-[var(--ds-subtle)]">{a.ext}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const goBack = () => nav(backHref);
  const onSent = () => nav(backHref);

  return (
    <div
      ref={rootRef}
      data-slot="finalise-page"
      className={cn("flex w-full min-w-0 flex-col bg-[var(--ds-surface)]", selfScroll && "min-h-0 flex-1 overflow-y-auto")}
    >
      <div className="px-4 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
        <PageHeader
          crumbs={crumbs}
          title="Finalise and send"
          lede={lede}
          className="mb-0"
          actions={
            <>
              <Link to={backHref} className={buttonVariants({ variant: "outline" })}>
                <ArrowLeft className="size-4" />
                Back to the letter
              </Link>
              {exportMenu}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 px-4 pb-[120px] pt-7 sm:px-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-9 lg:px-12">
        <PreviewPanel
          draft={draft}
          approver={approver}
          checks={checks}
          healthScore={scoreData.score}
        />

        <section aria-label="Finalise" className="order-1 min-w-0 lg:order-none">
          {/* Needed: first, it holds the send. Signed off: after the steps. */}
          {counselMissing && !isSent && <CounselAttestation draft={draft} />}
          {isSent ? (
            <SentCard draft={draft} matterName={matter?.name} />
          ) : (
            <>
              <Section n={1} title={first ? `How will ${first} get this letter?` : "How will they get this letter?"}>
                <WayCards flow={flow} variant="page" />
                <EmailErrorBox flow={flow} />
              </Section>
              {flow.prefs.way === "self" && <DownloadSection flow={flow} />}
              <Section n={flow.prefs.way === "self" ? 3 : 2} title="Record how it was given">
                <GivenSection flow={flow} />
              </Section>
            </>
          )}
          {flow.counselRequired && (isSent || !counselMissing) && <CounselAttestation draft={draft} />}
          <ChecklistCard draft={draft} counselMissing={counselMissing} scoreData={scoreData} />
          <ExpertsCard onSeeSpecialists={() => nav(`/consultants?draft=${draft.id}`)} />
          {!isSent && (
            <p className="m-0 mt-3 px-1 text-center text-[12.5px] text-[var(--ds-muted)]">
              Or skip,{" "}
              <button
                type="button"
                onClick={() => {
                  if (!counselMissing) flow.send({ onSent });
                }}
                disabled={!!flow.block || flow.working || counselMissing}
                className="rounded-[4px] font-medium text-[var(--ds-ink)] underline underline-offset-[3px] outline-none focus-visible:shadow-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--ds-subtle)] disabled:no-underline"
              >
                mark as sent
              </button>{" "}
              without a second opinion
            </p>
          )}
        </section>
      </div>

      <footer
        data-slot="finalise-footer"
        className="sticky bottom-0 z-20 mt-auto flex min-h-[72px] flex-wrap items-center gap-2.5 border-t border-[var(--ds-line)] bg-[var(--ds-surface)]/95 px-4 py-3 backdrop-blur-[6px] sm:px-8 lg:px-12"
      >
        {isSent ? (
          <>
            <span className="hidden items-center gap-2 text-[13.5px] text-[var(--ds-muted)] sm:inline-flex">
              <CircleCheck aria-hidden className="size-4 text-[var(--ds-green-solid)]" />
              <b className="font-medium text-[var(--ds-ink)]">Sent</b>
              {dateGivenOf(draft) ? ` on ${fmtShortDayYear(dateGivenOf(draft) as string)}` : ""}
            </span>
            <span className="hidden flex-1 sm:block" />
            <Button className="w-full sm:w-auto" onClick={goBack}>
              Back to the letter
            </Button>
          </>
        ) : (
          <>
            <span className="hidden items-center gap-2 text-[13.5px] text-[var(--ds-muted)] sm:inline-flex">
              <CornerDownLeft aria-hidden className="size-4" />
              Afterwards: <b className="font-medium text-[var(--ds-ink)]">back to the letter, with what's next</b>
            </span>
            <span className="hidden flex-1 sm:block" />
            {(flow.block || counselMissing) && (
              <div className="w-full text-[12.5px] text-[var(--ds-muted)] sm:w-auto sm:max-w-[360px] sm:text-right">
                {flow.block ? (
                  <BlockLine block={flow.block} className="mt-0" />
                ) : (
                  <p className="m-0">Add the counsel sign-off to mark this as sent.</p>
                )}
              </div>
            )}
            <Button variant="outline" className="hidden sm:inline-flex" onClick={goBack} disabled={flow.working}>
              Cancel
            </Button>
            <SendButton
              flow={flow}
              size="page"
              blocked={counselMissing}
              onSent={onSent}
              className="h-11 w-full sm:h-[38px] sm:w-auto"
            />
          </>
        )}
      </footer>
      {flow.gate}
      {exportsHook.gate}
    </div>
  );
}

/* ============================================================================
 * Parts
 * ==========================================================================*/

function Section({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`fin-sec-${n}`}
      className="mb-4 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-5 sm:px-[22px]"
    >
      <div className="mb-3.5 flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--ds-ink)] text-[12px] font-semibold text-[var(--ds-on-accent)]"
        >
          {n}
        </span>
        <h2 id={`fin-sec-${n}`} className="ds-title m-0 min-w-0 text-[21px] leading-[1.2]">
          <span className="sr-only">{n}. </span>
          {title}
        </h2>
        {aside && <span className="ml-auto shrink-0 text-[12.5px] text-[var(--ds-subtle)]">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** The letter as exported, scaled into the grey stage (as-full-c `.stage`). */
function PreviewPanel({
  draft,
  approver,
  checks,
  healthScore,
}: {
  draft: Draft;
  approver: string | null;
  checks: HealthCheck[];
  healthScore: number;
}) {
  const total = checks.length;
  const passing = checks.filter((c) => c.severity === "pass").length;
  const failing = checks.some((c) => c.severity === "fail");
  const healthTone =
    healthScore >= 85
      ? "text-[var(--ds-health-good)]"
      : healthScore >= 70
        ? "text-[var(--ds-health-mid)]"
        : "text-[var(--ds-health-low)]";
  const chip = "inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[9px] py-[3px] text-[12.5px] text-[var(--ds-body)]";

  return (
    <div className="order-2 flex flex-col items-center rounded-[16px] bg-[var(--ds-canvas)] pt-[22px] lg:sticky lg:top-6 lg:order-none">
      <div className="h-[470px] w-[352px] max-w-full overflow-hidden rounded-[3px] shadow-[var(--ds-shadow-paper)]">
        <div className="w-[640px] origin-top-left scale-[.55]">
          <LetterPage draft={draft} />
        </div>
      </div>
      <div className="flex w-full flex-wrap justify-center gap-1.5 px-[18px] pb-[18px] pt-3.5">
        {approver !== null && (
          <span className={chip}>
            <CircleCheck aria-hidden className="size-[13px] text-[var(--ds-green-solid)]" />
            {approver ? `Approved by ${approver}` : "Approved"}
          </span>
        )}
        <span className={chip}>
          {failing ? (
            <CircleAlert aria-hidden className="size-[13px] text-[var(--ds-red-fg)]" />
          ) : (
            <CircleCheck aria-hidden className="size-[13px] text-[var(--ds-green-solid)]" />
          )}
          {passing} of {total} checks
        </span>
        <span className={chip}>
          <CircleCheck aria-hidden className={cn("size-[13px]", healthTone)} />
          Health <b className={cn("font-medium tabular-nums", healthTone)}>{healthScore}</b>
        </span>
      </div>
      <SendingFacts draft={draft} />
    </div>
  );
}

/** "What you're sending": title, jurisdiction, who drafted it, who it is for, evidence. */
function SendingFacts({ draft }: { draft: Draft }) {
  const profile = useProfileStore((s) => s.profile);
  const draftedBy = profile.personal.preferredName || profile.personal.legalName || "you";
  const meta = getLetterMeta(draft.letterType);
  const recipient = recipientNameFor(draft) ?? "the recipient";
  const evidenceCount = draft.evidence?.length ?? 0;
  return (
    <section
      aria-label="What you're sending"
      className="w-full border-t border-[var(--ds-line)] px-[18px] py-3.5 text-[12.5px] text-[var(--ds-muted)]"
    >
      <div className="text-[11.5px] uppercase tracking-[.06em] text-[var(--ds-subtle)]">What you're sending</div>
      <div className="mt-1 truncate text-[14px] font-medium text-[var(--ds-ink)]">{draft.title ?? meta.title}</div>
      <div className="mt-0.5">
        {draft.context?.jurisdiction ?? "UK"}, drafted by {draftedBy}, for {recipient}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Pill>{evidenceCount > 0 ? `${evidenceCount} evidence file${evidenceCount === 1 ? "" : "s"}` : "No evidence"}</Pill>
      </div>
    </section>
  );
}

/** The letter itself, as it will be exported, on a white page. */
function LetterPage({ draft }: { draft: Draft }) {
  const issued = draft.context?.issueDate
    ? formatDateOnly(draft.context.issueDate, { day: "numeric", month: "long", year: "numeric" }, "en-GB")
    : "";
  const html = useMemo(() => {
    const parts = draft.sections
      .map((s) => ({
        sid: s.sectionId,
        html: sanitizeLetterHtmlForExport(mergeAcceptedSuggestionsHtml(s.html ?? "", { forExport: true })),
      }))
      .filter((p) => p.html.replace(/<[^>]+>/g, "").trim().length > 0);
    if (parts.length === 0) return "";
    // The issue date sits under the recipient's address, as on the export.
    const dateLine = issued ? `<p class="final-date">${issued.replace(/[<>&]/g, "")}</p>` : "";
    const at = parts.findIndex((p) => p.sid === "recipient_block");
    const out = parts.map((p) => p.html);
    if (dateLine) out.splice(at >= 0 ? at + 1 : 0, 0, dateLine);
    return out.join("");
  }, [draft.sections, issued]);
  const name = draft.employer?.legalName?.trim() ?? "";
  const address = (draft.employer?.address ?? "")
    .split(/,|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const confidential = draft.context?.confidentiality;
  return (
    <article aria-label="Letter preview" className="min-h-[855px] bg-[var(--ds-surface)] px-[60px] py-14">
      {(name || address.length > 0) && (
        <header className="mb-6 flex items-start justify-between gap-6 border-b border-[var(--ds-line)] pb-4">
          <div className="font-serif text-[19px] leading-tight text-[var(--ds-ink)]">{name}</div>
          {address.length > 0 && (
            <address className="text-right font-serif text-[12px] not-italic leading-[1.5] text-[var(--ds-muted)]">
              {address.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </address>
          )}
        </header>
      )}
      {(confidential === "private_and_confidential" || confidential === "confidential") && (
        <p className="m-0 mb-1.5 font-serif text-[12px] uppercase tracking-[0.06em] text-[var(--ds-muted)]">
          {confidential === "private_and_confidential" ? "Private and confidential" : "Confidential"}
        </p>
      )}
      {html ? (
        <div className="final-letter" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">This letter has no content yet. Go back to the letter to write it.</p>
      )}
      <style>{finalLetterStyles}</style>
    </article>
  );
}

const finalLetterStyles = `
.final-letter { font-family: var(--font-serif); font-size: 15.5px; line-height: 1.62; color: var(--ds-ink); overflow-wrap: anywhere; }
.final-letter p { margin: 0 0 0.9em; }
.final-letter h1, .final-letter h2, .final-letter h3 { font-weight: 600; line-height: 1.3; margin: 1.3em 0 0.5em; }
.final-letter h1 { font-size: 1.25rem; } .final-letter h2 { font-size: 1.12rem; } .final-letter h3 { font-size: 1rem; }
.final-letter ul, .final-letter ol { margin: 0 0 0.9em 1.3em; padding: 0; }
.final-letter li { margin: 0 0 0.3em; }
.final-letter table { width: 100%; border-collapse: collapse; margin: 0.75em 0; font-size: 0.95em; }
.final-letter th, .final-letter td { border: 1px solid var(--ds-line); padding: 6px 10px; text-align: left; }
.final-letter img { max-width: 100%; height: auto; }
.final-letter a { color: inherit; }
`;

/* ---------- 2. What to download ---------- */

function evidenceName(item: NonNullable<Draft["evidence"]>[number]): string {
  const raw = item.filename || item.figureLabel || item.parsedSummary || item.content || "";
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function sectionLabel(draft: Draft, ids: string[] | undefined): string {
  if (!ids || ids.length === 0) return "General";
  const idx = draft.sections.findIndex((s) => s.id === ids[0] || s.sectionId === ids[0]);
  return idx >= 0 ? `Section ${idx + 1}` : "General";
}

function Row({
  checked,
  onChange,
  disabled,
  tile,
  name,
  meta,
  sub,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tile: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  sub?: boolean;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--ds-line-2)] py-2.5 text-[14px] text-[var(--ds-ink)] first:border-t-0 first:pt-0",
        sub && "py-2 pl-[30px]",
        disabled && "opacity-[.55]"
      )}
    >
      <label
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-[6px] has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]",
          disabled ? "cursor-default" : "cursor-pointer"
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(e.target.checked)}
        />
        <CheckBox on={checked} size={18} />
        {tile}
        <span className="min-w-0 break-words">{name}</span>
      </label>
      {meta && <span className="ml-auto text-[12.5px] text-[var(--ds-subtle)]">{meta}</span>}
    </div>
  );
}

function Tile({ tone, children, small }: { tone: "red" | "amber" | "blue" | "grey"; children: ReactNode; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        small ? "size-6 rounded-[6px]" : "size-[30px] rounded-[8px]",
        tone === "red" && "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
        tone === "amber" && "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
        tone === "blue" && "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
        tone === "grey" && "bg-[var(--ds-surface-2)] text-[var(--ds-muted)]"
      )}
    >
      {children}
    </span>
  );
}

function FormatSwitch({ flow }: { flow: SendFlow }) {
  const opts: Array<{ v: SendFlow["prefs"]["letterFormat"]; label: string }> = [
    { v: "pdf", label: "PDF" },
    { v: "docx", label: "Word" },
    { v: "txt", label: "Plain text" },
  ];
  const disabled = flow.working || !flow.canSend || !flow.prefs.includeLetter;
  return (
    <div
      role="radiogroup"
      aria-label="Letter format"
      className="ml-auto inline-flex rounded-[9px] bg-[var(--ds-surface-2)] p-[3px]"
    >
      {opts.map((o) => {
        const on = flow.prefs.letterFormat === o.v;
        return (
          <label
            key={o.v}
            className={cn(
              "relative rounded-[7px] px-2.5 py-1 text-[12.5px] transition-colors duration-[120ms] has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]",
              on ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]" : "text-[var(--ds-muted)]",
              disabled ? "cursor-default opacity-[.6]" : "cursor-pointer hover:text-[var(--ds-ink)]"
            )}
          >
            <input
              type="radio"
              name="letter-format"
              className="sr-only"
              checked={on}
              disabled={disabled}
              onChange={() => flow.update({ letterFormat: o.v })}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

function CoverNote({ flow }: { flow: SendFlow }) {
  const [value, setValue] = useState(flow.prefs.coverNote);
  const saved = useRef(flow.prefs.coverNote);
  const update = flow.update;
  useEffect(() => {
    if (value === saved.current) return;
    const t = window.setTimeout(() => {
      saved.current = value;
      update({ coverNote: value });
    }, 500);
    return () => window.clearTimeout(t);
  }, [value, update]);
  return (
    <div className="mt-3.5">
      <label htmlFor="fin-cover-note" className="sr-only">
        Covering note for the file
      </label>
      <textarea
        id="fin-cover-note"
        value={value}
        disabled={flow.working || !flow.canSend}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== saved.current) {
            saved.current = value;
            update({ coverNote: value });
          }
        }}
        rows={2}
        placeholder="Add a covering note for the file (optional)"
        className="block min-h-16 w-full resize-y rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[13.5px] text-[var(--ds-ink)] outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:bg-[var(--ds-surface-2)]"
      />
      {value.trim() && (
        <p className="m-0 mt-1 text-[12px] text-[var(--ds-subtle)]">Saved on the letter and added to the evidence pack's summary.</p>
      )}
    </div>
  );
}

function DownloadSection({ flow }: { flow: SendFlow }) {
  const { draft, prefs } = flow;
  const evidence = draft.evidence ?? [];
  const excluded = new Set(prefs.excludedEvidence);
  const included = evidence.filter((e) => !excluded.has(e.id)).length;
  const files = (prefs.includeLetter ? 1 : 0) + (prefs.downloads.pack ? 1 : 0) + (prefs.downloads.audit ? 1 : 0);
  const locked = flow.working || !flow.canSend;
  const setDownloads = (patch: Partial<SendFlow["prefs"]["downloads"]>) =>
    flow.update({ downloads: { ...prefs.downloads, ...patch } });

  return (
    <Section n={2} title="What to download" aside={`${files} ${files === 1 ? "file" : "files"}`}>
      <div className="flex flex-col">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pt-0 text-[14px] text-[var(--ds-ink)]">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[6px] has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]">
            <input
              type="checkbox"
              className="sr-only"
              checked={prefs.includeLetter}
              disabled={locked}
              aria-label="The letter"
              onChange={(e) => flow.update({ includeLetter: e.target.checked })}
            />
            <CheckBox on={prefs.includeLetter} size={18} />
            <Tile tone="red">
              <FileText className="size-4" />
            </Tile>
            <span>The letter</span>
          </label>
          <FormatSwitch flow={flow} />
        </div>
        <Row
          label="Evidence pack"
          checked={prefs.downloads.pack}
          disabled={locked}
          onChange={(v) => setDownloads({ pack: v })}
          tile={
            <Tile tone="amber">
              <Package className="size-4" />
            </Tile>
          }
          name="Evidence pack"
          meta={
            evidence.length > 0
              ? `${included} of ${evidence.length} ${evidence.length === 1 ? "file" : "files"}, in one .zip`
              : "Letter, summary and audit file, in one .zip"
          }
        />
        {evidence.map((item) => (
          <Row
            key={item.id}
            sub
            label={`Include ${evidenceName(item)}`}
            checked={prefs.downloads.pack && !excluded.has(item.id)}
            disabled={locked || !prefs.downloads.pack}
            onChange={(v) => {
              const next = new Set(prefs.excludedEvidence);
              if (v) next.delete(item.id);
              else next.add(item.id);
              flow.update({ excludedEvidence: [...next] });
            }}
            tile={
              <Tile tone="grey" small>
                <File className="size-[13px]" />
              </Tile>
            }
            name={evidenceName(item)}
            meta={sectionLabel(draft, item.sectionIds)}
          />
        ))}
        <Row
          label="Audit record"
          checked={prefs.downloads.audit}
          disabled={locked}
          onChange={(v) => setDownloads({ audit: v })}
          tile={
            <Tile tone="blue">
              <ScrollText className="size-4" />
            </Tile>
          }
          name="Audit record"
          meta="Who drafted, checked and approved it"
        />
      </div>
      <CoverNote flow={flow} />
    </Section>
  );
}

/* ---------- 3. Record how it was given ---------- */

function StaticField({ label, children, tone }: { label: string; children: ReactNode; tone?: "green" }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[13px] font-medium text-[var(--ds-ink)]">{label}</div>
      <div
        className={cn(
          "flex h-10 min-w-0 items-center gap-1.5 rounded-[9px] border px-2.5 text-[14px]",
          tone === "green"
            ? "border-[var(--ds-green-bd)] bg-[var(--ds-green-soft)] text-[var(--ds-green-ink)]"
            : "border-[var(--ds-line)] bg-[var(--ds-surface-2)] text-[var(--ds-body)]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function GivenSection({ flow }: { flow: SendFlow }) {
  const email = flow.prefs.way === "email";
  const dateGiven = email ? todayDateOnly() : flow.prefs.dateGiven;
  const close = flow.draft.mode === "employee" ? null : appealCloseDate(flow.draft, dateGiven);
  return (
    <div className={cn("grid grid-cols-1 gap-3", close ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {email ? (
        <>
          <StaticField label="Given by">Email from DraftHR</StaticField>
          <StaticField label="Date given">
            <CalendarCheck aria-hidden className="size-[15px] text-[var(--ds-subtle)]" />
            Today, {fmtShortDayYear(dateGiven)}
          </StaticField>
        </>
      ) : (
        <>
          <GivenByField flow={flow} variant="page" />
          <DateGivenField flow={flow} variant="page" />
        </>
      )}
      {close && (
        <StaticField label="Appeal window closes" tone="green">
          <CalendarCheck aria-hidden className="size-[15px] shrink-0" />
          <span className="truncate">{fmtShortDayYear(close)}</span>
        </StaticField>
      )}
    </div>
  );
}

/* ---------- Sent ---------- */

function SentCard({ draft, matterName }: { draft: Draft; matterName?: string }) {
  const banner = sentBannerText(draft, { matterName });
  const rec = getSentRecord(draft);
  const to = recipientNameFor(draft);
  return (
    <section
      aria-label="Sent"
      className="mb-4 flex items-start gap-3 rounded-[16px] border border-[var(--ds-green-bd)] bg-[var(--ds-green-soft)] px-4 py-5 text-[var(--ds-green-ink)] sm:px-[22px]"
    >
      <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--ds-green-solid)]" />
      <div className="min-w-0 text-[14px] leading-[1.5]">
        <h2 className="ds-title m-0 text-[21px] leading-[1.2] text-[var(--ds-ink)]">
          {to ? `Sent to ${to}` : "Sent"}
        </h2>
        {banner && (
          <p className="m-0 mt-1.5">
            <b className="font-medium">{banner.title}</b> {banner.detail}
          </p>
        )}
        {rec?.downloaded?.length === 0 && rec.way === "self" && (
          <p className="m-0 mt-1 text-[13px]">No files were downloaded with it. Use Export above if you need a copy.</p>
        )}
      </div>
    </section>
  );
}

/* ---------- The checklist, counsel sign-off and experts ---------- */

function ChecklistCard({
  draft,
  counselMissing,
  scoreData,
}: {
  draft: Draft;
  counselMissing: boolean;
  scoreData: ReturnType<typeof computeHealthScore>;
}) {
  const nav = useNavigate();
  const counselRequired = (draft.context?.counselReviewRequired ?? false) || counselMissing;
  const evidenceCount = draft.evidence?.length ?? 0;
  const recipient = recipientNameFor(draft);
  const allSectionsReady = draft.sections.every((s) => (s.html ?? "").replace(/<[^>]+>/g, "").trim().length > 0);
  const answers = draft.answers as Record<string, unknown>;
  const hasLetterhead = Boolean(answers.hasLetterhead || draft.employer?.letterheadDataUrl || answers.letterheadDataUrl);
  type CheckState = "ok" | "fail" | "warn" | "pending";
  const items: Array<{ state: CheckState; title: string; sub?: string; fix?: string }> = [
    {
      state: allSectionsReady ? "ok" : "warn",
      title: "All sections written",
      sub: allSectionsReady ? `${draft.sections.length} of ${draft.sections.length} ready` : "Some sections still empty",
      fix: allSectionsReady ? undefined : `/editor/${draft.id}`,
    },
    {
      state: evidenceCount > 0 ? "ok" : "warn",
      title: "Evidence linked",
      sub: evidenceCount > 0 ? `${evidenceCount} file${evidenceCount === 1 ? "" : "s"}` : "No evidence attached",
    },
    draft.mode === "employee"
      ? { state: "ok", title: "Letterhead", sub: "Not needed for an employee letter" }
      : hasLetterhead
        ? { state: "ok", title: "Letterhead attached" }
        : { state: "warn", title: "Letterhead", sub: "No company letterhead added" },
    {
      state: recipient ? "ok" : "fail",
      title: "Recipient details",
      sub: recipient ? undefined : "Missing, required",
      fix: recipient ? undefined : `/editor/${draft.id}`,
    },
    {
      state: counselMissing ? "pending" : "ok",
      title: "Counsel review",
      sub: counselMissing ? "Sign off above before export" : counselRequired ? "Signed off" : "Not required for this letter",
    },
  ];
  const okCount = items.filter((i) => i.state === "ok").length;
  const stepState = { ok: "ok", warn: "warn", fail: "fail", pending: "todo" } as const;
  const failing = scoreData.failCount;

  return (
    <section
      aria-labelledby="fin-ready"
      className="mb-4 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-5 sm:px-[22px]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fin-ready" className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
          Ready to send
        </h2>
        <span className="text-[12.5px] text-[var(--ds-subtle)]">
          {failing > 0 ? `${failing} blocking ${failing === 1 ? "check" : "checks"}` : `Health ${scoreData.score} of 100`}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--ds-line)]">
          <span
            className="block h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-500"
            style={{ width: `${(okCount / items.length) * 100}%` }}
          />
        </div>
        <span className="ds-mono shrink-0 text-[11.5px] text-[var(--ds-muted)]">
          {okCount} of {items.length}
        </span>
      </div>
      <PlanSteps>
        {items.map((item) => (
          <PlanStep
            key={item.title}
            state={stepState[item.state]}
            sub={item.sub}
            onClick={item.fix ? () => nav(item.fix as string) : undefined}
            aside={
              item.fix ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 text-[12px] font-medium text-[var(--ds-ink)]">
                  Fix
                  <ArrowRight className="size-3" />
                </span>
              ) : undefined
            }
          >
            {item.title}
          </PlanStep>
        ))}
      </PlanSteps>
    </section>
  );
}

/**
 * Counsel-review attestation for high-risk letters. Blocks every export and
 * marking as sent until filled in and confirmed; confirming saves
 * answers._counselReview (the record the Send step and the counsel pill use),
 * unticking clears it.
 */
function CounselAttestation({ draft }: { draft: Draft }) {
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const stored = (draft.answers as Record<string, unknown>)?._counselReview as
    | { reviewedBy?: string; reviewedOn?: string }
    | undefined;
  const confirmed = Boolean(stored?.reviewedBy && stored?.reviewedOn);
  const [reviewerName, setReviewerName] = useState(stored?.reviewedBy ?? "");
  const [reviewedOn, setReviewedOn] = useState(stored?.reviewedOn ?? toDateOnly(new Date()));
  const canConfirm = reviewerName.trim() !== "" && reviewedOn !== "";
  const field =
    "mt-1 block h-10 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[14px] font-normal text-[var(--ds-ink)] outline-none transition-[border-color,box-shadow] duration-[120ms] hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] disabled:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-muted)]";

  const toggle = () => {
    const fresh = useDraftStore.getState().drafts[draft.id] ?? draft;
    const answers = { ...fresh.answers } as Record<string, unknown>;
    if (!confirmed && canConfirm) {
      answers._counselReview = { reviewedBy: reviewerName.trim(), reviewedOn, attestedAt: Date.now() };
    } else {
      delete answers._counselReview;
    }
    updateAnswers(draft.id, answers as typeof draft.answers);
  };

  return (
    <section
      aria-labelledby="counsel-signoff-title"
      className="mb-4 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-4 py-5 sm:px-[22px]"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            confirmed ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]" : "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
          )}
        >
          <ShieldCheck className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="counsel-signoff-title" className="m-0 text-[15px] font-medium text-[var(--ds-ink)]">
            Counsel sign-off
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-[var(--ds-muted)]">Required for this letter type before export or send.</p>
        </div>
        <Pill tone={confirmed ? "green" : "amber"} round>
          {confirmed ? "Signed off" : "Needed"}
        </Pill>
      </div>
      <div className="mb-3 grid gap-2.5 sm:grid-cols-[1fr_170px]">
        <label className="text-[13px] font-medium text-[var(--ds-ink)]">
          Reviewed by (counsel)
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            disabled={confirmed}
            placeholder="e.g. Priya Shah, Employment Solicitor"
            className={field}
          />
        </label>
        <label className="text-[13px] font-medium text-[var(--ds-ink)]">
          Review date
          <input
            type="date"
            value={reviewedOn}
            max={todayDateOnly()}
            onChange={(e) => setReviewedOn(e.target.value)}
            disabled={confirmed}
            className={field}
          />
        </label>
      </div>
      <label
        htmlFor="counsel-attestation"
        className={cn(
          "flex items-center gap-2.5 rounded-[9px] bg-[var(--ds-surface)] px-3 py-2.5 ring-1 ring-[var(--ds-line)] select-none has-[input:focus-visible]:shadow-[var(--ds-focus-ring)]",
          canConfirm || confirmed ? "cursor-pointer" : "cursor-not-allowed opacity-70"
        )}
      >
        <input
          id="counsel-attestation"
          type="checkbox"
          checked={confirmed}
          disabled={!canConfirm && !confirmed}
          onChange={toggle}
          className="size-4 shrink-0 rounded accent-[var(--ds-accent)]"
        />
        <span className="text-[13.5px] font-medium leading-snug text-[var(--ds-ink)]">
          I confirm this has been reviewed by counsel
        </span>
      </label>
    </section>
  );
}

/** A second opinion before sending (the real marketplace owns the listing). */
function ExpertsCard({ onSeeSpecialists }: { onSeeSpecialists: () => void }) {
  return (
    <section
      aria-labelledby="finalise-experts-title"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-4 sm:px-[22px]"
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--ds-lilac-bg)] text-[var(--ds-lilac-fg)]"
      >
        <Scale className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-[240px]">
        <h2 id="finalise-experts-title" className="m-0 text-[14.5px] font-medium text-[var(--ds-ink)]">
          Want a second opinion before you send?
        </h2>
        <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-[var(--ds-muted)]">
          Book a qualified employment law specialist to review this letter. Most reviews come back within 24 hours.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onSeeSpecialists}>
        See specialists
        <ArrowRight className="size-3.5" />
      </Button>
    </section>
  );
}
