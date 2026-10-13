/**
 * Letter art shared by Home, its tabs and Reports: the pastel for a letter
 * type, the drawn page on a tinted panel (mock shell.mjs `paper`) and the
 * small page thumbnail used in rows (mock _kit.mjs `paper`).
 *
 * Presentation only. Colours come from the --ds-tint-* tokens.
 */
import type { CSSProperties, ReactNode } from "react";
import type { LetterTypeId } from "@/lib/letters/types";
import { categoryOf, getLetterMeta, LETTER_CATEGORIES, type LetterTypeMeta } from "@/lib/letters/catalog";
import { cn } from "@/lib/utils";

export type Tint = "lavender" | "mint" | "peach" | "butter" | "sky" | "rose";

const TINT_BY_CATEGORY: Record<string, Tint> = {
  performance_conduct: "lavender",
  dispute: "peach",
  compensation: "mint",
  leave: "sky",
  departure: "rose",
  onboarding: "butter",
  tribunal_legal: "lavender",
};

export function tintFor(id: LetterTypeId | string): Tint {
  const cat = safeCategory(id);
  return (cat && TINT_BY_CATEGORY[cat]) || "sky";
}

/** CSS variables `--tint` and `--tint-ink` for a pastel. */
export function tintVars(tint: Tint): CSSProperties {
  return {
    ["--tint" as string]: `var(--ds-tint-${tint})`,
    ["--tint-ink" as string]: `var(--ds-tint-${tint}-ink)`,
  };
}

function safeCategory(id: string) {
  try {
    return categoryOf(id as LetterTypeId);
  } catch {
    return undefined;
  }
}

export function categoryName(id: LetterTypeId | string): string | undefined {
  const cat = safeCategory(id);
  return LETTER_CATEGORIES.find((c) => c.id === cat)?.label;
}

export function metaFor(id: LetterTypeId | string): LetterTypeMeta | null {
  try {
    return getLetterMeta(id as LetterTypeId);
  } catch {
    return null;
  }
}

/**
 * The drawn white page on a pastel panel. Hovering the nearest `.group`
 * lifts only the page (5px, a slight turn) over 200ms; the card around it
 * never moves.
 */
export function PaperArt({ tint, height = 132, className }: { tint: Tint; height?: number; className?: string }) {
  const line = "block h-1 shrink-0 rounded-[2px] bg-[var(--ds-line)]";
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden rounded-[11px] bg-[var(--tint)]", className)}
      style={{ ...tintVars(tint), height }}
    >
      <span className="absolute bottom-[-26px] left-1/2 flex h-[128px] w-[112px] -translate-x-1/2 -rotate-[2.5deg] flex-col gap-[5px] rounded-[3px] bg-[var(--ds-surface)] px-[13px] pt-4 shadow-[var(--ds-shadow-m)] transition-transform duration-200 ease-out group-hover:-translate-y-[5px] group-hover:-rotate-1 motion-reduce:transition-none">
        <span className="absolute top-0 right-0 size-4 rounded-bl-[2px] bg-[linear-gradient(225deg,var(--tint)_50%,var(--ds-line-strong)_50%)]" />
        <span className="mb-[3px] size-[9px] shrink-0 rounded-[2px] bg-[var(--tint-ink)] opacity-85" />
        <span className="mb-[3px] block h-1 w-[58%] shrink-0 rounded-[2px] bg-[var(--ds-ink)] opacity-50" />
        <span className={line} style={{ width: "94%" }} />
        <span className={line} />
        <span className={line} style={{ width: "82%" }} />
        <span className="block h-1 shrink-0" />
        <span className={line} />
        <span className={line} style={{ width: "90%" }} />
        <span className={line} style={{ width: "64%" }} />
      </span>
    </div>
  );
}

/** Small page thumbnail (34 by 44) that leads a row. Decorative. */
export function PageThumb({ tinted = false, className }: { tinted?: boolean; className?: string }) {
  const line = "block h-[2px] w-full shrink-0 rounded-[2px] bg-[var(--ds-line-strong)]";
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[44px] w-[34px] shrink-0 flex-col gap-[3px] rounded-[4px] border border-[var(--ds-line)] px-[6px] py-[7px] shadow-[var(--ds-shadow-s)]",
        tinted ? "bg-[var(--ds-amber-chip)]" : "bg-[var(--ds-surface)]",
        className
      )}
    >
      <span className={line} style={{ width: "60%" }} />
      <span className={line} />
      <span className={line} />
      <span className={line} style={{ width: "80%" }} />
      <span className={line} />
      <span className={line} style={{ width: "45%" }} />
    </span>
  );
}

/**
 * The art card (mock shell.mjs `artTile`): hairline card, 16px corners,
 * 6px inner padding, the drawn page, then name, meta and an optional pill.
 * Render it inside a link or button that carries the `group` class.
 */
export function ArtCardBody({
  tint,
  title,
  meta,
  pill,
}: {
  tint: Tint;
  title: string;
  meta?: ReactNode;
  pill?: ReactNode;
}) {
  return (
    <>
      <PaperArt tint={tint} />
      <span className="flex min-w-0 flex-col px-2.5 pt-3 pb-2.5">
        <span className="truncate text-[14.5px] font-medium text-[var(--ds-ink)]">{title}</span>
        {meta && <span className="mt-[3px] truncate text-[13px] text-[var(--ds-muted)]">{meta}</span>}
        {pill && <span className="mt-2.5 flex min-w-0">{pill}</span>}
      </span>
    </>
  );
}

export const ART_CARD =
  "group flex min-w-0 flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5 text-left " +
  "transition-colors duration-[120ms] hover:border-[var(--ds-line-strong)] active:bg-[var(--ds-surface-2)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]";
