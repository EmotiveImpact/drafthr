import { ArrowRight, MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { CustomTemplate } from "@/lib/letters/types";
import { PaperThumb, Pill } from "@/components/finalize/Plan";
import { tintForCategory, tintStyle } from "./tints";

/**
 * Single 6B card for a user-saved custom template. Mirrors the built-in
 * template cards so both tabs share grid rhythm. Rename and delete live in
 * the "..." menu on the card.
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
  const tint = tintForCategory(meta.category);

  return (
    <article
      style={tintStyle(tint)}
      className="group/card relative flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] transition duration-200 hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)]"
    >
      <div className="relative mx-1.5 mt-1.5">
        <PaperThumb tint={tint} height={120} />
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Template actions"
                className="grid size-7 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-surface)] text-[var(--ds-body)] shadow-[var(--ds-shadow-s)] hover:text-[var(--ds-ink)]"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onRename} aria-label="Rename template">
                <Pencil className="size-3.5" />
                Rename or describe
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                aria-label="Delete template"
                className="text-[var(--ds-red-fg)] focus:text-[var(--ds-red-fg)]"
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="m-0 truncate text-[14px] font-medium text-[var(--ds-ink)]" title={template.name}>
          {template.name}
        </h3>
        {template.description && (
          <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
            {template.description}
          </p>
        )}

        <p className="m-0 mt-2.5 text-[12px] text-[var(--ds-muted)]">
          {populatedSections} section{populatedSections === 1 ? "" : "s"} pre-filled,{" "}
          <span title={new Date(template.updatedAt).toLocaleString()}>
            updated {timeAgo(template.updatedAt)}
          </span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Pill tone="tint">{meta.shortTitle}</Pill>
          {template.jurisdiction && <Pill>{template.jurisdiction}</Pill>}
          <Pill className="capitalize">{template.mode}</Pill>
        </div>

        <div className="mt-auto pt-4">
          <Button
            size="sm"
            onClick={onStart}
            className="w-full text-[12.5px]"
            title="Start a new draft pre-filled from this template"
          >
            <Sparkles className="size-3.5" />
            Start drafting
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
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
