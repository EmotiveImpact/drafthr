import { ArrowRight, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { CustomTemplate } from "@/lib/letters/types";

/**
 * Single card for a user-saved custom template. Mirrors the dimensions
 * of the built-in TemplateCard so both tabs share grid rhythm.
 */
export function CustomTemplateCard({
  template,
  onStart,
  onRename,
  onDelete,
}: {
  template: CustomTemplate;
  onStart: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const meta = getLetterMeta(template.baseLetterType);
  const populatedSections = Object.keys(template.sectionHtml).length;

  return (
    <article className="group relative flex flex-col rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-subtle)] hover:shadow-sm transition overflow-hidden">
      {/* Top row: base-letter label + jurisdiction + actions */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-body)]">
          {meta.shortTitle}
        </span>
        <div className="flex items-center gap-1">
          {template.jurisdiction && (
            <span className="text-[10px] text-[var(--ds-muted)] font-medium">
              {template.jurisdiction}
            </span>
          )}
          <span className="text-[10px] text-[var(--ds-muted)] font-medium capitalize">
            · {template.mode}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-4 flex-1 flex flex-col">
        <h3 className="text-[15px] font-semibold text-[var(--ds-ink)] m-0 leading-tight">
          {template.name}
        </h3>
        {template.description && (
          <p className="text-[12.5px] text-[var(--ds-body)] mt-1.5 leading-relaxed m-0 line-clamp-3">
            {template.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-3 text-[10.5px] text-[var(--ds-muted)] flex-wrap">
          <span>
            {populatedSections} section{populatedSections === 1 ? "" : "s"} pre-filled
          </span>
          <span>·</span>
          <span title={new Date(template.updatedAt).toLocaleString()}>
            updated {timeAgo(template.updatedAt)}
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-1 mt-auto">
        <Button
          size="sm"
          onClick={onStart}
          className="flex-1 text-[12px]"
          title="Start a new draft pre-filled from this template"
        >
          <Sparkles className="size-3" />
          Start drafting
          <ArrowRight className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRename}
          className="size-8 p-0"
          aria-label="Rename template"
          title="Rename"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="size-8 p-0 text-[var(--ds-red-fg)]"
          aria-label="Delete template"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}

/* Local timeAgo — kept inline to avoid pulling a util into a UI file. */
function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
