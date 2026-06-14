import { motion } from "framer-motion";
import { UserPlus, Users } from "lucide-react";
import type { MatterParticipant, MatterParticipantRole } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Strip of participant chips. Each chip shows initials, name and role tag.
 *
 * The participant editor is not built yet, so the "Add" affordance is rendered
 * as an honest, non-clickable "coming soon" control rather than a button whose
 * only behaviour is an apology alert (board CPO-04/JA-05). The slice + types are
 * ready for when the editor lands.
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function MatterParticipants({
  participants,
}: {
  participants: MatterParticipant[];
}) {
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
        {participants.length > 0 && (
          <span
            aria-disabled="true"
            title="Adding participants is coming soon"
            className="text-[11px] text-[var(--ds-subtle)] inline-flex items-center gap-1 cursor-not-allowed select-none"
          >
            <UserPlus className="size-3" /> Add · soon
          </span>
        )}
      </div>
      {participants.length === 0 ? (
        <span
          aria-disabled="true"
          title="Adding participants is coming soon"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ds-subtle)] rounded-md border border-dashed border-[var(--ds-line)] px-3 py-1.5 cursor-not-allowed select-none"
        >
          <UserPlus className="size-3.5" /> No participants yet — adding coming soon
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {participants.map((p, i) => (
            <div
              key={`${p.employeeId ?? "x"}-${i}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--ds-surface)] border border-[var(--ds-line)] pl-1 pr-3 py-1"
            >
              <span
                className="size-6 rounded-full grid place-items-center text-[10px] font-semibold text-[var(--ds-av-fg)]"
                style={{
                  background: `var(--ds-av-${(i % 8) + 1})`,
                }}
              >
                {initials(p.name) || "?"}
              </span>
              <span className="text-[12px] text-[var(--ds-ink)] font-medium">
                {p.name}
              </span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-[1px] rounded-full font-medium",
                  ROLE_TONE[p.role]
                )}
              >
                {ROLE_LABEL[p.role]}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
