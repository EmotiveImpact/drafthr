import type { Draft } from "@/lib/letters/types";
import { rulesFor, ruleSatisfied } from "@/lib/letters/compliance";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TemplateQualityInspector } from "./TemplateQualityInspector";
import { getDraftReadiness, type ReadinessAction } from "@/lib/finalize/readiness";

const SEVERITY_LABEL = {
  required: "Required",
  recommended: "Recommended",
  warn: "Watch out",
} as const;

const SEVERITY_TONE = {
  required: {
    bg: "var(--ds-red-bg)",
    fg: "var(--ds-red-fg)",
    Icon: AlertCircle,
  },
  recommended: {
    bg: "var(--ds-amber-bg)",
    fg: "var(--ds-amber-fg)",
    Icon: AlertTriangle,
  },
  warn: {
    bg: "var(--ds-amber-bg)",
    fg: "var(--ds-amber-fg)",
    Icon: AlertTriangle,
  },
};

/**
 * Per-clause compliance checklist for the active draft. Computes against
 * the assembled letter HTML using `rulesFor()` + `ruleMatches()`.
 *
 * Layout:
 *  - Header: jurisdiction + N/M satisfied summary score
 *  - Missing required (red)
 *  - Missing recommended (amber)
 *  - Detected (subtle list, ticked off)
 *  - Footer: counsel-review reminder if applicable
 */
