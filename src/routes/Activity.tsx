import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import {
  Bot,
  FilePlus2,
  FileEdit,
  RotateCw,
  ShieldCheck,
  FileDown,
  Activity as ActivityIcon,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";
import { buildDraftTimeline, type DraftTimelineItem } from "@/lib/timeline";

type Event = DraftTimelineItem & {
  draftId: string;
  draftLabel: string;
  mode: "employer" | "employee";
};

export function Activity() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const events = useMemo(() => {
    const out: Event[] = [];
    const list = Object.values(drafts).filter((d) => (role ? d.mode === role : true));
    for (const d of list) {
      const label = safeMeta(d.letterType)?.shortTitle ?? d.letterType.replace(/_/g, " ");
      for (const event of buildDraftTimeline(d)) {
        out.push({
          ...event,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
        });
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [drafts, role]);

  const groups = useMemo(() => {
    const out: { day: string; events: Event[] }[] = [];
    for (const e of events) {
      const day = formatDay(e.createdAt);
      const existing = out.find((g) => g.day === day);
      if (existing) existing.events.push(e);
      else out.push({ day, events: [e] });
    }
    return out;
  }, [events]);

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Activity" }]}
        title="Audit trail"
        lede="Every draft you've created, regenerated, exported, and attested. Useful for a paper trail when sharing context with a lawyer or HR partner."
      />

      {events.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          body="Start drafting a letter and the audit trail builds itself — every regenerate, export, and attestation is logged here."
          primary={{ label: "Start a letter", to: "/" }}
        />
      ) : (
        <Flex direction="column" gap="3">
          {groups.map((g) => (
            <Card size="2" key={g.day}>
              <Heading size="2" mb="2">{g.day}</Heading>
              <Flex direction="column">
                {g.events.map((e, i) => (
                  <button key={i} onClick={() => nav(`/editor/${e.draftId}`)} className="text-left">
                    <Flex
                      px="4"
                      py="2"
                      align="start"
                      gap="3"
                      className="hover:bg-[var(--gray-2)] cursor-pointer border-b border-[var(--gray-5)] last:border-b-0"
                    >
                      <Box mt="1">{iconFor(e.kind)}</Box>
                      <Box className="flex-1 min-w-0">
                        <Text size="2" as="div">
                          {e.title}{" "}
                          <Text color="gray">· {e.draftLabel}</Text>
                        </Text>
                        <Flex align="center" gap="2" mt="1">
                          <Badge color="gray" variant="soft">
                            {e.mode === "employer" ? "HR" : "employee"}
                          </Badge>
                          {e.detail && <Text size="1" color="gray">· {e.detail}</Text>}
                        </Flex>
                      </Box>
                      <Text size="1" color="gray" className="tabular-nums shrink-0">{formatTime(e.createdAt)}</Text>
                    </Flex>
                  </button>
                ))}
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
    </Box>
  );
}

function iconFor(kind: Event["kind"]) {
  const cls = "size-4 text-[var(--gray-9)]";
  if (kind === "created") return <FilePlus2 className={cls} />;
  if (kind === "section_generated") return <RotateCw className={cls} />;
  if (kind === "exported") return <FileDown className={cls} />;
  if (kind === "counsel_review") return <ShieldCheck className="size-4 text-[var(--green-11)]" />;
  if (kind.startsWith("comment_")) return <MessageSquare className={cls} />;
  if (kind.startsWith("ai_")) return <Bot className={cls} />;
  if (kind.startsWith("collaborator_")) return <UserPlus className={cls} />;
  if (kind.endsWith("_updated")) return <FileEdit className={cls} />;
  return <ActivityIcon className={cls} />;
}

function safeMeta(id: string): { shortTitle: string } | null {
  try { return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]); } catch { return null; }
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export type { Draft as _Draft };
