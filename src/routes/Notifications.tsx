import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import {
  ChevronLeft,
  Bell,
  ArrowUpRight,
  AlertTriangle,
  AlertCircle,
  Info,
  CalendarClock,
  ShieldAlert,
  ShieldCheck,
  FileWarning,
  Clock,
  UserRound,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import {
  deriveNotifications,
  type Notification,
  type NotificationKind,
  type NotificationSeverity,
} from "@/lib/notifications";

const SEVERITY_PILL: Record<NotificationSeverity, string> = {
  urgent: "bg-rose-50 text-rose-900 border-rose-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  info: "bg-muted text-foreground border-letter-rule",
};

const SEVERITY_RING: Record<NotificationSeverity, string> = {
  urgent: "border-rose-200 bg-rose-50/40",
  warn: "border-amber-200 bg-amber-50/40",
  info: "border-letter-rule bg-background",
};

export function Notifications() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);

  const list = useMemo(
    () => deriveNotifications(Object.values(drafts), profile),
    [drafts, profile]
  );

  const urgent = list.filter((n) => n.severity === "urgent");
  const warn = list.filter((n) => n.severity === "warn");
  const info = list.filter((n) => n.severity === "info");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav(-1)}
          className="text-muted-foreground -ml-3 mb-2 h-7"
        >
          <ChevronLeft className="size-3.5 mr-1" /> Back
        </Button>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
          Notifications
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          What needs your attention
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Derived from your drafts and profile — tribunal deadlines, ACAS Early Conciliation
          windows, missing required clauses, counsel-review-pending exports, and stale drafts.
          No emails sent yet — these are surfaced here so nothing slips.
        </p>
      </div>

      {list.length === 0 && (
        <div className="rounded-md border border-dashed border-letter-rule p-10 text-center">
          <Bell className="size-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">All clear.</p>
          <p className="text-xs text-muted-foreground mt-1">
            You'll see deadline reminders, compliance gaps, and counsel-review prompts here as
            you work.
          </p>
        </div>
      )}

      {urgent.length > 0 && (
        <Section title="Urgent" count={urgent.length} items={urgent} />
      )}
      {warn.length > 0 && <Section title="Action recommended" count={warn.length} items={warn} />}
      {info.length > 0 && <Section title="Heads up" count={info.length} items={info} />}
    </div>
  );
}

function Section({
  title,
  count,
  items,
}: {
  title: string;
  count: number;
  items: Notification[];
}) {
  const nav = useNavigate();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          <Badge className="bg-muted text-foreground border-letter-rule">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-sidebar-border">
          {items.map((n) => (
            <li
              key={n.id}
              onClick={() => n.actionHref && nav(n.actionHref)}
              className={`px-6 py-3 cursor-pointer hover:bg-muted/30 ${SEVERITY_RING[n.severity]}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5">{iconFor(n)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{n.title}</span>
                    <Badge className={SEVERITY_PILL[n.severity]}>{n.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {n.description}
                  </p>
                </div>
                {n.actionLabel && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1 shrink-0">
                    {n.actionLabel}
                    <ArrowUpRight className="size-3" />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function iconFor(n: Notification) {
  const map: Record<NotificationKind, typeof Bell> = {
    tribunal_deadline: CalendarClock,
    acas_ec_deadline: Clock,
    counsel_review_pending: ShieldAlert,
    compliance_gap: FileWarning,
    profile_incomplete: UserRound,
    stale_draft: Clock,
    wp_no_header: ShieldCheck,
  };
  const Icon =
    map[n.kind] ?? (n.severity === "urgent" ? AlertCircle : n.severity === "warn" ? AlertTriangle : Info);
  return <Icon className="size-4 text-muted-foreground" />;
}
