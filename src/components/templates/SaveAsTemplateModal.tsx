import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, SectionId } from "@/lib/letters/types";

/**
 * "Save as template" modal — captures the current draft's per-section
 * html (keyed by canonical SectionId) + answers as a reusable
 * CustomTemplate stored at workspace level.
 */
export function SaveAsTemplateModal({
  draft,
  open,
  onOpenChange,
}: {
  draft: Draft;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const createCustomTemplate = useDraftStore((s) => s.createCustomTemplate);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const meta = getLetterMeta(draft.letterType);

  // Count sections with non-empty html so the user knows what's being captured.
  const populatedCount = useMemo(
    () => draft.sections.filter((s) => s.html.trim().length > 0).length,
    [draft.sections]
  );

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Build sectionHtml keyed by canonical SectionId (not per-draft id) so a
    // new draft spawned from this template can match sections by sectionId.
    const sectionHtml: Partial<Record<SectionId, string>> = {};
    for (const sec of draft.sections) {
      if (sec.html.trim().length === 0) continue;
      sectionHtml[sec.sectionId] = sec.html;
    }
    createCustomTemplate({
      name: trimmed,
      description: description.trim() || undefined,
      baseLetterType: draft.letterType,
      mode: draft.mode,
      jurisdiction: draft.context.jurisdiction,
      sectionHtml,
      answers: draft.answers,
    });
    toast.success(`Saved "${trimmed}" to My Templates`);
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Reuse this letter's section text across future drafts. Stored
            in your workspace under <span className="font-medium">My Templates</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. "Acme settlement language"`}
              autoFocus
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-desc">Description (optional)</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, when to use it…"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Capture summary — gives the user a sense of what gets saved. */}
          <div className="text-[12px] text-[var(--ds-muted)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-2">
            <div>
              Base: <span className="text-[var(--ds-ink)] font-medium">{meta.shortTitle}</span>
              {" · "}
              <span className="capitalize">{draft.mode}</span>
              {" · "}
              {draft.context.jurisdiction}
            </div>
            <div className="mt-0.5">
              Capturing{" "}
              <span className="text-[var(--ds-ink)] font-medium">
                {populatedCount} of {draft.sections.length}
              </span>{" "}
              sections with content.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || populatedCount === 0}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
