import { useState, type ReactNode } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Phone, ShieldAlert } from "lucide-react";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { LetterTypeId, Jurisdiction } from "@/lib/letters/types";
import { tintStyle } from "@/components/templates/tints";
import { cn } from "@/lib/utils";
import { Callout, plainLabel } from "./kit";

type TriageScore = "strong" | "moderate" | "weak";
type Evidence = "strong" | "some" | "thin";
type Informal = "yes" | "no" | "unsafe" | "tried";

/** What the quick check found, shown in the step column afterwards. */
export type TriageResult = { score: TriageScore; summary: string };

const FREE_ADVICE_UK = [
  { label: "ACAS helpline", phone: "0300 123 1100", url: "https://www.acas.org.uk/" },
  { label: "Citizens Advice", url: "https://www.citizensadvice.org.uk/" },
  { label: "Equality Advisory and Support Service", url: "https://www.equalityadvisoryservice.com/" },
  { label: "Working Families", url: "https://workingfamilies.org.uk/" },
  { label: "Law Centres Network", url: "https://www.lawcentres.org.uk/" },
];

const FREE_ADVICE_US = [
  { label: "EEOC", phone: "1-800-669-4000", url: "https://www.eeoc.gov/" },
  { label: "NLRB", url: "https://www.nlrb.gov/" },
  { label: "Department of Labor (state directory)", url: "https://www.dol.gov/" },
  { label: "Legal aid (lawhelp.org)", url: "https://www.lawhelp.org/" },
  { label: "National Employment Lawyers Association", url: "https://www.nelahq.org/" },
];

const EVIDENCE_LINE: Record<Evidence, string> = {
  strong: "Evidence is strong",
  some: "Some evidence is in place",
  thin: "Evidence is thin",
};
const INFORMAL_LINE: Record<Informal, string> = {
  tried: "an informal route was tried first",
  no: "the informal route has not been tried yet",
  unsafe: "raising it informally would not be safe",
  yes: "an informal reply is still awaited",
};

export function triageScore(evidence: Evidence, informal: Informal): TriageScore {
  if (evidence === "strong" || (evidence === "some" && informal === "tried")) return "strong";
  if (evidence === "thin" && informal === "no") return "weak";
  return "moderate";
}

export function triageSummary(evidence: Evidence, informal: Informal): string {
  return `${EVIDENCE_LINE[evidence]} and ${INFORMAL_LINE[informal]}.`;
}

/**
 * Quick check shown before high-risk EMPLOYEE letters, in the form column:
 * a rose-tinted top, two questions as radio cards, the outcome and the free
 * advice list. A weak result recommends free advice first but never blocks.
 */
