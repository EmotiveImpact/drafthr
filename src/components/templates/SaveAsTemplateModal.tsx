import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, SectionId } from "@/lib/letters/types";
import { Field, KitDialogContent, KitDialogFooter } from "@/components/wizard/kit";

/**
 * "Save as template": captures the letter's per-section wording (keyed by
 * canonical SectionId) and its answers as a firm template, saved in the
 * workspace under Your templates.
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

  // Count sections with content so the user knows what's being captured.
  const populatedCount = useMemo(
    () => draft.sections.filter((s) => s.html.trim().length > 0).length,
    [draft.sections]
  );

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || populatedCount === 0) return;
    // Keyed by canonical SectionId (not per-draft id) so a new letter
    // started from this template can match sections by sectionId.
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
    toast.success(`Saved "${trimmed}" to Your templates`, {
      description: "Find it under Templates, Your templates, to start a new letter from it.",
    });
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KitDialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Reuse this letter's wording for future letters. Saved in your workspace under Your templates.
          </DialogDescription>
        </DialogHeader>

        <form
          id="save-as-template-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Field label="Name" htmlFor="tpl-name" required>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Depot lateness warning"
              autoFocus
              maxLength={120}
            />
          </Field>
          <Field label="Description (optional)" htmlFor="tpl-desc">
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, and when to use it"
              rows={3}
              maxLength={500}
            />
          </Field>

          <div className="rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--ds-muted)]">
            <div>
              Base: <span className="font-medium text-[var(--ds-ink)]">{meta.shortTitle}</span>
              {" · "}
              {draft.mode === "employer" ? "HR" : "Employee"}
              {" · "}
              {draft.context.jurisdiction}
            </div>
            <div className="mt-0.5">
              Capturing{" "}
              <span className="font-medium text-[var(--ds-ink)]">
                {populatedCount} of {draft.sections.length}
              </span>{" "}
              sections with content.
            </div>
          </div>
        </form>

        <KitDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="save-as-template-form" disabled={!name.trim() || populatedCount === 0}>
            Save template
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}
