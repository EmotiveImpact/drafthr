import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { PageHeader } from "@/components/ds";
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

const SEVERITY_COLOR: Record<NotificationSeverity, "red" | "amber" | "gray"> = {
  urgent: "red",
  warn: "amber",
  info: "gray",
};

const SEVERITY_BG: Record<NotificationSeverity, string | undefined> = {
  urgent: "var(--red-2)",
  warn: "var(--amber-2)",
  info: undefined,
};

export function Notifications() {
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
    <Box className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Notifications" }]}
        title="What needs your attention"
        lede="Derived from your drafts and profile — tribunal deadlines, ACAS Early Conciliation windows, missing required clauses, counsel-review-pending exports, and stale drafts."
      />

      {list.length === 0 && (
        <Card size="3">
          <Flex direction="column" align="center" gap="2" py="6">
            <Bell className="size-5 text-[var(--gray-9)]" />
            <Text size="2" weight="medium" as="p">All clear.</Text>
            <Text size="1" color="gray" align="center" as="p">
              You'll see deadline reminders, compliance gaps, and counsel-review prompts here.
            </Text>
          </Flex>
        </Card>
      )}

      <Flex direction="column" gap="3">
        {urgent.length > 0 && <Section title="Urgent" count={urgent.length} items={urgent} />}
        {warn.length > 0 && <Section title="Action recommended" count={warn.length} items={warn} />}
        {info.length > 0 && <Section title="Heads up" count={info.length} items={info} />}
      </Flex>
    </Box>
  );
}

function Section({ title, count, items }: { title: string; count: number; items: Notification[] }) {
  const nav = useNavigate();
  return (
    <Card size="2">
      <Flex align="center" gap="2" mb="3">
        <Heading size="3">{title}</Heading>
        <Badge color="gray" variant="soft">{count}</Badge>
      </Flex>
      <Flex direction="column">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => n.actionHref && nav(n.actionHref)}
            className="text-left"
          >
            <Flex
              px="4"
              py="3"
              gap="3"
              align="start"
              className="hover:bg-[var(--gray-2)] cursor-pointer border-b border-[var(--gray-5)] last:border-b-0"
              style={{ background: SEVERITY_BG[n.severity] }}
            >
              <Box mt="1">{iconFor(n)}</Box>
              <Box className="flex-1 min-w-0">
                <Flex align="center" gap="2" wrap="wrap">
                  <Text size="2" weight="medium">{n.title}</Text>
                  <Badge color={SEVERITY_COLOR[n.severity]} variant="soft">{n.severity}</Badge>
                </Flex>
                <Text size="1" color="gray" mt="1" as="p" className="leading-relaxed">{n.description}</Text>
              </Box>
              {n.actionLabel && (
                <Flex align="center" gap="1" className="shrink-0">
                  <Text size="1" color="gray">{n.actionLabel}</Text>
                  <ArrowUpRight className="size-3 text-[var(--gray-9)]" />
                </Flex>
              )}
            </Flex>
          </button>
        ))}
      </Flex>
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
  const Icon = map[n.kind] ?? (n.severity === "urgent" ? AlertCircle : n.severity === "warn" ? AlertTriangle : Info);
  return <Icon className="size-4 text-[var(--gray-9)]" />;
}
