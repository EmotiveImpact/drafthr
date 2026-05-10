import type { Draft } from "@/lib/letters/types";
import { rulesFor, ruleMatches } from "@/lib/letters/compliance";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo } from "react";

const SEVERITY_ICON = {
  required: AlertCircle,
  recommended: AlertTriangle,
  warn: AlertTriangle,
};

const SEVERITY_COLOR = {
  required: "text-rose-700 bg-rose-50 border-rose-200",
  recommended: "text-amber-800 bg-amber-50 border-amber-200",
  warn: "text-orange-800 bg-orange-50 border-orange-200",
};

export function CompliancePanel({ draft }: { draft: Draft }) {
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

  const evaluations = rules.map((r) => ({
    rule: r,
    present: ruleMatches(r, fullText),
  }));

  const missing = evaluations.filter((e) => !e.present);
  const present = evaluations.filter((e) => e.present);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        <header>
          <h3 className="text-sm font-semibold tracking-tight">Compliance checklist</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Live checks against {draft.context.jurisdiction}
            {draft.context.usState ? ` (${draft.context.usState})` : ""} legal patterns. Not a substitute for counsel.
          </p>
        </header>

        {missing.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Missing or recommended ({missing.length})
            </h4>
            <ul className="space-y-2">
              {missing.map(({ rule }) => {
                const Icon = SEVERITY_ICON[rule.severity];
                return (
                  <li
                    key={rule.id}
                    className={
                      "rounded-md border p-3 text-xs leading-relaxed " +
                      SEVERITY_COLOR[rule.severity]
                    }
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="size-3.5 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <div className="font-medium">{rule.label}</div>
                        <div className="opacity-80">{rule.description}</div>
                        <div className="text-[11px] opacity-90 italic">
                          Suggestion: {rule.recommendation}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {present.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Detected ({present.length})
            </h4>
            <ul className="space-y-1.5">
              {present.map(({ rule }) => (
                <li
                  key={rule.id}
                  className="flex items-start gap-2 text-xs text-foreground"
                >
                  <CheckCircle2 className="size-3.5 mt-0.5 text-green-700 shrink-0" />
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {evaluations.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No specific compliance rules configured for this letter/jurisdiction
            yet — Tier 1 disclaimer still applies.
          </p>
        )}

        <section className="rounded-md border border-letter-rule bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {draft.context.counselReviewRequired ? (
            <>
              <strong>Counsel review required.</strong> This letter type carries
              elevated legal risk. The export will include a Tier 3 disclaimer
              and we recommend qualified employment-law review before
              issuance.
            </>
          ) : (
            <>
              The export will include a Tier 1 (universal) and, where
              applicable, Tier 2 (jurisdiction) disclaimer.
            </>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
