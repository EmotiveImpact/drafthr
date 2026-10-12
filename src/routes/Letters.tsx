import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Plus, Search, X } from "lucide-react";
import { PageHeader, EmptyState, type PageTab } from "@/components/ds";
import { LetterRows } from "@/components/letters/LetterRows";
import {
  categoryLabel,
  letterBucket,
  letterLabel,
  letterParty,
  type LetterBucket,
} from "@/components/letters/letterView";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canApprove } from "@/lib/permissions";

type TabId = "all" | LetterBucket;

const TAB_IDS: TabId[] = ["all", "approval", "draft", "sent"];

/**
 * Letters: every letter in the current mode in one list (design 2A header
 * with pill tabs over 13B rows). Same source as the sidebar's recent letters:
 * the draft store, minus template-authoring drafts, filtered by the person's
 * mode. Tabs read `?tab=` so other pages can link straight to Sent or
 * Needs approval.
 */
export function Letters() {
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const viewerCanApprove = canApprove(workspaceRole);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");

  const tabParam = params.get("tab") as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : "all";

  const all = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => !d.isTemplateSource)
        .filter((d) => (role ? d.mode === role : true))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, role]
  );

  const counts = useMemo(() => {
    const c = { approval: 0, draft: 0, sent: 0 };
    for (const d of all) c[letterBucket(d)] += 1;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((d) => {
      if (tab !== "all" && letterBucket(d) !== tab) return false;
      if (!t) return true;
      const hay = [letterLabel(d), letterParty(d), categoryLabel(d.letterType) ?? "", d.letterType.replace(/_/g, " ")]
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
  }, [all, tab, q]);

  const tabs: PageTab[] = [
    { id: "all", label: "All", count: all.length },
    // Approval is an HR workspace flow; employees only see the tab if a
    // letter of theirs is actually waiting.
    ...(role !== "employee" || counts.approval > 0 || tab === "approval"
      ? [{ id: "approval", label: "Needs approval", count: counts.approval }]
      : []),
    { id: "draft", label: "Drafts", count: counts.draft },
    { id: "sent", label: "Sent", count: counts.sent },
  ];

  const onTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
  };

  const newHref = role === "employee" ? "/me/new" : "/hr/new";
  const lede =
    role === "employee"
      ? "Every letter you have drafted, checked and sent."
      : "Every letter your team has drafted, checked and sent.";

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10 lg:px-11">
      <PageHeader
        title="Letters"
        lede={lede}
        actions={
          <Link
            to={newHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3.5 text-[13.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
          >
            <Plus className="size-4" />
            New letter
          </Link>
        }
        tabs={tabs}
        activeTab={tab}
        onTabChange={onTab}
      />

      {all.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No letters yet"
          body="Letters you draft appear here, with their status, health score and when they were last touched."
          primary={{ label: "Start a letter", to: newHref }}
        />
      ) : (
        <section aria-label="Letters" className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 pb-3 pl-2.5">
            <span className="text-[13px] whitespace-nowrap text-[var(--ds-muted)]" aria-live="polite">
              {rows.length} {rows.length === 1 ? "letter" : "letters"}
            </span>
            <label className="flex h-8 w-full max-w-[240px] min-w-0 cursor-text items-center gap-[7px] rounded-[var(--ds-r-s)] border border-transparent bg-[var(--ds-surface-2)] px-[9px] text-[var(--ds-muted)] focus-within:border-[var(--ds-line-strong)] focus-within:bg-[var(--ds-surface)] sm:w-[220px]">
              <Search className="size-3.5 shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search letters"
                aria-label="Search letters"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-muted)] [&::-webkit-search-cancel-button]:hidden"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                  className="grid size-5 place-items-center rounded text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
                >
                  <X className="size-3" />
                </button>
              )}
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-5 py-8 text-center text-[13px] text-[var(--ds-muted)]">
              {q ? `No letters match "${q.trim()}".` : emptyTabCopy(tab)}
            </div>
          ) : (
            <LetterRows drafts={rows} viewerCanApprove={viewerCanApprove} />
          )}
        </section>
      )}
    </div>
  );
}

function emptyTabCopy(tab: TabId): string {
  switch (tab) {
    case "approval":
      return "Nothing is waiting for approval.";
    case "sent":
      return "Nothing sent yet. Letters appear here once you export them.";
    case "draft":
      return "No drafts in progress.";
    default:
      return "No letters yet.";
  }
}
