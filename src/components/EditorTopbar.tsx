import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ScrollText, ShieldCheck } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { UserChip } from "@/lib/auth/UserChip";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useProfileStore } from "@/lib/profile";
import { listIdentities } from "@/lib/comments/identity";
import { AvatarStack } from "@/components/ds/Avatar";

/**
 * Compact topbar for the editor route when the global sidebar is unmounted:
 * a back button to the letters, the brand mark, the letter title and the
 * person's chip. Built on the design tokens (no Radix Themes).
 */
export function EditorTopbar() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const profile = useProfileStore((s) => s.profile);
  const meta = draft ? getLetterMeta(draft.letterType) : null;
  const backTo = draft?.mode === "employer" ? "/hr" : draft?.mode === "employee" ? "/me" : "/";
  const identities = draft ? listIdentities(draft, profile) : [];

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] px-3 sm:px-4">
      <button
        type="button"
        onClick={() => nav(backTo)}
        aria-label="Back to letters"
        className="-ml-1.5 inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Letters</span>
      </button>
      <span aria-hidden className="hidden h-5 w-px bg-[var(--ds-line)] sm:block" />
      <Link
        to="/"
        className="hidden min-w-0 items-center gap-2 rounded-[8px] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)] sm:flex"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)]">
          <ScrollText className="size-3.5" />
        </span>
        <span className="hidden text-[12px] font-semibold tracking-[0.02em] text-[var(--ds-ink)] md:block">DraftHR</span>
      </Link>
      <span aria-hidden className="hidden h-5 w-px bg-[var(--ds-line)] md:block" />
      <div className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ds-ink)]">
        {meta?.title ?? "Editor"}
        {draft && (
          <span className="hidden font-normal text-[var(--ds-muted)] md:inline">
            {" "}
            ·{" "}
            {draft.mode === "employer"
              ? draft.employee.legalName || "(no recipient)"
              : `to ${draft.employer.legalName || "(employer)"}`}{" "}
            · {draft.context.jurisdiction}
          </span>
        )}
      </div>
      <span className="hidden items-center gap-1 rounded-[7px] border border-[var(--ds-line)] px-2 py-1 text-[11.5px] text-[var(--ds-muted)] lg:inline-flex">
        <ShieldCheck className="size-3" />
        Counsel review recommended
      </span>
      {identities.length > 0 && (
        <div className="hidden items-center sm:flex">
          <AvatarStack
            size="lg"
            max={3}
            people={identities.map((p) => ({ seed: p.email || p.id, name: p.name, email: p.email, initials: p.initials, title: p.name + (p.email ? ` <${p.email}>` : "") }))}
          />
        </div>
      )}
      <NotificationsBell />
      <UserChip />
    </header>
  );
}
