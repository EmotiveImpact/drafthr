import type { EmployerLetterTypeId, EmployeeLetterTypeId, LetterTypeId, Mode } from "./types";
import {
  EMPLOYEE_UNIVERSAL_STEPS,
  EMPLOYEE_LETTER_QUESTIONS,
} from "./questions/employee";

export type QuestionType =
  | "text"
  | "textarea"
  | "date"
  | "select"
  | "select_multi"
  | "boolean"
  | "number"
  | "currency"
  | "repeater";

export type RepeaterConfig = {
  /** Singular noun shown on Add/Remove buttons and item headers — e.g. "Incident", "Witness". */
  itemLabel: string;
  /** Sub-fields rendered per item. IDs are scoped under the parent question id. */
  fields: Question[];
  minItems?: number;
  maxItems?: number;
  /** How many empty items to show on first render. Default 1. */
  defaultItems?: number;
};

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  jurisdiction?: "UK" | "US";
  showIf?: (answers: Record<string, unknown>) => boolean;
  /** Only meaningful when type === "repeater". */
  repeater?: RepeaterConfig;
};

/** Type guard for the value stored under a repeater question. */
export type RepeaterValue = Array<Record<string, unknown>>;

/**
 * Whether a stored answer satisfies a question's `required` constraint.
 *
 * Repeater-aware: `RepeaterField` auto-hydrates a required repeater that has
 * `defaultItems >= 1` into an array of EMPTY objects (`[{}, {}]`). A naive
 * `Array.isArray(v) && v.length > 0` gate therefore treats a brand-new,
 * untouched repeater as "answered", letting the wizard enable "Generate draft"
 * with completely blank findings/incidents/criteria — a real validation
 * bypass on tribunal-grade letters. Here a required repeater counts as answered
 * only when it has at least `max(minItems, 1)` items whose own required
 * sub-fields are filled (and which carry at least one value).
 */
export function isQuestionAnswered(q: Question, value: unknown): boolean {
  if (q.type === "repeater") {
    if (!Array.isArray(value)) return false;
    const fields = q.repeater?.fields ?? [];
    const needed = Math.max(q.repeater?.minItems ?? 0, 1);
    const complete = (value as RepeaterValue).filter((item) =>
      isRepeaterItemComplete(fields, item)
    );
    return complete.length >= needed;
  }
  // select_multi and other array-valued answers: any non-empty selection.
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== "" && value !== null;
}

function isRepeaterItemComplete(
  fields: Question[],
  item: Record<string, unknown>
): boolean {
  const requiredOk = fields
    .filter((f) => f.required)
    .every((f) => isQuestionAnswered(f, item[f.id]));
  // Guard the no-required-sub-fields case: an item must carry at least one
  // value so a bare `{}` never counts as complete.
  const hasAnyValue = fields.some((f) => {
    const v = item[f.id];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== "" && v !== null;
  });
  return requiredOk && hasAnyValue;
}

/**
 * Whether a question should be shown for the current answers.
 *
 * Enforces BOTH gates: the `jurisdiction` marker (previously dead metadata —
 * many `(UK)`/`(US)`-labelled questions carried it but the wizard only ever
 * checked `showIf`, so e.g. a US termination showed the UK "Disciplinary
 * hearing date" and "Appeal officer" fields, polluting the draft/LLM with
 * wrong-jurisdiction data) AND the `showIf` predicate. A jurisdiction-tagged
 * question is hidden until the (universal, first-step) jurisdiction answer
 * matches.
 */
export function isQuestionVisible(
  q: Question,
  answers: Record<string, unknown>
): boolean {
  if (q.jurisdiction && q.jurisdiction !== answers.jurisdiction) return false;
  if (q.showIf && !q.showIf(answers)) return false;
  return true;
}

export type QuestionStep = {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
};

