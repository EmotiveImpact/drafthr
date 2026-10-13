import { useEffect, useState } from "react";
import type { MatterColor, MatterType, Mode } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MATTER_TINT, MATTER_TYPES, MATTER_TYPE_LABEL } from "./model";
import { DatePicker } from "@/components/wizard/DatePicker";

export const SELECT_CLASS =
  "h-10 w-full min-w-0 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[14.5px] text-[var(--ds-ink)] outline-none transition-[border-color,box-shadow] duration-[120ms] hover:border-[var(--ds-line-hover)] focus-visible:border-[var(--ds-ink)]";

export type NewMatterInput = {
  name: string;
  color: MatterColor;
  type?: MatterType;
  description?: string;
  primaryName?: string;
  deadlineISO?: string;
  deadlineLabel?: string;
};

/** "New matter": name, person, description, key deadline, type and colour. */
export function NewMatterDialog({
  open,
  onOpenChange,
  mode,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
  onCreate: (input: NewMatterInput) => void;
}) {
  const [name, setName] = useState("");
  const [primaryName, setPrimaryName] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineISO, setDeadline] = useState("");
  const [deadlineLabel, setDeadlineLabel] = useState("");
  const [type, setType] = useState<MatterType | "">("");
  const [color, setColor] = useState<MatterColor>("blue");

  // Fresh fields each time it opens.
  useEffect(() => {
    if (open) {
      setName("");
      setPrimaryName("");
      setDescription("");
      setDeadline("");
      setDeadlineLabel("");
      setType("");
      setColor("blue");
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      color,
      type: type || undefined,
      description: description.trim() || undefined,
      primaryName: primaryName.trim() || undefined,
      deadlineISO: deadlineISO || undefined,
      deadlineLabel: deadlineLabel.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New matter</DialogTitle>
          <DialogDescription>
            {mode === "employer"
              ? "Bundle related letters about a single person, hiring round, or HR workstream."
              : "Bundle related letters about an employer, claim, or grievance you're pursuing."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="matter-name">Matter name *</Label>
            <Input
              id="matter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "employer" ? "e.g. Jane Smith, performance" : "e.g. Acme Ltd, constructive dismissal"}
              autoFocus
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="matter-primary">{mode === "employer" ? "Person / role" : "Employer"} (optional)</Label>
              <Input
                id="matter-primary"
                value={primaryName}
                onChange={(e) => setPrimaryName(e.target.value)}
                placeholder={mode === "employer" ? "Jane Smith" : "Acme Holdings Limited"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-type">Type (optional)</Label>
              <select id="matter-type" value={type} onChange={(e) => setType(e.target.value as MatterType | "")} className={SELECT_CLASS}>
                <option value="">Not set</option>
                {MATTER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MATTER_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="matter-desc">Short description (optional)</Label>
            <Textarea
              id="matter-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A line or two of context. Visible only to you."
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label id="matter-deadline-label-text" htmlFor="matter-deadline">Key deadline (optional)</Label>
              <DatePicker id="matter-deadline" labelledBy="matter-deadline-label-text" value={deadlineISO} onChange={(v) => setDeadline(v ?? "")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matter-deadline-label">Deadline label</Label>
              <Input
                id="matter-deadline-label"
                value={deadlineLabel}
                onChange={(e) => setDeadlineLabel(e.target.value)}
                placeholder="e.g. ACAS EC ends"
                disabled={!deadlineISO}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <div className="flex items-center gap-2">
              {(["blue", "green", "amber", "red", "violet", "slate"] as const satisfies readonly MatterColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  className={cn(
                    "grid size-8 place-items-center rounded-full border outline-none transition-shadow duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
                    color === c ? "shadow-[0_0_0_2px_var(--ds-surface),0_0_0_4px_var(--ds-ink)]" : "hover:shadow-[0_0_0_1px_var(--ds-line-strong)]"
                  )}
                  style={{ background: MATTER_TINT[c][0], borderColor: MATTER_TINT[c][1] }}
                >
                  <span className="size-2 rounded-full" style={{ background: MATTER_TINT[c][1] }} />
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create matter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
