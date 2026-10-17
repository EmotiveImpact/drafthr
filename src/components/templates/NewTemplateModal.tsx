import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Field, KitDialogContent, KitDialogFooter, Segmented } from "@/components/wizard/kit";

/**
 * "Create a template": name, description, base letter type and the
 * jurisdiction default, then a template-authoring letter opens in the editor
 * (its top bar shows Save template).
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
  const createTemplateSourceDraft = useDraftStore((s) => s.createTemplateSourceDraft);
  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseLetterType, setBaseLetterType] = useState<LetterTypeId | "">("");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("UK");

  const canSubmit = name.trim().length > 0 && baseLetterType !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    const id = createTemplateSourceDraft(baseLetterType as LetterTypeId, { jurisdiction }, mode, {
      templateName: name.trim(),
      templateDescription: description.trim() || undefined,
    });
    onOpenChange(false);
    setName("");
    setDescription("");
    setBaseLetterType("");
    nav(`/editor/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KitDialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create a template</DialogTitle>
          <DialogDescription>
            Write a reusable letter from scratch. You edit the sections in the editor and press Save template when you
            are done.
          </DialogDescription>
        </DialogHeader>

        <form
          id="new-template-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Field label="Name" htmlFor="new-tpl-name" required>
            <Input
              id="new-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard probation outcome"
              autoFocus
              maxLength={120}
            />
          </Field>
          <Field label="Description" htmlFor="new-tpl-desc" aside="Optional">
            <Textarea
              id="new-tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, and when to use it"
              rows={3}
              maxLength={500}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Base letter type" htmlFor="new-tpl-base" required>
              <Select value={baseLetterType || undefined} onValueChange={(v) => setBaseLetterType(v as LetterTypeId)}>
                <SelectTrigger id="new-tpl-base" className="w-full">
                  <SelectValue placeholder="Pick a letter type" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.shortTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Jurisdiction default">
              <Segmented
                label="Jurisdiction default"
                value={jurisdiction}
                onChange={setJurisdiction}
                options={[
                  { value: "UK", label: "UK" },
                  { value: "US", label: "US" },
                ]}
              />
            </Field>
          </div>
        </form>

        <KitDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-template-form" disabled={!canSubmit}>
            Create and edit
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}
