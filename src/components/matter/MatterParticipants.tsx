import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Users, X } from "lucide-react";
import type { MatterParticipant, MatterParticipantRole } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Strip of participant chips with a real add/remove editor (store-backed).
 * Participants link a matter to people — either existing employees (so the
 * employee↔matter relationship the Reports/Employees views rely on is fed) or
 * external parties (witnesses from another company) captured by name.
 */
const ROLE_LABEL: Record<MatterParticipantRole, string> = {
  subject: "subject",
  manager: "manager",
  accused: "accused",
  complainant: "complainant",
  witness: "witness",
  representative: "rep",
  other: "other",
};

const ROLE_TONE: Record<MatterParticipantRole, string> = {
  subject: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  manager: "bg-[var(--ds-line-2)] text-[var(--ds-body)]",
  accused: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  complainant: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  witness: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  representative: "bg-[var(--ds-line-2)] text-[var(--ds-body)]",
  other: "bg-[var(--ds-line-2)] text-[var(--ds-muted)]",
};

const ROLE_ORDER: MatterParticipantRole[] = [
  "subject",
  "manager",
  "complainant",
  "accused",
  "witness",
  "representative",
  "other",
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function MatterParticipants({
  matterId,
  participants,
}: {
  matterId: string;
  participants: MatterParticipant[];
}) {
  const employees = useDraftStore((s) => s.employees);
  const addParticipant = useDraftStore((s) => s.addMatterParticipant);
  const removeParticipant = useDraftStore((s) => s.removeMatterParticipant);

  const [adding, setAdding] = useState(false);
  // "" = external party (use the name field); otherwise an employee id.
  const [employeeId, setEmployeeId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [role, setRole] = useState<MatterParticipantRole>("subject");

  // Active employees not already participants — the picker options.
  const availableEmployees = useMemo(() => {
    const taken = new Set(
      participants.map((p) => p.employeeId).filter((id): id is string => !!id),
    );
    return Object.values(employees)
      .filter((e) => e.status !== "left" && !taken.has(e.id))
      .sort((a, b) => a.legalName.localeCompare(b.legalName));
  }, [employees, participants]);

  const resetForm = () => {
    setAdding(false);
    setEmployeeId("");
    setExternalName("");
    setRole("subject");
  };

  const canAdd = employeeId !== "" || externalName.trim().length > 0;

  const onAdd = () => {
    if (!canAdd) return;
    if (employeeId) {
      const emp = employees[employeeId];
      if (!emp) return;
      addParticipant(matterId, { employeeId: emp.id, name: emp.legalName, role });
    } else {
      addParticipant(matterId, {
        employeeId: null,
        name: externalName.trim(),
        role,
      });
    }
    resetForm();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
      className="mb-5"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0 flex items-center gap-1.5">
          <Users className="size-3" /> Participants
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1 transition"
          >
            <UserPlus className="size-3" /> Add
          </button>
        )}
      </div>

      {participants.length === 0 && !adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-muted)] rounded-md border border-dashed border-[var(--ds-line)] px-3 py-1.5 hover:border-[var(--ds-ink)] hover:text-[var(--ds-ink)] transition"
        >
          <UserPlus className="size-3.5" /> Add a participant
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {participants.map((p, i) => (
            <div
              key={`${p.employeeId ?? "x"}-${p.name}-${i}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--ds-surface)] border border-[var(--ds-line)] pl-1 pr-1.5 py-1"
            >
              <span
                className="size-6 rounded-full grid place-items-center text-[10px] font-semibold text-[var(--ds-av-fg)]"
                style={{ background: `var(--ds-av-${(i % 8) + 1})` }}
              >
                {initials(p.name) || "?"}
              </span>
              <span className="text-[12px] text-[var(--ds-ink)] font-medium">{p.name}</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-[1px] rounded-full font-medium",
                  ROLE_TONE[p.role],
                )}
              >
                {ROLE_LABEL[p.role]}
              </span>
              <button
                type="button"
                onClick={() => removeParticipant(matterId, i)}
                aria-label={`Remove ${p.name}`}
                className="size-5 grid place-items-center rounded-full text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-2">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-8 rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
          >
            <option value="">External party…</option>
            {availableEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.legalName}
              </option>
            ))}
          </select>

          {employeeId === "" && (
            <input
              type="text"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder="Name"
              className="h-8 w-40 rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
            />
          )}

          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MatterParticipantRole)}
            className="h-8 rounded-md border border-[var(--ds-line)] bg-white px-2 text-[12px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
          >
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd}
            className="h-8 rounded-md bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="h-8 rounded-md px-2 text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          >
            Cancel
          </button>
        </div>
      )}
    </motion.section>
  );
}
