import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDraftStore } from "@/lib/store";
import type { CustomTemplate } from "@/lib/letters/types";
import { Field, KitDialogContent, KitDialogFooter } from "@/components/wizard/kit";

/** Rename a firm template and edit its description. */
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
    toast.success("Template saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KitDialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Change how this template shows in Your templates.</DialogDescription>
        </DialogHeader>
        <form
          id="rename-template-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Field label="Name" htmlFor="rename-tpl-name" required>
            <Input
              id="rename-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </Field>
          <Field label="Description" htmlFor="rename-tpl-desc" aside="Optional">
            <Textarea
              id="rename-tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>
        </form>
        <KitDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rename-template-form" disabled={!name.trim()}>
            Save changes
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}
