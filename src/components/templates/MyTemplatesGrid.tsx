import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookmarkPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";
import type { CustomTemplate, Mode } from "@/lib/letters/types";
import { CustomTemplateCard } from "./CustomTemplateCard";
import { RenameCustomTemplateModal } from "./RenameCustomTemplateModal";
import { NewTemplateModal } from "./NewTemplateModal";

/**
 * Grid of the user's workspace-saved custom templates (6B cards), scoped to
 * a single mode. Empty state nudges the user toward creating one or saving
 * from an open draft.
 *
 * `onCreate` lets the page own the "Create a template" modal (the template
 * library header has the button); without it the grid opens its own.
 */
export function MyTemplatesGrid({ mode, onCreate }: { mode: Mode; onCreate?: () => void }) {
  const nav = useNavigate();
  const customTemplates = useDraftStore((s) => s.customTemplates);
  const createDraftFromCustomTemplate = useDraftStore(
    (s) => s.createDraftFromCustomTemplate
  );
  const deleteCustomTemplate = useDraftStore((s) => s.deleteCustomTemplate);

  const [renaming, setRenaming] = useState<CustomTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const create = onCreate ?? (() => setCreating(true));

  // Sort by most-recently-updated within the active mode.
  const templates = useMemo(() => {
    return Object.values(customTemplates)
      .filter((t) => t.mode === mode)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [customTemplates, mode]);

  const handleStart = (id: string) => {
    const newId = createDraftFromCustomTemplate(id, mode);
    if (newId) nav(`/editor/${newId}`);
  };

  const handleDelete = (tpl: CustomTemplate) => {
    const ok = window.confirm(`Delete "${tpl.name}"? This can't be undone.`);
    if (!ok) return;
    deleteCustomTemplate(tpl.id);
    toast.success(`Deleted "${tpl.name}"`);
  };

  const ownModal = !onCreate && (
    <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />
  );

  if (templates.length === 0) {
    return (
      <>
        <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-6 py-12 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]">
            <BookmarkPlus className="size-5" />
          </div>
          <h3 className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">
            No custom templates yet
          </h3>
          <p className="m-0 mb-4 mt-1 text-[12.5px] text-[var(--ds-muted)]">
            Build one from scratch, or use Save as template on an open letter.
          </p>
          <Button size="sm" onClick={create}>
            <Plus className="size-3.5" />
            New template
          </Button>
        </div>
        {ownModal}
      </>
    );
  }

  return (
    <>
      {!onCreate && (
        <div className="mb-3 flex items-center justify-end">
          <Button size="sm" onClick={create}>
            <Plus className="size-3.5" />
            New template
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <CustomTemplateCard
            key={t.id}
            template={t}
            onStart={() => handleStart(t.id)}
            onRename={() => setRenaming(t)}
            onDelete={() => handleDelete(t)}
          />
        ))}
      </div>
      <RenameCustomTemplateModal
        template={renaming}
        open={renaming !== null}
        onOpenChange={(o) => {
          if (!o) setRenaming(null);
        }}
      />
      {ownModal}
    </>
  );
}
