import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { deriveNotifications, topSeverity } from "@/lib/notifications";

const PILL: Record<string, string> = {
  urgent: "bg-[var(--ds-red-solid)] text-white",
  warn: "bg-[var(--ds-red-solid)] text-white",
  info: "bg-[var(--ds-subtle)] text-white",
};

const DOT: Record<string, string> = {
  urgent: "bg-[var(--ds-red-solid)]",
  warn: "bg-[var(--ds-amber-dot)]",
  info: "bg-[var(--ds-faint)]",
};

const LABEL: Record<string, string> = {
  urgent: "Urgent",
  warn: "Action",
  info: "Heads up",
};

/**
 * The bell. In the sidebar's top row it is a quiet 30px icon with a small
 * amber (or red, when urgent) dot; in the phone top bar it is a 38px icon
 * with a red count badge, as in the phone-home mock.
 * Click → popover preview of the top 4. "View all" jumps to /notifications.
 */
export function NotificationsBell({
  variant = "dot",
  className,
}: {
  /** "dot" for the sidebar, "count" for the phone top bar. */
  variant?: "dot" | "count";
  className?: string;
} = {}) {
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
        <button
          type="button"
          aria-label={actionable > 0 ? `Notifications, ${actionable} need you` : "Notifications"}
          title="Notifications"
          className={cn(
            "relative grid shrink-0 place-items-center transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)]",
            variant === "count"
              ? "size-[38px] rounded-[10px] text-[var(--ds-ink)]"
              : "size-[30px] rounded-[8px] text-[var(--ds-subtle)]",
            className
          )}
        >
          <Bell className={variant === "count" ? "size-[19px]" : "size-[17px]"} aria-hidden />
          {actionable > 0 && top && variant === "dot" && (
            <span
              aria-hidden
              className={cn(
                "absolute top-[6px] right-[7px] size-[7px] rounded-full border-[1.5px] border-[var(--ds-surface)]",
                DOT[top]
              )}
            />
          )}
          {actionable > 0 && top && variant === "count" && (
            <span
              aria-hidden
              className={cn(
                "absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-[var(--ds-surface)] px-[3px] text-[9.5px] font-semibold",
                PILL[top]
              )}
            >
              {actionable > 9 ? "9+" : actionable}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[var(--ds-r-l)] border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 shadow-[var(--ds-shadow-l)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ds-line-2)] px-4 py-3">
          <span className="ds-heading text-[19px]">Notifications</span>
          <button
            type="button"
            className="rounded-[6px] px-1 text-[13px] text-[var(--ds-ink)] hover:underline underline-offset-[3px]"
            onClick={() => go("/notifications")}
          >
            View all
          </button>
        </div>
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--ds-muted)]">
            All clear. Nothing needs your attention.
          </div>
        ) : (
          <ul className="m-0 max-h-[60vh] list-none divide-y divide-[var(--ds-line-2)] overflow-auto p-0">
            {preview.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => n.actionHref && go(n.actionHref)}
                  className="w-full cursor-pointer px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)]"
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className={`size-1.5 shrink-0 rounded-full ${DOT[n.severity]}`} aria-hidden />
                    <span className="flex-1 truncate text-[14px] text-[var(--ds-ink)]">{n.title}</span>
                    <span className="shrink-0 text-[12px] text-[var(--ds-subtle)]">{LABEL[n.severity] ?? n.severity}</span>
                  </div>
                  <p className="m-0 mt-0.5 line-clamp-2 pl-3.5 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                    {n.description}
                  </p>
                </button>
              </li>
            ))}
            {list.length > preview.length && (
              <li>
                <button
                  type="button"
                  className="w-full cursor-pointer px-4 py-2.5 text-center text-[13px] text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
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
