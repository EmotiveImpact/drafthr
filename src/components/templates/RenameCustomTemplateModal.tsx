import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useDraftStore } from "@/lib/store";
import type { CustomTemplate } from "@/lib/letters/types";

/**
 * Rename + edit-description modal for a saved custom template.
 */
export function RenameCustomTemplateModal({
  template,
  open,
  onOpenChange,
}: {
  template: CustomTemplate | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const updateCustomTemplate = useDraftStore((s) => s.updateCustomTemplate);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  // Re-sync local state when the target template changes.
  useEffect(() => {
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
  }, [template?.id, template?.name, template?.description]);

  if (!template) return null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateCustomTemplate(template.id, {
      name: trimmed,
      description: description.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rename-tpl-name">Name</Label>
            <Input
              id="rename-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rename-tpl-desc">Description</Label>
            <Textarea
              id="rename-tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
