import { useEffect, useMemo, useRef, useState } from "react";
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
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";
import { saveDraftAsTemplate } from "@/lib/save-draft-template";
import { uid } from "@/lib/utils";

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
  const [saving, setSaving] = useState(false);
  const pendingId = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    pendingId.current = null; setSaving(false);
    return () => { generation.current += 1; };
  }, [draft.id, open]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const meta = getLetterMeta(draft.letterType);

  // Count sections with non-empty html so the user knows what's being captured.
  const populatedCount = useMemo(
    () => draft.sections.filter((s) => s.html.trim().length > 0).length,
    [draft.sections]
  );

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    pendingId.current ??= uid("tpl");
    const attempt = generation.current;
    setSaving(true);
    try {
      await saveDraftAsTemplate({ draft, templateId: pendingId.current, name: trimmed, description,
        isCurrent: () => generation.current === attempt });
      if (generation.current !== attempt) return;
      toast.success(`Saved "${trimmed}" to My Templates`);
      setName(""); setDescription(""); pendingId.current = null;
      onOpenChange(false);
    } catch (error) {
      if (generation.current === attempt) toast.error(error instanceof Error ? error.message : "Template could not be saved.");
    } finally { if (generation.current === attempt) setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}>
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
              disabled={saving}
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
              disabled={saving}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim() || populatedCount === 0}>
            {saving ? "Saving template…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
