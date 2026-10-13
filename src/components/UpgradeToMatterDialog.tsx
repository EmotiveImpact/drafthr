import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDraftStore } from "@/lib/store";
import { suggestColorForGroup } from "@/lib/matters";
import { MATTER_TINT } from "@/components/matter/model";
import type { AutoGroup } from "@/lib/matters";
import type { Mode, MatterColor } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Dialog that promotes an auto-group (Home's "Make this a matter") into
 * a named Matter in one click. Pre-fills:
 *   - name = primaryName of the group ("Acme Holdings Ltd" → "Acme Holdings")
 *   - color = suggestion from suggestColorForGroup
 *   - primaryName / primaryContext = from the group
 *
 * On submit: creates the matter, bulk-assigns the group's drafts, navigates
 * to /matters/:newId.
 */
export function UpgradeToMatterDialog({
  group,
  mode,
  open,
  onOpenChange,
}: {
  group: AutoGroup | null;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nav = useNavigate();
  const upgrade = useDraftStore((s) => s.upgradeGroupToMatter);

  const [name, setName] = useState("");
  const [color, setColor] = useState<MatterColor>("blue");
  const [deadlineISO, setDeadlineISO] = useState<string>("");
  const [deadlineLabel, setDeadlineLabel] = useState<string>("");

  // Reset & pre-fill whenever the parent passes in a new group. Using
  // group.key as the dependency means switching from group A to group B
  // (with intermediate close) re-suggests fresh defaults rather than
  // carrying stale state.
  useEffect(() => {
    if (group && open) {
      setName(suggestDefaultName(group));
      setColor(suggestColorForGroup(group.drafts));
      setDeadlineISO("");
      setDeadlineLabel("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.key, open]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || !name.trim()) return;
    const id = upgrade({
      name: name.trim(),
      mode,
      color,
      primaryName: group.primaryName,
      primaryContext: group.primaryContext,
      deadlineISO: deadlineISO || undefined,
      deadlineLabel: deadlineLabel.trim() || undefined,
      draftIds: group.drafts.map((d) => d.id),
    });
    // Reset before close so re-open from a different group starts fresh.
    setName("");
    setDeadlineISO("");
    setDeadlineLabel("");
    onOpenChange(false);
    nav(`/matters/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make this a matter</DialogTitle>
          <DialogDescription>
            Bundle{" "}
            <strong className="text-[var(--ds-ink)]">
              {group?.drafts.length ?? 0} letter
              {(group?.drafts.length ?? 0) === 1 ? "" : "s"}
            </strong>{" "}
            into a named case. Give it a deadline so the countdown shows on the
            sidebar and review checklist.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="matter-name" className="mb-1.5 block">
              Matter name
            </Label>
            <Input
              id="matter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "employer"
                  ? "James O'Connor, PIP 2026 Q2"
                  : "Acme discrimination 2026"
              }
              autoFocus
              required
            />
            {group?.primaryName && (
              <p className="mt-1.5 text-[12.5px] text-[var(--ds-muted)]">
                {mode === "employer" ? "Person" : "Employer"}: {group.primaryName}
                {group.primaryContext && ` · ${group.primaryContext}`}
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block">Colour</Label>
            <div className="flex items-center gap-2">
              {(["blue", "green", "amber", "red", "violet", "slate"] as MatterColor[]).map((c) => (
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="matter-deadline" className="mb-1.5 block">
                Deadline (optional)
              </Label>
              <Input
                id="matter-deadline"
                type="date"
                value={deadlineISO}
                onChange={(e) => setDeadlineISO(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="matter-deadline-label" className="mb-1.5 block">
                Deadline label
              </Label>
              <Input
                id="matter-deadline-label"
                value={deadlineLabel}
                onChange={(e) => setDeadlineLabel(e.target.value)}
                placeholder="e.g. ACAS EC deadline"
                disabled={!deadlineISO}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create matter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Best-guess matter name from a group. Trims common corporate suffixes
 * so "Acme Holdings Limited" → "Acme Holdings".
 */
function suggestDefaultName(group: AutoGroup): string {
  const raw = group.primaryName ?? "";
  return raw
    .replace(/\s+(Limited|Ltd|Ltd\.|LLC|Inc\.?|Corp\.?|plc|PLC)$/i, "")
    .trim();
}
