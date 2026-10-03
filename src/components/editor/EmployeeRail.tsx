import type { Draft } from "@/lib/letters/types";
import { useMemo } from "react";
import {
  checkRegisterSafety,
  type RegisterSafetyHit,
} from "@/lib/letters/compliance/register-safety";
import { rulesFor, ruleMatches } from "@/lib/letters/compliance";
import { AlertTriangle, AlertCircle, ShieldX, CheckCircle2, ShieldCheck } from "lucide-react";
import { TemplateQualityInspector } from "./TemplateQualityInspector";
import { getDraftReadiness } from "@/lib/finalize/readiness";

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
  const readiness = useMemo(() => getDraftReadiness(draft), [draft]);
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
    // Plain overflow-y-auto (not Radix ScrollArea). Radix's viewport
    // uses display:table internally and sizes to widest child, which
    // ignored our min-w-0 and let long lint strings bleed past the
    // 260px rail. A plain block scroller respects the parent width.
    <div className="h-full overflow-y-auto overflow-x-hidden min-w-0">
      <div className="p-3 space-y-4 min-w-0">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Live checks against {draft.context.jurisdiction}
          {draft.context.usState ? ` (${draft.context.usState})` : ""}. Tribunal
          panels read what you write — phrasing matters.
        </p>

        <TemplateQualityInspector draft={draft} />

        {/* Register-safety hits */}
        {safetyHits.length > 0 && (
          <section className="min-w-0">
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
                      "rounded-md border p-2.5 text-[11.5px] leading-relaxed break-words " +
                      SEVERITY_COLOR[h.rule.severity]
                    }
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon className="size-3.5 mt-0.5 shrink-0" />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-medium break-words">{h.rule.label}</div>
                        <div className="opacity-80 break-words">{h.rule.description}</div>
                        <div className="opacity-90 break-words">
                          Detected:{" "}
                          <span className="italic break-words">
                            "{truncate(h.match, 60)}"
                          </span>
                        </div>
                        <div className="text-[11px] opacity-90 italic break-words">
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
          <section className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Rights — missing ({rightsMissing.length})
            </h4>
            <ul className="space-y-2">
              {rightsMissing.map(({ rule }) => (
                <li
                  key={rule.id}
                  className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] leading-relaxed text-amber-900 break-words"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-medium break-words">{rule.label}</div>
                      <div className="opacity-80 break-words">{rule.description}</div>
                      <div className="text-[11px] opacity-90 italic break-words">
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
          <section className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Detected ({rightsPresent.length})
            </h4>
            <ul className="space-y-1.5">
              {rightsPresent.map(({ rule }) => (
                <li
                  key={rule.id}
                  className="flex items-start gap-2 text-[11.5px] text-foreground min-w-0"
                >
                  <CheckCircle2 className="size-3.5 mt-0.5 text-green-700 shrink-0" />
                  <span className="min-w-0 break-words">{rule.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {safetyHits.length === 0 && rightsMissing.length === 0 && (
          <div className="rounded-md border border-letter-rule bg-muted/30 p-3 text-[11.5px] leading-relaxed text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 mt-0.5 text-green-700 shrink-0" />
            <p className="break-words">
              All clear so far. Keep going — checks re-run as you edit.
            </p>
          </div>
        )}

        {/* Footer note */}
        <section className="rounded-md border border-letter-rule bg-muted/30 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground break-words">
          {readiness.counsel.required ? (
            <>
              <strong>Counsel review required.</strong> A named solicitor (UK) or
              attorney (US) must be recorded before export or send.
            </>
          ) : (
            <>Free advice: ACAS 0300 123 1100 (UK) · EEOC 1-800-669-4000 (US).</>
          )}
        </section>
      </div>
    </div>
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
