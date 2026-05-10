import type { Draft, EmployeeTone, Tone } from "@/lib/letters/types";
import { Box, Button, Flex, Popover, RadioGroup, Text } from "@radix-ui/themes";
import { useDraftStore } from "@/lib/store";
import { Mic2 } from "lucide-react";

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
 */
export function ToneOverride({ draft }: { draft: Draft }) {
  const updateAnswers = useDraftStore((s) => s.updateAnswers);

  const setTone = (next: Tone | EmployeeTone) => {
    if (draft.mode === "employer") {
      const updatedAnswers = { ...draft.answers, tone: next };
      updateAnswers(draft.id, updatedAnswers);
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
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="ghost" size="1" color="gray">
          <Mic2 className="size-3.5" />
          Tone: <Text weight="medium" className="capitalize ml-1">{currentMeta?.label ?? current}</Text>
        </Button>
      </Popover.Trigger>
      <Popover.Content align="start" width="288px">
        <Text size="1" weight="medium" as="div">Letter tone</Text>
        <Text size="1" color="gray" mb="2" as="p" className="leading-relaxed">
          Changes apply to the next "Regenerate all" or section regenerate.
        </Text>
        <RadioGroup.Root value={current} onValueChange={(v) => setTone(v as Tone | EmployeeTone)}>
          <Flex direction="column" gap="1">
            {options.map((o) => (
              <Flex
                asChild
                align="start"
                gap="2"
                p="2"
                className="cursor-pointer hover:bg-[var(--gray-3)]"
                style={{
                  borderRadius: "var(--radius-2)",
                  background: current === o.value ? "var(--accent-3)" : undefined,
                }}
                key={o.value}
              >
                <label htmlFor={`tone-${o.value}`}>
                  <RadioGroup.Item id={`tone-${o.value}`} value={o.value} mt="1" />
                  <Box>
                    <Text size="1" weight="medium" as="div">{o.label}</Text>
                    <Text size="1" color="gray" as="div" className="leading-relaxed">{o.hint}</Text>
                  </Box>
                </label>
              </Flex>
            ))}
          </Flex>
        </RadioGroup.Root>
      </Popover.Content>
    </Popover.Root>
  );
}
