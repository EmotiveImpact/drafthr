import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { BrandMark } from "@/components/ds/BrandMark";
import { WizardChrome } from "@/components/editor/WizardChrome";

/**
 * Document bar (design 11A) for the letter steps that live outside the
 * editor: Evidence, Review and Finalise. File name on the left, the
 * Edit / Review / Finalise pill track in the middle, actions on the right.
 * On phones the pill track drops to a second row.
 */
export function DocBar({
  draft,
  current,
  title,
  label,
  actions,
  leading,
}: {
  draft: Draft;
  current: "edit" | "evidence" | "review" | "finalize";
  title: string;
  /** Muted word after the title, e.g. "Evidence". */
  label?: string;
  actions?: ReactNode;
  /** Replaces the home link (e.g. a back button). */
  leading?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)]">
      <div className="flex h-[52px] items-center gap-2 px-3 sm:px-4">
        {leading ?? (
          <Link
            to="/"
            aria-label="Home"
            className="-mx-1 mr-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--ds-r-s)] transition hover:bg-[var(--ds-surface-2)]"
          >
            <BrandMark size={26} />
          </Link>
        )}
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-[var(--ds-line)] sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none md:basis-auto">
          <FileText className="hidden size-4 shrink-0 text-[var(--ds-muted)] sm:block" aria-hidden />
          <span className="truncate text-[13.5px] font-medium text-[var(--ds-ink)] md:max-w-[34vw]">{title}</span>
          {label && (
            <span className="hidden shrink-0 text-[13px] text-[var(--ds-muted)] lg:inline">{label}</span>
          )}
        </div>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <WizardChrome bare draftId={draft.id} mode={draft.mode} current={current} />
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className="overflow-x-auto px-3 pb-2 md:hidden">
        <WizardChrome bare draftId={draft.id} mode={draft.mode} current={current} />
      </div>
    </header>
  );
}

/** Outline button used in the document bar (Versions / Share style). */
export const DOC_BTN =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[13px] font-medium text-[var(--ds-ink)] transition hover:bg-[var(--ds-surface-2)] disabled:cursor-not-allowed disabled:opacity-50";

/** Near-black primary button used in the document bar (Export style). */
export const DOC_BTN_PRIMARY =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3 text-[13px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50";
