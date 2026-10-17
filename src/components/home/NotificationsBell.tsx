/**
 * The bell and its pop-over (mock notifications): a red count of unread
 * items that need you, then a 452px card under the bell with a caret,
 * "Mark all as read", settings, a severity filter, Today and Earlier
 * groups, and a footer to the full page and the settings.
 *
 * src/components/NotificationsBell.tsx (shell) re-exports this.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { snoozeUntil } from "./notificationFeed";
import { useNotificationState, useNotifications, type ShownItem } from "./notificationState";
import { NotificationGroups, NotificationRow, NotificationSettings, SeveritySegments, type SeverityFilter } from "./NotificationList";

export function NotificationsBell({
  variant = "dot",
  className,
}: {
  /** "dot" for the sidebar, "count" for the phone top bar. */
  variant?: "dot" | "count";
  className?: string;
} = {}) {
  const nav = useNavigate();
  const feed = useNotifications();
  const markRead = useNotificationState((s) => s.markRead);
  const snooze = useNotificationState((s) => s.snooze);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [view, setView] = useState<"list" | "settings">("list");
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);

  // Point the caret at the bell wherever the pop-over ends up.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const c = content.current?.getBoundingClientRect();
      if (t && c && c.width > 0) setCaret(Math.max(14, Math.min(c.width - 26, t.left + t.width / 2 - c.left - 6)));
    };
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [open, view]);

  // Close on navigation: the bell lives in persistent chrome (bug #14).
  const go = (href: string) => {
    setOpen(false);
    nav(href);
  };
  const onGo = (item: ShownItem) => {
    markRead(feed.who, [item.id]);
    if (item.href) go(item.href);
  };
  const onSnooze = (item: ShownItem) => snooze(feed.who, item.id, snoozeUntil());

  const list = filter === "all" ? feed.items : feed.items.filter((i) => i.severity === filter);
  const { today, earlier } = feed.groups(list);
  const badge = feed.unreadNeedYou;
  const quiet = badge === 0 && feed.unreadAny > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setView("list");
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={badge > 0 ? `Notifications, ${badge} need you` : "Notifications"}
          title="Notifications"
          className={cn(
            "relative grid shrink-0 place-items-center transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)] data-[state=open]:text-[var(--ds-ink)]",
            variant === "count"
              ? "size-[38px] rounded-[10px] text-[var(--ds-ink)]"
              : "size-[30px] md:size-[28px] rounded-[8px] text-[var(--ds-subtle)]",
            className
          )}
        >
          <Bell className={variant === "count" ? "size-[19px]" : "size-[17px]"} aria-hidden />
          {badge > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute grid h-4 min-w-4 place-items-center rounded-full border-2 border-[var(--ds-surface)] bg-[var(--ds-red-solid)] px-[3px] text-[9.5px] leading-none font-semibold text-[var(--ds-on-accent)]",
                variant === "count" ? "top-1 right-1" : "-top-0.5 -right-0.5"
              )}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
          {quiet && (
            <span
              aria-hidden
              className="absolute top-[6px] right-[7px] size-[7px] rounded-full border-[1.5px] border-[var(--ds-surface)] bg-[var(--ds-amber-dot)]"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align={variant === "count" ? "end" : "start"}
        alignOffset={variant === "count" ? 0 : -3}
        sideOffset={10}
        collisionPadding={12}
        aria-label="Notifications"
        className="relative w-[452px] max-w-[calc(100vw-24px)] rounded-[16px] p-0 shadow-[var(--ds-shadow-xl)]"
      >
        {caret != null && (
          <span
            aria-hidden
            className="absolute -top-[7px] size-3 rotate-45 border-t border-l border-[var(--ds-line)] bg-[var(--ds-surface)]"
            style={{ left: caret }}
          />
        )}
        {view === "settings" ? (
          <div className="px-[18px] pt-4 pb-3">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="Back to notifications"
                className="grid size-[30px] place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <h2 className="ds-title m-0 text-[22px] leading-tight tracking-[-0.015em]">Notification settings</h2>
            </div>
            <p className="m-0 mb-1 text-[12.5px] text-[var(--ds-muted)]">
              Choose what shows here and on the Notifications page. Saved for you on this device.
            </p>
            <NotificationSettings who={feed.who} muted={feed.muted} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-[18px] pt-4">
              <h2 className="ds-title m-0 text-[22px] leading-tight tracking-[-0.015em]">Notifications</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => markRead(feed.who, feed.items.map((i) => i.id))}
                  disabled={feed.unreadAny === 0}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-1 text-[13px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:underline disabled:text-[var(--ds-subtle)] disabled:no-underline"
                >
                  <CheckCheck className="size-[15px]" aria-hidden />
                  Mark all as read
                </button>
                <button
                  type="button"
                  onClick={() => setView("settings")}
                  aria-label="Notification settings"
                  title="Notification settings"
                  className="ml-1 grid size-[30px] place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
                >
                  <Settings className="size-4" aria-hidden />
                </button>
              </div>
            </div>
            {feed.items.length > 0 && (
              <div className="no-scrollbar overflow-x-auto px-[18px] pt-3 pb-1">
                <SeveritySegments value={filter} onChange={setFilter} counts={feed.counts} />
              </div>
            )}
            <div className="max-h-[min(60vh,470px)] overflow-y-auto overscroll-contain px-2 pb-1">
              {feed.items.length === 0 ? (
                <p className="m-0 px-2.5 py-8 text-center text-[13px] text-[var(--ds-muted)]">
                  All clear. Nothing needs your attention.
                </p>
              ) : list.length === 0 ? (
                <p className="m-0 px-2.5 py-8 text-center text-[13px] text-[var(--ds-muted)]">Nothing here right now.</p>
              ) : (
                <NotificationGroups
                  today={today}
                  earlier={earlier}
                  render={(item, first) => (
                    <NotificationRow key={item.id} item={item} first={first} onGo={onGo} onSnooze={onSnooze} />
                  )}
                />
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-[var(--ds-line-2)] px-[18px] py-3 text-[13px]">
              <button
                type="button"
                onClick={() => go("/notifications")}
                className="rounded-[4px] text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
              >
                View all notifications
              </button>
              <button
                type="button"
                onClick={() => setView("settings")}
                className="inline-flex items-center gap-1.5 rounded-[4px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:text-[var(--ds-ink)]"
              >
                <Settings className="size-3.5" aria-hidden />
                Notification settings
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
