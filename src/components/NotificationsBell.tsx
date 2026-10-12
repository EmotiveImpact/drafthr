import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { deriveNotifications, topSeverity } from "@/lib/notifications";

const PILL: Record<string, string> = {
  urgent: "bg-[var(--ds-red-fg)] text-white",
  warn: "bg-[var(--ds-amber-dot)] text-white",
  info: "bg-[var(--ds-muted)] text-white",
};

const DOT: Record<string, string> = {
  urgent: "bg-[var(--ds-red-fg)]",
  warn: "bg-[var(--ds-amber-dot)]",
  info: "bg-[var(--ds-faint)]",
};

const LABEL: Record<string, string> = {
  urgent: "Urgent",
  warn: "Action",
  info: "Heads up",
};

/**
 * Bell icon for the topbar. Badge shows the urgent/warn count.
 * Click → popover preview of the top 4. "View all" jumps to /notifications.
 */
export function NotificationsBell() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  // Close the popover on navigation. The bell lives in persistent chrome, so a
  // route change does NOT unmount it — without this the popover floated over
  // the destination page until an outside click/Escape (bug #14).
  const go = (href: string) => {
    setOpen(false);
    nav(href);
  };

  const list = useMemo(
    () =>
      deriveNotifications(
        Object.values(drafts).filter((d) => !d.isTemplateSource),
        profile
      ),
    [drafts, profile]
  );
  const top = topSeverity(list);
  const actionable = list.filter((n) => n.severity !== "info").length;
  const preview = list.slice(0, 4);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 relative" aria-label="Notifications">
          <Bell className="size-4" />
          {actionable > 0 && top && (
            <span
              className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full text-[10px] grid place-items-center px-1 font-medium ${PILL[top]}`}
            >
              {actionable > 9 ? "9+" : actionable}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 overflow-hidden rounded-[var(--ds-r-m)] border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 shadow-[var(--ds-shadow-l)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ds-line)] px-3.5 py-3">
          <span className="text-[13.5px] font-semibold text-[var(--ds-ink)]">Notifications</span>
          <button
            className="text-[12.5px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
            onClick={() => go("/notifications")}
          >
            View all
          </button>
        </div>
        {list.length === 0 ? (
          <div className="px-3 py-8 text-center text-[12.5px] text-[var(--ds-muted)]">
            All clear. Nothing needs your attention.
          </div>
        ) : (
          <ul className="m-0 max-h-[60vh] list-none divide-y divide-[var(--ds-line-2)] overflow-auto p-0">
            {preview.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => n.actionHref && go(n.actionHref)}
                  className="w-full cursor-pointer px-3.5 py-3 text-left hover:bg-[var(--ds-surface-2)]"
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${DOT[n.severity]}`} aria-hidden />
                    <span className="flex-1 truncate text-[13px] font-medium text-[var(--ds-ink)]">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-[var(--ds-muted)]">{LABEL[n.severity] ?? n.severity}</span>
                  </div>
                  <p className="m-0 line-clamp-2 pl-3.5 text-[12px] leading-relaxed text-[var(--ds-muted)]">
                    {n.description}
                  </p>
                </button>
              </li>
            ))}
            {list.length > preview.length && (
              <li>
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2.5 text-center text-[12.5px] text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                  onClick={() => go("/notifications")}
                >
                  {list.length - preview.length} more
                </button>
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
