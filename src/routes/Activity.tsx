import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import {
  ChevronLeft,
  FilePlus2,
  FileEdit,
  RotateCw,
  ShieldCheck,
  FileDown,
  Activity as ActivityIcon,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";

type Event = {
  ts: number;
  draftId: string;
  draftLabel: string;
  mode: "employer" | "employee";
  kind: "created" | "regenerated" | "exported" | "counsel_review" | "updated";
  description: string;
  meta?: string;
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

      out.push({
        ts: d.createdAt,
        draftId: d.id,
        draftLabel: label,
        mode: d.mode,
        kind: "created",
        description: `Created ${label}`,
        meta: d.context.jurisdiction,
      });

      for (const sec of d.sections) {
        sec.versions.forEach((v, i) => {
          if (i === 0) return;
          out.push({
            ts: v.createdAt,
            draftId: d.id,
            draftLabel: label,
            mode: d.mode,
            kind: "regenerated",
            description: `Regenerated "${sec.title}"`,
            meta: `v${i + 1}`,
          });
        });
      }

      const review = (d.answers as Record<string, unknown>)._counselReview as
        | { reviewedBy?: string; reviewedOn?: string }
        | undefined;
      if (review?.reviewedBy && review.reviewedOn) {
        out.push({
          ts: new Date(review.reviewedOn).getTime() || d.updatedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "counsel_review",
          description: `Counsel review attested by ${review.reviewedBy}`,
          meta: review.reviewedOn,
        });
      }

      for (const ex of d.exports ?? []) {
        out.push({
          ts: ex.exportedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "exported",
          description: `Exported as ${ex.format.toUpperCase()}`,
          meta: ex.reviewedBy ? `attested by ${ex.reviewedBy}` : undefined,
        });
      }

      if (d.updatedAt - d.createdAt > 60_000 && !out.some((e) => e.draftId === d.id && e.ts === d.updatedAt)) {
        out.push({
          ts: d.updatedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "updated",
          description: `Last updated ${label}`,
        });
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }, [drafts, role]);

  const groups = useMemo(() => {
    const out: { day: string; events: Event[] }[] = [];
    for (const e of events) {
      const day = formatDay(e.ts);
      const existing = out.find((g) => g.day === day);
      if (existing) existing.events.push(e);
      else out.push({ day, events: [e] });
    }
    return out;
  }, [events]);

  return (
    <Box className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Box mb="6">
        <Button variant="ghost" size="1" color="gray" onClick={() => nav(-1)} className="!-ml-2 !mb-1">
          <ChevronLeft className="size-3.5" /> Back
        </Button>
        <Text size="1" color="gray" weight="medium" className="uppercase tracking-[0.18em]" as="div">Activity</Text>
        <Heading size="6" mt="1" mb="1">Audit trail</Heading>
        <Text size="2" color="gray" className="max-w-2xl">
          Every draft you've created, regenerated, exported, and attested. Useful for a paper trail
          when sharing context with a lawyer or HR partner.
        </Text>
      </Box>

      {events.length === 0 ? (
        <Card size="3">
          <Flex direction="column" align="center" gap="2" py="6">
            <ActivityIcon className="size-5 text-[var(--gray-9)]" />
            <Text size="2" weight="medium" as="p">No activity yet.</Text>
            <Text size="1" color="gray" align="center" as="p">
              Start drafting a letter and the audit trail builds itself.
            </Text>
          </Flex>
        </Card>
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
                          {e.description}{" "}
                          <Text color="gray">· {e.draftLabel}</Text>
                        </Text>
                        <Flex align="center" gap="2" mt="1">
                          <Badge color="gray" variant="soft">
                            {e.mode === "employer" ? "HR" : "employee"}
                          </Badge>
                          {e.meta && <Text size="1" color="gray">· {e.meta}</Text>}
                        </Flex>
                      </Box>
                      <Text size="1" color="gray" className="tabular-nums shrink-0">{formatTime(e.ts)}</Text>
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
  switch (kind) {
    case "created": return <FilePlus2 className={cls} />;
    case "regenerated": return <RotateCw className={cls} />;
    case "exported": return <FileDown className={cls} />;
    case "counsel_review": return <ShieldCheck className="size-4 text-[var(--green-11)]" />;
    case "updated": return <FileEdit className={cls} />;
    default: return <ActivityIcon className={cls} />;
  }
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
