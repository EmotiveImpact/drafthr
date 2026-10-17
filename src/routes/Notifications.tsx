import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Settings } from "lucide-react";
import { EmptyState } from "@/components/ds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfileStore } from "@/lib/profile";
import { BAND_BTN_GHOST, Band, BandTabs, useWorkspaceName } from "@/components/home/HomeBand";
import { snoozeUntil } from "@/components/home/notificationFeed";
import { useNotificationState, useNotifications, type ShownItem } from "@/components/home/notificationState";
import {
  NotificationGroups,
  NotificationRow,
  NotificationSettings,
  SEVERITY_WORD,
  type SeverityFilter,
} from "@/components/home/NotificationList";

/**
 * Notifications (mock notifications, page form): the same band as Home,
 * tabs All, Urgent, Action recommended and Heads up, and the feed in one
 * column grouped into Today and Earlier. Every mode keeps this page; each
 * person sees only what comes from their own letters.
 */
export function Notifications() {
  const nav = useNavigate();
  const role = useProfileStore((s) => s.profile.role);
  const workspace = useWorkspaceName();
  const feed = useNotifications();
  const markRead = useNotificationState((s) => s.markRead);
  const snooze = useNotificationState((s) => s.snooze);
  const [tab, setTab] = useState<SeverityFilter>("all");

  const list = tab === "all" ? feed.items : feed.items.filter((i) => i.severity === tab);
  const { today, earlier } = feed.groups(list);
  const needYou = feed.counts.urgent + feed.counts.warn;

  const onGo = (item: ShownItem) => {
    markRead(feed.who, [item.id]);
    if (item.href) nav(item.href);
  };
  const onSnooze = (item: ShownItem) => snooze(feed.who, item.id, snoozeUntil());

  const crumbs =
    role === "employer"
      ? [{ label: workspace, href: "/hr" }, { label: "Notifications" }]
      : [{ label: "Home", href: role === "employee" ? "/me" : "/c" }, { label: "Notifications" }];

  return (
    <div className="min-w-0">
      <Band
        crumbs={crumbs}
        title="Notifications"
        lede={
          feed.items.length === 0 ? (
            <>Deadlines, approvals, comments and compliance gaps from your letters.</>
          ) : (
            <>
              <b>{needYou}</b> {needYou === 1 ? "needs" : "need"} you. Deadlines, approvals, comments and compliance gaps
              from your letters.
            </>
          )
        }
        actions={
          <>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={BAND_BTN_GHOST} title="Notification settings">
                  <Settings className="size-4" aria-hidden />
                  Settings
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-4">
                <p className="m-0 mb-1 text-[14px] font-medium text-[var(--ds-ink)]">Notification settings</p>
                <p className="m-0 mb-1 text-[12.5px] text-[var(--ds-muted)]">Saved for you on this device.</p>
                <NotificationSettings who={feed.who} muted={feed.muted} />
              </PopoverContent>
            </Popover>
            <button
              type="button"
              className={BAND_BTN_GHOST}
              onClick={() => markRead(feed.who, feed.items.map((i) => i.id))}
              disabled={feed.unreadAny === 0}
            >
              <CheckCheck className="size-4" aria-hidden />
              Mark all as read
            </button>
          </>
        }
        tabs={
          <BandTabs
            label="Notification types"
            active={tab}
            onChange={(id) => setTab(id as SeverityFilter)}
            tabs={[
              { id: "all", label: "All", count: feed.counts.all },
              { id: "urgent", label: "Urgent", count: feed.counts.urgent },
              { id: "warn", label: "Action recommended", count: feed.counts.warn },
              { id: "info", label: "Heads up", count: feed.counts.info },
            ]}
          />
        }
      />

      <div className="max-w-[816px] px-2 pt-3 pb-12 md:px-10 md:pt-5">
        {/* Phone: the band's actions are hidden, so Mark all as read sits here. */}
        {feed.unreadAny > 0 && (
          <div className="flex justify-end px-2 md:hidden">
            <button
              type="button"
              onClick={() => markRead(feed.who, feed.items.map((i) => i.id))}
              className="inline-flex items-center gap-1.5 rounded-[6px] px-1 py-1 text-[13px] text-[var(--ds-ink)]"
            >
              <CheckCheck className="size-[15px]" aria-hidden />
              Mark all as read
            </button>
          </div>
        )}
        {feed.items.length === 0 ? (
          <div className="mx-2 mt-2 rounded-[16px] border border-[var(--ds-line)]">
            <EmptyState
              icon={Bell}
              title="All clear"
              body="You'll see deadline reminders, compliance gaps and counsel-review prompts here."
            />
          </div>
        ) : list.length === 0 ? (
          <p className="m-0 px-2.5 py-10 text-center text-[13.5px] text-[var(--ds-muted)]">
            Nothing in {SEVERITY_WORD[tab as Exclude<SeverityFilter, "all">]} right now.
          </p>
        ) : (
          <div key={tab} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <NotificationGroups
              today={today}
              earlier={earlier}
              render={(item, first) => (
                <NotificationRow key={item.id} item={item} first={first} wide onGo={onGo} onSnooze={onSnooze} />
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
