import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArrowRight, ArrowUpRight, CalendarDays, FileText, FolderCheck, FolderOpen, FolderPlus, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/ds";
import { ListHeader } from "@/components/letters/ListHeader";
import { FilterMenu, NoMatch, SearchField, SortMenu } from "@/components/letters/toolbar";
import { downloadText, Initials, MENU_MOTION, todayStamp, useOrgName, usePageTitle, WithReason } from "@/components/letters/parts";
import { NewMatterDialog } from "@/components/matter/NewMatterDialog";
import { useMatterRows, type MatterRow } from "@/components/matter/rows";
import { DeadlineCell, DeleteMatterDialog, MatterMark, PeopleStack } from "@/components/matter/parts";
import { deadlinesIcs, dueWithin, MATTER_TYPE_LABEL, RISK_LABEL, RISK_OPTIONS, RISK_TONE, ROLE_LABEL } from "@/components/matter/model";
import type { MatterType } from "@/lib/letters/types";

type TabId = "open" | "closed" | "archived";
type SortId = "deadline" | "updated" | "name";

const SORTS: { value: SortId; label: string }[] = [
  { value: "deadline", label: "Next deadline" },
  { value: "updated", label: "Last updated" },
  { value: "name", label: "Name" },
];

const COLS = ["236px", "118px", "170px", "130px", "88px", "210px", "52px", "52px", "20px"];
const HEADS = ["Matter", "Type", "Employee", "Stage", "Risk", "Next deadline", "Letters", "Owner", ""];

/**
 * /matters: every matter in the current mode as a table (matters mock),
 * Open, Closed and Archived, with search, type, owner and risk filters, a
 * sort and an .ics export of upcoming deadlines.
 */
