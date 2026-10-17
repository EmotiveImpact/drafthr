import type { Draft, EmployeeTone, Tone } from "@/lib/letters/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { Mic2, Check, ChevronDown } from "lucide-react";

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

/** Apply a tone to a letter (employer tone or employee tone). */
function applyTone(draft: Draft, next: Tone | EmployeeTone) {
  const st = useDraftStore.getState();
  const d0 = st.drafts[draft.id] ?? draft;
  if (draft.mode === "employer") {
    st.updateAnswers(draft.id, { ...d0.answers, tone: next });
  } else {
    st.updateAnswers(draft.id, { ...d0.answers, employeeTone: next });
  }
  useDraftStore.setState((s) => {
    const d = s.drafts[draft.id];
    if (!d) return s;
    return {
      drafts: {
        ...s.drafts,
        [draft.id]: {
          ...d,
          context:
            draft.mode === "employer"
              ? { ...d.context, tone: next as Tone }
              : { ...d.context, employeeTone: next as EmployeeTone },
          updatedAt: Date.now(),
        },
      },
    };
  });
}

/**
 * The tones a letter can take, the current one, and a setter. Plain
 * function (no hooks) so menus elsewhere (the phone overflow menu) can list
 * the same choices.
 */
export function TONE_OPTIONS(draft: Draft): {
  options: { value: Tone | EmployeeTone; label: string; hint: string }[];
  current: Tone | EmployeeTone;
  currentLabel: string;
  setTone: (next: Tone | EmployeeTone) => void;
} {
  const isEmployee = draft.mode === "employee";
  const current: Tone | EmployeeTone = isEmployee ? draft.context.employeeTone ?? "assertive" : draft.context.tone;
  const options = isEmployee ? EMPLOYEE_TONES : EMPLOYER_TONES;
  const currentLabel = options.find((o) => o.value === current)?.label ?? String(current ?? "");
  return { options, current, currentLabel, setTone: (next) => applyTone(draft, next) };
}

/**
 * Unified Tone popover. Lists every tone option as a row, with the
 * Without-Prejudice toggle as a final row on employee-mode drafts,
 * one continuous menu, no sub-sections.
 */
export function DocumentPopover({
  draft,
  variant = "icon",
  disabled = false,
}: {
  draft: Draft;
  /** "icon" (default): a square icon button. "ribbon": a labelled
   * "Tone: Formal" control. "tools": the letter workspace tools row,
   * "Tone Firm" with a chevron (mock f1). */
  variant?: "icon" | "ribbon" | "tools";
  /** Greyed and not clickable (the letter is locked). */
  disabled?: boolean;
}) {
  const setWithoutPrejudice = useDraftStore((s) => s.setWithoutPrejudice);

  const isEmployee = draft.mode === "employee";
  const wpOn = Boolean(draft.context.withoutPrejudice);
  const { options, current, currentLabel, setTone } = TONE_OPTIONS(draft);
  const currentMeta = { label: currentLabel };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        {variant === "tools" ? (
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[13.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)] disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            aria-label={`Tone: ${currentMeta.label}`}
            title={disabled ? "The letter is locked" : "Letter tone"}
          >
            <span className={disabled ? "text-[var(--ds-faint)]" : "text-[var(--ds-subtle)]"}>Tone</span>
            <span>{currentMeta.label}</span>
            <ChevronDown className={"size-[14px] " + (disabled ? "text-[var(--ds-faint)]" : "text-[var(--ds-subtle)]")} />
          </button>
        ) : variant === "ribbon" ? (
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--ds-r-s)] px-2 text-[13px] text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] data-[state=open]:bg-[var(--ds-surface-2)]"
            aria-label={`Tone: ${currentMeta.label}`}
            title="Letter tone"
          >
            <Mic2 className="size-3.5 text-[var(--ds-muted)]" />
            <span className="text-[var(--ds-muted)]">Tone:</span>
            <span className="text-[var(--ds-ink)]">{currentMeta.label}</span>
            <ChevronDown className="size-3 text-[var(--ds-muted)]" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] transition"
            aria-label={`Tone: ${currentMeta.label}`}
            title={`Tone: ${currentMeta.label}`}
          >
            <Mic2 className="size-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-1 duration-[160ms] data-[state=closed]:duration-[100ms]">
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
                    (wpOn ? "bg-[var(--ds-accent)]" : "bg-[var(--ds-line-strong)]")
                  }
                >
                  <span
                    className={
                      "size-3 rounded-full bg-[var(--ds-surface)] shadow transition-transform " +
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
                  Marks the letter "Without Prejudice and Subject to Contract".
                  Settlement-position language is permissible.
                </span>
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
