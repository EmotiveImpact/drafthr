import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tintStyle, type Tint } from "./tints";

const LINES = ["94%", "100%", "82%", null, "100%", "90%", "64%"] as const;

/**
 * The drawn letter page on a pastel panel (shell.mjs `paper()`): a white
 * sheet tilted slightly, a folded corner, a small type mark in the tint's ink
 * and grey text lines. Pastels only ever mark the letter type.
 */
export function PaperArt({
  tint,
  height = 112,
  className,
  children,
}: {
  tint: Tint;
  height?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden
      style={{ ...tintStyle(tint), height }}
      className={cn("relative overflow-hidden rounded-[11px] bg-[var(--tint)]", className)}
    >
      <span className="absolute bottom-[-26px] left-1/2 flex h-[128px] w-[112px] -translate-x-1/2 -rotate-[2.5deg] flex-col gap-[5px] rounded-[3px] bg-[var(--ds-surface)] px-[13px] pt-4 shadow-[var(--ds-shadow-m)]">
        <span className="absolute right-0 top-0 size-4 rounded-bl-[2px] bg-[linear-gradient(225deg,var(--tint)_50%,var(--ds-line)_50%)]" />
        <span className="mb-[3px] size-[9px] shrink-0 rounded-[2px] bg-[var(--tint-ink)] opacity-85" />
        <span className="mb-[3px] block h-1 w-[58%] shrink-0 rounded-[2px] bg-[var(--ds-ink)] opacity-50" />
        {LINES.map((w, i) =>
          w ? (
            <span key={i} className="block h-1 shrink-0 rounded-[2px] bg-[var(--ds-line)]" style={{ width: w }} />
          ) : (
            <span key={i} className="block h-1 shrink-0" />
          )
        )}
      </span>
      {children}
    </div>
  );
}
