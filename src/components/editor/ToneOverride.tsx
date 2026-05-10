import type { Draft, EmployeeTone, Tone } from "@/lib/letters/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDraftStore } from "@/lib/store";
import { Mic2 } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPLOYER_TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "warm", label: "Warm", hint: "Personable but professional. Use for offers, promotions." },
  { value: "neutral", label: "Neutral", hint: "Polite, factual, no editorialising." },
  { value: "formal", label: "Formal", hint: "Formal business register. No contractions. Default." },
  { value: "firm", label: "Firm", hint: "Firm and unambiguous. No softening hedges." },
];

const EMPLOYEE_TONES: { value: EmployeeTone; label: string; hint: string }[] = [
  { value: "conciliatory", label: "Conciliatory", hint: "Cooperative, relationship-preserving. First-time grievance, accommodation ask." },
  { value: "assertive", label: "Assertive", hint: "Formal, clear, expectant. Default for grievances and pay disputes." },
  { value: "forensic", label: "Forensic", hint: "Dispassionate, dated, evidential. Whistleblowing, appeals." },
  { value: "tribunal_ready", label: "Tribunal-ready", hint: "Strictly procedural and declaratory. ACAS EC, ET1 cover." },
];

/**
 * Per-letter tone override. Lives in the editor action row so the user can
 * adjust tone for THIS letter without changing their profile defaults.
 *
 * Rebuilds the master system prompt on next regeneration — sections written
 * before the change keep their tone unless the user clicks "Regenerate all".
 */
export function ToneOverride({ draft }: { draft: Draft }) {
  const updateAnswers = useDraftStore((s) => s.updateAnswers);

  const setTone = (next: Tone | EmployeeTone) => {
    if (draft.mode === "employer") {
      // We piggyback on the wizard's tone field stored in answers + context.
      const updatedAnswers = { ...draft.answers, tone: next };
      updateAnswers(draft.id, updatedAnswers);
      // Mutate context tone in-place by re-saving via the store's existing pathway.
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
      const updatedAnswers = { ...draft.answers, employeeTone: next };
      updateAnswers(draft.id, updatedAnswers);
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

  const current =
    draft.mode === "employer"
      ? draft.context.tone
      : draft.context.employeeTone ?? "assertive";
  const options = draft.mode === "employer" ? EMPLOYER_TONES : EMPLOYEE_TONES;
  const currentMeta = options.find((o) => o.value === current);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs">
          <Mic2 className="size-3.5 mr-1.5" />
          Tone: <span className="ml-1 font-medium capitalize">{currentMeta?.label ?? current}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <Label className="text-xs font-medium">Letter tone</Label>
        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
          Changes apply to the next "Regenerate all" or section regenerate.
        </p>
        <RadioGroup
          value={current}
          onValueChange={(v) => setTone(v as Tone | EmployeeTone)}
          className="space-y-1.5"
        >
          {options.map((o) => (
            <label
              key={o.value}
              htmlFor={`tone-${o.value}`}
              className={cn(
                "flex items-start gap-2 rounded-sm p-2 cursor-pointer hover:bg-accent/40",
                current === o.value && "bg-accent/60"
              )}
            >
              <RadioGroupItem id={`tone-${o.value}`} value={o.value} className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-xs font-medium">{o.label}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">{o.hint}</div>
              </div>
            </label>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
