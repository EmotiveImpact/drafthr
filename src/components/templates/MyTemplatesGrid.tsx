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
 * Grid of the user's workspace-saved custom templates, scoped to a
 * single mode. Empty-state nudges the user toward saving from an open
 * draft.
 */
export function MyTemplatesGrid({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const customTemplates = useDraftStore((s) => s.customTemplates);
  const createDraftFromCustomTemplate = useDraftStore(
    (s) => s.createDraftFromCustomTemplate
  );
  const deleteCustomTemplate = useDraftStore((s) => s.deleteCustomTemplate);

  const [renaming, setRenaming] = useState<CustomTemplate | null>(null);
  const [creating, setCreating] = useState(false);

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

  if (templates.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-10 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)]">
            <BookmarkPlus className="size-5" />
          </div>
          <h3 className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
            No custom templates yet
          </h3>
          <p className="text-[12.5px] text-[var(--ds-muted)] mt-1 mb-4 m-0">
            Build one from scratch with <span className="font-medium">New template</span>,
            or save from an open draft (File → Save as template).
          </p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            New template
          </Button>
        </div>
        <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          New template
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
      <NewTemplateModal open={creating} onOpenChange={setCreating} mode={mode} />
    </>
  );
}
