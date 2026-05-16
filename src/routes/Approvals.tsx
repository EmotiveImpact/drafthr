import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { ClipboardCheck, ArrowRight, Search } from "lucide-react";
import { PageHeader, EmptyState, StatusDot } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { displayTitleFor } from "@/lib/letters/display";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, Mode } from "@/lib/letters/types";

type SortKey = "recent" | "oldest";

/**
 * Approval queue — every HR draft sitting in `in_review`. Reviewers land
 * here from the sidebar; rows deep-link straight into the editor where
 * the canvas is read-only and the Approve / Request changes actions live.
 */
export function Approvals() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const [modeFilter, setModeFilter] = useState<Mode | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const inReview = useMemo(
    () =>
      Object.values(drafts).filter(
        (d) => d.reviewStatus === "in_review" && !d.isTemplateSource
      ),
    [drafts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inReview
      .filter((d) => (modeFilter === "all" ? true : d.mode === modeFilter))
      .filter((d) => {
        if (!q) return true;
        const title = displayTitleFor(d).toLowerCase();
        const recipient =
          d.mode === "employer" ? d.employee.legalName : d.employer.legalName;
        return title.includes(q) || (recipient ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aT = a.submittedForReviewAt ?? a.updatedAt;
        const bT = b.submittedForReviewAt ?? b.updatedAt;
        return sortKey === "recent" ? bT - aT : aT - bT;
      });
  }, [inReview, modeFilter, query, sortKey]);

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Approvals" }]}
        title="Approval queue"
        lede="Drafts your team has submitted for sign-off. Open one to approve or request changes."
      />

      {/* Filters */}
      <Flex
        gap="3"
        align="end"
        wrap="wrap"
        mb="4"
        className="border-b border-[var(--ds-line-2)] pb-4"
      >
        <Box style={{ minWidth: 200 }} className="flex-1">
          <Text
            as="label"
            size="1"
            color="gray"
            weight="medium"
            mb="1"
            className="block"
          >
            Search
          </Text>
          <TextField.Root
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="By title or recipient"
          >
            <TextField.Slot>
              <Search className="size-3.5" />
            </TextField.Slot>
          </TextField.Root>
        </Box>
        <Box>
          <Text
            as="label"
            size="1"
            color="gray"
            weight="medium"
            mb="1"
            className="block"
          >
            Mode
          </Text>
          <Select.Root
            value={modeFilter}
            onValueChange={(v) => setModeFilter(v as Mode | "all")}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="all">All</Select.Item>
              <Select.Item value="employer">HR</Select.Item>
              <Select.Item value="employee">Employee</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
        <Box>
          <Text
            as="label"
            size="1"
            color="gray"
            weight="medium"
            mb="1"
            className="block"
          >
            Submitted
          </Text>
          <Select.Root
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="recent">Most recent first</Select.Item>
              <Select.Item value="oldest">Oldest first</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
      </Flex>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            inReview.length === 0
              ? "No drafts waiting for approval"
              : "Nothing matches those filters"
          }
          body={
            inReview.length === 0
              ? "Drafters submit letters here for sign-off. When something needs your eyes, it'll appear in this list."
              : "Try widening the mode filter or clearing the search."
          }
        />
      ) : (
        <Flex direction="column" gap="2">
          {filtered.map((d) => (
            <ApprovalRow key={d.id} draft={d} onOpen={() => nav(`/editor/${d.id}`)} />
          ))}
        </Flex>
      )}
    </Box>
  );
}

function ApprovalRow({ draft, onOpen }: { draft: Draft; onOpen: () => void }) {
  const meta = getLetterMeta(draft.letterType);
  const title = displayTitleFor(draft);
  const submittedAt = draft.submittedForReviewAt ?? draft.updatedAt;
  const ageLabel = formatAge(Date.now() - submittedAt);
  const submitterEntry = (draft.approvals ?? [])
    .slice()
    .reverse()
    .find((a) => a.decision === "submitted");
  const recipient =
    draft.mode === "employer"
      ? draft.employee.legalName || "(no recipient)"
      : `to ${draft.employer.legalName || "(employer)"}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full flex items-center gap-3 px-4 py-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:border-[var(--ds-ink)]/40 hover:bg-[var(--ds-line-2)]/30 transition group"
    >
      <Box className="flex-1 min-w-0">
        <Flex align="center" gap="2" className="min-w-0">
          <Text size="2" weight="medium" className="truncate text-[var(--ds-ink)]">
            {title}
          </Text>
          <StatusDot tone="amber" size="sm" inheritColor>
            In review
          </StatusDot>
        </Flex>
        <Text size="1" color="gray" className="block mt-0.5 truncate">
          {meta.shortTitle} · {recipient} · submitted {ageLabel}
          {submitterEntry?.reviewerName
            ? ` to ${submitterEntry.reviewerName}`
            : ""}
        </Text>
      </Box>
      <Button variant="ghost" size="2" tabIndex={-1}>
        Open in editor
        <ArrowRight className="size-3.5" />
      </Button>
    </button>
  );
}

function formatAge(ms: number): string {
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
