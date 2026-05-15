import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { useDraftStore } from "@/lib/store";
import type { CustomTemplate, Mode } from "@/lib/letters/types";
import { CustomTemplateCard } from "./CustomTemplateCard";
import { RenameCustomTemplateModal } from "./RenameCustomTemplateModal";

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
      <div className="rounded-lg border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface)] p-10 text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)]">
          <BookmarkPlus className="size-5" />
        </div>
        <h3 className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
          No custom templates yet
        </h3>
        <p className="text-[12.5px] text-[var(--ds-muted)] mt-1 m-0">
          Save one from an open draft (File → Save as template) to reuse it
          here.
        </p>
      </div>
    );
  }

  return (
    <>
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
    </>
  );
}
