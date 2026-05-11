import type { Draft } from "@/lib/letters/types";
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  checkRegisterSafety,
  type RegisterSafetyHit,
} from "@/lib/letters/compliance/register-safety";
import { rulesFor, ruleMatches } from "@/lib/letters/compliance";
import { AlertTriangle, AlertCircle, ShieldX, CheckCircle2, ShieldCheck } from "lucide-react";
import { TemplateQualityInspector } from "./TemplateQualityInspector";

const SEVERITY_COLOR: Record<string, string> = {
  block: "text-rose-900 bg-rose-50 border-rose-300",
  warn: "text-amber-900 bg-amber-50 border-amber-200",
  suggest: "text-foreground bg-muted/40 border-letter-rule",
};

const SEVERITY_ICON: Record<string, typeof AlertCircle> = {
  block: ShieldX,
  warn: AlertTriangle,
  suggest: AlertCircle,
};

export function EmployeeRail({ draft }: { draft: Draft }) {
  const fullText = useMemo(
    () => stripHtml(draft.sections.map((s) => s.html).join("\n")),
    [draft.sections]
  );

  const safetyHits: RegisterSafetyHit[] = useMemo(
    () =>
      checkRegisterSafety(fullText, {
        withoutPrejudice: draft.context.withoutPrejudice,
      }),
    [fullText, draft.context.withoutPrejudice]
  );

  const rights = useMemo(
    () => rulesFor(draft.letterType, draft.context.jurisdiction, draft.context.usState),
    [draft.letterType, draft.context.jurisdiction, draft.context.usState]
  );

  const rightsEvaluations = rights.map((r) => ({
    rule: r,
    present: ruleMatches(r, draft.sections.map((s) => s.html).join("\n")),
  }));
  const rightsMissing = rightsEvaluations.filter((e) => !e.present);
  const rightsPresent = rightsEvaluations.filter((e) => e.present);

  const blockHits = safetyHits.filter((h) => h.rule.severity === "block");
  const warnHits = safetyHits.filter((h) => h.rule.severity === "warn");
  const suggestHits = safetyHits.filter((h) => h.rule.severity === "suggest");

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        <header>
          <h3 className="text-sm font-semibold tracking-tight">Rights & register checks</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Live checks against {draft.context.jurisdiction}
            {draft.context.usState ? ` (${draft.context.usState})` : ""}. Tribunal panels read what
            you write — phrasing matters.
          </p>
        </header>

        <TemplateQualityInspector draft={draft} />

        {/* Register-safety hits */}
        {safetyHits.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Register-safety
              {blockHits.length > 0 && (
                <span className="ml-2 text-rose-700">{blockHits.length} blocking</span>
              )}
            </h4>
            <ul className="space-y-2">
              {[...blockHits, ...warnHits, ...suggestHits].map((h, i) => {
                const Icon = SEVERITY_ICON[h.rule.severity];
                return (
                  <li
                    key={`${h.rule.id}-${i}`}
                    className={
                      "rounded-md border p-3 text-xs leading-relaxed " +
                      SEVERITY_COLOR[h.rule.severity]
                    }
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="size-3.5 mt-0.5 shrink-0" />
                      <div className="space-y-1 min-w-0">
                        <div className="font-medium">{h.rule.label}</div>
                        <div className="opacity-80">{h.rule.description}</div>
                        <div className="opacity-90">
                          Detected: <span className="italic">"{truncate(h.match, 80)}"</span>
                        </div>
                        <div className="text-[11px] opacity-90 italic">
                          Suggestion: {h.rule.recommendation}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Rights-preservation checks */}
        {rightsMissing.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Rights preservation — missing ({rightsMissing.length})
            </h4>
            <ul className="space-y-2">
              {rightsMissing.map(({ rule }) => (
                <li
                  key={rule.id}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div className="font-medium">{rule.label}</div>
                      <div className="opacity-80">{rule.description}</div>
                      <div className="text-[11px] opacity-90 italic">
                        Suggestion: {rule.recommendation}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rightsPresent.length > 0 && (
          <section>
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Detected ({rightsPresent.length})
            </h4>
            <ul className="space-y-1.5">
              {rightsPresent.map(({ rule }) => (
                <li key={rule.id} className="flex items-start gap-2 text-xs text-foreground">
                  <CheckCircle2 className="size-3.5 mt-0.5 text-green-700 shrink-0" />
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {safetyHits.length === 0 && rightsMissing.length === 0 && (
          <div className="rounded-md border border-letter-rule bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 mt-0.5 text-green-700" />
            <p>
              All clear so far. Keep going — checks re-run as you edit.
            </p>
          </div>
        )}

        {/* Footer note */}
        <section className="rounded-md border border-letter-rule bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {draft.context.counselReviewRequired ? (
            <>
              <strong>Counsel review recommended.</strong> Consider speaking to a
              qualified employment solicitor (UK) or attorney (US) before sending. ACAS
              0300 123 1100 / EEOC 1-800-669-4000 are free starting points.
            </>
          ) : (
            <>
              Free advice: ACAS 0300 123 1100 (UK) or EEOC 1-800-669-4000 (US).
            </>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function stripHtml(s: string): string {
  if (typeof document === "undefined") return s.replace(/<[^>]+>/g, " ");
  const tmp = document.createElement("div");
  tmp.innerHTML = s;
  return tmp.textContent ?? "";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
