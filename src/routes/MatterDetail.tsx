import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Archive, ArrowLeft, FolderCheck, FolderMinus, MoreHorizontal, Pencil, Plus, RotateCcw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { daysUntilDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill, type PillTone } from "@/components/ds";
import { ListHeader } from "@/components/letters/ListHeader";
import { LettersTable } from "@/components/letters/LettersTable";
import { downloadText, MENU_MOTION, usePageTitle } from "@/components/letters/parts";
import { PromptDialog } from "@/components/letters/dialogs";
import { MatterRiskBadge } from "@/components/matter/MatterRiskBadge";
import { MatterParticipants } from "@/components/matter/MatterParticipants";
import { MatterTasks } from "@/components/matter/MatterTasks";
import { MatterCalendar } from "@/components/matter/MatterCalendar";
import { useMatterRows, type MatterRow } from "@/components/matter/rows";
import { DeleteMatterDialog, MatterMark, PeopleStack } from "@/components/matter/parts";
import { deadlinesIcs, relativeDays } from "@/components/matter/model";
import {
  AddLetterDialog,
  AskBox,
  CardLink,
  DeadlineTimeline,
  EvidenceList,
  evidenceRows,
  HistoryList,
  historyEntries,
  LetterTiles,
  NextStrip,
  SectionCard,
  SectionHead,
} from "@/components/matter/cards";

type TabId = "overview" | "letters" | "evidence" | "deadlines" | "notes" | "history";
const TABS: TabId[] = ["overview", "letters", "evidence", "deadlines", "notes", "history"];

/**
 * /matters/:matterId (matter mock): the matter's header with its people,
 * options menu and "Add a letter", then Overview (next step, ask box,
 * letters, evidence, tasks, deadlines with the tribunal limit, history) and
 * tabs for Letters, Evidence, Deadlines, Notes and History. The tab is in
 * the URL (`?tab=`).
 */
export function MatterDetail() {
  const { matterId } = useParams<{ matterId: string }>();
  const rows = useMatterRows(true);
  const row = rows.find((r) => r.matter.id === matterId);
  usePageTitle(row?.matter.name ?? "Matter not found");

  if (!row) {
    return (
      <div className="px-4 pt-10 md:px-12">
        <h1 className="ds-title m-0 text-[34px] leading-[1.1]">Matter not found</h1>
        <p className="m-0 mt-2 text-[15px] text-[var(--ds-muted)]">It may have been deleted, or the link is out of date.</p>
        <Link
          to="/matters"
          className="mt-4 inline-flex items-center gap-1.5 rounded-[6px] text-[14px] text-[var(--ds-ink)] outline-none hover:underline focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          <ArrowLeft className="size-3.5" /> Back to all matters
        </Link>
      </div>
    );
  }
  return <MatterPage row={row} />;
}

