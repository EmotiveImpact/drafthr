import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  draft: Draft;
  activeSectionId: string | null;
  onSelect: (id: string) => void;
};

export function SectionsList({ draft, activeSectionId, onSelect }: Props) {
  const total = draft.sections.length;
  const ready = draft.sections.filter((s) => s.status === "ready").length;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-3 space-y-0.5">
        {/* Apple-minimal: header shows progress count next to "Sections" so the
         * user always knows how close the letter is to done without opening the
         * preview. */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--ds-muted)] uppercase tracking-[0.08em]">
            Sections
          </span>
          <span
            className="text-[10px] font-medium text-[var(--ds-muted)] tabular-nums"
            title={`${ready} of ${total} sections marked ready`}
          >
            {ready}/{total}
          </span>
        </div>
        {draft.sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            title={s.title}
            onClick={() => onSelect(s.id)}
            className={cn(
              "w-full min-w-0 overflow-hidden text-left px-2 py-1.5 rounded-md text-[13px] flex items-center gap-2 transition-colors",
              activeSectionId === s.id
                ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)] font-medium"
                : "text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
            )}
          >
            <span className="inline-grid place-items-center size-5 rounded-md bg-[var(--ds-line-2)] text-[10px] font-medium text-[var(--ds-muted)] shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 min-w-0 truncate">{sidebarLabelFor(s)}</span>
            <span
              className={cn(
                "size-1.5 rounded-full shrink-0",
                s.status === "ready" && "bg-[var(--ds-green-fg)]",
                s.status === "edited" && "bg-[var(--ds-amber-fg)]",
                s.status === "streaming" && "bg-[var(--ds-ink)] animate-pulse",
                s.status === "empty" && "bg-[var(--ds-line)]"
              )}
            />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

type SidebarSection = Draft["sections"][number];

const LABEL_BY_SECTION_ID: Partial<Record<SidebarSection["sectionId"], string>> = {
  header: "Header",
  recipient_block: "Date & recipient",
  subject: "Subject",
  salutation: "Salutation",
  opening: "Opening",
  body: "Body",
  terms: "Terms",
  compensation: "Compensation",
  benefits: "Benefits",
  conditions: "Conditions",
  next_steps: "Next steps",
  appeal_rights: "Appeal rights",
  closing: "Closing",
  signature: "Signature",
  chronology: "Chronology",
  witnesses: "Evidence",
  statutory_basis: "Legal basis",
  impact: "Impact",
  outcome_sought: "Outcome",
  evidence_attached: "Evidence",
  reservation_of_rights: "Rights reserved",
  deadline: "Deadline",
};

const TITLE_OVERRIDES: [RegExp, string][] = [
  [/^statement that this is/i, "Statement"],
  [/^request for hearing/i, "Hearing request"],
  [/^request for appeal hearing/i, "Appeal hearing"],
  [/^protected-characteristic basis/i, "Protected basis"],
  [/^without prejudice/i, "WP header"],
  [/^reservation of/i, "Rights reserved"],
  [/^notice of resignation/i, "Resignation notice"],
  [/^effective date of resignation/i, "Effective date"],
  [/^recital of breach/i, "Breach chronology"],
  [/^statement treating/i, "Breach basis"],
  [/^statement that contract/i, "Breach basis"],
  [/^statutory basis/i, "Legal basis"],
  [/^statutory deadline/i, "Deadline"],
  [/^grounds of appeal/i, "Appeal grounds"],
  [/^information disclosed/i, "Disclosure"],
  [/^reasonable belief/i, "Public interest"],
  [/^request for response/i, "Response request"],
  [/^request for oh referral/i, "OH request"],
  [/^specific scope/i, "Scope"],
  [/^specific adjustments/i, "Adjustments"],
  [/^effect on work/i, "Work impact"],
  [/^engagement with each objective/i, "Objectives"],
  [/^tools \/ training/i, "Support requested"],
  [/^questions on selection/i, "Selection questions"],
  [/^request for selection scoring/i, "Scoring request"],
  [/^suggestions to avoid/i, "Alternatives"],
];

function sidebarLabelFor(section: SidebarSection): string {
  const title = section.title.trim();
  for (const [pattern, label] of TITLE_OVERRIDES) {
    if (pattern.test(title)) return label;
  }

  const beforeDash = title.split(/\s+[—-]\s+/)[0]?.trim();
  if (beforeDash && beforeDash.length <= 22) return beforeDash;

  return LABEL_BY_SECTION_ID[section.sectionId] ?? compactTitle(title);
}

function compactTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+\/\s+.*/g, "")
    .replace(/\s+[—-]\s+.*/g, "")
    .trim();
}
