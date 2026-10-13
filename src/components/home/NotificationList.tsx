/**
 * Notification rows, the severity filter and the settings panel, shared by
 * the bell pop-over and the Notifications page (mock notifications).
 */
import type { ReactNode } from "react";
import {
  CalendarDays,
  Check,
  FileClock,
  Gauge,
  MessageSquareText,
  Scale,
  ShieldAlert,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { NotificationSeverity } from "@/lib/notifications";
import { PersonDot } from "./ApprovalPreview";
import { FEED_CATEGORY_LABEL, feedAgo, type FeedCategory, type FeedLead } from "./notificationFeed";
import { useNotificationState, type ShownItem } from "./notificationState";

export type SeverityFilter = "all" | NotificationSeverity;

export const SEVERITY_WORD: Record<NotificationSeverity, string> = {
  urgent: "Urgent",
  warn: "Action recommended",
  info: "Heads up",
};

const ICONS: Record<Extract<FeedLead, { type: "icon" }>["icon"], LucideIcon> = {
  calendar: CalendarDays,
  message: MessageSquareText,
  scale: Scale,
  gauge: Gauge,
  shield: ShieldAlert,
  file: FileClock,
  user: UserRound,
  check: Check,
  undo: Undo2,
};

const LEAD_TONE: Record<"red" | "amber" | "grey" | "green", string> = {
  red: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  grey: "bg-[var(--ds-surface-2)] text-[var(--ds-muted)]",
  green: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
};

export function Lead({ lead }: { lead: FeedLead }) {
  if (lead.type === "person") return <PersonDot name={lead.name} size={30} />;
  const Icon = ICONS[lead.icon];
  return (
    <span aria-hidden className={cn("grid size-[30px] shrink-0 place-items-center rounded-full", LEAD_TONE[lead.tone])}>
      <Icon className="size-[15px]" />
    </span>
  );
}

export const MINI =
  "inline-flex h-[27px] items-center rounded-[7px] border px-[9px] text-[12.5px] font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]";

export function NotificationRow({
  item,
  onGo,
  onSnooze,
  wide = false,
  first = false,
}: {
  item: ShownItem;
  onGo: (item: ShownItem) => void;
  onSnooze: (item: ShownItem) => void;
  /** The page: action label on the right, hairlines between rows. */
  wide?: boolean;
  first?: boolean;
}) {
  const meta = [item.severity === "urgent" ? "Urgent" : null, item.meta, feedAgo(item.time)].filter(Boolean).join(" · ");
  return (
    <li
      className={cn(
        "group/n relative",
        wide && "border-t border-[var(--ds-line-2)] first:border-t-0"
      )}
    >
      <div
        className={cn(
          "relative flex items-start gap-3 rounded-[10px] py-2.5 pr-[30px] pl-2.5 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)]",
          item.unread && first && "bg-[var(--ds-hover)]",
          wide && "py-3"
        )}
      >
        <Lead lead={item.lead} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onGo(item)}
            className="block w-full text-left text-[14px] leading-[1.35] text-[var(--ds-body)] after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--ds-focus)]"
          >
            {item.title.map((p, i) =>
              typeof p === "string" ? (
                <span key={i}>{p}</span>
              ) : (
                <b key={i} className="font-medium text-[var(--ds-ink)]">
                  {p.b}
                </b>
              )
            )}
            {item.unread && <span className="sr-only">, unread</span>}
          </button>
          <div className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--ds-subtle)]">
            {item.dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: item.dot }} />}
            <span className={cn(wide ? "line-clamp-2" : "truncate")}>{meta}</span>
          </div>
          {item.primary && (
            <div className="relative z-[1] mt-[9px] flex gap-1.5">
              <button
                type="button"
                onClick={() => onGo(item)}
                className={cn(MINI, "border-[var(--ds-accent)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]")}
              >
                {item.primary}
              </button>
              <button
                type="button"
                onClick={() => onSnooze(item)}
                title="Hide until tomorrow"
                className={cn(MINI, "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-hover)]")}
              >
                Snooze
              </button>
            </div>
          )}
        </div>
        {wide && item.actionLabel && (
          <span className="hidden shrink-0 self-center text-[13px] text-[var(--ds-muted)] group-hover/n:text-[var(--ds-ink)] md:block">
            {item.actionLabel}
          </span>
        )}
        {item.unread && (
          <span aria-hidden className="absolute top-4 right-3 size-[7px] rounded-full bg-[var(--ds-blue-fg)]" />
        )}
      </div>
    </li>
  );
}

/** "Today" and "Earlier" groups. */
export function NotificationGroups({
  today,
  earlier,
  render,
}: {
  today: ShownItem[];
  earlier: ShownItem[];
  render: (item: ShownItem, first: boolean) => ReactNode;
}) {
  return (
    <>
      {today.length > 0 && (
        <section aria-label="Today">
          <h3 className="m-0 px-2.5 pt-3 pb-1 text-[12px] font-medium text-[var(--ds-subtle)]">Today</h3>
          <ul className="m-0 list-none p-0">{today.map((i, n) => render(i, n === 0))}</ul>
        </section>
      )}
      {earlier.length > 0 && (
        <section aria-label="Earlier">
          <h3 className="m-0 px-2.5 pt-3 pb-1 text-[12px] font-medium text-[var(--ds-subtle)]">Earlier</h3>
          <ul className="m-0 list-none p-0">{earlier.map((i) => render(i, false))}</ul>
        </section>
      )}
    </>
  );
}

export function SeveritySegments({
  value,
  onChange,
  counts,
}: {
  value: SeverityFilter;
  onChange: (v: SeverityFilter) => void;
  counts: { all: number; urgent: number; warn: number; info: number };
}) {
  const opts: Array<[SeverityFilter, string, number]> = [
    ["all", "All", counts.all],
    ["urgent", "Urgent", counts.urgent],
    ["warn", "Action", counts.warn],
    ["info", "Heads up", counts.info],
  ];
  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex max-w-full rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]">
      {opts.map(([id, label, n]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded-[7px] px-2.5 py-[5px] text-[13px] whitespace-nowrap transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]",
            value === id
              ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
              : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          )}
        >
          {label}
          <em className="ml-[3px] text-[12px] font-normal text-[var(--ds-subtle)] not-italic">{n}</em>
        </button>
      ))}
    </div>
  );
}

/** Which kinds of notification to show (saved for this person, on this device). */
export function NotificationSettings({ who, muted }: { who: string; muted: Partial<Record<FeedCategory, boolean>> }) {
  const setMuted = useNotificationState((s) => s.setMuted);
  return (
    <ul className="m-0 list-none p-0">
      {(Object.keys(FEED_CATEGORY_LABEL) as FeedCategory[]).map((c) => {
        const id = `notif-setting-${c}`;
        return (
          <li key={c} className="flex items-center gap-3 border-t border-[var(--ds-line-2)] py-2.5 first:border-t-0">
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <span className="block text-[13.5px] text-[var(--ds-ink)]">{FEED_CATEGORY_LABEL[c].title}</span>
              <span className="mt-0.5 block text-[12px] text-[var(--ds-subtle)]">{FEED_CATEGORY_LABEL[c].sub}</span>
            </label>
            <Switch id={id} checked={!muted[c]} onCheckedChange={(on) => setMuted(who, c, !on)} />
          </li>
        );
      })}
    </ul>
  );
}