function MatterPage({ row }: { row: MatterRow }) {
  const nav = useNavigate();
  const m = row.matter;
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as TabId | null;
  const tab: TabId = raw && TABS.includes(raw) ? raw : "overview";
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setParams(next, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const updateMatter = useDraftStore((s) => s.updateMatter);
  const closeMatter = useDraftStore((s) => s.closeMatter);
  const archiveMatter = useDraftStore((s) => s.archiveMatter);
  const assignDraftToMatter = useDraftStore((s) => s.assignDraftToMatter);

  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const evidence = useMemo(() => evidenceRows(row.drafts), [row.drafts]);
  const history = useMemo(() => historyEntries(row.drafts), [row.drafts]);
  const lettersSorted = useMemo(() => [...row.letters].sort((a, b) => b.updatedAt - a.updatedAt), [row.letters]);

  const subject = row.people[0];
  const context = subject?.jobTitle || m.parties?.primaryContext;
  const next = row.next;
  const nextRel = next?.iso ? relativeDays(next.iso) : undefined;
  const nextDays = next?.iso ? daysUntilDateOnly(next.iso) : undefined;
  const nextTone: PillTone = !nextRel ? "blue" : nextRel.tone === "late" || next?.kind === "tribunal" ? "red" : nextRel.tone === "soon" ? "amber" : "blue";
  const closed = m.status !== "active";

  const removeFromMatter = (id: string) => {
    const label = row.letters.find((l) => l.id === id)?.label ?? "Letter";
    assignDraftToMatter(id, null);
    toast(`Removed "${label}" from the matter`, { action: { label: "Undo", onClick: () => assignDraftToMatter(id, m.id) } });
  };

  const exportIcs = () => {
    const entries = row.deadlines.filter((i) => i.iso).map((item) => ({ matter: m, item }));
    downloadText(`${m.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-deadlines.ics`, deadlinesIcs(entries), "text/calendar;charset=utf-8");
    toast(`Downloaded ${entries.length === 1 ? "1 deadline" : `${entries.length} deadlines`} as a calendar file`);
  };
  const datedCount = row.deadlines.filter((i) => i.iso).length;

  const lede = (
    <div key={m.status} className="flex min-w-0 flex-wrap items-center gap-x-0 gap-y-1.5 animate-in fade-in-0 duration-500 motion-reduce:duration-0">
      {context && <span className="truncate">{context}</span>}
      {context && <Sep />}
      <span className="whitespace-nowrap">Opened {format(m.createdAt, "d MMM yyyy")}</span>
      {m.status === "closed" && (
        <>
          <Sep />
          <span className="whitespace-nowrap text-[var(--ds-ink)]">Closed {format(m.updatedAt, "d MMM yyyy")}</span>
        </>
      )}
      <span className="ml-3 inline-flex flex-wrap items-center gap-1.5">
        {m.status === "archived" && <Pill tone="grey">Archived</Pill>}
        {m.status === "closed" && <Pill tone="grey">Closed</Pill>}
        {row.typeLabel && <Pill tone="grey">{row.typeLabel}</Pill>}
        <MatterRiskBadge band={row.risk} />
        {!closed && next?.iso && nextRel && (
          <Pill tone={nextTone} title={next.title}>
            {next.title.length > 30 ? `${next.title.slice(0, 28).trimEnd()}…` : next.title} {nextDays !== undefined && nextDays < 0 ? nextRel.text : nextDays === 0 ? "due today" : `due ${nextRel.text}`}
          </Pill>
        )}
        {m.counselReviewed && <Pill tone="green">Counsel reviewed</Pill>}
      </span>
    </div>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Matter options" title="Manage matter">
          <MoreHorizontal className="size-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16} align="end" sideOffset={8} className={cn("w-[248px] max-w-[calc(100vw-32px)]", MENU_MOTION)}>
        <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
          <Pencil />
          Rename matter
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPeopleOpen(true)}>
          <UserPlus />
          Edit participants
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            updateMatter(m.id, { counselReviewed: !m.counselReviewed });
            toast(m.counselReviewed ? "Marked as not counsel reviewed" : "Marked as counsel reviewed");
          }}
        >
          <ShieldCheck />
          {m.counselReviewed ? "Mark as not counsel reviewed" : "Mark as counsel reviewed"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {m.status === "active" ? (
          <DropdownMenuItem
            onSelect={() => {
              closeMatter(m.id);
              toast(`Closed "${m.name}"`);
            }}
          >
            <FolderCheck />
            Close matter
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => {
              updateMatter(m.id, { status: "active", archivedAt: undefined });
              toast(`Re-opened "${m.name}"`);
            }}
          >
            <RotateCcw />
            Re-open matter
          </DropdownMenuItem>
        )}
        {m.status !== "archived" && (
          <DropdownMenuItem
            onSelect={() => {
              const prev = m.status;
              archiveMatter(m.id);
              toast(`Archived "${m.name}"`, { action: { label: "Undo", onClick: () => updateMatter(m.id, { status: prev, archivedAt: undefined }) } });
            }}
          >
            <Archive />
            Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
          <Trash2 />
          Delete matter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-w-0">
      <ListHeader
        crumbs={[{ label: "Matters", href: "/matters" }, { label: row.ref }]}
        title={m.name}
        mark={<MatterMark matter={m} size={46} italic className={cn("transition-opacity duration-500 motion-reduce:transition-none", closed && "opacity-60")} />}
        lede={lede}
        below={m.description ? <p className="m-0 mt-2.5 max-w-[680px] text-[14px] leading-relaxed text-[var(--ds-muted)]">{m.description}</p> : undefined}
        actions={
          <>
            {row.people.length > 0 && (
              <button
                type="button"
                onClick={() => setPeopleOpen(true)}
                aria-label={`People in this matter: ${row.people.map((p) => p.name).join(", ")}`}
                className="mr-1 hidden rounded-full outline-none focus-visible:shadow-[var(--ds-focus-ring)] sm:inline-flex"
              >
                <PeopleStack people={row.people} size={30} max={4} />
              </button>
            )}
            {menu}
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-[17px]" />
              Add a letter
            </Button>
          </>
        }
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "letters", label: "Letters", count: row.letters.length },
          { id: "evidence", label: "Evidence", count: evidence.length },
          { id: "deadlines", label: "Deadlines", count: row.deadlines.length },
          { id: "notes", label: "Notes" },
          { id: "history", label: "History" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        countStyle="plain"
        tabsLabel="Matter sections"
        className={cn("transition-[filter] duration-500", closed && "[&_h1]:text-[var(--ds-body)]")}
      />

      <div className="min-w-0 px-4 pb-14 pt-5 md:px-12 md:pt-6">
        {tab === "overview" && (
          <div className="grid min-w-0 gap-9 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <NextStrip matter={m} tasks={row.tasks} letters={row.letters} onAddLetter={() => setAddOpen(true)} />
              <AskBox
                matter={m}
                counts={{ letters: row.letters.length, files: evidence.length, deadlines: datedCount }}
                onFiles={() => setTab("evidence")}
                onAddLetter={() => setAddOpen(true)}
              />
              <section className="mt-6" aria-label="Letters">
                <SectionHead
                  title="Letters"
                  sub="Everything written and sent in this matter"
                  action={row.letters.length > 0 ? <CardLink onClick={() => setTab("letters")}>View all</CardLink> : undefined}
                />
                {row.letters.length > 0 ? (
                  <LetterTiles rows={lettersSorted.slice(0, 3)} onRemove={removeFromMatter} />
                ) : (
                  <EmptyBox>
                    No letters in this matter yet. Use <b className="font-medium text-[var(--ds-ink)]">Add a letter</b> above to start one.
                  </EmptyBox>
                )}
              </section>
              <div className="mt-[22px] grid min-w-0 gap-3.5 md:grid-cols-2">
                <SectionCard
                  title="Evidence"
                  action={evidence.length > 0 ? <CardLink onClick={() => setTab("evidence")}>View all {evidence.length}</CardLink> : undefined}
                >
                  {evidence.length > 0 ? (
                    <EvidenceList rows={evidence.slice(0, 3)} />
                  ) : (
                    <p className="m-0 mb-3.5 text-[13px] text-[var(--ds-muted)]">
                      No evidence yet. Add files from a letter's Evidence page and they show here.
                    </p>
                  )}
                </SectionCard>
                <MatterTasks matterId={m.id} tasks={row.tasks} />
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              <SectionCard title="Deadlines" action={datedCount > 0 ? <CardLink onClick={exportIcs}>Export</CardLink> : undefined}>
                {row.deadlines.length > 0 ? (
                  <DeadlineTimeline items={row.deadlines} />
                ) : (
                  <div className="mb-3.5">
                    <p className="m-0 text-[13px] text-[var(--ds-muted)]">No deadlines yet</p>
                    <Button variant="outline" size="sm" className="mt-2.5" onClick={() => setTab("deadlines")}>
                      <Plus />
                      Add event
                    </Button>
                  </div>
                )}
              </SectionCard>
              <SectionCard title="History" action={history.length > 0 ? <CardLink onClick={() => setTab("history")}>View all</CardLink> : undefined}>
                {history.length > 0 ? (
                  <HistoryList entries={history.slice(0, 3)} />
                ) : (
                  <p className="m-0 mb-3.5 text-[13px] text-[var(--ds-muted)]">Nothing has happened on this matter's letters yet.</p>
                )}
              </SectionCard>
            </aside>
          </div>
        )}

        {tab === "letters" &&
          (row.letters.length > 0 ? (
            <LettersTable
              rows={lettersSorted}
              columns={["recipient", "where", "health", "updated", "owner"]}
              ariaLabel={`Letters in ${m.name}`}
              menuExtra={(r) => (
                <DropdownMenuItem onSelect={() => removeFromMatter(r.id)}>
                  <FolderMinus />
                  Remove from matter
                </DropdownMenuItem>
              )}
            />
          ) : (
            <EmptyBox>
              No letters in this matter yet. Use <b className="font-medium text-[var(--ds-ink)]">Add a letter</b> above to start one.
            </EmptyBox>
          ))}

        {tab === "evidence" && (
          <div className="max-w-[860px]">
            <SectionCard title="Evidence">
              {evidence.length > 0 ? (
                <EvidenceList rows={evidence} detailed />
              ) : (
                <p className="m-0 mb-3.5 text-[13.5px] text-[var(--ds-muted)]">
                  No evidence yet. Open a letter in this matter and add files on its Evidence page.
                </p>
              )}
            </SectionCard>
          </div>
        )}

        {tab === "deadlines" && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SectionCard title="Deadlines" action={datedCount > 0 ? <CardLink onClick={exportIcs}>Export</CardLink> : undefined}>
              {row.deadlines.length > 0 ? (
                <DeadlineTimeline items={row.deadlines} />
              ) : (
                <p className="m-0 mb-3.5 text-[13.5px] text-[var(--ds-muted)]">No deadlines yet. Add an event to start the timeline.</p>
              )}
            </SectionCard>
            <MatterCalendar matterId={m.id} events={row.events} />
          </div>
        )}

        {tab === "notes" && <MatterNotes key={m.id} matterId={m.id} value={m.description ?? ""} />}

        {tab === "history" && (
          <div className="max-w-[860px]">
            <SectionCard title="History">
              {history.length > 0 ? (
                <HistoryList entries={history} detailed />
              ) : (
                <p className="m-0 mb-3.5 text-[13.5px] text-[var(--ds-muted)]">Nothing has happened on this matter's letters yet.</p>
              )}
            </SectionCard>
          </div>
        )}
      </div>

      <AddLetterDialog matter={m} open={addOpen} onOpenChange={setAddOpen} />
      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename matter"
        label="Matter name"
        initial={m.name}
        onSave={(name) => {
          updateMatter(m.id, { name });
          toast("Matter renamed");
        }}
      />
      <Dialog open={peopleOpen} onOpenChange={setPeopleOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit participants</DialogTitle>
            <DialogDescription>The people this matter is about, and anyone else involved.</DialogDescription>
          </DialogHeader>
          <MatterParticipants matterId={m.id} participants={m.participants ?? []} primary={row.people.find((p) => p.role === "primary") ?? null} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeopleOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteMatterDialog matter={m} letterCount={row.letters.length} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={() => nav("/matters")} />
    </div>
  );
}

function Sep() {
  return (
    <span aria-hidden className="mx-2 text-[var(--ds-faint)]">
      ·
    </span>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[14px] bg-[var(--ds-surface-2)] px-6 py-8 text-center text-[13.5px] text-[var(--ds-muted)]">{children}</div>;
}

function MatterNotes({ matterId, value }: { matterId: string; value: string }) {
  const updateMatter = useDraftStore((s) => s.updateMatter);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const changed = text !== value;
  return (
    <div className="max-w-[760px]">
      <SectionCard title="Notes">
        <p className="m-0 mb-3 text-[13.5px] text-[var(--ds-muted)]">Context, decisions and anything worth remembering about this matter.</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          aria-label="Matter notes"
          placeholder="What happened, what was agreed, what to watch for."
          className="min-h-[200px] text-[14.5px]"
        />
        <div className="mb-3.5 mt-3 flex justify-end">
          <Button
            disabled={!changed}
            onClick={() => {
              updateMatter(matterId, { description: text.trim() || undefined });
              toast("Notes saved");
            }}
          >
            Save notes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
