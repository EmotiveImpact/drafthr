import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { UserChip } from "@/lib/auth/UserChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationsBell } from "@/components/NotificationsBell";

/**
 * Compact topbar shown ONLY on the editor route, where the global sidebar is
 * unmounted. Provides a "← Letters" back button, a brand mark, the letter
 * title, and the user chip.
 */
export function EditorTopbar() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const meta = draft ? getLetterMeta(draft.letterType) : null;
  const backTo = draft?.mode === "employer" ? "/hr" : draft?.mode === "employee" ? "/me" : "/";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background px-3 sm:px-4 sticky top-0 z-30">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => nav(backTo)}
        className="text-muted-foreground -ml-1.5"
      >
        <ChevronLeft className="size-4 mr-1" />
        Letters
      </Button>
      <Separator orientation="vertical" className="h-4" />
      <Link to="/" className="flex items-center gap-2 group min-w-0">
        <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center shrink-0">
          <ScrollText className="size-3.5" />
        </div>
        <div className="leading-tight min-w-0 hidden sm:block">
          <div className="text-xs font-semibold tracking-tight truncate">HR Letter</div>
        </div>
      </Link>
      <Separator orientation="vertical" className="h-4 hidden sm:block" />
      <div className="text-sm font-medium truncate flex-1 min-w-0">
        {meta?.title ?? "Editor"}
        {draft && (
          <span className="text-muted-foreground hidden md:inline">
            {" "}· {draft.mode === "employer"
              ? draft.employee.legalName || "(no recipient)"
              : `to ${draft.employer.legalName || "(employer)"}`}{" "}
            · {draft.context.jurisdiction}
          </span>
        )}
      </div>
      <div className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-letter-rule px-2 py-1 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-3" />
        Counsel review recommended
      </div>
      <NotificationsBell />
      <ThemeToggle />
      <UserChip />
    </header>
  );
}
