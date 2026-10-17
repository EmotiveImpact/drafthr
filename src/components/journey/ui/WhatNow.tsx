import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** The grey "what to do now" line under the tracker: a bold lead, then detail. */
export function WhatNow({
  lead,
  detail,
  className,
  style,
}: {
  lead: string;
  detail?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      data-slot="what-now"
      style={style}
      className={cn(
        "m-0 rounded-[10px] bg-[var(--ds-surface-2)] px-3 py-2.5 text-[13px] leading-[1.45] text-[var(--ds-body)]",
        className
      )}
    >
      <b className="font-medium text-[var(--ds-ink)]">{lead}</b>
      {detail ? ` ${detail}` : null}
    </p>
  );
}
