import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Task } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { daysUntilDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TickBox } from "@/components/letters/parts";
import { CardLink, SectionCard } from "./cards";
import { shortDay } from "./model";

/**
 * Tasks card for a matter (matter mock `task()`): open tasks first by due
 * date, then up to five recently completed. Ticking completes a task;
 * unticking a done one re-opens it. "Add" shows an inline form.
 */
export function MatterTasks({ matterId, tasks, className }: { matterId: string; tasks: Task[]; className?: string }) {
  const createTask = useDraftStore((s) => s.createTask);
  const completeTask = useDraftStore((s) => s.completeTask);
  const updateTask = useDraftStore((s) => s.updateTask);
  const deleteTask = useDraftStore((s) => s.deleteTask);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");

  const open = tasks.filter((t) => t.status === "open").sort((a, b) => (a.dueISO ?? "9999").localeCompare(b.dueISO ?? "9999"));
  const completed = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    .slice(0, 5);

  const resetForm = () => {
    setLabel("");
    setDue("");
    setAdding(false);
  };
  const onSave = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    createTask({ matterId, label: trimmed, dueISO: due || undefined, status: "open" });
    resetForm();
  };

  return (
    <SectionCard title="Tasks" className={className} action={!adding ? <CardLink onClick={() => setAdding(true)}>Add</CardLink> : undefined}>
      {tasks.length === 0 && !adding ? (
        <div className="mb-3.5 rounded-[10px] bg-[var(--ds-surface-2)] px-4 py-5 text-center">
          <p className="m-0 mb-3 text-[13px] text-[var(--ds-muted)]">No tasks yet. Track what needs doing next.</p>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            New task
          </Button>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={() => completeTask(t.id)} onDelete={() => deleteTask(t.id)} />
          ))}
          {completed.map((t) => (
            // Unticking a done task re-opens it (completeTask is one way).
            <TaskRow key={t.id} task={t} onToggle={() => updateTask(t.id, { status: "open", doneAt: undefined })} onDelete={() => deleteTask(t.id)} completed />
          ))}
        </ul>
      )}

      {adding && (
        <div className="mb-3.5 mt-1 grid gap-2 rounded-[10px] bg-[var(--ds-surface-2)] p-3">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What needs doing?"
            aria-label="What needs doing?"
            className="h-9 text-[14px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") resetForm();
            }}
          />
          <Input type="date" value={due} min={todayDateOnly()} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="h-9 text-[14px]" />
          <div className="flex gap-2">
            <Button size="sm" onClick={onSave} disabled={!label.trim()}>
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function TaskRow({ task, onToggle, onDelete, completed }: { task: Task; onToggle: () => void; onDelete: () => void; completed?: boolean }) {
  const days = task.dueISO ? daysUntilDateOnly(task.dueISO) : undefined;
  const soon = days !== undefined && days <= 3;
  return (
    <li className="group/task flex min-h-[47px] items-center gap-3 border-t border-[var(--ds-line-2)] py-2 first:border-t-0">
      <TickBox
        checked={!!completed}
        onChange={onToggle}
        label={completed ? `Re-open ${task.label}` : `Complete ${task.label}`}
        className="rounded-[5px]"
      />
      <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", completed ? "text-[var(--ds-subtle)] line-through" : "text-[var(--ds-ink)]")}>{task.label}</span>
      <span className={cn("shrink-0 text-[12px]", !completed && soon ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-subtle)]")}>
        {completed
          ? task.doneAt
            ? `Done ${shortDay(toDateOnly(new Date(task.doneAt))).replace(/^\w+ /, "")}`
            : "Done"
          : task.dueISO
            ? shortDay(task.dueISO)
            : "No date"}
      </span>
      <button
        type="button"
        onClick={onDelete}
        title="Delete task"
        aria-label={`Delete task ${task.label}`}
        className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-faint)] opacity-60 outline-none transition-[opacity,color,background-color] duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-red-fg)] focus-visible:opacity-100 focus-visible:shadow-[var(--ds-focus-ring)] group-hover/task:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