export function CompliancePanel({ draft }: { draft: Draft }) {
  const nav = useNavigate();
  const readiness = useMemo(() => getDraftReadiness(draft), [draft]);
  const goToFix = (action: ReadinessAction, sectionId?: string) => {
    if (action === "evidence") nav(`/editor/${draft.id}/evidence`);
    else if (action === "review") nav(`/editor/${draft.id}/review`);
    else if (action === "settings") nav("/settings");
    else nav(`/editor/${draft.id}${sectionId ? `?section=${sectionId}` : ""}`);
  };
  const fullText = useMemo(
    () => draft.sections.map((s) => s.html).join("\n"),
    [draft.sections]
  );

  const rules = useMemo(
    () =>
      rulesFor(
        draft.letterType,
        draft.context.jurisdiction,
        draft.context.usState
      ),
    [draft.letterType, draft.context.jurisdiction, draft.context.usState]
  );

  // `present` = requirement satisfied/compliant. ruleSatisfied inverts the
  // warn rules (non-compete / salary-consent) so a detected problem lands in
  // the "missing" (flagged) buckets with its removal recommendation, rather
  // than being ticked off as a satisfied clause.
  const evaluations = rules.map((r) => ({
    rule: r,
    present: ruleSatisfied(r, fullText),
  }));

  const missing = evaluations.filter((e) => !e.present);
  const missingRequired = missing.filter((e) => e.rule.severity === "required");
  const missingRecommended = missing.filter((e) => e.rule.severity !== "required");
  const present = evaluations.filter((e) => e.present);

  const score = evaluations.length > 0 ? Math.round((present.length / evaluations.length) * 100) : null;
  const scoreTone =
    score === null
      ? "neutral"
      : score >= 90
      ? "green"
      : score >= 60
      ? "amber"
      : "red";

  return (
    // Plain overflow-y-auto (not Radix ScrollArea). See EmployeeRail
    // for the rationale — Radix's viewport sizes to widest child and
    // ignored our min-w-0 / break-words constraints in the 260px rail.
    <div className="h-full overflow-y-auto overflow-x-hidden min-w-0">
      <div className="p-3 space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-[11px] text-[var(--ds-muted)] leading-relaxed min-w-0 break-words">
            Live checks against {draft.context.jurisdiction}
            {draft.context.usState ? ` (${draft.context.usState})` : ""}.
          </p>
          {score !== null && (
            <span
              className={
                "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full " +
                (scoreTone === "green"
                  ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                  : scoreTone === "amber"
                    ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                    : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]")
              }
            >
              {present.length}/{evaluations.length}
            </span>
          )}
        </div>

        <section className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold text-[var(--ds-ink)]">Send readiness</h4>
            <span className={
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
              (readiness.blockers.length
                ? "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]"
                : "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]")
            }>
              {readiness.statusLabel}
            </span>
          </div>
          {readiness.blockers.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {readiness.blockers.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    onClick={() => goToFix(
                      issue.id === "counsel-review" ? "editor" : issue.action,
                      issue.sectionIds?.[0],
                    )}
                    className="w-full rounded px-1.5 py-1 text-left text-[10.5px] text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-red-fg)]/30"
                  >
                    {issue.label} <span aria-hidden>→</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[10.5px] text-[var(--ds-green-fg)]">
              No mandatory blockers remain.
            </p>
          )}
        </section>

        <TemplateQualityInspector draft={draft} />

        {missingRequired.length > 0 && (
          <RuleSection
            heading={`Required missing · ${missingRequired.length}`}
            items={missingRequired.map((e) => e.rule)}
          />
        )}

        {missingRecommended.length > 0 && (
          <RuleSection
            heading={`Recommended missing · ${missingRecommended.length}`}
            items={missingRecommended.map((e) => e.rule)}
          />
        )}

        {present.length > 0 && (
          <section className="min-w-0">
            <h4 className="text-[11px] font-semibold text-[var(--ds-muted)] mb-2">
              Detected · {present.length}
            </h4>
            <ul className="space-y-1">
              {present.map(({ rule }) => (
                <li
                  key={rule.id}
                  className="flex items-start gap-2 text-[11.5px] text-[var(--ds-body)] py-1 min-w-0"
                >
                  <CheckCircle2 className="size-3.5 mt-0.5 text-[var(--ds-green-fg)] shrink-0" />
                  <span className="flex-1 min-w-0 break-words">{rule.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {evaluations.length === 0 && (
          <p className="text-[11.5px] text-[var(--ds-muted)] leading-relaxed break-words">
            No specific compliance rules configured for this letter / jurisdiction
            yet — Tier 1 disclaimer still applies.
          </p>
        )}

        <section
          className="rounded-md border p-2.5 text-[10.5px] leading-relaxed break-words"
          style={{
            background: readiness.counsel.required ? "var(--ds-amber-bg)" : "var(--ds-line-2)",
            borderColor: readiness.counsel.required ? "var(--ds-amber-bg)" : "var(--ds-line)",
            color: readiness.counsel.required ? "var(--ds-amber-fg)" : "var(--ds-muted)",
          }}
        >
          {readiness.counsel.required ? (
            <>
              <strong>Counsel review required.</strong> This letter type carries
              elevated legal risk. The export will include a Tier 3 disclaimer
              and we recommend qualified employment-law review before issuance.
            </>
          ) : (
            <>
              The export will include a Tier 1 (universal) and, where applicable,
              Tier 2 (jurisdiction) disclaimer.
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function RuleSection({
  heading,
  items,
}: {
  heading: string;
  items: { id: string; label: string; description: string; recommendation: string; severity: "required" | "recommended" | "warn" }[];
}) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold text-[var(--ds-muted)] mb-2">{heading}</h4>
      <ul className="space-y-2">
        {items.map((rule) => {
          const tone = SEVERITY_TONE[rule.severity];
          const Icon = tone.Icon;
          return (
            <li
              key={rule.id}
              className="rounded-md border p-2.5 text-[11.5px] leading-relaxed break-words"
              style={{ background: tone.bg, borderColor: tone.bg, color: tone.fg }}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Icon className="size-3.5 mt-0.5 shrink-0" />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-medium flex items-center gap-2 min-w-0">
                    <span className="min-w-0 break-words flex-1">
                      {rule.label}
                    </span>
                    <span
                      className="text-[9px] uppercase tracking-wider opacity-80 shrink-0"
                      style={{ letterSpacing: "0.08em" }}
                    >
                      {SEVERITY_LABEL[rule.severity]}
                    </span>
                  </div>
                  <div className="opacity-80 break-words">{rule.description}</div>
                  <div className="text-[11px] italic opacity-90 break-words">
                    Suggestion: {rule.recommendation}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
