import type { Draft, EmployeeTone, Tone } from "@/lib/letters/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { Mic2, Check } from "lucide-react";

const EMPLOYER_TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "warm", label: "Warm", hint: "Personable but professional. Offers, promotions." },
  { value: "neutral", label: "Neutral", hint: "Polite, factual, no editorialising." },
  { value: "formal", label: "Formal", hint: "Formal business register. Default." },
  { value: "firm", label: "Firm", hint: "Firm and unambiguous. No softening hedges." },
];

const EMPLOYEE_TONES: { value: EmployeeTone; label: string; hint: string }[] = [
  { value: "conciliatory", label: "Conciliatory", hint: "Cooperative. First-time grievance, accommodation ask." },
  { value: "assertive", label: "Assertive", hint: "Formal, clear, expectant. Default." },
  { value: "forensic", label: "Forensic", hint: "Dispassionate, dated, evidential." },
  { value: "tribunal_ready", label: "Tribunal-ready", hint: "Strictly procedural. ACAS EC, ET1 cover." },
];

/**
 * Unified Tone popover. Lists every tone option as a row, with the
 * Without-Prejudice toggle as a final row on employee-mode drafts —
 * one continuous menu, no sub-sections.
 */
export function DocumentPopover({ draft }: { draft: Draft }) {
  const updateAnswers = useDraftStore((s) => s.updateAnswers);
  const setWithoutPrejudice = useDraftStore((s) => s.setWithoutPrejudice);

  const isEmployee = draft.mode === "employee";
  const wpOn = Boolean(draft.context.withoutPrejudice);
  const current = isEmployee
    ? draft.context.employeeTone ?? "assertive"
    : draft.context.tone;
  const options = isEmployee ? EMPLOYEE_TONES : EMPLOYER_TONES;
  const currentMeta = options.find((o) => o.value === current);

  const setTone = (next: Tone | EmployeeTone) => {
    if (draft.mode === "employer") {
      updateAnswers(draft.id, { ...draft.answers, tone: next });
      useDraftStore.setState((s) => {
        const d = s.drafts[draft.id];
        if (!d) return s;
        return {
          drafts: {
            ...s.drafts,
            [draft.id]: {
              ...d,
              context: { ...d.context, tone: next as Tone },
              updatedAt: Date.now(),
            },
          },
        };
      });
    } else {
      updateAnswers(draft.id, { ...draft.answers, employeeTone: next });
      useDraftStore.setState((s) => {
        const d = s.drafts[draft.id];
        if (!d) return s;
        return {
          drafts: {
            ...s.drafts,
            [draft.id]: {
              ...d,
              context: { ...d.context, employeeTone: next as EmployeeTone },
              updatedAt: Date.now(),
            },
          },
        };
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
          aria-label={`Tone: ${currentMeta?.label ?? current}`}
          title={`Tone: ${currentMeta?.label ?? current}`}
        >
          <Mic2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-1">
        <div role="radiogroup" aria-label="Letter tone">
          {options.map((o) => {
            const active = o.value === current;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTone(o.value)}
                className={
                  "w-full text-left flex items-start gap-2 p-2 rounded-md transition-colors " +
                  (active
                    ? "bg-[var(--ds-line-2)]"
                    : "hover:bg-[var(--ds-line-2)]")
                }
              >
                <span className="mt-0.5 shrink-0 size-4 inline-grid place-items-center">
                  {active ? (
                    <Check className="size-3.5 text-[var(--ds-ink)]" />
                  ) : (
                    <span className="size-3 rounded-full border border-[var(--ds-line)]" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-[var(--ds-ink)]">{o.label}</span>
                  <span className="block text-[11px] text-[var(--ds-muted)] leading-relaxed">
                    {o.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {isEmployee && (
          <>
            <div className="h-px bg-[var(--ds-line-2)] my-1" />
            <button
              type="button"
              role="switch"
              aria-checked={wpOn}
              onClick={() => setWithoutPrejudice(draft.id, !wpOn)}
              className="w-full text-left flex items-start gap-2 p-2 rounded-md hover:bg-[var(--ds-line-2)] transition-colors"
              title="When ON the letter carries a 'Without Prejudice and Subject to Contract' marker (s.111A ERA 1996, with caveats). Send only as a discrete settlement communication."
            >
              <span className="mt-0.5 shrink-0">
                <span
                  className={
                    "inline-flex items-center w-7 h-4 rounded-full transition-colors " +
                    (wpOn ? "bg-[var(--ds-ink)]" : "bg-[var(--ds-line)]")
                  }
                >
                  <span
                    className={
                      "size-3 rounded-full bg-white shadow transition-transform " +
                      (wpOn ? "translate-x-3.5" : "translate-x-0.5")
                    }
                  />
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-[var(--ds-ink)]">
                  Without Prejudice
                </span>
                <span className="block text-[11px] text-[var(--ds-muted)] leading-relaxed">
                  Marks the letter "Without Prejudice and Subject to Contract" —
                  settlement-position language is permissible.
                </span>
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
