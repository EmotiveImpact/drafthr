import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";
import type { CustomTemplate, Mode } from "@/lib/letters/types";
import { ConfirmDialog } from "@/components/wizard/kit";
import { CustomTemplateCard, NewTemplateTile } from "./CustomTemplateCard";
import { RenameCustomTemplateModal } from "./RenameCustomTemplateModal";
import { NewTemplateModal } from "./NewTemplateModal";
import { PaperArt } from "./PaperArt";

/**
 * The firm's own templates for one mode, newest first. `variant="all"` is
 * the section on the All tab (no Start drafting button; the name starts a
 * letter), `variant="mine"` is the Your templates tab. Rename and Delete sit
 * in each card's "..." menu; Delete asks first in a kit dialog.
 *
 * `onCreate` lets the page own the Create a template dialog.
 */
export function MyTemplatesGrid({
  mode,
  onCreate,
  variant = "mine",
  limit,
}: {
  mode: Mode;
  onCreate?: () => void;
  variant?: "all" | "mine";
  /** Cap the cards shown (the All tab shows a few). */
  limit?: number;
}) {
  const nav = useNavigate();
  const customTemplates = useDraftStore((s) => s.customTemplates);
  const createDraftFromCustomTemplate = useDraftStore((s) => s.createDraftFromCustomTemplate);
  const deleteCustomTemplate = useDraftStore((s) => s.deleteCustomTemplate);

  const [renaming, setRenaming] = useState<CustomTemplate | null>(null);
  const [deleting, setDeleting] = useState<CustomTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const create = onCreate ?? (() => setCreating(true));

  const templates = useMemo(
    () =>
      Object.values(customTemplates)
        .filter((t) => t.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [customTemplates, mode]
  );

  const handleStart = (id: string) => {
    const newId = createDraftFromCustomTemplate(id, mode);
    if (newId) nav(`/editor/${newId}`);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteCustomTemplate(deleting.id);
    toast.success(`Deleted "${deleting.name}"`);
    setDeleting(null);
  };

  const ownModal = !onCreate && <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />;

  if (templates.length === 0 && variant === "mine") {
    return (
      <>
        <div className="flex flex-col items-center rounded-[16px] border border-dashed border-[var(--ds-line-strong)] px-6 py-9 text-center">
          <PaperArt tint="sky" height={120} className="w-[220px]" />
          <h3 className="ds-heading m-0 mt-5 text-[22px]">No firm templates yet</h3>
          <p className="m-0 mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-[var(--ds-muted)]">
            Create one from scratch, or use Save as template on any letter.
          </p>
          <Button className="mt-5" onClick={create}>
            <Plus className="size-4" />
            Create a template
          </Button>
        </div>
        {ownModal}
      </>
    );
  }

  const shown = limit ? templates.slice(0, limit) : templates;

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {shown.map((t) => (
          <CustomTemplateCard
            key={t.id}
            template={t}
            showStart={variant === "mine"}
            onStart={() => handleStart(t.id)}
            onRename={() => setRenaming(t)}
            onDelete={() => setDeleting(t)}
          />
        ))}
        <NewTemplateTile onClick={create} />
      </div>
      <RenameCustomTemplateModal
        template={renaming}
        open={renaming !== null}
        onOpenChange={(o) => {
          if (!o) setRenaming(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={deleting ? `Delete "${deleting.name}"?` : "Delete template?"}
        description="This can't be undone. Letters already started from it are not changed."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
      {ownModal}
    </>
  );
}
