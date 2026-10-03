import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2, ListChecks } from "lucide-react";
import type { Task } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { formatDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tasks panel for a Matter. Renders open tasks first (sorted by due ascending)
 * then up to five most-recently-completed. Inline add-form for new tasks.
 */
export function MatterTasks({
  matterId,
  tasks,
}: {
  matterId: string;
  tasks: Task[];
}) {
  const createTask = useDraftStore((s) => s.createTask);
  const completeTask = useDraftStore((s) => s.completeTask);
  const updateTask = useDraftStore((s) => s.updateTask);
  const deleteTask = useDraftStore((s) => s.deleteTask);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");

  const open = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.dueISO ?? "9999").localeCompare(b.dueISO ?? "9999"));
  const completed = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    .slice(0, 5);

  const total = tasks.length;
  const openCount = open.length;

  const resetForm = () => {
    setLabel("");
    setDue("");
    setAdding(false);
  };

  const onSave = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    createTask({
      matterId,
      label: trimmed,
      dueISO: due || undefined,
      status: "open",
    });
    resetForm();
  };

  return (
    <section
      className="mb-5"
    >
      <div className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--ds-line-2)]">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0 flex items-center gap-1.5">
            <ListChecks className="size-3" /> Tasks
            <span className="text-[var(--ds-muted)] font-mono ml-1">
              {openCount}/{total}
            </span>
          </h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
            >
              <Plus className="size-3" /> New task
            </button>
          )}
        </div>

        {total === 0 && !adding ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-[var(--ds-muted)] m-0 mb-2">
              No tasks yet — track what needs doing next
            </p>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" /> New task
            </Button>
          </div>
        ) : (
          <ul className="m-0 p-0 list-none">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => completeTask(t.id)}
                onDelete={() => deleteTask(t.id)}
              />
            ))}
            {completed.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                // The completed check renders as a toggle button — clicking it
                // must RE-OPEN the task, not call the one-way completeTask
                // (which would just re-stamp doneAt to today).
                onToggle={() => updateTask(t.id, { status: "open", doneAt: undefined })}
                onDelete={() => deleteTask(t.id)}
                completed
              />
            ))}
          </ul>
        )}

        {adding && (
          <div className="border-t border-[var(--ds-line-2)] px-4 py-3 bg-[var(--ds-surface-2)]">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                autoFocus
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What needs doing?"
                className="flex-1 text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none focus:ring-2 focus:ring-[var(--ds-line)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                  if (e.key === "Escape") resetForm();
                }}
              />
              <input
                type="date"
                value={due}
                min={todayDateOnly()}
                onChange={(e) => setDue(e.target.value)}
                className="text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] outline-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={onSave} disabled={!label.trim()}>
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  completed,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  completed?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--ds-line-2)] first:border-t-0 group">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "shrink-0 transition",
          completed
            ? "text-[var(--ds-green-fg)]"
            : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
        )}
        title={completed ? "Completed" : "Mark complete"}
      >
        {completed ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-[13px] truncate",
            completed
              ? "text-[var(--ds-muted)] line-through"
              : "text-[var(--ds-ink)]"
          )}
        >
          {task.label}
        </div>
      </div>
      <div className="text-[11px] text-[var(--ds-muted)] shrink-0 tabular-nums">
        {completed
          ? task.doneAt
            ? `completed ${formatDateOnly(
                toDateOnly(new Date(task.doneAt)),
                { dateStyle: "medium" }
              )}`
            : "completed"
          : task.dueISO
          ? `due ${formatDateOnly(task.dueISO, { dateStyle: "medium" })}`
          : "no date"}
      </div>
      {!completed && (
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="hidden group-hover:inline-flex shrink-0"
        >
          Done
        </Button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)] opacity-0 group-hover:opacity-100 transition shrink-0"
        title="Delete task"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
