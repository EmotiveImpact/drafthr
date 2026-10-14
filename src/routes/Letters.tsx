import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Download, FileText, Layers, Plus, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canSubmitForReview } from "@/lib/permissions";
import { ListHeader, type ListTab } from "@/components/letters/ListHeader";
import { LettersTable, type Selection } from "@/components/letters/LettersTable";
import { useLetterRows, type LetterRowData } from "@/components/letters/rows";
import { useLetterArchive } from "@/components/letters/archive";
import { ArrowPager, BulkBar, FilterMenu, NoMatch, SearchField, SortMenu, usePage, type BulkAction, type FilterOption } from "@/components/letters/toolbar";
import { downloadText, todayStamp, useOrgName, usePageTitle, WithReason } from "@/components/letters/parts";
import { ChangeOwnerDialog, SubmitForApprovalDialog } from "@/components/letters/dialogs";
import { approvalSkipReason, changeOwner, lettersCsv, summariseReasons } from "@/components/letters/bulkActions";
import { useWorkspaceLoad } from "@/components/home/loadState";
import { ListPlaceholder } from "@/components/home/HomeParts";

type TabId = "all" | "needs-you" | "in-review" | "approval" | "sent" | "archived";
type SortId = "updated" | "oldest" | "health" | "name";

const TAB_IDS: TabId[] = ["all", "needs-you", "in-review", "approval", "sent", "archived"];
const PAGE_SIZE = 25;
const NO_MATTER = "__none";

const SORTS: { value: SortId; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "oldest", label: "Oldest first" },
  { value: "health", label: "Health" },
  { value: "name", label: "Name" },
];

const EMPTY_TAB: Record<TabId, string> = {
  all: "No letters here yet.",
  "needs-you": "Nothing needs you right now.",
  "in-review": "Nothing is out for review.",
  approval: "Nothing is waiting for approval.",
  sent: "Nothing sent yet. Letters appear here once you mark them as sent.",
  archived: "No archived letters.",
};

function inTab(r: LetterRowData, tab: TabId): boolean {
  if (tab === "archived") return r.archived;
  if (r.archived) return false;
  const j = r.journey;
  switch (tab) {
    case "all":
      return true;
    case "needs-you":
      return j.needsYou;
    case "in-review":
      return j.stage === "review" && (j.review?.status === "out" || j.review?.status === "back");
    case "approval":
      return j.stage === "approve";
    case "sent":
      return j.stage === "sent";
  }
}

/** Map old links: `?tab=draft` (the old Drafts tab) opens All. */
function readTab(raw: string | null): TabId {
  if (!raw) return "all";
  if (raw === "needs-approval") return "approval";
  return (TAB_IDS as string[]).includes(raw) ? (raw as TabId) : "all";
}

/**
 * Letters: every letter in the current mode, and where it is (f9-letters).
 * Tabs read `?tab=` so other pages (and the old /exported link) can open
 * Needs you, In review, Approval or Sent directly. Rows can be ticked for
 * bulk export, approval, owner change and archive.
 */
