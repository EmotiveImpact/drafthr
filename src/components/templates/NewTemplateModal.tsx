import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDraftStore } from "@/lib/store";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import type { Jurisdiction, LetterTypeId, Mode } from "@/lib/letters/types";

/**
 * "New template" — captures name + description + base letter type +
 * jurisdiction default, then spawns a template-authoring draft and
 * navigates the user straight into the editor.
 */
export function NewTemplateModal({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
}) {
  const nav = useNavigate();
  const createTemplateSourceDraft = useDraftStore(
    (s) => s.createTemplateSourceDraft
  );
  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseLetterType, setBaseLetterType] = useState<LetterTypeId | "">("");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("UK");

  const canSubmit = name.trim().length > 0 && baseLetterType !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    const id = createTemplateSourceDraft(
      baseLetterType as LetterTypeId,
      { jurisdiction },
      mode,
      {
        templateName: name.trim(),
        templateDescription: description.trim() || undefined,
      }
    );
    onOpenChange(false);
    setName("");
    setDescription("");
    setBaseLetterType("");
    nav(`/editor/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Author a reusable letter from scratch. You'll edit the
            sections in the editor and click Save template when done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="new-tpl-name">Name *</Label>
            <Input
              id="new-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. "Standard probation outcome"`}
              autoFocus
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-tpl-desc">Description</Label>
            <Textarea
              id="new-tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, when to use it…"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-tpl-base">Base letter type *</Label>
              <Select
                value={baseLetterType || undefined}
                onValueChange={(v) => setBaseLetterType(v as LetterTypeId)}
              >
                <SelectTrigger id="new-tpl-base">
                  <SelectValue placeholder="Pick a base" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.shortTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-tpl-jur">Jurisdiction default</Label>
              <div
                role="tablist"
                aria-label="Jurisdiction default"
                className="inline-flex h-9 gap-0.5 rounded-[var(--ds-r-m)] bg-[var(--ds-chip)] p-[3px]"
              >
                {(["UK", "US"] as const).map((j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setJurisdiction(j)}
                    className={
                      "flex-1 rounded-[7px] px-3 text-[12.5px] font-medium transition " +
                      (jurisdiction === j
                        ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]"
                        : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]")
                    }
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Create &amp; edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
