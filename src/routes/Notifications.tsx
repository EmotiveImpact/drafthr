import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, EmptyState } from "@/components/ds";
import {
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
import { PageShell } from "@/components/reports/parts";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  urgent: "bg-[var(--ds-red-fg)]",
  warn: "bg-[var(--ds-amber-dot)]",
  info: "bg-[var(--ds-faint)]",
};

const SEVERITY_ICON_BG: Record<NotificationSeverity, string> = {
  urgent: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  warn: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  info: "bg-[var(--ds-chip)] text-[var(--ds-muted)]",
};

const SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  urgent: "Urgent",
  warn: "Action recommended",
  info: "Heads up",
};

type Tab = "all" | NotificationSeverity;

export function Notifications() {
  const drafts = useDraftStore((s) => s.drafts);
  const profile = useProfileStore((s) => s.profile);
  const [tab, setTab] = useState<Tab>("all");

  const list = useMemo(
    () =>
      deriveNotifications(
        Object.values(drafts).filter((d) => !d.isTemplateSource),
        profile
      ),
    [drafts, profile]
  );

  const urgent = list.filter((n) => n.severity === "urgent");
  const warn = list.filter((n) => n.severity === "warn");
  const info = list.filter((n) => n.severity === "info");

  return (
    <PageShell width="medium">
      <PageHeader
        crumbs={[{ label: "Notifications" }]}
        title="What needs your attention"
        lede="Derived from your drafts and profile: tribunal deadlines, ACAS Early Conciliation windows, missing required clauses, exports waiting on counsel review, and stale drafts."
        tabs={[
          { id: "all", label: "All", count: list.length },
          { id: "urgent", label: "Urgent", count: urgent.length },
          { id: "warn", label: "Action recommended", count: warn.length },
          { id: "info", label: "Heads up", count: info.length },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as Tab)}
      />

      {list.length === 0 && (
        <div className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)]">
          <EmptyState
            icon={Bell}
            title="All clear"
            body="You'll see deadline reminders, compliance gaps and counsel-review prompts here."
          />
        </div>
      )}

      <div className="flex flex-col gap-8">
        {(tab === "all" || tab === "urgent") && urgent.length > 0 && (
          <Section title="Urgent" items={urgent} />
        )}
        {(tab === "all" || tab === "warn") && warn.length > 0 && (
          <Section title="Action recommended" items={warn} />
        )}
        {(tab === "all" || tab === "info") && info.length > 0 && (
          <Section title="Heads up" items={info} />
        )}
        {tab !== "all" && list.length > 0 && list.every((n) => n.severity !== tab) && (
          <p className="m-0 py-10 text-center text-[13px] text-[var(--ds-muted)]">
            Nothing in {SEVERITY_LABEL[tab]} right now.
          </p>
        )}
      </div>
    </PageShell>
  );
}

function Section({ title, items }: { title: string; items: Notification[] }) {
  const nav = useNavigate();
  return (
    <section>
      <h2 className="m-0 mb-2 flex items-center gap-2 text-[15px] font-semibold text-[var(--ds-ink)]">
        {title}
        <span className="ds-mono text-[12px] font-normal text-[var(--ds-muted)]">{items.length}</span>
      </h2>
      <div className="flex flex-col">
        {items.map((n, i) => (
          <button
            key={n.id}
            type="button"
            onClick={() => n.actionHref && nav(n.actionHref)}
            className={cn(
              "group relative flex w-full cursor-pointer items-start gap-3 rounded-[var(--ds-r-m)] px-3 py-3.5 text-left hover:bg-[var(--ds-surface-2)]",
              i > 0 &&
                "before:absolute before:inset-x-3 before:top-0 before:border-t before:border-[var(--ds-line)] hover:before:border-transparent"
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)]",
                SEVERITY_ICON_BG[n.severity]
              )}
            >
              {iconFor(n)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} aria-hidden />
                <span className="text-[14px] font-semibold text-[var(--ds-ink)]">{n.title}</span>
                <span className="sr-only">{n.severity}</span>
              </span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                {n.description}
              </span>
            </span>
            {n.actionLabel && (
              <span className="mt-1 flex shrink-0 items-center gap-1 text-[12.5px] text-[var(--ds-muted)] group-hover:text-[var(--ds-ink)]">
                <span className="hidden sm:inline">{n.actionLabel}</span>
                <ArrowUpRight className="size-3.5" />
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
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
  const Icon = map[n.kind] ?? (n.severity === "urgent" ? AlertCircle : n.severity === "warn" ? AlertTriangle : Info);
  return <Icon className="size-4" />;
}