export function Letters() {
  usePageTitle("Letters");
  const role = useProfileStore((s) => s.profile.role);
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const submitForReview = useDraftStore((s) => s.submitForReview);
  const archive = useLetterArchive((s) => s.archive);
  const restore = useLetterArchive((s) => s.restore);
  const org = useOrgName();
  const [params, setParams] = useSearchParams();
  const tab = readTab(params.get("tab"));

  const all = useLetterRows();
  // The first pull from the server is still on its way and this device has
  // no letters yet: soft placeholders, as in the sidebar and on Home, never
  // "No letters yet" (LISTS-X1).
  const pulling = useWorkspaceLoad((s) => s.pulling);
  const loading = pulling && all.length === 0;
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [matter, setMatter] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);

  const isEmployee = role === "employee";
  const newHref = isEmployee ? "/me/new" : "/hr/new";
  const viewer = !canSubmitForReview(workspaceRole);

  const counts = useMemo(() => {
    const c = {} as Record<TabId, number>;
    for (const t of TAB_IDS) c[t] = 0;
    for (const r of all) for (const t of TAB_IDS) if (inTab(r, t)) c[t] += 1;
    return c;
  }, [all]);

  const live = useMemo(() => all.filter((r) => !r.archived), [all]);

  /* Filter menus offer the values present in the letters. */
  const options = useMemo(() => {
    const tally = (vals: (string | null | undefined)[]): FilterOption[] => {
      const m = new Map<string, number>();
      for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
    };
    const matters = new Map<string, { label: string; count: number }>();
    let none = 0;
    for (const r of live) {
      if (r.matter) {
        const cur = matters.get(r.matter.id) ?? { label: r.matter.name, count: 0 };
        cur.count += 1;
        matters.set(r.matter.id, cur);
      } else none += 1;
    }
    return {
      type: tally(live.map((r) => r.typeLabel)),
      person: tally(live.map((r) => r.recipient)),
      matter: [
        ...[...matters.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([value, v]) => ({ value, label: v.label, count: v.count })),
        ...(none > 0 ? [{ value: NO_MATTER, label: "No matter", count: none }] : []),
      ],
      owner: tally(live.map((r) => r.owner.name)),
    };
  }, [live]);

  const filtersSet = !!(q.trim() || type || person || matter || owner);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = all.filter((r) => {
      if (!inTab(r, tab)) return false;
      if (type && r.typeLabel !== type) return false;
      if (person && r.recipient !== person) return false;
      if (matter && (matter === NO_MATTER ? !!r.matter : r.matter?.id !== matter)) return false;
      if (owner && r.owner.name !== owner) return false;
      if (!t) return true;
      const hay = [r.label, r.typeLabel, r.draft.letterType.replace(/_/g, " "), r.recipient, r.matter?.name, r.owner.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
    const when = (r: LetterRowData) => (tab === "sent" ? (r.sentAt ?? r.updatedAt) : r.updatedAt);
    const sorted = [...list];
    if (sort === "updated") sorted.sort((a, b) => when(b) - when(a));
    else if (sort === "oldest") sorted.sort((a, b) => when(a) - when(b));
    else if (sort === "health") sorted.sort((a, b) => (a.health ?? 101) - (b.health ?? 101) || when(b) - when(a));
    else sorted.sort((a, b) => a.label.localeCompare(b.label));
    return sorted;
  }, [all, tab, q, type, person, matter, owner, sort]);

  const { page, pages, setPage } = usePage(rows.length, PAGE_SIZE, `${tab}|${q}|${type}|${person}|${matter}|${owner}|${sort}`);
  const pageRows = useMemo(() => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [rows, page]);

  /* Selection: only rows still shown stay ticked; switching tabs clears it. */
  useEffect(() => setSelected(new Set()), [tab]);
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const shown = new Set(pageRows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pageRows]);

  const selection: Selection = {
    selected,
    toggle: (id, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    toggleAll: (on) => setSelected(on ? new Set(pageRows.map((r) => r.id)) : new Set()),
  };
  const ticked = pageRows.filter((r) => selected.has(r.id));
  const eligible = ticked.filter((r) => !approvalSkipReason(r));

  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    setQ("");
    setType(null);
    setPerson(null);
    setMatter(null);
    setOwner(null);
  };

  const exportRows = (list: LetterRowData[], what: string) => {
    downloadText(`drafthr-letters-${todayStamp()}.csv`, lettersCsv(list));
    toast(`Downloaded ${what} as CSV`, { description: `drafthr-letters-${todayStamp()}.csv` });
  };

  const onSubmitForApproval = (approver: string) => {
    const skipped = ticked.map(approvalSkipReason).filter((r): r is string => !!r);
    for (const r of eligible) submitForReview(r.id, approver);
    const sent = eligible.length;
    toast(`${sent} sent for approval, ${skipped.length} skipped`, {
      description: skipped.length ? `Skipped: ${summariseReasons(skipped)}.` : `With ${approver} to approve.`,
    });
    setSelected(new Set());
  };

  const onArchive = (ids: string[]) => {
    archive(ids);
    setSelected(new Set());
    toast(`Archived ${ids.length === 1 ? "1 letter" : `${ids.length} letters`}`, {
      description: "Find them under Archived.",
      duration: 6000,
      action: { label: "Undo", onClick: () => restore(ids) },
    });
  };

  const onRestore = (ids: string[]) => {
    restore(ids);
    setSelected(new Set());
    toast(`Restored ${ids.length === 1 ? "1 letter" : `${ids.length} letters`}`);
  };

  const bulkActions: BulkAction[] = [
    { id: "export", label: "Export", icon: Download, onClick: () => exportRows(ticked, ticked.length === 1 ? "1 letter" : `${ticked.length} letters`) },
    ...(!isEmployee && tab !== "archived"
      ? [
          {
            id: "submit",
            label: "Submit for approval",
            icon: Send,
            onClick: () => setSubmitOpen(true),
            disabledReason: viewer ? "Viewers cannot send letters for approval" : null,
          },
          {
            id: "owner",
            label: "Change owner",
            icon: UserRound,
            onClick: () => setOwnerOpen(true),
            disabledReason: viewer ? "Viewers cannot change who owns a letter" : null,
          },
        ]
      : []),
    tab === "archived"
      ? { id: "restore", label: "Restore", icon: ArchiveRestore, onClick: () => onRestore(ticked.map((r) => r.id)) }
      : {
          id: "archive",
          label: "Archive",
          icon: Archive,
          onClick: () => onArchive(ticked.map((r) => r.id)),
          disabledReason: viewer ? "Viewers cannot archive letters" : null,
        },
  ];

  const needs = counts["needs-you"];
  const lede = loading ? (
    isEmployee ? (
      "Every letter you have drafted, and where it is."
    ) : (
      "Every letter, and where it is."
    )
  ) : isEmployee ? (
    <>Every letter you have drafted, and where it is.{needs > 0 && <> <b>{needs}</b> {needs === 1 ? "needs" : "need"} you.</>}</>
  ) : needs > 0 ? (
    <>
      Every letter, and where it is. <b>{needs}</b> {needs === 1 ? "needs" : "need"} you.
    </>
  ) : (
    <>Every letter, and where it is. Nothing needs you right now.</>
  );

  const tabs: ListTab[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "needs-you", label: "Needs you", count: counts["needs-you"] },
    { id: "in-review", label: "In review", count: counts["in-review"] },
    // Approval is an HR workspace flow; employees see it only when a letter
    // of theirs is waiting (or a link opens it).
    ...(!isEmployee || counts.approval > 0 || tab === "approval" ? [{ id: "approval", label: "Approval", count: counts.approval }] : []),
    { id: "sent", label: "Sent", count: counts.sent },
    ...(counts.archived > 0 || tab === "archived" ? [{ id: "archived", label: "Archived", count: counts.archived }] : []),
  ];

  const noun = tab === "sent" ? "sent letters" : tab === "archived" ? "archived letters" : "letters";
  const exportReason = rows.length === 0 ? "No letters to export in this view" : null;

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: org }, { label: "Letters" }]}
        title="Letters"
        lede={lede}
        actions={
          <>
            {!isEmployee && (
              <Button variant="outline" asChild>
                <Link to="/bulk">
                  <Layers className="size-[17px]" />
                  Bulk letters
                </Link>
              </Button>
            )}
            {all.length > 0 && (
              <WithReason reason={exportReason}>
                <Button
                  variant="outline"
                  disabled={!!exportReason}
                  onClick={() => exportRows(rows, rows.length === 1 ? "1 letter" : `${rows.length} letters`)}
                >
                  <Download className="size-[17px]" />
                  Export
                </Button>
              </WithReason>
            )}
            <Button asChild>
              <Link to={newHref}>
                <Plus className="size-[17px]" />
                New letter
              </Link>
            </Button>
          </>
        }
        tabs={all.length > 0 ? tabs : undefined}
        activeTab={tab}
        onTabChange={setTab}
        countStyle="chip-strong"
        tabsLabel="Letters"
      />

      {loading ? (
        <section aria-label="Letters" aria-busy="true" className="min-w-0 px-4 pb-10 pt-5 md:px-12 md:pt-[22px]">
          <ListPlaceholder rows={4} label="Loading letters" />
        </section>
      ) : all.length === 0 ? (
        <div className="px-4 py-6 md:px-12">
          <EmptyState
            icon={FileText}
            title="No letters yet"
            body="Your first letter takes about five minutes."
            primary={{ label: "New letter", to: newHref }}
          />
        </div>
      ) : (
        <section aria-label="Letters" className="min-w-0 px-4 pb-10 pt-5 md:px-12 md:pt-[22px]">
          <div className="mb-3.5 flex min-w-0 flex-wrap items-center gap-2">
            <SearchField
              value={q}
              onChange={setQ}
              label="Search letters"
              placeholder="Search letters, people or matters"
              className="md:w-[300px] md:flex-none"
            />
            <FilterMenu label="Type" options={options.type} value={type} onChange={setType} />
            <FilterMenu label="Person" options={options.person} value={person} onChange={setPerson} />
            <FilterMenu label="Matter" options={options.matter} value={matter} onChange={setMatter} />
            <FilterMenu label="Owner" options={options.owner} value={owner} onChange={setOwner} />
            <span className="hidden flex-1 md:block" />
            <SortMenu options={SORTS} value={sort} onChange={setSort} />
          </div>

          {rows.length === 0 ? (
            filtersSet ? (
              <NoMatch onClear={clearFilters}>{q.trim() ? `No letters match "${q.trim()}".` : "No letters match these filters."}</NoMatch>
            ) : (
              <NoMatch>{EMPTY_TAB[tab]}</NoMatch>
            )
          ) : (
            <>
              <LettersTable
                rows={pageRows}
                selection={selection}
                dateColumn={tab === "sent" ? "sent" : "updated"}
                ariaLabel={tab === "all" ? "Letters" : `${tabs.find((t) => t.id === tab)?.label ?? ""} letters`}
                menuExtra={(r) =>
                  r.archived ? (
                    <DropdownMenuItem onSelect={() => onRestore([r.id])}>
                      <ArchiveRestore />
                      Restore
                    </DropdownMenuItem>
                  ) : viewer ? null : (
                    <DropdownMenuItem onSelect={() => onArchive([r.id])}>
                      <Archive />
                      Archive
                    </DropdownMenuItem>
                  )
                }
              />
              <div className="flex items-center justify-between gap-3 px-3 pt-3.5 text-[13px] text-[var(--ds-muted)]">
                <span aria-live="polite">
                  Showing {pageRows.length} of {rows.length} {noun}
                </span>
                <ArrowPager page={page} pages={pages} onPage={setPage} />
              </div>
            </>
          )}

          <BulkBar count={ticked.length} actions={bulkActions} onClear={() => setSelected(new Set())} />
        </section>
      )}

      <SubmitForApprovalDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        count={ticked.length}
        eligible={eligible.length}
        onSubmit={onSubmitForApproval}
      />
      <ChangeOwnerDialog
        open={ownerOpen}
        onOpenChange={setOwnerOpen}
        count={ticked.length}
        onPick={(p) => {
          const n = changeOwner(
            ticked.map((r) => r.id),
            p
          );
          setSelected(new Set());
          toast(`${p.you ? "You now own" : `${p.name} now owns`} ${n === 1 ? "1 letter" : `${n} letters`}`);
        }}
      />
    </div>
  );
}
