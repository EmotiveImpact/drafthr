import { useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { MatterParticipant, MatterParticipantRole } from "@/lib/letters/types";
import type { MatterPerson } from "./model";
import { useDraftStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ds";
import { Initials } from "@/components/letters/parts";
import { SELECT_CLASS } from "./NewMatterDialog";

/**
 * The participants editor (Edit participants): each person with their role
 * and a remove button, and "Add a participant" for an employee from the
 * directory or an external party by name. Store-backed, so the header
 * avatars and the Employees counts update at once.
 */
const ROLE_LABEL: Record<MatterParticipantRole, string> = {
  subject: "Subject",
  manager: "Manager",
  accused: "Accused",
  complainant: "Complainant",
  witness: "Witness",
  representative: "Representative",
  other: "Other",
};

const ROLE_ORDER: MatterParticipantRole[] = ["subject", "manager", "complainant", "accused", "witness", "representative", "other"];

export function MatterParticipants({
  matterId,
  participants,
  primary,
}: {
  matterId: string;
  participants: MatterParticipant[];
  /**
   * The person named on the matter itself (its primary party) when they are
   * not also a participant. The header shows them, so the list does too.
   */
  primary?: MatterPerson | null;
}) {
  const employees = useDraftStore((s) => s.employees);
  const addParticipant = useDraftStore((s) => s.addMatterParticipant);
  const removeParticipant = useDraftStore((s) => s.removeMatterParticipant);

  const [adding, setAdding] = useState(participants.length === 0 && !primary);
  // "" = external party (use the name field); otherwise an employee id.
  const [employeeId, setEmployeeId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [role, setRole] = useState<MatterParticipantRole>("subject");

  // Active employees not already in the matter.
  const availableEmployees = useMemo(() => {
    const taken = new Set(participants.map((p) => p.employeeId).filter((id): id is string => !!id));
    if (primary?.employeeId) taken.add(primary.employeeId);
    return Object.values(employees)
      .filter((e) => e.status !== "left" && !taken.has(e.id))
      .sort((a, b) => a.legalName.localeCompare(b.legalName));
  }, [employees, participants, primary]);

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
      addParticipant(matterId, { employeeId: null, name: externalName.trim(), role });
    }
    resetForm();
  };

  return (
    <div className="grid gap-3">
      {participants.length === 0 && !primary ? (
        <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">Nobody is linked to this matter yet.</p>
      ) : (
        <ul className="m-0 list-none rounded-[12px] border border-[var(--ds-line)] p-0">
          {primary && (
            <li className="flex min-h-12 items-center gap-3 px-3 py-2">
              <Initials name={primary.name} seed={primary.employeeId ?? primary.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[var(--ds-ink)]">{primary.name}</span>
                <span className="block text-[12px] text-[var(--ds-muted)]">
                  {primary.employeeId ? "Employee" : "External party"}, named when the matter was opened
                </span>
              </span>
              <Tag>{ROLE_LABEL.subject}</Tag>
              {/* Keeps the rows lined up with the removable ones below. */}
              <span aria-hidden className="size-7" />
            </li>
          )}
          {participants.map((p, i) => (
            <li key={`${p.employeeId ?? "x"}-${p.name}-${i}`} className="flex min-h-12 items-center gap-3 border-t border-[var(--ds-line-2)] px-3 py-2 first:border-t-0">
              <Initials name={p.name} seed={p.employeeId ?? p.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[var(--ds-ink)]">{p.name}</span>
                <span className="block text-[12px] text-[var(--ds-subtle)]">{p.employeeId ? "Employee" : "External party"}</span>
              </span>
              <Tag>{ROLE_LABEL[p.role]}</Tag>
              <button
                type="button"
                onClick={() => removeParticipant(matterId, i)}
                aria-label={`Remove ${p.name}`}
                className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-subtle)] outline-none transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="grid gap-2 rounded-[12px] bg-[var(--ds-surface-2)] p-3">
          <span className="text-[13px] font-medium text-[var(--ds-ink)]">Add a participant</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Person" className={SELECT_CLASS + " h-9 text-[14px]"}>
              <option value="">External party…</option>
              {availableEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.legalName}
                </option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as MatterParticipantRole)} aria-label="Role" className={SELECT_CLASS + " h-9 text-[14px]"}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {employeeId === "" && (
            <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Name" aria-label="Name" className="h-9 text-[14px]" />
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={onAdd} disabled={!canAdd}>
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
          <UserPlus />
          Add a participant
        </Button>
      )}
    </div>
  );
}
