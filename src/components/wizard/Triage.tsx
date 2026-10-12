import { useState, type ReactNode } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { LetterTypeId, Jurisdiction } from "@/lib/letters/types";
import { tintStyle } from "@/components/templates/tints";
import { cn } from "@/lib/utils";

type TriageScore = "strong" | "moderate" | "weak";

const FREE_ADVICE_UK = [
  { label: "ACAS helpline", phone: "0300 123 1100", url: "https://www.acas.org.uk/" },
  { label: "Citizens Advice", url: "https://www.citizensadvice.org.uk/" },
  { label: "Equality Advisory & Support Service", url: "https://www.equalityadvisoryservice.com/" },
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

/**
 * Triage step shown before high-risk EMPLOYEE letters, as the first card of
 * the wizard (a 6B tinted card). Two questions:
 *   1. How strong is the evidence?
 *   2. Is informal escalation still possible?
 *
 * If the triage score is "weak", we softly recommend free advice services
 * before drafting, but we never block the user. The wizard page supplies
 * the header and the plan card around it.
 */
export function Triage({
  letterType,
  jurisdiction,
  onSkip,
  onContinue,
}: {
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const meta = getLetterMeta(letterType);
  const [evidence, setEvidence] = useState<"strong" | "some" | "thin" | undefined>();
  const [informal, setInformal] = useState<"yes" | "no" | "unsafe" | "tried" | undefined>();
  const advice = jurisdiction === "UK" ? FREE_ADVICE_UK : FREE_ADVICE_US;

  const score: TriageScore | null =
    evidence && informal
      ? evidence === "strong" || (evidence === "some" && informal === "tried")
        ? "strong"
        : evidence === "thin" && informal === "no"
        ? "weak"
        : "moderate"
      : null;

  return (
    <section
      aria-labelledby="triage-title"
      style={tintStyle("rose")}
      className="overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-s)]"
    >
      {/* 6B tinted top */}
      <div className="mx-1.5 mt-1.5 rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--tint)] px-5 py-5 sm:px-6">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--tint-ink)]">
          <ShieldAlert className="size-3.5" />
          High-risk letter
        </span>
        <h2
          id="triage-title"
          className="m-0 mt-2 text-[19px] font-medium leading-snug tracking-[-0.01em] text-[var(--ds-ink)]"
        >
          Let's pause for 30 seconds before drafting.
        </h2>
        <p className="m-0 mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--ds-body)]">
          {meta.title} is a high-risk letter: what you write may be disclosed in tribunal or
          court proceedings. A quick check helps you decide whether to draft now, get advice
          first, or pursue a different route.
        </p>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <TriageQuestion
          title="Evidence"
          help="How strong is your factual record: dates, named witnesses, written evidence?"
        >
          <RadioGroup value={evidence} onValueChange={(v) => setEvidence(v as typeof evidence)} className="gap-1.5">
            <TriageOption value="strong" label="Strong. I have specific dates, named witnesses, and written evidence (emails, policies, photos)." current={evidence} />
            <TriageOption value="some" label="Some. I have most of the dates and a few witnesses or documents." current={evidence} />
            <TriageOption value="thin" label="Thin. It's mostly my word; I don't have dates or witnesses pinned down." current={evidence} />
          </RadioGroup>
        </TriageQuestion>

        <TriageQuestion
          title="Informal route"
          help="Have you tried to resolve this informally with your manager or HR first?"
        >
          <RadioGroup value={informal} onValueChange={(v) => setInformal(v as typeof informal)} className="gap-1.5">
            <TriageOption value="tried" label="Yes, tried and it didn't resolve." current={informal} />
            <TriageOption value="no" label="No, I haven't raised it informally yet." current={informal} />
            <TriageOption value="unsafe" label="It wouldn't be safe or appropriate to raise informally (harassment, retaliation, safety)." current={informal} />
            <TriageOption value="yes" label="Yes, and I'm waiting on a response." current={informal} />
          </RadioGroup>
        </TriageQuestion>

        {/* Outcome message */}
        {score && (
          <div className="space-y-3">
            {score === "strong" && (
              <Outcome tone="green" icon={<ShieldCheck className="mt-0.5 size-4 shrink-0" />}>
                <strong className="font-semibold">You're well-positioned to draft.</strong> Specific
                facts, named witnesses, and a documented attempt to resolve informally are exactly
                what a tribunal panel looks for. Continue, and consider counsel review before
                sending.
              </Outcome>
            )}
            {score === "moderate" && (
              <Outcome tone="amber" icon={<AlertTriangle className="mt-0.5 size-4 shrink-0" />}>
                <strong className="font-semibold">Proceed, but pin down the gaps.</strong> Before
                sending, try to fix specific dates and identify any witnesses. Vague chronology
                weakens your position. Free advice helplines (below) can help you sharpen the record.
              </Outcome>
            )}
            {score === "weak" && (
              <Outcome tone="red" icon={<AlertTriangle className="mt-0.5 size-4 shrink-0" />}>
                <strong className="font-semibold">Strongly recommended: get advice first.</strong> A
                high-risk letter without dates, witnesses, or an informal-route attempt is harder to
                act on and can be cited against you. Talk to one of the free services below before
                drafting. You can come back any time.
              </Outcome>
            )}

            <details className="group rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] px-3.5 py-3 text-[12.5px]">
              <summary className="cursor-pointer font-medium text-[var(--ds-ink)]">
                Free advice, {jurisdiction === "UK" ? "UK" : "US"}
              </summary>
              <ul className="m-0 mt-2.5 list-none space-y-2 p-0">
                {advice.map((a) => (
                  <li key={a.label} className="flex items-center gap-2 text-[var(--ds-body)]">
                    {a.phone && <Phone className="size-3 shrink-0 text-[var(--ds-muted)]" />}
                    <span>{a.label}</span>
                    {a.phone && <span className="ds-mono text-[var(--ds-muted)]">{a.phone}</span>}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-[var(--ds-ink)] underline underline-offset-2"
                    >
                      Visit
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--ds-line-2)] px-4 py-3 sm:px-6">
        <Button variant="ghost" onClick={onSkip}>
          Skip triage
        </Button>
        <Button onClick={onContinue} disabled={!evidence || !informal}>
          Continue to drafting
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function TriageQuestion({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="p-0 text-[13.5px] font-medium text-[var(--ds-ink)]">{title}</legend>
      <p className="m-0 mb-2.5 mt-0.5 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">{help}</p>
      {children}
    </fieldset>
  );
}

const OUTCOME_TONE = {
  green: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  red: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
} as const;

function Outcome({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof OUTCOME_TONE;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[var(--ds-r-m)] px-3.5 py-3 text-[12.5px] leading-relaxed",
        OUTCOME_TONE[tone],
      )}
    >
      {icon}
      <p className="m-0">{children}</p>
    </div>
  );
}

function TriageOption({
  value,
  label,
  current,
}: {
  value: string;
  label: string;
  current: string | undefined;
}) {
  const id = `tri-${value}`;
  const on = current === value;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[var(--ds-r-m)] border px-3 py-2.5 transition",
        on
          ? "border-[var(--ds-line-strong)] bg-[var(--ds-surface-2)]"
          : "border-[var(--ds-line)] hover:bg-[var(--ds-surface-2)]",
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="text-[13.5px] leading-relaxed text-[var(--ds-body)]">{label}</span>
    </label>
  );
}