/** Universal questions asked on every letter, before letter-specific questions. */
export const UNIVERSAL_STEPS: QuestionStep[] = [
  {
    id: "jurisdiction",
    title: "Jurisdiction",
    description:
      "We tailor the legal language by country and region. Your selection drives every clause and disclaimer.",
    questions: [
      {
        id: "jurisdiction",
        type: "select",
        label: "Country of employment",
        required: true,
        options: [
          { value: "UK", label: "United Kingdom" },
          { value: "US", label: "United States" },
        ],
      },
      {
        id: "ukRegion",
        type: "select",
        label: "UK region",
        required: true,
        showIf: (a) => a.jurisdiction === "UK",
        options: [
          { value: "England & Wales", label: "England and Wales" },
          { value: "Scotland", label: "Scotland" },
          { value: "Northern Ireland", label: "Northern Ireland" },
        ],
      },
      {
        id: "usState",
        type: "select",
        label: "US state",
        required: true,
        showIf: (a) => a.jurisdiction === "US",
        options: [
          { value: "AL", label: "Alabama" },
          { value: "AK", label: "Alaska" },
          { value: "AZ", label: "Arizona" },
          { value: "AR", label: "Arkansas" },
          { value: "CA", label: "California" },
          { value: "CO", label: "Colorado" },
          { value: "CT", label: "Connecticut" },
          { value: "DE", label: "Delaware" },
          { value: "DC", label: "District of Columbia" },
          { value: "FL", label: "Florida" },
          { value: "GA", label: "Georgia" },
          { value: "HI", label: "Hawaii" },
          { value: "ID", label: "Idaho" },
          { value: "IL", label: "Illinois" },
          { value: "IN", label: "Indiana" },
          { value: "IA", label: "Iowa" },
          { value: "KS", label: "Kansas" },
          { value: "KY", label: "Kentucky" },
          { value: "LA", label: "Louisiana" },
          { value: "ME", label: "Maine" },
          { value: "MD", label: "Maryland" },
          { value: "MA", label: "Massachusetts" },
          { value: "MI", label: "Michigan" },
          { value: "MN", label: "Minnesota" },
          { value: "MS", label: "Mississippi" },
          { value: "MO", label: "Missouri" },
          { value: "MT", label: "Montana" },
          { value: "NE", label: "Nebraska" },
          { value: "NV", label: "Nevada" },
          { value: "NH", label: "New Hampshire" },
          { value: "NJ", label: "New Jersey" },
          { value: "NM", label: "New Mexico" },
          { value: "NY", label: "New York" },
          { value: "NC", label: "North Carolina" },
          { value: "ND", label: "North Dakota" },
          { value: "OH", label: "Ohio" },
          { value: "OK", label: "Oklahoma" },
          { value: "OR", label: "Oregon" },
          { value: "PA", label: "Pennsylvania" },
          { value: "RI", label: "Rhode Island" },
          { value: "SC", label: "South Carolina" },
          { value: "SD", label: "South Dakota" },
          { value: "TN", label: "Tennessee" },
          { value: "TX", label: "Texas" },
          { value: "UT", label: "Utah" },
          { value: "VT", label: "Vermont" },
          { value: "VA", label: "Virginia" },
          { value: "WA", label: "Washington" },
          { value: "WV", label: "West Virginia" },
          { value: "WI", label: "Wisconsin" },
          { value: "WY", label: "Wyoming" },
        ],
      },
      {
        id: "workerClass",
        type: "select",
        label: "Worker classification",
        required: true,
        options: [
          { value: "employee", label: "Employee" },
          { value: "worker", label: "Worker (UK)" },
          { value: "contractor", label: "Contractor / 1099" },
          { value: "casual", label: "Casual / zero-hours" },
        ],
      },
    ],
  },
  {
    id: "employer",
    title: "Employer details",
    description: "The legal entity issuing the letter and the signatory.",
    questions: [
      {
        id: "employerLegalName",
        type: "text",
        label: "Company legal name",
        required: true,
        placeholder: "Acme Holdings Limited",
      },
      {
        id: "employerAddress",
        type: "textarea",
        label: "Registered address",
        required: true,
      },
      {
        id: "employerRegNumber",
        type: "text",
        label: "Companies House number / EIN",
        required: false,
      },
      {
        id: "hasLetterhead",
        type: "boolean",
        label: "Will this be sent on company letterhead?",
        help: "If yes, we suppress the redundant header.",
      },
      {
        id: "signatoryName",
        type: "text",
        label: "Signatory name",
        required: true,
      },
      {
        id: "signatoryTitle",
        type: "text",
        label: "Signatory job title",
        required: true,
      },
    ],
  },
  {
    id: "employee",
    title: "Employee details",
    description: "The recipient of the letter.",
    questions: [
      {
        id: "employeeLegalName",
        type: "text",
        label: "Full legal name",
        required: true,
      },
      {
        id: "employeePreferredName",
        type: "text",
        label: "Preferred name (used in salutation)",
      },
      {
        id: "employeeJobTitle",
        type: "text",
        label: "Current job title",
        required: true,
      },
      {
        id: "employeeDepartment",
        type: "text",
        label: "Department",
      },
      {
        id: "employeeAddress",
        type: "textarea",
        label: "Employee personal address",
        required: true,
      },
      {
        id: "employeeEmail",
        type: "text",
        label: "Email (work or personal, your call)",
      },
      {
        id: "employeeStartDate",
        type: "date",
        label: "Continuous service start date",
        required: true,
      },
    ],
  },
  {
    id: "letter_context",
    title: "Letter context",
    description: "Effective date, tone, confidentiality.",
    questions: [
      {
        id: "effectiveDate",
        type: "date",
        label: "Effective date of the action",
        required: true,
        help: "When does this letter take effect: start date, termination date, etc.",
      },
      {
        id: "tone",
        type: "select",
        label: "Tone",
        required: true,
        options: [
          { value: "warm", label: "Warm" },
          { value: "neutral", label: "Neutral" },
          { value: "formal", label: "Formal" },
          { value: "firm", label: "Firm" },
        ],
        help: "Some letter types constrain tone: terminations cannot be 'warm', for example.",
      },
      {
        id: "confidentiality",
        type: "select",
        label: "Confidentiality",
        required: true,
        options: [
          { value: "public", label: "Standard" },
          { value: "confidential", label: "Confidential" },
          { value: "private_and_confidential", label: "Private and confidential" },
        ],
      },
      {
        id: "deliveryMethod",
        type: "select",
        label: "Delivery method",
        required: true,
        options: [
          { value: "email", label: "Email" },
          { value: "post", label: "Post" },
          { value: "hand-delivery", label: "Hand-delivery" },
          { value: "recorded-delivery", label: "Recorded delivery" },
        ],
      },
      {
        id: "sendBy",
        type: "date",
        label: "Send by",
        help:
          "When does this letter need to go out? Appears on Calendar and as a status pill so you don't miss it.",
      },
    ],
  },
  {
    id: "risk_flags",
    title: "Risk flags",
    description:
      "Tell us about any flags that need legal-review attention. Honest answers protect the organisation.",
    questions: [
      {
        id: "protectedStatus",
        type: "boolean",
        label: "Is the employee currently in a legally protected situation?",
        help:
          "Pregnancy, parental leave, long-term sickness, whistleblower, trade union representative, current grievance. Any of these triggers a counsel-review gate before export.",
      },
      {
        id: "grievanceLast90Days",
        type: "boolean",
        label: "Has the employee raised a grievance in the last 90 days?",
      },
      {
        id: "collectiveConsultation",
        type: "boolean",
        label: "Are 20 or more employees affected by the same change within 90 days?",
        // One question serves UK and US letters (answers and prompts key on
        // the id), so the help stays true for both rather than naming one
        // country's law on the other's letter.
        help:
          "If so, the law may require collective consultation or advance notice before any letters go out.",
      },
    ],
  },
];