export function Triage({
  letterType,
  jurisdiction,
  onSkip,
  onContinue,
  onBack,
}: {
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  onSkip: () => void;
  onContinue: (result: TriageResult) => void;
  /** Back to the template library (the "Letter type" step). */
  onBack?: () => void;
}) {
  const meta = getLetterMeta(letterType);
  const [evidence, setEvidence] = useState<Evidence | undefined>();
  const [informal, setInformal] = useState<Informal | undefined>();
  const advice = jurisdiction === "UK" ? FREE_ADVICE_UK : FREE_ADVICE_US;
  const score = evidence && informal ? triageScore(evidence, informal) : null;

  return (
    <section aria-labelledby="triage-title" style={tintStyle("rose")} className="min-w-0">
      <div className="rounded-[14px] bg-[var(--tint)] px-5 py-5 sm:px-6">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--tint-ink)]">
          <ShieldAlert aria-hidden className="size-3.5" />
          High-risk letter
        </span>
        <h2 id="triage-title" className="ds-title m-0 mt-2 text-[28px] leading-[1.1] tracking-[-0.018em]">
          Let's pause for 30 seconds before drafting.
        </h2>
        <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--ds-body)]">
          {plainLabel(meta.title)} is a high-risk letter: what you write may be disclosed in tribunal or court
          proceedings. A quick check helps you decide whether to draft now, get advice first, or take a different
          route.
        </p>
      </div>

      <div className="border-b border-[var(--ds-line-2)] py-4">
        <TriageQuestion title="Evidence" help="How strong is your factual record: dates, named witnesses, written evidence?">
          <RadioGroup value={evidence} onValueChange={(v) => setEvidence(v as Evidence)} className="gap-2">
            <TriageOption value="strong" label="Strong. I have specific dates, named witnesses, and written evidence (emails, policies, photos)." current={evidence} />
            <TriageOption value="some" label="Some. I have most of the dates and a few witnesses or documents." current={evidence} />
            <TriageOption value="thin" label="Thin. It's mostly my word; I don't have dates or witnesses pinned down." current={evidence} />
          </RadioGroup>
        </TriageQuestion>
      </div>

      <div className="py-4">
        <TriageQuestion title="Informal route" help="Have you tried to resolve this informally with your manager or HR first?">
          <RadioGroup value={informal} onValueChange={(v) => setInformal(v as Informal)} className="gap-2">
            <TriageOption value="tried" label="Yes, tried and it didn't resolve." current={informal} />
            <TriageOption value="no" label="No, I haven't raised it informally yet." current={informal} />
            <TriageOption value="unsafe" label="It wouldn't be safe or appropriate to raise informally (harassment, retaliation, safety)." current={informal} />
            <TriageOption value="yes" label="Yes, and I'm waiting on a response." current={informal} />
          </RadioGroup>
        </TriageQuestion>
      </div>

      {score && (
        <div className="space-y-3 pb-4" aria-live="polite">
          {score === "strong" && (
            <Callout tone="success" title="You're well placed to draft.">
              Specific facts, named witnesses and a documented attempt to resolve it informally are what a tribunal
              panel looks for. Continue, and consider counsel review before sending.
            </Callout>
          )}
          {score === "moderate" && (
            <Callout tone="warning" title="Proceed, but pin down the gaps.">
              Before sending, try to fix specific dates and identify any witnesses. A vague chronology weakens your
              position. The free advice services below can help you sharpen the record.
            </Callout>
          )}
          {score === "weak" && (
            <Callout tone="error" title="Get advice first.">
              A high-risk letter without dates, witnesses or an informal attempt is harder to act on and can be cited
              against you. Talk to one of the free services below before drafting. You can come back any time.
            </Callout>
          )}

          <div className="rounded-[12px] bg-[var(--ds-surface-2)] px-4 py-3">
            <div className="text-[13px] font-medium text-[var(--ds-ink)]">Free advice, {jurisdiction === "UK" ? "UK" : "US"}</div>
            <ul className="m-0 mt-2 list-none space-y-2 p-0 text-[13px]">
              {advice.map((a) => (
                <li key={a.label} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[var(--ds-body)]">
                  {a.phone && <Phone aria-hidden className="size-3 shrink-0 text-[var(--ds-muted)]" />}
                  <span>{a.label}</span>
                  {a.phone && <span className="ds-mono text-[var(--ds-muted)]">{a.phone}</span>}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[var(--ds-ink)] underline underline-offset-2"
                  >
                    Visit
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--ds-line)] pt-4">
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          Skip triage
        </Button>
        <span className="hidden flex-1 sm:block" />
        <Button
          onClick={() => evidence && informal && onContinue({ score: triageScore(evidence, informal), summary: triageSummary(evidence, informal) })}
          disabled={!evidence || !informal}
        >
          Continue to drafting
        </Button>
      </div>
    </section>
  );
}

function TriageQuestion({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="p-0 text-[13.5px] font-medium text-[var(--ds-ink)]">{title}</legend>
      <p className="m-0 mb-2.5 mt-0.5 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">{help}</p>
      {children}
    </fieldset>
  );
}

function TriageOption({ value, label, current }: { value: string; label: string; current: string | undefined }) {
  const id = `tri-${value}`;
  const on = current === value;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3.5 py-3 transition-colors duration-[120ms]",
        on
          ? "border-[var(--ds-ink)] bg-[var(--ds-surface)]"
          : "border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)]"
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">{label}</span>
    </label>
  );
}
