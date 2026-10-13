import { MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LETTER_CATALOG } from "@/lib/letters/catalog";
import type { CustomTemplate } from "@/lib/letters/types";
import { timeAgoWords } from "@/components/wizard/kit";

/**
 * A firm template card (templates mock, "Your firm's templates"): white, a
 * hairline, 14px corners; the name with a "..." menu, the description and a
 * meta line built from real data only (base letter, jurisdiction, when it
 * was last updated). With `onStart` it also carries Start drafting.
 */
export function CustomTemplateCard({
  template,
  onStart,
  onRename,
  onDelete,
  showStart = true,
}: {
  template: CustomTemplate;
  onStart: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** The All tab shows the card without the button (the name starts it). */
  showStart?: boolean;
}) {
  const base = LETTER_CATALOG.find((l) => l.id === template.baseLetterType);
  const meta = [
    base?.shortTitle ?? "Custom letter",
    template.jurisdiction,
    `updated ${timeAgoWords(template.updatedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-testid="firm-template-card"
      className="flex min-w-0 flex-col rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-3.5 transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)]"
    >
      <div className="-mr-1.5 -mt-[3px] flex items-start justify-between gap-2">
        <h3 className="m-0 min-w-0 pt-[3px] text-[14.5px] font-medium leading-snug text-[var(--ds-ink)]">
          {showStart ? (
            <span className="block truncate" title={template.name}>
              {template.name}
            </span>
          ) : (
            <button
              type="button"
              onClick={onStart}
              title={`Start a letter from ${template.name}`}
              className="block max-w-full truncate rounded-[4px] text-left hover:underline hover:underline-offset-2"
            >
              {template.name}
            </button>
          )}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Template actions"
              className="grid size-[26px] shrink-0 place-items-center rounded-[7px] text-[var(--ds-subtle)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)]"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onRename} aria-label="Rename template">
              <Pencil />
              Rename or describe
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} aria-label="Delete template" variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="m-0 mt-[3px] line-clamp-2 text-[13px] leading-[1.4] text-[var(--ds-muted)]">
        {template.description || "No description yet."}
      </p>
      <p
        className="m-0 mt-2.5 truncate text-[12.5px] text-[var(--ds-subtle)]"
        title={new Date(template.updatedAt).toLocaleString("en-GB")}
      >
        {meta}
      </p>
      {showStart && (
        <Button
          size="sm"
          onClick={onStart}
          className="mt-3.5 h-[34px] w-full"
          title="Start a new letter from this template"
        >
          <Sparkles className="size-3.5" />
          Start drafting
        </Button>
      )}
    </article>
  );
}

/** Dashed tile that opens the Create a template dialog. */
export function NewTemplateTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--ds-line-strong)] px-4 py-4 text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-2)]"
    >
      <span className="grid size-[30px] place-items-center rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)]">
        <Plus className="size-4" aria-hidden />
      </span>
      Create a template
      <small className="text-[12.5px] text-[var(--ds-subtle)]">or save any letter as one</small>
    </button>
  );
}