export function MattersIndex() {
  usePageTitle("Matters");
  const nav = useNavigate();
  const org = useOrgName();
  const role = useProfileStore((s) => s.profile.role) ?? "employer";
  const createMatter = useDraftStore((s) => s.createMatter);
  const updateMatter = useDraftStore((s) => s.updateMatter);
  const rows = useMatterRows();
  const [createOpen, setCreateOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: TabId = rawTab === "closed" || rawTab === "archived" ? rawTab : "open";
  const setTab = (t: TabId) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === "open") next.delete("tab");
        else next.set("tab", t);
        return next;
      },
      { replace: true }
    );
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>("deadline");

  const byTab = useMemo(
    () => ({
      open: rows.filter((r) => r.matter.status === "active"),
      closed: rows.filter((r) => r.matter.status === "closed"),
      archived: rows.filter((r) => r.matter.status === "archived"),
    }),
    [rows]
  );

  const upcoming7 = useMemo(() => byTab.open.reduce((n, r) => n + dueWithin(r.deadlines, 7).length, 0), [byTab.open]);
  const icsEntries = useMemo(
    () => byTab.open.flatMap((r) => r.deadlines.filter((i) => i.iso && !i.done).map((item) => ({ matter: r.matter, item }))),
    [byTab.open]
  );

  const typeOptions = useMemo(() => {
    // Every matter type the app knows, with its count (0 when none yet), so
    // the menu is the same list New matter offers.
    return (Object.keys(MATTER_TYPE_LABEL) as MatterType[]).map((t) => ({
      value: t,
      label: MATTER_TYPE_LABEL[t],
      count: rows.filter((r) => r.matter.type === t).length,
    }));
  }, [rows]);
  const ownerOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.owner, (m.get(r.owner) ?? 0) + 1);
    return [...m.entries()].map(([value, count]) => ({ value, label: value, count }));
  }, [rows]);

  const filtersSet = !!(q.trim() || type || owner || risk);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = byTab[tab].filter((r) => {
      if (type && r.matter.type !== type) return false;
      if (owner && r.owner !== owner) return false;
      if (risk && r.risk !== risk) return false;
      if (!t) return true;
      const hay = [r.matter.name, r.ref, r.typeLabel, r.matter.parties?.primaryName, r.matter.parties?.primaryContext, ...r.people.map((p) => p.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
    if (sort === "deadline") list.sort((a, b) => (a.next?.iso ?? "9999").localeCompare(b.next?.iso ?? "9999") || b.matter.updatedAt - a.matter.updatedAt);
    else if (sort === "updated") list.sort((a, b) => b.matter.updatedAt - a.matter.updatedAt);
    else list.sort((a, b) => a.matter.name.localeCompare(b.matter.name));
    return list;
  }, [byTab, tab, q, type, owner, risk, sort]);

  const clearFilters = () => {
    setQ("");
    setType(null);
    setOwner(null);
    setRisk(null);
  };

  const exportIcs = () => {
    downloadText(`drafthr-matter-deadlines-${todayStamp()}.ics`, deadlinesIcs(icsEntries), "text/calendar;charset=utf-8");
    toast(`Downloaded ${icsEntries.length === 1 ? "1 deadline" : `${icsEntries.length} deadlines`} as a calendar file`);
  };

  const prefix = role === "employer" ? "/hr" : "/me";
  const openCount = byTab.open.length;
  const tabNoun = tab === "open" ? "open" : tab;

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: org }, { label: role === "employer" ? "HR team" : "Matters" }]}
        title="Matters"
        lede={
          rows.length === 0 ? (
            "Named cases that bundle related letters about a person, hiring round or HR workstream."
          ) : (
            <>
              <b>
                {openCount} open {openCount === 1 ? "matter" : "matters"}
              </b>
              ,{" "}
              <b>
                {upcoming7} {upcoming7 === 1 ? "deadline" : "deadlines"}
              </b>{" "}
              in the next 7 days.
            </>
          )
        }
        actions={
          <>
            {rows.length > 0 && (
              <WithReason reason={icsEntries.length === 0 ? "No upcoming deadlines in open matters" : null}>
                <Button variant="outline" disabled={icsEntries.length === 0} onClick={exportIcs}>
                  <CalendarDays className="size-[17px]" />
                  Export deadlines
                </Button>
              </WithReason>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlus className="size-[17px]" />
              New matter
            </Button>
          </>
        }
        tabs={
          rows.length === 0
            ? undefined
            : [
                { id: "open", label: "Open", count: byTab.open.length },
                { id: "closed", label: "Closed", count: byTab.closed.length },
                { id: "archived", label: "Archived", count: byTab.archived.length },
              ]
        }
        activeTab={tab}
        onTabChange={(id) => setTab(id as TabId)}
        countStyle="plain"
        tabsLabel="Matters"
      />

      <NewMatterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={role}
        onCreate={(input) => {
          const { type: mtype, ...rest } = input;
          const id = createMatter({ ...rest, mode: role });
          if (mtype) updateMatter(id, { type: mtype });
          setCreateOpen(false);
          nav(`/matters/${id}`);
        }}
      />

      <section aria-label="Matters" className="min-w-0 px-4 pb-12 pt-5 md:px-12 md:pt-[22px]">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 grid size-11 place-items-center rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)]">
              <FolderOpen className="size-5" />
            </div>
            <h2 className="m-0 text-[16px] font-medium text-[var(--ds-ink)]">No matters yet</h2>
            <p className="m-0 mt-1.5 max-w-[52ch] text-[13.5px] text-[var(--ds-muted)]">
              Matters are named containers for related letters. Create one here, or promote a group of letters from{" "}
              <Link to={prefix} className="text-[var(--ds-ink)] underline underline-offset-2">
                Home
              </Link>
              .
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Button onClick={() => setCreateOpen(true)}>
                <FolderPlus className="size-[17px]" />
                New matter
              </Button>
              <Button variant="outline" asChild>
                <Link to={prefix}>
                  <ArrowRight className="size-[17px]" />
                  Go to Home
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-[18px] flex min-w-0 flex-wrap items-center gap-2.5">
              <SearchField value={q} onChange={setQ} label="Search matters" placeholder="Search matters or people" size="lg" className="md:w-[320px] md:flex-none" />
              <FilterMenu variant="button" label="Type" allLabel="All" options={typeOptions} value={type} onChange={setType} emptyText="No matter has a type yet" />
              <FilterMenu variant="button" label="Owner" allLabel="Anyone" options={ownerOptions} value={owner} onChange={setOwner} />
              <FilterMenu variant="button" label="Risk" allLabel="Any" options={RISK_OPTIONS} value={risk} onChange={setRisk} />
              <span className="hidden flex-1 md:block" />
              <SortMenu variant="button" options={SORTS} value={sort} onChange={setSort} />
            </div>

            {shown.length === 0 ? (
              filtersSet ? (
                <NoMatch onClear={clearFilters}>No matters match those filters.</NoMatch>
              ) : (
                <NoMatch>{tab === "open" ? "No open matters." : tab === "closed" ? "No closed matters." : "No archived matters."}</NoMatch>
              )
            ) : (
              <MattersTable rows={shown} quiet={tab !== "open"} />
            )}

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ds-line)] pt-3.5 text-[13px] text-[var(--ds-muted)]">
              <span aria-live="polite">
                Showing {shown.length} {tabNoun} {shown.length === 1 ? "matter" : "matters"}
              </span>
              {byTab[tab].length > 0 && <span>Last change {lastChange(byTab[tab])}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function lastChange(rows: MatterRow[]): string {
  const ts = Math.max(...rows.map((r) => Math.max(r.matter.updatedAt, ...r.drafts.map((d) => d.updatedAt))));
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const INTERACTIVE = "a,button,[role=menuitem],[data-radix-popper-content-wrapper]";

function MattersTable({ rows, quiet }: { rows: MatterRow[]; quiet?: boolean }) {
  const nav = useNavigate();
  const open = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    nav(`/matters/${id}`);
  };
  return (
    <div className={cn("min-w-0 animate-in fade-in-0 duration-200", quiet && "[&_[data-quiet]]:opacity-80")}>
      <table aria-label="Matters" className="hidden w-full table-fixed border-separate border-spacing-0 lg:table [&_td]:leading-[1.3]">
        <colgroup>
          {COLS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {HEADS.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap border-b border-[var(--ds-line)] px-2.5 pb-2.5 text-left text-[12.5px] font-medium text-[var(--ds-subtle)] first:pl-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const last = i === rows.length - 1;
            const td = cn(
              "whitespace-nowrap px-2.5 py-[13px] align-middle transition-colors duration-[120ms] group-hover/row:bg-[var(--ds-hover)]",
              !last && "border-b border-[var(--ds-line-2)]"
            );
            const subject = r.people[0];
            return (
              <tr key={r.matter.id} data-matter-id={r.matter.id} onClick={(e) => open(e, r.matter.id)} className="group/row cursor-pointer">
                <td className={cn(td, "rounded-l-[10px] pl-1")}>
                  <div data-quiet className="flex min-w-0 items-center gap-3">
                    <MatterMark matter={r.matter} />
                    <div className="min-w-0">
                      <Link
                        to={`/matters/${r.matter.id}`}
                        className="block truncate rounded-[4px] text-[14px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                      >
                        {r.matter.name}
                      </Link>
                      <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{r.ref}</div>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  {r.typeLabel ? <span className="block truncate text-[14px] text-[var(--ds-body)]">{r.typeLabel}</span> : <span className="text-[var(--ds-muted)]">-</span>}
                </td>
                <td className={td}>
                  {r.people.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PeopleStack people={r.people} size={26} max={3} />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-[var(--ds-ink)]">{r.people.length} people</div>
                        <div className="truncate text-[12.5px] text-[var(--ds-muted)]">
                          {subject.name}
                          {ROLE_LABEL[subject.role] ? `, ${ROLE_LABEL[subject.role].toLowerCase()}` : ""}
                        </div>
                      </div>
                    </div>
                  ) : subject ? (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Initials name={subject.name} size={28} />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-[var(--ds-ink)]">{subject.name}</div>
                        {subject.jobTitle && <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{subject.jobTitle}</div>}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[var(--ds-muted)]">-</span>
                  )}
                </td>
                <td className={td}>
                  <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
                </td>
                <td className={td}>
                  {r.risk ? <Pill tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]}</Pill> : <span className="text-[var(--ds-muted)]">-</span>}
                </td>
                <td className={td}>
                  <DeadlineCell item={r.next} />
                </td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ds-body)]">
                    <FileText aria-hidden className="size-[14px] text-[var(--ds-subtle)]" />
                    <span className="ds-mono">{r.letters.length}</span>
                  </span>
                </td>
                <td className={td}>
                  <span title={`Owner: ${r.owner}`} className="inline-flex">
                    <Initials name={r.owner} size={26} />
                    <span className="sr-only">Owner: {r.owner}</span>
                  </span>
                </td>
                <td className={cn(td, "rounded-r-[10px] px-0")}>
                  <MatterRowMenu row={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phones and narrow screens: stacked rows. */}
      <ul aria-label="Matters" className="m-0 flex list-none flex-col p-0 lg:hidden">
        {rows.map((r, i) => (
          <li
            key={r.matter.id}
            data-matter-id={r.matter.id}
            onClick={(e) => open(e, r.matter.id)}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[12px] px-2 py-3 transition-colors duration-[120ms] active:bg-[var(--ds-surface-2)]",
              i > 0 && "border-t border-[var(--ds-line-2)]"
            )}
          >
            <MatterMark matter={r.matter} />
            <div className="min-w-0 flex-1">
              <Link to={`/matters/${r.matter.id}`} className="block truncate rounded-[4px] text-[14px] font-medium text-[var(--ds-ink)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]">
                {r.matter.name}
              </Link>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--ds-muted)]">
                {r.people[0] && <span className="truncate">{r.people.length > 1 ? `${r.people.length} people` : r.people[0].name}</span>}
                <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
                {r.risk && <Pill tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]}</Pill>}
              </div>
              <div className="mt-2">
                <DeadlineCell item={r.next} />
              </div>
            </div>
            <MatterRowMenu row={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatterRowMenu({ row }: { row: MatterRow }) {
  const nav = useNavigate();
  const closeMatter = useDraftStore((s) => s.closeMatter);
  const archiveMatter = useDraftStore((s) => s.archiveMatter);
  const updateMatter = useDraftStore((s) => s.updateMatter);
  const [confirm, setConfirm] = useState(false);
  const m = row.matter;
  const reopen = () => {
    updateMatter(m.id, { status: "active", archivedAt: undefined });
    toast(`Re-opened "${m.name}"`);
  };
  return (
    // Clicks inside the menu or the dialog (portalled) must not reach the row.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${m.name}`}
            className="grid size-7 place-items-center rounded-[8px] text-[var(--ds-faint)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)] active:bg-[var(--ds-line)] data-[state=open]:bg-[var(--ds-surface-3)] data-[state=open]:text-[var(--ds-ink)]"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent collisionPadding={16} align="end" className={cn("w-56", MENU_MOTION)}>
          <DropdownMenuItem onSelect={() => nav(`/matters/${m.id}`)}>
            <ArrowUpRight />
            Open
          </DropdownMenuItem>
          {m.status === "active" ? (
            <DropdownMenuItem
              onSelect={() => {
                closeMatter(m.id);
                toast(`Closed "${m.name}"`, { action: { label: "Undo", onClick: () => updateMatter(m.id, { status: "active" }) } });
              }}
            >
              <FolderCheck />
              Close matter
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={reopen}>
              <RotateCcw />
              Re-open matter
            </DropdownMenuItem>
          )}
          {m.status !== "archived" && (
            <DropdownMenuItem
              onSelect={() => {
                archiveMatter(m.id);
                toast(`Archived "${m.name}"`, { action: { label: "Undo", onClick: () => updateMatter(m.id, { status: m.status, archivedAt: undefined }) } });
              }}
            >
              <Archive />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete matter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteMatterDialog matter={m} letterCount={row.letters.length} open={confirm} onOpenChange={setConfirm} />
    </span>
  );
}
