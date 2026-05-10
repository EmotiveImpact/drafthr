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
  | "currency";

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
};

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
      "We tailor the legal language by country and region — your selection drives every clause and disclaimer.",
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
          { value: "England & Wales", label: "England & Wales" },
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
        label: "Email (work or personal — your call)",
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
        help: "When does this letter take effect — start date, termination date, etc.",
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
        help: "Some letter types constrain tone — terminations cannot be 'warm', for example.",
      },
      {
        id: "confidentiality",
        type: "select",
        label: "Confidentiality",
        required: true,
        options: [
          { value: "public", label: "Standard" },
          { value: "confidential", label: "Confidential" },
          { value: "private_and_confidential", label: "Private & Confidential" },
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
          "Pregnancy, parental leave, long-term sickness, whistleblower, trade union representative, current grievance — any of these triggers a counsel-review gate before export.",
      },
      {
        id: "grievanceLast90Days",
        type: "boolean",
        label: "Has the employee raised a grievance in the last 90 days?",
      },
      {
        id: "collectiveConsultation",
        type: "boolean",
        label:
          "Are 20+ employees being affected by the same change in a 90-day window? (UK: triggers s.188 TULRCA collective consultation; US: may trigger WARN.)",
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
        { id: "equityGrant", type: "textarea", label: "Equity grant (shares, vesting, cliff — optional)" },
        { id: "signOnBonus", type: "textarea", label: "Sign-on bonus & clawback terms (optional)" },
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
        { id: "preConditions", type: "textarea", label: "Pre-conditions (background, references, right-to-work, medical) — optional" },
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
        { id: "responsibilities", type: "textarea", label: "Headline responsibilities (for character reference)" },
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
        { id: "findingsSummary", type: "textarea", label: "Findings / business reason summary", required: true },
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
        { id: "findings", type: "textarea", label: "Findings of fact", required: true },
        { id: "improvementRequired", type: "textarea", label: "Improvement required (specific, measurable)", required: true },
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
            { value: "pass", label: "Pass — confirm employment" },
            { value: "extend", label: "Extend probation" },
            { value: "fail", label: "Fail — terminate" },
          ],
        },
        { id: "reviewMeetingDate", type: "date", label: "Probation review meeting date", required: true },
        { id: "reviewSummary", type: "textarea", label: "Review summary / specific evidence", required: true },
        { id: "newEndDate", type: "date", label: "New end date (if extending)" },
        { id: "objectives", type: "textarea", label: "Objectives if extending" },
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
        { id: "selectionCriteria", type: "textarea", label: "Selection criteria applied", required: true },
        { id: "consultationDates", type: "textarea", label: "Consultation meeting dates" },
        { id: "alternativeSearch", type: "textarea", label: "Suitable alternative employment search outcome" },
        { id: "redundancyPay", type: "currency", label: "Statutory redundancy pay (UK)", jurisdiction: "UK" },
        { id: "severancePackage", type: "textarea", label: "Severance package (US)", jurisdiction: "US" },
        { id: "outplacementProvider", type: "text", label: "Outplacement provider (optional)" },
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
        { id: "phasedSchedule", type: "textarea", label: "Phased schedule (if applicable)" },
        { id: "accommodations", type: "textarea", label: "Reasonable adjustments / accommodations" },
        { id: "ohReportRef", type: "text", label: "OH report reference (optional)" },
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
        { id: "covenants", type: "textarea", label: "Restrictive covenants" },
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