/** Letter-type-specific question steps that come after the universal flow. */
export const LETTER_QUESTIONS: Partial<Record<LetterTypeId, QuestionStep[]>> = {
  offer: [
    {
      id: "role_and_compensation",
      title: "Role & compensation",
      questions: [
        { id: "newJobTitle", type: "text", label: "Job title for new role", required: true },
        { id: "newDepartment", type: "text", label: "Department", required: true },
        { id: "reportingManager", type: "text", label: "Reporting manager", required: true },
        { id: "workLocation", type: "text", label: "Work location", required: true },
        {
          id: "remoteHybrid",
          type: "select",
          label: "Working pattern",
          options: [
            { value: "onsite", label: "On-site" },
            { value: "hybrid", label: "Hybrid" },
            { value: "remote", label: "Remote" },
          ],
          required: true,
        },
        { id: "baseSalary", type: "currency", label: "Base salary (annual)", required: true },
        {
          id: "currency",
          type: "select",
          label: "Currency",
          required: true,
          options: [
            { value: "GBP", label: "GBP £" },
            { value: "USD", label: "USD $" },
            { value: "EUR", label: "EUR €" },
          ],
        },
        {
          id: "payFrequency",
          type: "select",
          label: "Pay frequency",
          required: true,
          options: [
            { value: "monthly", label: "Monthly" },
            { value: "biweekly", label: "Bi-weekly" },
            { value: "weekly", label: "Weekly" },
          ],
        },
        { id: "bonusStructure", type: "textarea", label: "Bonus / commission structure (optional)" },
        { id: "equityGrant", type: "textarea", label: "Equity grant (shares, vesting, cliff, optional)" },
        { id: "signOnBonus", type: "textarea", label: "Sign-on bonus and clawback terms (optional)" },
      ],
    },
    {
      id: "terms_and_conditions",
      title: "Terms & conditions",
      questions: [
        { id: "probationLength", type: "text", label: "Probation length (e.g. 3 months, 6 months, 90 days)", required: true },
        { id: "noticeProbation", type: "text", label: "Notice during probation", required: true },
        { id: "noticePost", type: "text", label: "Notice after probation", required: true },
        { id: "annualLeaveDays", type: "number", label: "Annual leave (days, excluding bank/public holidays)", required: true },
        { id: "workingHours", type: "text", label: "Standard working hours", required: true },
        { id: "pensionPlan", type: "textarea", label: "Pension / 401(k) details (optional)" },
        { id: "healthcare", type: "textarea", label: "Healthcare details (optional)" },
        {
          id: "benefitsHighlights",
          type: "repeater",
          label: "Benefits highlights",
          help: "Each headline benefit listed individually so the offer letter showcases them clearly.",
          repeater: {
            itemLabel: "Benefit",
            minItems: 0,
            maxItems: 8,
            defaultItems: 0,
            fields: [
              { id: "benefit", type: "text", label: "Benefit", required: true, placeholder: "e.g. Private healthcare, EAP, learning budget" },
              { id: "detail", type: "text", label: "Detail / value" },
            ],
          },
        },
        {
          id: "contingencies",
          type: "repeater",
          label: "Contingencies / pre-conditions",
          help: "Each pre-condition listed separately so the candidate knows exactly what must clear before the offer becomes unconditional.",
          repeater: {
            itemLabel: "Contingency",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "contingency", type: "text", label: "Contingency", required: true, placeholder: "Background check, references, right-to-work, medical" },
              { id: "detail", type: "text", label: "Detail (provider, deadline)" },
            ],
          },
        },
        { id: "acceptanceDeadline", type: "date", label: "Acceptance deadline" },
      ],
    },
  ],

  reference: [
    {
      id: "reference_scope",
      title: "Reference scope",
      questions: [
        {
          id: "referenceType",
          type: "select",
          label: "Reference type",
          required: true,
          options: [
            { value: "factual", label: "Factual / verification only (recommended)" },
            { value: "character", label: "Full character reference (only if authorised)" },
          ],
        },
        { id: "purpose", type: "text", label: "Purpose (mortgage, immigration, new role, etc.)", required: true },
        { id: "addressedTo", type: "text", label: "Addressed to (or 'To Whom It May Concern')", required: true },
        { id: "endDate", type: "date", label: "End date of employment (or 'present')" },
        {
          id: "discloseSalary",
          type: "boolean",
          label: "Disclose salary?",
          help: "Only with the employee's written consent.",
        },
        { id: "responsibilities", type: "textarea", label: "Headline responsibilities (for character reference)", showIf: (a) => a.referenceType === "character" },
      ],
    },
  ],

  termination: [
    {
      id: "decision",
      title: "Decision details",
      questions: [
        {
          id: "terminationCategory",
          type: "select",
          label: "Termination category",
          required: true,
          options: [
            { value: "gross_misconduct", label: "Gross misconduct" },
            { value: "conduct", label: "Conduct" },
            { value: "capability", label: "Capability" },
            { value: "redundancy", label: "Redundancy / RIF" },
            { value: "sosr", label: "Some other substantial reason (SOSR)" },
            { value: "without_cause", label: "Without cause (US at-will)" },
          ],
        },
        { id: "hearingDate", type: "date", label: "Disciplinary hearing date (UK)", jurisdiction: "UK" },
        {
          id: "factualFindings",
          type: "repeater",
          label: "Factual findings (numbered)",
          help: "One row per finding. Tribunal-grade dismissal letters list discrete findings of fact, each tied to evidence, rather than a single prose summary.",
          required: true,
          repeater: {
            itemLabel: "Finding",
            minItems: 1,
            maxItems: 10,
            defaultItems: 2,
            fields: [
              { id: "finding", type: "textarea", label: "Finding of fact", required: true },
              { id: "evidence", type: "textarea", label: "Evidence relied upon (witness, document, policy)" },
              { id: "policyRef", type: "text", label: "Policy / clause breached (if applicable)" },
            ],
          },
        },
        { id: "businessReasonSummary", type: "textarea", label: "Overall business reason / context", required: true },
        { id: "lastWorkingDay", type: "date", label: "Last working day", required: true },
        { id: "noticeArrangement", type: "select", label: "Notice arrangement", required: true, options: [
          { value: "worked", label: "Worked" },
          { value: "pilon", label: "Payment in lieu of notice (PILON)" },
          { value: "garden_leave", label: "Garden leave" },
        ] },
        { id: "severanceOffered", type: "currency", label: "Severance offered (optional)" },
        { id: "covenantsInForce", type: "textarea", label: "Restrictive covenants in force (summarised)" },
        { id: "appealOfficer", type: "text", label: "Appeal officer (UK)", jurisdiction: "UK" },
      ],
    },
  ],

  warning: [
    {
      id: "warning_decision",
      title: "Warning details",
      questions: [
        {
          id: "warningLevel",
          type: "select",
          label: "Warning level",
          required: true,
          options: [
            { value: "verbal", label: "Verbal" },
            { value: "written", label: "First written" },
            { value: "final_written", label: "Final written" },
          ],
        },
        { id: "hearingDate", type: "date", label: "Hearing date", required: true },
        { id: "hearingAttendees", type: "textarea", label: "Hearing attendees (incl. accompanying person)", required: true },
        { id: "allegations", type: "textarea", label: "Allegations summary", required: true },
        {
          id: "specificConcerns",
          type: "repeater",
          label: "Specific concerns / findings",
          help: "Each concern listed separately with the evidence it rests on. The letter will surface them as numbered findings.",
          required: true,
          repeater: {
            itemLabel: "Concern",
            minItems: 1,
            maxItems: 10,
            defaultItems: 2,
            fields: [
              { id: "concern", type: "textarea", label: "What was the concern?", required: true },
              { id: "evidence", type: "textarea", label: "Evidence / examples relied upon" },
              { id: "policyRef", type: "text", label: "Policy or standard breached" },
            ],
          },
        },
        {
          id: "smartImprovements",
          type: "repeater",
          label: "SMART improvements required",
          help: "Each improvement framed as Specific / Measurable / Achievable / Relevant / Time-bound. Reviewable at the review date.",
          required: true,
          repeater: {
            itemLabel: "Improvement",
            minItems: 1,
            maxItems: 8,
            defaultItems: 2,
            fields: [
              { id: "improvement", type: "textarea", label: "Required improvement (specific)", required: true },
              { id: "measure", type: "text", label: "How it will be measured" },
              { id: "byDate", type: "date", label: "Achieve by" },
            ],
          },
        },
        { id: "reviewDate", type: "date", label: "Review date", required: true },
        { id: "timeOnFile", type: "text", label: "Time on file (e.g. 6 months, 12 months)", required: true },
        { id: "appealOfficer", type: "text", label: "Appeal officer", required: true },
      ],
    },
  ],

  promotion: [
    {
      id: "promo",
      title: "Promotion details",
      questions: [
        { id: "newJobTitle", type: "text", label: "New job title", required: true },
        { id: "newLevel", type: "text", label: "New level / grade" },
        { id: "newManager", type: "text", label: "New reporting manager", required: true },
        { id: "newSalary", type: "currency", label: "New base salary", required: true },
        { id: "currency", type: "select", label: "Currency", required: true, options: [
          { value: "GBP", label: "GBP £" },
          { value: "USD", label: "USD $" },
          { value: "EUR", label: "EUR €" },
        ] },
        { id: "responsibilitiesSummary", type: "textarea", label: "New responsibilities summary" },
        {
          id: "developmentOpportunities",
          type: "repeater",
          label: "Development opportunities in the new role",
          repeater: {
            itemLabel: "Opportunity",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "opportunity", type: "textarea", label: "Opportunity", required: true, placeholder: "e.g. Lead the platform team's hiring through 2026" },
            ],
          },
        },
        {
          id: "supportProvided",
          type: "repeater",
          label: "Support provided to set them up to succeed",
          repeater: {
            itemLabel: "Support",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "support", type: "textarea", label: "Support / resource", required: true, placeholder: "e.g. Exec coaching, team handover with predecessor, training budget" },
            ],
          },
        },
        {
          id: "exemptStatusChange",
          type: "boolean",
          label: "Does this change FLSA exempt / non-exempt classification (US)?",
          jurisdiction: "US",
        },
      ],
    },
  ],

  salary_increase: [
    {
      id: "pay",
      title: "Pay change",
      questions: [
        { id: "oldSalary", type: "currency", label: "Current base salary", required: true },
        { id: "newSalary", type: "currency", label: "New base salary", required: true },
        { id: "currency", type: "select", label: "Currency", required: true, options: [
          { value: "GBP", label: "GBP £" },
          { value: "USD", label: "USD $" },
          { value: "EUR", label: "EUR €" },
        ] },
        {
          id: "reason",
          type: "select",
          label: "Reason",
          required: true,
          options: [
            { value: "merit", label: "Merit / performance" },
            { value: "market", label: "Market adjustment" },
            { value: "cola", label: "Cost of living" },
            { value: "promotion_alignment", label: "Promotion alignment" },
          ],
        },
        { id: "firstPayDate", type: "date", label: "First pay date with new amount" },
      ],
    },
  ],

  probation_outcome: [
    {
      id: "outcome",
      title: "Outcome",
      questions: [
        {
          id: "probationOutcome",
          type: "select",
          label: "Outcome",
          required: true,
          options: [
            { value: "pass", label: "Pass: confirm employment" },
            { value: "extend", label: "Extend probation" },
            { value: "fail", label: "Fail: terminate" },
          ],
        },
        { id: "reviewMeetingDate", type: "date", label: "Probation review meeting date", required: true },
        {
          id: "strengths",
          type: "repeater",
          label: "Strengths observed",
          help: "Concrete evidence-based strengths the letter will list, each as a specific, dated example, not adjectives.",
          required: true,
          repeater: {
            itemLabel: "Strength",
            minItems: 1,
            maxItems: 6,
            defaultItems: 2,
            fields: [
              { id: "strength", type: "textarea", label: "Strength (specific, evidenced)", required: true },
            ],
          },
        },
        {
          id: "areasForDevelopment",
          type: "repeater",
          label: "Areas for development",
          help: "Required only on extend / fail outcomes. For pass, leave empty.",
          showIf: (a) => a.probationOutcome === "extend" || a.probationOutcome === "fail",
          repeater: {
            itemLabel: "Area",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "area", type: "textarea", label: "Area for development", required: true },
              { id: "evidence", type: "textarea", label: "Evidence / examples" },
            ],
          },
        },
        { id: "newEndDate", type: "date", label: "New end date (if extending)", showIf: (a) => a.probationOutcome === "extend" },
        { id: "objectivesIfExtending", type: "textarea", label: "Objectives if extending", showIf: (a) => a.probationOutcome === "extend" },
        { id: "supportOffered", type: "textarea", label: "Support offered (training, mentoring, OH/EAP)" },
      ],
    },
  ],

  contract_amendment: [
    {
      id: "variation",
      title: "Variation details",
      questions: [
        { id: "originalContractDate", type: "date", label: "Original contract date", required: true },
        { id: "clauseVaried", type: "textarea", label: "Clause(s) being varied", required: true },
        { id: "oldValue", type: "textarea", label: "Old terms", required: true },
        { id: "newValue", type: "textarea", label: "New terms", required: true },
        { id: "businessReason", type: "textarea", label: "Business reason", required: true },
        { id: "consultationHistory", type: "textarea", label: "Consultation history (UK)", jurisdiction: "UK" },
      ],
    },
  ],

  redundancy: [
    {
      id: "redundancy_details",
      title: "Redundancy / Layoff details",
      questions: [
        { id: "selectionPool", type: "textarea", label: "Selection pool (roles considered)", required: true },
        {
          id: "selectionCriteria",
          type: "repeater",
          label: "Selection criteria",
          help: "Each criterion separately. Tribunal-grade redundancy letters expose the criteria and how they were scored. Vague criteria are the #1 unfair-dismissal trap.",
          required: true,
          repeater: {
            itemLabel: "Criterion",
            minItems: 1,
            maxItems: 8,
            defaultItems: 3,
            fields: [
              { id: "criterion", type: "text", label: "Criterion (e.g. performance against objectives)", required: true },
              { id: "weighting", type: "text", label: "Weighting / score range" },
              { id: "method", type: "textarea", label: "How it was assessed" },
            ],
          },
        },
        {
          id: "alternativeVacancies",
          type: "repeater",
          label: "Suitable alternative vacancies considered",
          help: "Each vacancy the employer considered. Empty = none available (the letter will say so).",
          repeater: {
            itemLabel: "Vacancy",
            minItems: 0,
            maxItems: 10,
            defaultItems: 0,
            fields: [
              { id: "role", type: "text", label: "Role", required: true },
              { id: "outcome", type: "textarea", label: "Why it was / wasn't a fit", required: true },
            ],
          },
        },
        { id: "consultationDates", type: "textarea", label: "Consultation meeting dates" },
        { id: "redundancyPay", type: "currency", label: "Statutory redundancy pay (UK)", jurisdiction: "UK" },
        { id: "severancePackage", type: "textarea", label: "Severance package (US)", jurisdiction: "US" },
        {
          id: "supportServices",
          type: "repeater",
          label: "Support / outplacement services offered",
          repeater: {
            itemLabel: "Service",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "service", type: "text", label: "Service", required: true, placeholder: "Outplacement coaching, CV review, EAP, etc." },
              { id: "provider", type: "text", label: "Provider / contact" },
            ],
          },
        },
        { id: "recallRights", type: "textarea", label: "Recall rights (US)", jurisdiction: "US" },
      ],
    },
  ],

  leave_approval: [
    {
      id: "leave",
      title: "Leave details",
      questions: [
        {
          id: "leaveType",
          type: "select",
          label: "Leave type",
          required: true,
          options: [
            { value: "maternity", label: "Maternity" },
            { value: "paternity", label: "Paternity" },
            { value: "shared_parental", label: "Shared parental (UK)" },
            { value: "adoption", label: "Adoption" },
            { value: "fmla", label: "FMLA (US)" },
            { value: "cfra", label: "CFRA (CA)" },
            { value: "sick", label: "Sick / SSP" },
            { value: "sabbatical", label: "Sabbatical" },
            { value: "carers", label: "Carer's leave (UK)" },
            { value: "bereavement", label: "Bereavement" },
            { value: "unpaid_parental", label: "Unpaid parental" },
          ],
        },
        { id: "startDate", type: "date", label: "Leave start date", required: true },
        { id: "expectedReturnDate", type: "date", label: "Expected return date" },
        {
          id: "payDuringLeave",
          type: "select",
          label: "Pay arrangement",
          options: [
            { value: "full", label: "Full pay (occupational top-up)" },
            { value: "statutory", label: "Statutory rate only" },
            { value: "blended", label: "Blended (top-up then statutory)" },
            { value: "unpaid", label: "Unpaid" },
          ],
        },
        { id: "kitDays", type: "number", label: "KIT day allowance (UK)", jurisdiction: "UK" },
      ],
    },
  ],

  resignation_acceptance: [
    {
      id: "resig",
      title: "Resignation details",
      questions: [
        { id: "resignationDate", type: "date", label: "Date resignation received", required: true },
        { id: "lastWorkingDay", type: "date", label: "Last working day", required: true },
        {
          id: "noticeArrangement",
          type: "select",
          label: "Notice arrangement",
          required: true,
          options: [
            { value: "worked", label: "Worked" },
            { value: "pilon", label: "Payment in lieu of notice" },
            { value: "garden_leave", label: "Garden leave" },
          ],
        },
        { id: "accruedLeaveDays", type: "number", label: "Accrued unused leave (days)" },
        { id: "exitInterviewDate", type: "date", label: "Exit interview date (optional)" },
      ],
    },
  ],

  return_to_work: [
    {
      id: "rtw",
      title: "Return-to-work plan",
      questions: [
        { id: "leaveEndDate", type: "date", label: "Leave end date", required: true },
        { id: "rtwDate", type: "date", label: "Return-to-work date", required: true },
        {
          id: "phasedReturn",
          type: "boolean",
          label: "Is this a phased return?",
        },
        { id: "phasedSchedule", type: "textarea", label: "Phased schedule (if applicable)", showIf: (a) => a.phasedReturn === true },
        {
          id: "reasonableAdjustments",
          type: "repeater",
          label: "Reasonable adjustments / accommodations",
          help: "Each adjustment listed separately with a clear scope and review date so the employee and manager know exactly what's agreed.",
          repeater: {
            itemLabel: "Adjustment",
            minItems: 0,
            maxItems: 10,
            defaultItems: 0,
            fields: [
              { id: "adjustment", type: "textarea", label: "Adjustment", required: true },
              { id: "duration", type: "text", label: "Duration / review date" },
              { id: "owner", type: "text", label: "Owner (line manager, OH, IT)" },
            ],
          },
        },
        { id: "ohReportRef", type: "text", label: "OH report reference (optional)" },
        { id: "adjustmentsReviewDate", type: "date", label: "When will adjustments be reviewed?" },
      ],
    },
  ],

  settlement_cover: [
    {
      id: "settlement",
      title: "Settlement terms",
      questions: [
        { id: "exGratiaAmount", type: "currency", label: "Ex gratia / severance amount", required: true },
        { id: "noticePilon", type: "currency", label: "Notice / PILON" },
        { id: "taxFreeElement", type: "currency", label: "Tax-free element (UK £30k cap under s.401 ITEPA)", jurisdiction: "UK" },
        { id: "benefitsContinuation", type: "textarea", label: "Benefits continuation" },
        { id: "referencesWording", type: "textarea", label: "Agreed references wording" },
        {
          id: "restrictiveCovenants",
          type: "repeater",
          label: "Restrictive covenants (each separately)",
          help: "Spelling out each covenant individually gives the employee's solicitor a clean per-clause review path and reduces disputes.",
          repeater: {
            itemLabel: "Covenant",
            minItems: 0,
            maxItems: 8,
            defaultItems: 0,
            fields: [
              {
                id: "type",
                type: "select",
                label: "Type",
                required: true,
                options: [
                  { value: "non_compete", label: "Non-compete" },
                  { value: "non_solicit_customers", label: "Non-solicit (customers)" },
                  { value: "non_solicit_employees", label: "Non-solicit (employees)" },
                  { value: "non_deal", label: "Non-deal" },
                  { value: "confidentiality", label: "Confidentiality" },
                  { value: "non_disparagement", label: "Non-disparagement" },
                  { value: "other", label: "Other" },
                ],
              },
              { id: "scope", type: "textarea", label: "Scope (territory, role types, customers)", required: true },
              { id: "durationMonths", type: "number", label: "Duration (months)" },
            ],
          },
        },
        {
          id: "discussionDates",
          type: "repeater",
          label: "Without-prejudice discussion dates",
          help: "Each meeting / call relied on for s.111A ERA 1996 protected-conversation framing. The letter references these in the opener.",
          repeater: {
            itemLabel: "Discussion",
            minItems: 0,
            maxItems: 6,
            defaultItems: 0,
            fields: [
              { id: "date", type: "date", label: "Date", required: true },
              { id: "format", type: "text", label: "Format (meeting / call / email)" },
              { id: "attendees", type: "text", label: "Attendees" },
            ],
          },
        },
        { id: "legalFeesContribution", type: "currency", label: "Legal fees contribution" },
        { id: "advisorDeadline", type: "date", label: "Advisor certification / signing deadline", required: true },
      ],
    },
  ],

  right_to_work: [
    {
      id: "immigration",
      title: "Immigration details",
      questions: [
        {
          id: "route",
          type: "select",
          label: "Immigration route",
          required: true,
          options: [
            { value: "uk_skilled_worker", label: "UK Skilled Worker (CoS)" },
            { value: "uk_global_talent", label: "UK Global Talent" },
            { value: "uk_scale_up", label: "UK Scale-up" },
            { value: "us_h1b", label: "US H-1B" },
            { value: "us_l1a", label: "US L-1A" },
            { value: "us_l1b", label: "US L-1B" },
            { value: "us_o1", label: "US O-1" },
            { value: "us_eb2", label: "US EB-2 / I-140" },
            { value: "us_eb3", label: "US EB-3 / I-140" },
            { value: "rtw_only", label: "Right-to-work verification only" },
          ],
        },
        { id: "sponsorLicence", type: "text", label: "Sponsor licence number (UK)", jurisdiction: "UK" },
        { id: "cosReference", type: "text", label: "Certificate of Sponsorship reference (UK)", jurisdiction: "UK" },
        { id: "petitionRef", type: "text", label: "Petition / receipt number (US)", jurisdiction: "US" },
        { id: "socCode", type: "text", label: "SOC code (UK)", jurisdiction: "UK" },
        { id: "salaryAtPosting", type: "currency", label: "Salary at or above going rate / prevailing wage" },
      ],
    },
  ],
};


/* ============================================================================
 * Mode-aware aggregator: pick the right question set for the right mode.
 * ==========================================================================*/

export function universalStepsFor(mode: Mode): QuestionStep[] {
  return mode === "employee" ? EMPLOYEE_UNIVERSAL_STEPS : UNIVERSAL_STEPS;
}

export function letterStepsFor(letterType: LetterTypeId): QuestionStep[] {
  // Probe the employee map first; fall back to employer.
  const e = EMPLOYEE_LETTER_QUESTIONS[letterType as EmployeeLetterTypeId];
  if (e) return e;
  const r = LETTER_QUESTIONS[letterType as EmployerLetterTypeId];
  return r ?? [];
}
