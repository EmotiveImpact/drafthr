import type { CSSProperties } from "react";
import { LETTER_CATALOG } from "@/lib/letters/catalog";

/**
 * Pastel tints (design option 6B). Tints group things by letter category;
 * they never carry status.
 */
export type Tint = "lavender" | "mint" | "peach" | "butter" | "sky" | "rose";

const CATEGORY_TINT: Record<string, Tint> = {
  onboarding: "mint",
  performance_conduct: "lavender",
  departure: "rose",
  leave: "sky",
  compensation: "butter",
  dispute: "peach",
  tribunal_legal: "lavender",
};

export function tintForCategory(category: string | undefined): Tint {
  return (category && CATEGORY_TINT[category]) || "sky";
}

/** Tint for a letter type, looked up defensively (unknown ids fall back). */
export function tintForLetter(letterType: string | undefined): Tint {
  const meta = LETTER_CATALOG.find((l) => l.id === letterType);
  return tintForCategory(meta?.category);
}

/** Sets `--tint` and `--tint-ink` so children can use bg-[var(--tint)]. */
export function tintStyle(tint: Tint): CSSProperties {
  return {
    ["--tint" as string]: `var(--ds-tint-${tint})`,
    ["--tint-ink" as string]: `var(--ds-tint-${tint}-ink)`,
  } as CSSProperties;
}
