/**
 * Pastel preview cards (design 6B): a tinted top holding a drawn letter page,
 * then the letter type's name, description and pills. Each card opens that
 * letter type's wizard, exactly as the old catalogue tiles did.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LetterTypeMeta } from "@/lib/letters/catalog";
import { categoryLabel, tintForLetterType, tintStyle } from "@/components/letters/letterView";

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
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2 @[940px]:grid-cols-3">
        {letters.map((l) => (
          <TemplateCard key={l.id} letter={l} href={`${prefix}/new/${l.id}`} />
        ))}
        {moreHref && (
          <Link
            to={moreHref}
            className="group flex min-h-[120px] items-center justify-center gap-1.5 rounded-[var(--ds-r-l)] border border-dashed border-[var(--ds-line-strong)] p-5 text-[14px] font-medium text-[var(--ds-muted)] transition hover:border-[var(--ds-ink)] hover:text-[var(--ds-ink)]"
          >
            More letter types
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function jurisdictions(l: LetterTypeMeta): string[] {
  if (l.jurisdictionScope === "uk_only") return ["UK"];
  if (l.jurisdictionScope === "us_only") return ["US"];
  return ["UK", "US"];
}

function TemplateCard({ letter: l, href }: { letter: LetterTypeMeta; href: string }) {
  const cat = categoryLabel(l.id);
  return (
    <Link
      to={href}
      style={tintStyle(tintForLetterType(l.id))}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] transition duration-200 hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
    >
      <div className="relative mx-1.5 mt-1.5 h-[128px] overflow-hidden rounded-[9px] bg-[var(--tint)]">
        <PreviewPage />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-4 py-3.5">
        <span className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{l.shortTitle}</span>
        <span className="truncate text-[12.5px] text-[var(--ds-muted)]">{l.description}</span>
        <span className="mt-2 flex min-w-0 items-center gap-1 overflow-hidden">
          {cat && (
            <span className="inline-flex h-5 items-center rounded-[var(--ds-r-s)] bg-[var(--tint)] px-[7px] text-[11.5px] font-medium whitespace-nowrap text-[var(--tint-ink)]">
              {cat}
            </span>
          )}
          {jurisdictions(l).map((j) => (
            <span
              key={j}
              className="inline-flex h-5 items-center rounded-[var(--ds-r-s)] bg-[var(--ds-chip)] px-[7px] text-[11.5px] font-medium whitespace-nowrap text-[var(--ds-body)]"
            >
              {j}
            </span>
          ))}
        </span>
      </div>
    </Link>
  );
}

/** Drawn letter page that lifts a little on hover. */
function PreviewPage() {
  const line = "block h-1 shrink-0 rounded-[2px] bg-[var(--ds-line)]";
  return (
    <span
      aria-hidden
      className="absolute bottom-[-26px] left-1/2 flex h-[124px] w-[108px] -translate-x-1/2 -rotate-[2.5deg] flex-col gap-[5px] rounded-[3px] bg-[var(--ds-surface)] px-[13px] pt-4 shadow-[var(--ds-shadow-m)] transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:-rotate-1"
    >
      <span className="mb-[3px] size-[9px] rounded-[2px] bg-[var(--tint-ink)] opacity-85" />
      <span className="mb-[3px] block h-1 w-[58%] shrink-0 rounded-[2px] bg-[var(--ds-ink)] opacity-55" />
      <span className={line} style={{ width: "94%" }} />
      <span className={line} />
      <span className={line} style={{ width: "82%" }} />
      <span className="h-1 shrink-0" />
      <span className={line} />
      <span className={line} style={{ width: "90%" }} />
      <span className={line} style={{ width: "64%" }} />
      <span className="absolute top-0 right-0 size-4 rounded-bl-[2px] bg-[linear-gradient(225deg,var(--tint)_50%,var(--ds-line)_50%)]" />
    </span>
  );
}
