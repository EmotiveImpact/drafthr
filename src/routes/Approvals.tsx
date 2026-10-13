import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpDown, ArrowUpRight, Check, CircleCheckBig, ClipboardCheck, ListFilter, Search, X } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { EmptyState, HealthRing } from "@/components/ds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BAND_BTN_GHOST, HomeBand } from "@/components/home/HomeBand";
import { shortDay, useHomeData } from "@/components/home/homeData";
import { PageThumb, metaFor } from "@/components/home/letterArt";
import {
  approvalRow,
  approvalsLedeParts,
  askedAgo,
  isForMe,
  recentlyApprovedBy,
  waitingLetters,
  type ApprovalRow,
} from "@/components/home/approvalData";
import { ApprovalPreview, BTN_SM_DARK, BTN_SM_GHOST, PersonDot } from "@/components/home/ApprovalPreview";
import { firstName } from "@/lib/journey/reviews";
import { FADE_IN_GROUP, ListPlaceholder } from "@/components/home/HomeParts";
import { useLettersLoading } from "@/components/home/loadState";
import { cn } from "@/lib/utils";

type SortKey = "oldest" | "recent";

const TOOL_BTN = cn(BAND_BTN_GHOST, "h-9 px-3 text-[13.5px]");

/**
 * Needs approval (a Home tab, mock approvals): every letter waiting for
 * sign-off, oldest first, with a preview of the selected one. People who
 * can approve (owner, admin, reviewer) approve or request changes from
 * the row or the preview; everyone else sees who the letter is with.
 */
