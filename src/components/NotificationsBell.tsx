import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/Badge";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { deriveNotifications, topSeverity } from "@/lib/notifications";

const PILL: Record<string, string> = {
  urgent: "bg-rose-500 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-muted-foreground text-background",
};

const RING: Record<string, string> = {
  urgent: "border-rose-200 bg-rose-50/60",
  warn: "border-amber-200 bg-amber-50/60",
  info: "border-letter-rule",
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
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2.5 flex items-center justify-between border-b border-sidebar-border">
          <span className="text-sm font-medium">Notifications</span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => go("/notifications")}
          >
            View all
          </button>
        </div>
        {list.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            All clear — nothing needs your attention.
          </div>
        ) : (
          <ul className="divide-y divide-sidebar-border max-h-[60vh] overflow-auto">
            {preview.map((n) => (
              <li
                key={n.id}
                onClick={() => n.actionHref && go(n.actionHref)}
                className={`px-3 py-2.5 cursor-pointer hover:bg-muted/40 ${RING[n.severity]}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium truncate flex-1">{n.title}</span>
                  <Badge
                    className={
                      n.severity === "urgent"
                        ? "bg-rose-50 text-rose-900 border-rose-200"
                        : n.severity === "warn"
                        ? "bg-amber-50 text-amber-900 border-amber-200"
                        : "bg-muted text-foreground border-letter-rule"
                    }
                  >
                    {n.severity}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {n.description}
                </p>
              </li>
            ))}
            {list.length > preview.length && (
              <li
                className="px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted/40 cursor-pointer"
                onClick={() => go("/notifications")}
              >
                + {list.length - preview.length} more →
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
