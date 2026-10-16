import type { Draft } from "@/lib/letters/types";
import { formatDateOnly } from "@/lib/date-only";
import { textOf } from "./health-fix";

/**
 * The top of the letter page (mock f1 `.lh`, phone-letter `.lh`): the
 * company name on the left; the address (and the letterhead logo, when one
 * is set) on the right, then a hairline. From the draft's employer block,
 * the same details the exports print. Not editable on the page: change
 * them in Edit details or Settings.
 *
 * An employee's own letter (a grievance to their employer) comes from the
 * employee, not the company: the top shows their name and address, never
 * the employer's name, address or logo, so it does not read as if the
 * company issued it.
 */
export function Letterhead({ draft, fallbackName, fallbackAddress }: { draft: Draft; fallbackName?: string; fallbackAddress?: string }) {
  const fromEmployee = draft.mode === "employee";
  const name = fromEmployee
    ? draft.employee?.legalName?.trim() || draft.employee?.preferredName?.trim() || ""
    : draft.employer?.legalName?.trim() || fallbackName?.trim() || "";
  const address = (
    fromEmployee ? draft.employee?.address?.trim() || "" : draft.employer?.address?.trim() || fallbackAddress?.trim() || ""
  ).replace(/\s*\n\s*/g, ", ");
  const lines = address
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const logo = fromEmployee ? undefined : draft.employer?.letterheadDataUrl;
  const phone = fromEmployee ? "" : draft.employer?.phone?.trim() || "";
  if (!name && lines.length === 0 && !logo) return null;
  return (
    <header
      data-slot="letterhead"
      className="mb-5 flex items-start justify-between gap-6 border-b border-[var(--ds-line)] pb-4 max-md:mb-3.5 max-md:pb-3"
    >
      <div className="min-w-0">
        <div className="text-[19px] leading-tight text-[var(--ds-ink)] max-md:font-sans max-md:text-[14px] max-md:font-semibold">{name}</div>
        {(lines.length > 0 || phone) && (
          <div className="mt-0.5 font-sans text-[12px] leading-[1.5] text-[var(--ds-muted)] md:hidden">
            {[lines.join(", "), phone].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-3">
        {(lines.length > 0 || phone) && (
          <address className="text-right text-[12px] not-italic leading-[1.5] text-[var(--ds-muted)] max-md:hidden">
            {groupAddress(lines).map((l) => (
              <div key={l}>{l}</div>
            ))}
            {phone && <div>{phone}</div>}
          </address>
        )}
        {logo ? (
          <img src={logo} alt={`${name} logo`} className="h-7 w-auto max-w-[96px] object-contain max-md:h-6 max-md:max-w-[64px]" />
        ) : (
          name && !fromEmployee && (
            // On the phone sheet a small mark sits at the right of the
            // letterhead (mock phone-letter): the company's initial until a
            // letterhead logo is set in Settings.
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-[6px] bg-[var(--ds-ink)] font-sans text-[12px] font-semibold text-[var(--ds-on-accent)] md:hidden"
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )
        )}
      </div>
    </header>
  );
}

/** "Unit 4", "Quayside Park", "Bristol BS1 6XN" become two or three lines. */
function groupAddress(parts: string[]): string[] {
  if (parts.length <= 3) return parts;
  // Keep the last part (town and postcode) on its own line; pair the rest.
  const head = parts.slice(0, -1);
  const out: string[] = [];
  for (let i = 0; i < head.length; i += 2) out.push(head.slice(i, i + 2).join(", "));
  out.push(parts[parts.length - 1]);
  return out;
}

/** "Private and confidential" (or "Confidential"), as the draft is set. */
export function ConfidentialLine({ draft }: { draft: Draft }) {
  const c = draft.context.confidentiality;
  if (c !== "private_and_confidential" && c !== "confidential") return null;
  return (
    <p className="m-0 mb-1.5 font-serif text-[12px] uppercase tracking-[0.06em] text-[var(--ds-muted)] max-md:font-sans max-md:text-[11.5px] max-md:font-semibold max-md:text-[var(--ds-ink)]">
      {c === "private_and_confidential" ? "Private and confidential" : "Confidential"}
    </p>
  );
}

const DATE_RE = /\b\d{1,2}(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

/** The issue date line, when the recipient block does not already carry a date. */
export function needsIssueDate(draft: Draft): boolean {
  if (!draft.context.issueDate) return false;
  const recipient = draft.sections.find((s) => s.sectionId === "recipient_block");
  if (!recipient) return false;
  return !DATE_RE.test(textOf(recipient.html));
}

export function IssueDate({ draft, className }: { draft: Draft; className?: string }) {
  if (!needsIssueDate(draft)) return null;
  const text =
    draft.context.jurisdiction === "US"
      ? formatDateOnly(draft.context.issueDate, { month: "long", day: "numeric", year: "numeric" }, "en-US")
      : formatDateOnly(draft.context.issueDate, { day: "numeric", month: "long", year: "numeric" }, "en-GB");
  return <p className={className ?? "m-0 mb-3"}>{text}</p>;
}
