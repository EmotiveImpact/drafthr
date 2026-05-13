import type { Question, QuestionStep } from "../questions";
import type { EmployeeLetterTypeId } from "../types";

const US_STATE_OPTIONS: NonNullable<Question["options"]> = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" }, { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" }, { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" }, { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" }, { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" }, { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" }, { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" }, { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" },
];

/**
 * Employee-side universal pre-flight. Sits alongside (and partly replaces) the
 * employer pre-flight in `questions.ts`. The orchestrator picks one based on
 * draft.mode.
 */
export const EMPLOYEE_UNIVERSAL_STEPS: QuestionStep[] = [
  {
    id: "jurisdiction",
    title: "Jurisdiction",
    description:
      "We tailor the legal language by country and region. This drives every clause and every disclaimer.",
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
        options: US_STATE_OPTIONS,
      },
      {
        id: "workerClass",
        type: "select",
        label: "Worker classification",
        required: true,
        help:
          "If you're not sure, pick the one closest to your reality. UK borderline cases (gig economy etc.) are read against Pimlico Plumbers v Smith [2018].",
        options: [
          { value: "employee", label: "Employee" },
          { value: "worker", label: "Worker (UK)" },
          { value: "contractor", label: "Contractor / 1099 / self-employed" },
          { value: "casual", label: "Casual / zero-hours" },
        ],
      },
    ],
  },
  {
    id: "you",
    title: "About you",
    description: "The letter will go out from you, so we need your details for the recipient block and salutation.",
    questions: [
      { id: "employeeLegalName", type: "text", label: "Your full legal name", required: true },
      { id: "employeePreferredName", type: "text", label: "Preferred name (used in salutation)" },
      { id: "employeeJobTitle", type: "text", label: "Your current job title", required: true },
      { id: "employeeDepartment", type: "text", label: "Department / team" },
      { id: "employeeAddress", type: "textarea", label: "Your address (for the letter)", required: true },
      { id: "employeeEmail", type: "text", label: "Your email" },
      { id: "employeeStartDate", type: "date", label: "Your continuous service start date", required: true },
    ],
  },
  {
    id: "employer",
    title: "About your employer",
    description: "Where the letter is going.",
    questions: [
      { id: "employerLegalName", type: "text", label: "Employer's legal name (as registered)", required: true },
      { id: "employerAddress", type: "textarea", label: "Employer's address", required: true },
      { id: "recipientName", type: "text", label: "Person to address it to (HR Director, Manager, named officer)", required: true },
      { id: "recipientTitle", type: "text", label: "Their title" },
    ],
  },
  {
    id: "protected",
    title: "Protected status",
    description:
      "Discrimination law has no minimum service requirement and no compensation cap. Tell us if any of these apply — it changes how the letter is framed.",
    questions: [
      {
        id: "protectedCharacteristics",
        type: "select_multi",
        label: "Do you believe the issue is connected to any protected characteristic?",
        help: "UK: Equality Act 2010. US: Title VII / ADA / ADEA / state law.",
        options: [
          { value: "race", label: "Race / ethnicity / national origin" },
          { value: "sex", label: "Sex / gender" },
          { value: "age", label: "Age" },
          { value: "disability", label: "Disability" },
          { value: "religion", label: "Religion or belief" },
          { value: "sexual_orientation", label: "Sexual orientation" },
          { value: "gender_reassignment", label: "Gender reassignment" },
          { value: "pregnancy_maternity", label: "Pregnancy or maternity" },
          { value: "marriage_civil_partnership", label: "Marriage or civil partnership" },
          { value: "veteran_status", label: "Veteran / military status (US)" },
          { value: "genetic_information", label: "Genetic information (US)" },
        ],
      },
    ],
  },
  {
    id: "deadlines",
    title: "Date of the act complained of",
    description:
      "Most claims have strict limitation periods. We use this date to compute and surface the deadline.",
    questions: [
      {
        id: "actDate",
        type: "date",
        label: "When did the conduct or decision happen?",
        help:
          "If it's a continuing course of conduct, pick the most recent incident. UK tribunal limitation is 3 months less one day from this date.",
      },
      {
        id: "raisedInformally",
        type: "select",
        label: "Have you raised it informally first?",
        options: [
          { value: "yes", label: "Yes, but it didn't resolve" },
          { value: "no", label: "No, this is the first time I'm raising it" },
          { value: "unsafe", label: "I didn't feel safe to raise it informally" },
        ],
      },
    ],
  },
];

