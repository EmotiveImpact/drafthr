import { useState } from "react";
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
import {
  MATTER_COLOR_CLASSES,
  suggestColorForGroup,
} from "@/lib/matters";
import type { AutoGroup } from "@/lib/matters";
import type { Mode, MatterColor } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Dialog that promotes an auto-group (Home's "Make this a Matter →") into
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

  // Reset state when a new group is passed in.
  // (Controlled by parent; we don't open ourselves.)
  // useEffect would be cleaner but the dialog only renders when group is set.
  if (group && name === "" && open) {
    queueMicrotask(() => {
      setName(suggestDefaultName(group));
      setColor(suggestColorForGroup(group.drafts));
    });
  }

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
          <DialogTitle>Make this a Matter</DialogTitle>
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
            <Label htmlFor="matter-name" className="text-[12px] font-medium mb-1.5 block">
              Matter name
            </Label>
            <Input
              id="matter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "employer"
                  ? "James O'Connor — PIP 2026 Q2"
                  : "Acme discrimination 2026"
              }
              autoFocus
              required
            />
            {group?.primaryName && (
              <p className="text-[11px] text-[var(--ds-muted)] mt-1">
                {mode === "employer" ? "Person" : "Employer"}: {group.primaryName}
                {group.primaryContext && ` · ${group.primaryContext}`}
              </p>
            )}
          </div>

          <div>
            <Label className="text-[12px] font-medium mb-1.5 block">Colour</Label>
            <div className="flex gap-1.5">
              {(["red", "amber", "blue", "violet", "green", "slate"] as MatterColor[]).map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Colour ${c}`}
                    className={cn(
                      "size-7 rounded-md transition ring-offset-1",
                      MATTER_COLOR_CLASSES[c].swatch,
                      color === c
                        ? "ring-2 ring-[var(--ds-ink)] scale-110"
                        : "ring-1 ring-black/10"
                    )}
                  />
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="matter-deadline" className="text-[12px] font-medium mb-1.5 block">
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
              <Label htmlFor="matter-deadline-label" className="text-[12px] font-medium mb-1.5 block">
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
