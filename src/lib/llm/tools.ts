export const CLAUSE_TYPES = [
  "confidentiality",
  "non_compete",
  "non_solicitation",
  "ip_assignment",
  "indemnification",
  "right_of_appeal",
  "reservation_of_rights",
  "without_prejudice_header",
  "garden_leave",
  "data_protection",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

/**
 * Map a clause_type enum to a concrete refinement instruction. Called
 * client-side when the user clicks Apply on an addClause tool call.
 *
 * The matching server-side tool schema lives in server/agent-tools.ts. Keep
 * this union in sync with that schema when adding or removing clause types.
 */
export const CLAUSE_TEMPLATES: Record<ClauseType, string> = {
  confidentiality:
    "Add a confidentiality clause obliging the recipient to keep proprietary information confidential, surviving termination. UK: reference the implied duty + any contract clause. US: tie to applicable trade-secrets law and any signed NDA.",
  non_compete:
    "Add a post-termination non-compete clause. UK: must be no broader than reasonably necessary in scope, geography, and duration to be enforceable (12 months max typically). US: do NOT add in CA, ND, OK, MN.",
  non_solicitation:
    "Add a post-termination non-solicitation of customers / employees clause. Cap duration and scope explicitly.",
  ip_assignment:
    "Add an intellectual-property assignment clause: any work created in the course of employment vests in the employer; recipient assigns all rights and waives moral rights so far as the law permits.",
  indemnification:
    "Add a mutual indemnification clause limited to direct losses arising from the indemnifying party's gross negligence or wilful misconduct. Cap at the fees paid in the preceding 12 months.",
  right_of_appeal:
    "Add a mandatory right-of-appeal paragraph: name the appeal officer, give a 5-working-day deadline, reference s.10 ERelA 1999 for the right to be accompanied (UK).",
  reservation_of_rights:
    "Add a reservation-of-rights paragraph: 'I reserve all my rights, including statutory, contractual, and common-law remedies, and the right to bring proceedings before the Employment Tribunal / EEOC / state agency.'",
  without_prejudice_header:
    "Prepend the header '<p><strong>Without Prejudice and Subject to Contract</strong></p>' as the first paragraph of the section.",
  garden_leave:
    "Add a garden-leave clause: employee remains employed and paid during the notice period but is required not to attend the workplace or contact clients. Only enforceable if contractually provided for.",
  data_protection:
    "Add a data-protection clause: the parties will process personal data in compliance with UK GDPR / GDPR / applicable state privacy law; include the lawful basis being relied on.",
};
