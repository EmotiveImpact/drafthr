/**
 * Letter types to start from, as art cards (mock home "Start from a
 * template"): the drawn page on the type's pastel, the name and a short
 * meta line. Each card opens that letter type's wizard.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LetterTypeMeta } from "@/lib/letters/catalog";
import { ART_CARD, ArtCardBody, categoryName, tintFor } from "./letterArt";

function scope(l: LetterTypeMeta): string {
  if (l.jurisdictionScope === "uk_only") return "UK only";
  if (l.jurisdictionScope === "us_only") return "US only";
  return "UK and US";
}

export function TemplateCards({
  letters,
  prefix,
  moreHref,
}: {
  letters: LetterTypeMeta[];
  prefix: string;
  /** Adds a final "More letter types" card. */
  moreHref?: string;
}) {
  return (
    <div className="@container w-full min-w-0">
      <div className="grid grid-cols-1 gap-3.5 @[460px]:grid-cols-2 @[680px]:grid-cols-3">
        {letters.map((l) => (
          <Link key={l.id} to={`${prefix}/new/${l.id}`} className={ART_CARD} aria-label={`Start ${l.shortTitle}`}>
            <ArtCardBody
              tint={tintFor(l.id)}
              title={l.shortTitle}
              meta={[categoryName(l.id), scope(l)].filter(Boolean).join(" · ")}
            />
          </Link>
        ))}
        {moreHref && (
          <Link
            to={moreHref}
            className="flex min-h-[120px] items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-[var(--ds-line-strong)] p-5 text-[14px] font-medium text-[var(--ds-muted)] transition-colors duration-[120ms] hover:border-[var(--ds-ink)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-2)]"
          >
            More letter types
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