/* --------------------------------------------------------------------------
 * Per-letter-type question packs.
 * Each catalogue entry should have an entry here. Letters with no extra
 * questions can omit and just rely on the universal pre-flight.
 * ------------------------------------------------------------------------*/

export const EMPLOYEE_LETTER_QUESTIONS: Partial<Record<EmployeeLetterTypeId, QuestionStep[]>> = {
  grievance: [
    {
      id: "facts",
      title: "What happened",
      description:
        "Be factual, specific, dated. The tribunal panel reads this letter; vague narratives weaken your case.",
      questions: [
        {
          id: "incidents",
          type: "repeater",
          label: "Incidents — chronological list",
          help: "Oldest first, most recent last. Specific dates, named people, witnesses. The AI weaves these into a tribunal-grade chronology.",
          required: true,
          repeater: {
            itemLabel: "Incident",
            minItems: 1,
            maxItems: 15,
            defaultItems: 3,
            fields: [
              { id: "date", type: "date", label: "Date", required: true },
              { id: "description", type: "textarea", label: "What happened? (factual, no editorialising)", required: true },
              { id: "individuals", type: "text", label: "Person(s) involved (full names)" },
              { id: "witnesses", type: "text", label: "Witnesses (names, if any)" },
              { id: "documents", type: "text", label: "Supporting documents (email, calendar entry, policy)" },
            ],
          },
        },
        {
          id: "documents",
          type: "textarea",
          label: "What documents back this up? (emails, calendar entries, policies)",
        },
        {
          id: "priorRaises",
          type: "textarea",
          label: "Have you raised this before? When and to whom?",
        },
        {
          id: "impact",
          type: "textarea",
          label: "Impact on you (work performance, wellbeing, financial)",
          required: true,
        },
      ],
    },
    {
      id: "outcome",
      title: "What outcome do you want?",
      description:
        "We surface these explicitly in the closing paragraph. Be specific.",
      questions: [
        {
          id: "outcomes",
          type: "repeater",
          label: "Outcomes sought (numbered)",
          help: "Each entry becomes a numbered remedy in the letter. Pair every ask with the reason it follows from the facts.",
          required: true,
          repeater: {
            itemLabel: "Outcome",
            minItems: 1,
            maxItems: 8,
            defaultItems: 2,
            fields: [
              { id: "outcome", type: "textarea", label: "Outcome / remedy you want", required: true, placeholder: "e.g. Re-allocation under a different line manager" },
              { id: "rationale", type: "textarea", label: "Why this remedy follows from the facts" },
            ],
          },
        },
      ],
    },
  ],

  resignation_clean: [
    {
      id: "departure",
      title: "Departure details",
      questions: [
        { id: "lastWorkingDay", type: "date", label: "Your last working day", required: true },
        { id: "noticePeriodWeeks", type: "number", label: "Your notice period (weeks)" },
        { id: "thanksNote", type: "textarea", label: "What would you like to thank them for? (optional)" },
        { id: "handoverOffer", type: "textarea", label: "What handover are you offering? (optional)" },
      ],
    },
  ],

  resignation_with_grievance: [
    {
      id: "departure",
      title: "Departure",
      questions: [
        { id: "lastWorkingDay", type: "date", label: "Your last working day", required: true },
        {
          id: "noticeArrangement",
          type: "select",
          label: "Notice arrangement",
          required: true,
          options: [
            { value: "worked", label: "Worked through notice" },
            { value: "pilon", label: "Payment in lieu of notice (PILON)" },
            { value: "garden_leave", label: "Garden leave" },
          ],
        },
      ],
    },
    {
      id: "grievance",
      title: "Grievance content",
      questions: [
        { id: "grievanceSummary", type: "textarea", label: "What is the grievance? (brief, factual)", required: true },
        {
          id: "incidents",
          type: "repeater",
          label: "Incidents — chronological",
          help: "The AI weaves each incident into a tribunal-grade narrative with causation linking the facts to the resignation decision.",
          required: true,
          repeater: {
            itemLabel: "Incident",
            minItems: 1,
            maxItems: 12,
            defaultItems: 2,
            fields: [
              { id: "date", type: "date", label: "Date", required: true },
              { id: "description", type: "textarea", label: "What happened (factual)", required: true },
              { id: "causation", type: "textarea", label: "How this contributed to your decision to resign" },
              { id: "individuals", type: "text", label: "Person(s) involved (full names)" },
              { id: "witnesses", type: "text", label: "Witnesses" },
            ],
          },
        },
        {
          id: "outcomes",
          type: "repeater",
          label: "Outcomes you still want from the grievance",
          help: "Even though you are resigning, the grievance has live remedies (reference correction, policy change, financial remedy).",
          required: true,
          repeater: {
            itemLabel: "Outcome",
            minItems: 1,
            maxItems: 6,
            defaultItems: 1,
            fields: [
              { id: "outcome", type: "textarea", label: "Outcome / remedy", required: true },
            ],
          },
        },
      ],
    },
  ],

  resignation_constructive: [
    {
      id: "breach",
      title: "Fundamental breach",
      description:
        "This letter triggers a constructive unfair dismissal claim. The breach must be fundamental (going to the root of the contract) and you must resign IN RESPONSE TO it, WITHOUT DELAY.",
      questions: [
        {
          id: "incidents",
          type: "repeater",
          label: "Incidents — chronological list",
          help: "List each incident the AI will weave into a tribunal-grade chronology. Include the 'last straw' as the final entry. Dates, named individuals, witnesses.",
          required: true,
          repeater: {
            itemLabel: "Incident",
            minItems: 1,
            maxItems: 12,
            defaultItems: 3,
            fields: [
              { id: "date", type: "date", label: "Date", required: true },
              { id: "description", type: "textarea", label: "What happened? (factual, no intensifiers)", required: true },
              { id: "individuals", type: "text", label: "Person(s) involved (full names)", placeholder: "e.g. Jane Smith, HR Director" },
              { id: "witnesses", type: "text", label: "Witnesses (names, if any)" },
              { id: "raisedAt", type: "text", label: "If raised informally / via grievance — when, to whom?" },
              { id: "employerResponse", type: "textarea", label: "Employer's response (or lack of one)" },
            ],
          },
        },
        {
          id: "responsePromptness",
          type: "select",
          label: "How long after the most recent incident are you resigning?",
          required: true,
          options: [
            { value: "same_day", label: "Same day" },
            { value: "few_days", label: "Within a few days" },
            { value: "couple_weeks", label: "1–2 weeks" },
            { value: "longer", label: "Longer (delay risks affirmation argument)" },
          ],
        },
        { id: "lastWorkingDay", type: "date", label: "Effective date of resignation", required: true },
      ],
    },
  ],

  flexible_working_request: [
    {
      id: "request",
      title: "Your proposed change",
      questions: [
        { id: "currentPattern", type: "textarea", label: "Current working pattern", required: true },
        { id: "proposedPattern", type: "textarea", label: "Proposed working pattern", required: true },
        { id: "effectiveFrom", type: "date", label: "Proposed effective date", required: true },
        { id: "businessImpact", type: "textarea", label: "How can the business adapt? (your suggested mitigations)" },
        {
          id: "previousRequest12mo",
          type: "boolean",
          label: "Have you made a flexible working request in the last 12 months?",
        },
      ],
    },
  ],

  subject_access_request: [
    {
      id: "scope",
      title: "Scope of request",
      questions: [
        {
          id: "categories",
          type: "select_multi",
          label: "Categories of personal data requested",
          required: true,
          options: [
            { value: "personnel_file", label: "Personnel / HR file" },
            { value: "emails", label: "Emails about me" },
            { value: "performance", label: "Performance / appraisal records" },
            { value: "disciplinary", label: "Disciplinary / grievance records" },
            { value: "payroll", label: "Payroll / pay records" },
            { value: "occupational_health", label: "Occupational health / medical" },
            { value: "recordings", label: "Audio / video recordings or CCTV" },
            { value: "instant_messages", label: "Slack / Teams / IM messages" },
            { value: "calendar", label: "Calendar / meeting metadata" },
            { value: "manager_notes", label: "Manager 1:1 notes / private notes about me" },
          ],
        },
        { id: "dateFrom", type: "date", label: "From date" },
        { id: "dateTo", type: "date", label: "To date (leave blank for 'to date')" },
        {
          id: "format",
          type: "select",
          label: "Preferred format",
          options: [
            { value: "electronic", label: "Electronic (recommended)" },
            { value: "paper", label: "Paper" },
          ],
        },
      ],
    },
  ],

  appeal: [
    {
      id: "decision",
      title: "Decision being appealed",
      questions: [
        { id: "decisionType", type: "select", label: "What is being appealed?", required: true, options: [
          { value: "warning", label: "Warning (verbal / written / final)" },
          { value: "dismissal", label: "Dismissal" },
          { value: "redundancy", label: "Redundancy outcome" },
          { value: "other", label: "Other" },
        ] },
        { id: "decisionDate", type: "date", label: "Date of decision letter", required: true },
        { id: "appealDeadline", type: "date", label: "Appeal deadline (per the decision letter)" },
      ],
    },
    {
      id: "grounds",
      title: "Grounds of appeal",
      description: "We use the canonical four grounds. Provide what applies.",
      questions: [
        { id: "groundProcedural", type: "textarea", label: "Procedural unfairness — what process was not followed?" },
        { id: "groundFactual", type: "textarea", label: "Factual error — what facts were wrong or missing?" },
        { id: "groundSeverity", type: "textarea", label: "Severity — why was the sanction disproportionate?" },
        { id: "groundNewEvidence", type: "textarea", label: "New evidence — what's available now that wasn't before?" },
        { id: "outcomeSought", type: "textarea", label: "Outcome sought (overturn / reduce sanction / rehearing)", required: true },
      ],
    },
  ],

  whistleblowing: [
    {
      id: "disclosure",
      title: "What you are disclosing",
      description:
        "PIDA / s.43A ERA 1996 protection requires: information (not allegation), reasonable belief, public interest, and one of six categories (criminal offence, breach of legal obligation, miscarriage of justice, danger to health & safety, environmental damage, deliberate concealment).",
      questions: [
        {
          id: "category",
          type: "select",
          label: "Which category applies?",
          required: true,
          options: [
            { value: "crime", label: "Criminal offence (committed, being committed, or likely)" },
            { value: "legal_obligation", label: "Breach of a legal obligation" },
            { value: "miscarriage_of_justice", label: "Miscarriage of justice" },
            { value: "health_safety", label: "Danger to health and safety" },
            { value: "environmental", label: "Damage to the environment" },
            { value: "concealment", label: "Deliberate concealment of any of the above" },
          ],
        },
        {
          id: "disclosedFacts",
          type: "repeater",
          label: "Disclosed facts — chronological",
          help: "PIDA protects INFORMATION, not allegations. Each fact: date, what specifically happened, how you know. The AI uses this as the spine of the disclosure — be precise.",
          required: true,
          repeater: {
            itemLabel: "Fact",
            minItems: 1,
            maxItems: 15,
            defaultItems: 3,
            fields: [
              { id: "date", type: "date", label: "Date (or earliest date in pattern)", required: true },
              { id: "description", type: "textarea", label: "What specifically happened (no allegation language)", required: true },
              { id: "sourceOfKnowledge", type: "textarea", label: "How you know (witnessed, document, system export)", required: true },
              { id: "documents", type: "text", label: "Supporting documents / refs" },
              {
                id: "confidence",
                type: "select",
                label: "Confidence",
                options: [
                  { value: "direct", label: "Directly witnessed" },
                  { value: "document", label: "Document-based" },
                  { value: "hearsay", label: "Reliable hearsay" },
                ],
              },
              { id: "isOngoing", type: "boolean", label: "Is this pattern still ongoing?" },
            ],
          },
        },
        { id: "reasonableBeliefBasis", type: "textarea", label: "Why you reasonably believe the information is substantially true", required: true },
        { id: "publicInterestBasis", type: "textarea", label: "Why disclosure is in the public interest", required: true },
        {
          id: "recipient",
          type: "select",
          label: "Who are you disclosing to?",
          options: [
            { value: "employer", label: "Your employer (s.43C)" },
            { value: "prescribed", label: "A prescribed person (s.43F) — e.g. HSE, FCA, ICO" },
            { value: "legal", label: "A legal adviser (s.43D)" },
            { value: "minister", label: "Government minister (s.43E)" },
          ],
        },
      ],
    },
  ],

  accommodation_request: [
    {
      id: "barrier",
      title: "What you need",
      questions: [
        {
          id: "discloseDiagnosis",
          type: "select",
          label: "Do you want to disclose a specific impairment / diagnosis?",
          help: "You don't have to. Many employees disclose only the barrier and the adjustment, not the underlying condition.",
          options: [
            { value: "no", label: "No — describe the barrier only" },
            { value: "yes", label: "Yes — disclose the impairment" },
          ],
        },
        { id: "impairment", type: "text", label: "Impairment to disclose (only if you chose 'yes')", showIf: (a) => a.discloseDiagnosis === "yes" },
        {
          id: "barriersAndAdjustments",
          type: "repeater",
          label: "Barriers and the adjustments you're requesting",
          help: "One row per barrier. Pair each barrier with the specific adjustment that addresses it — the AI maps them directly into the letter so the employer sees a clean ask.",
          required: true,
          repeater: {
            itemLabel: "Barrier",
            minItems: 1,
            maxItems: 10,
            defaultItems: 2,
            fields: [
              { id: "barrier", type: "textarea", label: "Barrier (task/aspect of the job that is hindered)", required: true },
              { id: "adjustment", type: "textarea", label: "Adjustment you are requesting", required: true },
              {
                id: "priority",
                type: "select",
                label: "Priority",
                options: [
                  { value: "critical", label: "Critical — can't do the job without this" },
                  { value: "important", label: "Important — significant impact" },
                  { value: "helpful", label: "Helpful — meaningful improvement" },
                ],
              },
            ],
          },
        },
        {
          id: "ohReferralRequested",
          type: "boolean",
          label: "Are you requesting an Occupational Health referral / interactive meeting?",
        },
      ],
    },
  ],

  pay_dispute: [
    {
      id: "dispute",
      title: "Pay dispute details",
      questions: [
        { id: "currency", type: "select", label: "Currency", required: true, options: [
          { value: "GBP", label: "GBP £" }, { value: "USD", label: "USD $" }, { value: "EUR", label: "EUR €" },
        ] },
        {
          id: "payItems",
          type: "repeater",
          label: "Disputed pay items",
          help: "One row per claim type (wages, commission, holiday pay, expenses, etc.). Real disputes are usually itemised — the AI lays each out separately so the employer can verify each line.",
          required: true,
          repeater: {
            itemLabel: "Item",
            minItems: 1,
            maxItems: 12,
            defaultItems: 1,
            fields: [
              {
                id: "basis",
                type: "select",
                label: "Type",
                required: true,
                options: [
                  { value: "wages", label: "Unpaid wages" },
                  { value: "overtime", label: "Unpaid overtime" },
                  { value: "holiday", label: "Holiday pay" },
                  { value: "commission", label: "Commission" },
                  { value: "bonus", label: "Bonus" },
                  { value: "expenses", label: "Expenses" },
                  { value: "notice", label: "Notice pay" },
                  { value: "redundancy", label: "Redundancy pay" },
                ],
              },
              { id: "itemDescription", type: "text", label: "Short description", placeholder: "e.g. Q1 2026 sales commission", required: true },
              { id: "period", type: "text", label: "Period it covers", placeholder: "e.g. 1 Jan – 31 Mar 2026", required: true },
              { id: "amountDue", type: "currency", label: "Amount due", required: true },
              { id: "amountPaid", type: "currency", label: "Amount paid (if part-paid)" },
              { id: "calculation", type: "textarea", label: "Calculation / evidence", placeholder: "How you arrived at the figure — rates, hours, dates, refs", required: true },
            ],
          },
        },
        { id: "amountOwed", type: "currency", label: "Total amount owed (sum of items above)", required: true },
        { id: "demandDeadline", type: "date", label: "Deadline for payment" },
      ],
    },
  ],

  pip_response: [
    {
      id: "pip",
      title: "PIP details",
      questions: [
        { id: "pipDate", type: "date", label: "Date the PIP was issued", required: true },
        {
          id: "pipObjectives",
          type: "repeater",
          label: "PIP objectives — one row per stated objective",
          help: "Quote each objective verbatim from the PIP, then write your factual response and flag any ambiguity. The AI threads each objective into the letter with your reply so nothing gets compressed.",
          required: true,
          repeater: {
            itemLabel: "Objective",
            minItems: 1,
            maxItems: 10,
            defaultItems: 3,
            fields: [
              { id: "objectiveAsStated", type: "textarea", label: "Objective (verbatim from PIP)", required: true },
              { id: "response", type: "textarea", label: "Your factual response / engagement", required: true },
              { id: "ambiguity", type: "textarea", label: "Where it is ambiguous or unmeasurable" },
            ],
          },
        },
        { id: "supportRequested", type: "textarea", label: "What tools / training / OH / adjustments do you need?" },
      ],
    },
  ],

  constructive_dismissal_warning: [
    {
      id: "breach",
      title: "Breach particulars",
      questions: [
        {
          id: "incidents",
          type: "repeater",
          label: "Incidents amounting to fundamental breach",
          help: "Chronological list. Dates and named individuals. This drives the AI's recital — be specific.",
          required: true,
          repeater: {
            itemLabel: "Incident",
            minItems: 1,
            maxItems: 12,
            defaultItems: 3,
            fields: [
              { id: "date", type: "date", label: "Date", required: true },
              { id: "description", type: "textarea", label: "What happened? (factual)", required: true },
              { id: "individuals", type: "text", label: "Person(s) involved (full names)" },
              { id: "witnesses", type: "text", label: "Witnesses" },
              { id: "raisedAt", type: "text", label: "Previously raised? (when, to whom)" },
              { id: "employerResponse", type: "textarea", label: "Employer's response" },
            ],
          },
        },
        { id: "remedyDeadline", type: "date", label: "Deadline for the employer to remedy", required: true },
        { id: "remedyAsk", type: "textarea", label: "What remedy are you demanding?", required: true },
      ],
    },
  ],

  sickness_notification: [
    {
      id: "absence",
      title: "Absence",
      questions: [
        { id: "absenceFromDate", type: "date", label: "First day of absence", required: true },
        { id: "absenceToDate", type: "date", label: "Expected last day (if known)" },
        { id: "fitNoteAttached", type: "boolean", label: "Have you attached a Fit Note / medical certificate?" },
        { id: "adjustmentsReferenced", type: "textarea", label: "Any 'may be fit for work' adjustments?" },
      ],
    },
  ] as QuestionStep[],

  redundancy_consultation_response: [
    {
      id: "consultation",
      title: "Consultation context",
      questions: [
        { id: "atRiskDate", type: "date", label: "Date of at-risk notification", required: true },
        { id: "selectionPool", type: "textarea", label: "Selection pool (as described to you)" },
        { id: "selectionCriteria", type: "textarea", label: "Selection criteria (as described to you)" },
        { id: "questionsForEmployer", type: "textarea", label: "Specific questions for the employer", required: true },
        {
          id: "alternativeRoles",
          type: "repeater",
          label: "Alternative roles you propose",
          help: "Each role you believe avoids the redundancy. Strengthens the case that the employer hasn't reasonably explored alternatives.",
          repeater: {
            itemLabel: "Role",
            minItems: 0,
            maxItems: 5,
            defaultItems: 0,
            fields: [
              { id: "roleDescription", type: "textarea", label: "Role / title and team", required: true },
              { id: "location", type: "text", label: "Location" },
              { id: "justification", type: "textarea", label: "Why you are suitable and how this avoids the redundancy", required: true },
            ],
          },
        },
      ],
    },
  ],

  settlement_counter_offer: [
    {
      id: "counter",
      title: "Counter-offer",
      questions: [
        { id: "originalOffer", type: "currency", label: "Their offer (lump sum)" },
        { id: "counterOffer", type: "currency", label: "Your counter-offer (lump sum)", required: true },
        { id: "currency", type: "select", label: "Currency", options: [
          { value: "GBP", label: "GBP £" }, { value: "USD", label: "USD $" },
        ] },
        { id: "referencesWording", type: "textarea", label: "Agreed reference wording you want" },
        { id: "covenantsObjections", type: "textarea", label: "Covenants you want struck or narrowed" },
        { id: "legalFeesContribution", type: "currency", label: "Legal-fee contribution requested" },
      ],
    },
  ],

  right_to_disconnect: [],
  holiday_request: [
    {
      id: "request",
      title: "Holiday request",
      questions: [
        { id: "leaveFrom", type: "date", label: "From", required: true },
        { id: "leaveTo", type: "date", label: "To", required: true },
        { id: "reason", type: "select", label: "Statutory or contractual leave?", options: [
          { value: "statutory", label: "Statutory annual leave" },
          { value: "contractual", label: "Contractual leave above statutory minimum" },
        ] },
      ],
    },
  ],

  reference_dispute: [
    {
      id: "ref",
      title: "Reference dispute",
      questions: [
        {
          id: "disputedPassages",
          type: "repeater",
          label: "Disputed passages from the reference",
          help: "One row per inaccurate passage. Quote verbatim, then state what is actually correct and the evidence for it. The AI pairs each quote with its correction.",
          required: true,
          repeater: {
            itemLabel: "Passage",
            minItems: 1,
            maxItems: 6,
            defaultItems: 1,
            fields: [
              { id: "quote", type: "textarea", label: "Inaccurate passage (verbatim)", required: true },
              { id: "correctionWithEvidence", type: "textarea", label: "What is correct, and evidence for it", required: true },
            ],
          },
        },
        {
          id: "demands",
          type: "repeater",
          label: "Remedies you demand",
          help: "Numbered list of remedial steps the employer must take.",
          required: true,
          repeater: {
            itemLabel: "Demand",
            minItems: 1,
            maxItems: 5,
            defaultItems: 2,
            fields: [
              { id: "demandText", type: "textarea", label: "What you demand", required: true, placeholder: "e.g. Withdraw the reference and issue a corrected one to the prospective employer" },
              { id: "deadline", type: "date", label: "Deadline to comply" },
            ],
          },
        },
      ],
    },
  ],

  resignation_withdrawal: [
    {
      id: "circumstances",
      title: "Circumstances",
      questions: [
        { id: "resignationDate", type: "date", label: "Date you resigned", required: true },
        { id: "circumstances", type: "textarea", label: "Circumstances (heated discussion, ambiguous words, immediate withdrawal)", required: true },
      ],
    },
  ],

  acas_ec_notification: [
    {
      id: "claim",
      title: "Intended claim",
      questions: [
        { id: "claimType", type: "select", label: "Intended claim type", required: true, options: [
          { value: "unfair_dismissal", label: "Unfair dismissal" },
          { value: "constructive", label: "Constructive unfair dismissal" },
          { value: "discrimination", label: "Discrimination" },
          { value: "wages", label: "Unpaid wages / unauthorised deduction" },
          { value: "whistleblowing", label: "Whistleblowing detriment / dismissal" },
          { value: "redundancy", label: "Unfair redundancy" },
          { value: "other", label: "Other" },
        ] },
        { id: "claimSummary", type: "textarea", label: "Brief summary of claim basis", required: true },
      ],
    },
  ],

  tribunal_cover: [
    {
      id: "claim",
      title: "Claim",
      questions: [
        { id: "et1Number", type: "text", label: "ET1 case reference (if known)" },
        { id: "claimSummary", type: "textarea", label: "Claim summary", required: true },
      ],
    },
  ],
};