export function Approvals() {
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const approveDraft = useDraftStore((s) => s.approveDraft);
  const requestChanges = useDraftStore((s) => s.requestChanges);
  const profile = useProfileStore((s) => s.profile);
  const home = useHomeData("employer");
  const loading = useLettersLoading();
  const me = (profile.personal.legalName || profile.personal.preferredName || "").trim();
  const canAct = home.canApprove;
  // Only the approver it was sent to signs it off (an owner or admin who
  // sent it to Ruth cannot approve their own letter, FEAT-X24). A letter
  // sent to the workspace's reviewers, and the reviewer role, as in the
  // letter itself (viewerIsApproverFor).
  const canActOn = (r: ApprovalRow) =>
    canAct && (profile.workspaceRole === "reviewer" || isForMe(r, me));

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("oldest");
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hintFor, setHintFor] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const rows = useMemo(
    () => waitingLetters(drafts).map((d) => approvalRow(d, matters, me)),
    [drafts, matters, me]
  );
  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.letterType, metaFor(r.letterType)?.shortTitle ?? r.title);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const hasEmployeeLetters = rows.some((r) => r.mode === "employee");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "all") return true;
        if (filter.startsWith("mode:")) return r.mode === filter.slice(5);
        return r.letterType === filter.slice(5);
      })
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.person.toLowerCase().includes(q))
      .sort((a, b) => (sortKey === "recent" ? b.askedAt - a.askedAt : a.askedAt - b.askedAt));
  }, [rows, filter, query, sortKey]);

  const current = filtered.find((r) => r.id === selected) ?? filtered[0] ?? null;
  const recent = useMemo(() => recentlyApprovedBy(drafts, me), [drafts, me]);

  // A letter that left the queue (approved elsewhere) drops its hint.
  useEffect(() => {
    if (hintFor && !rows.some((r) => r.id === hintFor)) setHintFor(null);
  }, [rows, hintFor]);

  const filterLabel =
    filter === "all"
      ? "All letter types"
      : filter === "mode:employer"
        ? "HR letters"
        : filter === "mode:employee"
          ? "Employee letters"
          : (types.find(([id]) => `type:${id}` === filter)?.[1] ?? "All letter types");

  const approve = (r: ApprovalRow) => {
    if (!canActOn(r)) return;
    approveDraft(r.id, me || "Workspace reviewer", notes[r.id]?.trim() || undefined);
    setNotes((n) => ({ ...n, [r.id]: "" }));
    setHintFor(null);
    toast.success("Approved", { description: r.person ? `${r.title} for ${r.person}` : r.title });
  };
  const askForChanges = (r: ApprovalRow) => {
    if (!canActOn(r)) return;
    const body = notes[r.id]?.trim();
    if (!body) {
      // Never send an empty request: show this letter and ask what to change.
      setSelected(r.id);
      setHintFor(r.id);
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    requestChanges(r.id, me || "Workspace reviewer", body);
    setNotes((n) => ({ ...n, [r.id]: "" }));
    setHintFor(null);
    toast.success("Changes requested", { description: r.person ? `${r.title} for ${r.person}` : r.title });
  };

  // "Waiting for your sign-off" counts only the letters you can sign off;
  // a letter you sent to someone else is just waiting for sign-off.
  const mine = rows.filter(canActOn);
  const lede = mine.length > 0 ? approvalsLedeParts(mine.map((r) => r.draft), true) : approvalsLedeParts(home.waiting, false);
  // Not yours: name the approver when every waiting letter went to one person.
  const approvers = [...new Set(rows.map((r) => r.approver))];
  const whose =
    mine.length > 0
      ? "your sign-off"
      : approvers.length === 1 && !/^workspace reviewer$/i.test(approvers[0])
        ? `${firstName(approvers[0]) || approvers[0]}'s sign-off`
        : "sign-off";

  return (
    <div className="min-w-0">
      <HomeBand
        active="approvals"
        approvals={home.waiting.length}
        lede={
          lede ? (
            <>
              <b>
                {lede.count} {lede.count === 1 ? "letter" : "letters"}
              </b>{" "}
              {lede.count === 1 ? "is" : "are"} waiting for {whose}
              {lede.count === 1 ? `, ${lede.sent}.` : `. The oldest was ${lede.sent}.`}
            </>
          ) : (
            <>Nothing is waiting for {canAct ? "your sign-off" : "sign-off"}.</>
          )
        }
      />

      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-7 px-4 pt-5 pb-12 md:px-12 md:pt-[26px]",
          rows.length > 0 && "xl:grid-cols-[minmax(0,1fr)_344px]"
        )}
      >
        <div className="min-w-0">
          {loading ? (
            <ListPlaceholder rows={3} label="Loading letters waiting for sign-off" />
          ) : rows.length === 0 ? (
            <div className="rounded-[16px] border border-[var(--ds-line)]">
              <EmptyState
                icon={ClipboardCheck}
                title="No letters waiting for approval"
                body="Letters sent for sign-off appear here. When something needs an approver, it shows in this list."
              />
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <label className="relative flex h-9 min-w-0 flex-1 basis-[220px] items-center sm:max-w-[340px]">
                  <Search className="pointer-events-none absolute left-3 size-4 text-[var(--ds-subtle)]" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search letters"
                    aria-label="Search"
                    className="h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pr-8 pl-[34px] text-[14px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-strong)] focus-visible:border-[var(--ds-ink)] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="absolute right-1.5 grid size-6 place-items-center rounded-[6px] text-[var(--ds-subtle)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </label>
                <span className="hidden flex-1 sm:block" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={TOOL_BTN}>
                      <ListFilter className="size-4" aria-hidden />
                      {filterLabel}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[230px]">
                    <DropdownMenuRadioGroup value={filter} onValueChange={setFilter}>
                      <DropdownMenuRadioItem value="all">All letter types</DropdownMenuRadioItem>
                      {hasEmployeeLetters && (
                        <>
                          <DropdownMenuRadioItem value="mode:employer">HR letters</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="mode:employee">Employee letters</DropdownMenuRadioItem>
                        </>
                      )}
                      {types.length > 0 && <DropdownMenuSeparator />}
                      {types.length > 0 && <DropdownMenuLabel>Letter type</DropdownMenuLabel>}
                      {types.map(([id, label]) => (
                        <DropdownMenuRadioItem key={id} value={`type:${id}`}>
                          {label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={TOOL_BTN}>
                      <ArrowUpDown className="size-4" aria-hidden />
                      {sortKey === "oldest" ? "Oldest first" : "Most recent first"}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuRadioGroup
                      aria-label="Submitted"
                      value={sortKey}
                      onValueChange={(v) => setSortKey(v as SortKey)}
                    >
                      <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="recent">Most recent first</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div
                aria-hidden
                className="hidden grid-cols-[34px_minmax(0,1fr)_56px_204px] gap-3.5 border-b border-[var(--ds-line)] px-3.5 pb-2 text-[12.5px] font-medium text-[var(--ds-subtle)] md:grid"
              >
                <span />
                <span>Letter and who asked</span>
                <span>Health</span>
                <span />
              </div>

              {filtered.length === 0 ? (
                <div className="mt-3 rounded-[16px] border border-[var(--ds-line)]">
                  <EmptyState
                    icon={Search}
                    title="Nothing matches those filters"
                    body="Try widening the filter or clearing the search."
                  />
                </div>
              ) : (
                <ul
                  key={`${filter}:${sortKey}`}
                  className={cn("m-0 list-none p-0", FADE_IN_GROUP)}
                  aria-label="Letters waiting for sign-off"
                >
                  {filtered.map((r) => (
                    <QueueRow
                      key={r.id}
                      row={r}
                      on={current?.id === r.id}
                      canAct={canActOn(r)}
                      onSelect={() => setSelected(r.id)}
                      onApprove={() => approve(r)}
                      onRequestChanges={() => askForChanges(r)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}

          {recent.length > 0 && (
            <section aria-label="Recently approved by you" className="mt-[26px]">
              <h2 className="m-0 mb-1.5 text-[15px] font-semibold text-[var(--ds-ink)]">Recently approved by you</h2>
              <ul className="m-0 list-none p-0">
                {recent.map((a) => (
                  <li key={a.id} className="border-b border-[var(--ds-line-2)]">
                    <Link
                      to={`/editor/${a.draftId}`}
                      className="flex items-center gap-2.5 rounded-[8px] px-3.5 py-2.5 text-[13.5px] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
                    >
                      <CircleCheckBig className="size-4 shrink-0 text-[var(--ds-green-fg)]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-[var(--ds-ink)]">{a.title}</span>
                        {a.person && <span className="text-[var(--ds-muted)]"> · {a.person}</span>}
                      </span>
                      <span className="shrink-0 text-[12.5px] text-[var(--ds-subtle)]">
                        {shortDay(a.at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {current && (
          <div className="min-w-0">
            <ApprovalPreview
              ref={noteRef}
              row={current}
              me={me || "You"}
              canAct={canActOn(current)}
              forMe={isForMe(current, me)}
              note={notes[current.id] ?? ""}
              onNote={(v) => {
                setNotes((n) => ({ ...n, [current.id]: v }));
                if (v.trim()) setHintFor(null);
              }}
              noteHint={hintFor === current.id}
              onApprove={() => approve(current)}
              onRequestChanges={() => askForChanges(current)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({
  row: r,
  on,
  canAct,
  onSelect,
  onApprove,
  onRequestChanges,
}: {
  row: ApprovalRow;
  on: boolean;
  canAct: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  // A click anywhere on the row (not on a link or button) shows it in the preview.
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest("a,button,input,textarea")) return;
    onSelect();
  };
  return (
    <li
      onClick={onRowClick}
      data-selected={on || undefined}
      className={cn(
        "grid cursor-default grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 border-b px-3.5 py-[13px] transition-colors duration-[120ms] md:grid-cols-[34px_minmax(0,1fr)_56px_204px]",
        on
          ? "rounded-[12px] border-transparent bg-[var(--ds-amber-chip)] shadow-[inset_0_0_0_1px_var(--ds-amber-chip-bd)]"
          : "border-[var(--ds-line-2)] hover:bg-[var(--ds-hover)]"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Preview ${r.title}${r.person ? ` for ${r.person}` : ""}`}
        aria-pressed={on}
        className="rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
      >
        <PageThumb tinted={on} />
      </button>
      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-medium text-[var(--ds-ink)]">
          <Link to={`/editor/${r.id}`} className="rounded-[4px] underline-offset-[3px] hover:underline">
            {r.title}
          </Link>
          {r.person && <span className="font-normal text-[var(--ds-muted)]"> · {r.person}</span>}
        </div>
        <div className="mt-[5px] flex min-w-0 items-center gap-[5px] overflow-hidden text-[12.5px] whitespace-nowrap text-[var(--ds-muted)]">
          <PersonDot name={r.requester} className="mr-0.5" />
          <span className="truncate">Asked by {r.requester}</span>
          <span aria-hidden className="text-[var(--ds-faint)]">·</span>
          <span className="shrink-0">{askedAgo(r.askedAt)}</span>
          {r.failing > 0 && (
            <>
              <span aria-hidden className="text-[var(--ds-faint)]">·</span>
              <span className="shrink-0 text-[11.5px] text-[var(--ds-red-fg)]">
                {r.failing} {r.failing === 1 ? "issue" : "issues"} to fix
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center">
        {r.score != null && (
          <HealthRing score={r.score} variant="big" size={34} stroke={3} className="[&_b]:text-[12px]" />
        )}
        <Link
          to={`/editor/${r.id}`}
          aria-label="Open in editor"
          className="ml-2 grid size-8 place-items-center rounded-[8px] text-[var(--ds-subtle)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] md:hidden"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
      {!canAct && (
        <span className="col-span-3 justify-self-end text-[12.5px] text-[var(--ds-muted)] md:col-span-1">
          {/^workspace reviewer$/i.test(r.approver) ? "With the approver" : `With ${r.approver.split(/\s+/)[0]}`}
        </span>
      )}
      {canAct && (
        <div className="col-span-3 flex justify-end gap-1.5 md:col-span-1">
          <button type="button" onClick={onRequestChanges} className={cn(BTN_SM_GHOST, "flex-1 md:flex-none")}>
            Request changes
          </button>
          <button type="button" onClick={onApprove} className={cn(BTN_SM_DARK, "flex-1 md:flex-none")}>
            <Check className="size-3.5" aria-hidden />
            Approve
          </button>
        </div>
      )}
    </li>
  );
}
