import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { ClipboardCheck, ArrowRight, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ds";
import { PageShell, PaperThumb, StatusPill } from "@/components/reports/parts";
import { useDraftStore } from "@/lib/store";
import { displayTitleFor } from "@/lib/letters/display";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, Mode } from "@/lib/letters/types";

type SortKey = "recent" | "oldest";

/**
 * Approval queue: every HR draft sitting in `in_review`. Reviewers land
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
    <PageShell>
      <PageHeader
        crumbs={[{ label: "Approvals" }]}
        title="Approval queue"
        lede="Drafts your team has submitted for sign-off. Open one to approve or request changes."
        tabs={[
          { id: "all", label: "All", count: inReview.length },
          { id: "employer", label: "HR", count: inReview.filter((d) => d.mode === "employer").length },
          { id: "employee", label: "Employee", count: inReview.filter((d) => d.mode === "employee").length },
        ]}
        activeTab={modeFilter}
        onTabChange={(id) => setModeFilter(id as Mode | "all")}
      />

      {/* Toolbar */}
      <Flex gap="3" align="center" wrap="wrap" mb="2" className="pl-3.5">
        <Text className="mr-auto text-[13px] text-[var(--ds-muted)]">
          {filtered.length === 1 ? "1 letter" : `${filtered.length} letters`}
        </Text>
        <Box className="min-w-0 flex-1 sm:max-w-[240px]">
          <TextField.Root
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or recipient"
            aria-label="Search"
          >
            <TextField.Slot>
              <Search className="size-3.5" />
            </TextField.Slot>
          </TextField.Root>
        </Box>
        <Select.Root
          value={sortKey}
          onValueChange={(v) => setSortKey(v as SortKey)}
        >
          <Select.Trigger aria-label="Submitted" />
          <Select.Content>
            <Select.Item value="recent">Most recent first</Select.Item>
            <Select.Item value="oldest">Oldest first</Select.Item>
          </Select.Content>
        </Select.Root>
      </Flex>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-[var(--ds-r-l)] border border-[var(--ds-line)]">
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
        </div>
      ) : (
        <>
          <div className="hidden min-h-[30px] grid-cols-[44px_minmax(0,1fr)_170px_110px_24px] items-center gap-4 border-b border-[var(--ds-line)] px-3.5 text-[12px] text-[var(--ds-muted)] md:grid">
            <span />
            <span>Letter</span>
            <span>Status</span>
            <span className="text-right">Submitted</span>
            <span />
          </div>
          <div className="flex flex-col gap-1 pt-1.5">
            {filtered.map((d) => (
              <ApprovalRow key={d.id} draft={d} onOpen={() => nav(`/editor/${d.id}`)} />
            ))}
          </div>
        </>
      )}
    </PageShell>
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
      className="group grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-3 rounded-[var(--ds-r-m)] bg-[var(--ds-amber-bg)] px-3.5 py-3 text-left transition hover:brightness-[0.98] md:grid-cols-[44px_minmax(0,1fr)_170px_110px_24px] md:gap-4"
    >
      <PaperThumb seed={draft.letterType} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-[var(--ds-ink)]">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ds-muted)]">
          {meta.shortTitle}, {recipient}
          {submitterEntry?.reviewerName ? `, sent to ${submitterEntry.reviewerName}` : ""}
          <span className="md:hidden">, submitted {ageLabel}</span>
        </span>
      </span>
      <span className="hidden md:block">
        <StatusPill tone="warn">Needs your approval</StatusPill>
      </span>
      <span className="hidden text-right text-[12.5px] text-[var(--ds-muted)] md:block">{ageLabel}</span>
      <span className="grid size-6 place-items-center text-[var(--ds-muted)] group-hover:text-[var(--ds-ink)]">
        <ArrowRight className="size-4" aria-label="Open in editor" />
      </span>
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
