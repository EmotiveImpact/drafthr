import { BookmarkPlus } from "lucide-react";
import type { Draft } from "@/lib/letters/types";

/**
 * Subtle banner shown above the canvas when the open draft is a
 * template authoring surface. Reads the user-supplied template name
 * from answers._templateName, falls back to draft.title or the letter
 * type label. Discard wires into a parent-supplied handler that drops
 * both the draft and any linked customTemplate row.
 */
export function TemplateSourceBanner({
  draft,
  onDiscard,
}: {
  draft: Draft;
  onDiscard?: () => void;
}) {
  const answersRec = draft.answers as Record<string, unknown>;
  const name =
    (answersRec._templateName as string | undefined)?.trim() ||
    draft.title?.trim() ||
    "Untitled template";

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] px-3 py-2 text-[12px]">
      <BookmarkPlus className="size-3.5 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        Editing template: <span className="font-semibold">{name}</span>
      </span>
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="underline hover:opacity-80"
        >
          Discard
        </button>
      )}
    </div>
  );
}
