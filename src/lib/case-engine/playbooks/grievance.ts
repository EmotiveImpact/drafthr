import type { Condition, Playbook, RouteStep } from "../types";

/**
 * Grievance playbook, translated from the draft 0.1 for legal review
 * (case-engine/playbooks/grievance.md, written 13 October 2026).
 *
 * Check ids keep the draft's K numbers. Where one draft check has a different
 * level for different lenses or situations, it is split and the extra check
 * gets a suffix (for example K1 and K1-hr). Route step ids are descriptive;
 * the comment on each step gives the draft's step code (E1, H2 and so on).
 * Facts the draft asks as one compound question (a yes-no plus a date) are
 * split into one fact per value, next to each other.
 */

type Block = NonNullable<RouteStep["blockedIf"]>[number];

// ---------------------------------------------------------------------------
// Shared conditions
// ---------------------------------------------------------------------------

/** England, Wales and Scotland: the Equality Act prevention duty and the 2025 Act time limits. */
const GB: Condition = { nation: ["england-wales", "scotland"] };
const NI: Condition = { nation: "northern-ireland" };
const UK: Condition = { country: "uk" };
const US: Condition = { country: "us" };
const EMPLOYEE: Condition = { lens: "employee" };
const EMPLOYER_SIDE: Condition = { lens: ["hr", "consultant"] };

const CHARACTERISTICS: string[] = [
  "age",
  "disability",
  "gender_reassignment",
  "marriage_civil_partnership",
  "pregnancy_maternity",
  "race",
  "national_origin",
  "religion_belief",
  "sex",
  "sexual_orientation",
  "political_opinion",
];

/** `protectedCharacteristicLink` names any characteristic, or "not sure". */
const LINKED_TO_CHARACTERISTIC: Condition = {
  fact: "protectedCharacteristicLink",
  in: [...CHARACTERISTICS, "not_sure"],
};

const RAISED_STAGES: string[] = [
  "raised_waiting",
  "meeting_arranged",
  "meeting_held",
  "outcome_received",
  "appealed",
  "appeal_decided",
];

/**
 * Stages after a meeting has been arranged. The acknowledgement and meeting
 * invite steps are not applicable once a case has moved past them outside
 * DraftHR, so later steps do not wait on them.
 */
const PAST_ARRANGING: string[] = [
  "meeting_arranged",
  "meeting_held",
  "outcome_received",
  "appealed",
  "appeal_decided",
];

const FAMILY_LEAVE: Condition = { fact: "familyLeaveStatus", in: ["pregnant", "on_leave", "returned"] };
const ROLE_CHANGING: Condition = { fact: "roleChange", in: ["changed", "at_risk_of_redundancy", "removed"] };
const RESIGNATION_IN_PLAY: Condition = {
  fact: "resignationIntent",
  in: ["thinking_about_it", "decided", "already_resigned"],
};
const PAY: Condition = { fact: "complaintCategories", is: "pay" };

/** Interim protection is expected: harassment, bullying, threats or ongoing contact. */
const INTERIM_NEEDED: Condition = {
  any: [
    { fact: "complaintCategories", in: ["bullying", "harassment", "sexual_harassment"] },
    { fact: "sexualConduct", is: true },
    { fact: "physicalHarmOrThreat", is: true },
    { fact: "isContinuing", is: true },
  ],
};

/**
 * A possible protected disclosure (K16 and the whistleblowing hand-off). The
 * draft's test story T2 treats a sexual harassment complaint received by HR
 * in Great Britain as one (ERA 1996 s43B(1)(da), from 6 April 2026), so that
 * case counts too. Employees get the same point in K7.
 */
const POSSIBLE_DISCLOSURE: Condition = {
  any: [
    { fact: "publicInterestElement", is: true },
    { all: [{ fact: "sexualConduct", is: true }, EMPLOYER_SIDE, GB] },
  ],
};

/**
 * The grievance is raised and waiting, and was sent before today. The draft
 * asks for "no acknowledgement after 10 working days, or no meeting after 20"
 * (K20, Proposal); the Condition language cannot count days since a past date,
 * so this is the closest safe version and the message carries the timetable.
 */
const AWAITING_REPLY: Condition = {
  all: [
    { fact: "grievanceStage", is: "raised_waiting" },
    {
      any: [
        { fact: "grievanceDate", before: { today: true } },
        { fact: "dateReceived", before: { today: true } },
      ],
    },
  ],
};

/** A date a claim deadline can run from is known. */
const CLAIM_POSSIBLE: Condition = {
  any: [{ known: "lastActDate" }, { known: "terminationDate" }, { known: "lastDeductionDate" }],
};

/** The UK tribunal deadlines, in rule use ids. K1, K2 and E6 look at all of them. */
const CLAIM_LIMITS: string[] = [
  "tribunal_discrimination",
  "tribunal_deduction",
  "tribunal_detriment",
  "tribunal_unfair_dismissal",
  "tribunal_companion",
];

/** The earliest claim deadline is 28 days away or less (passed deadlines included). */
const LIMIT_WITHIN_28: Condition = {
  any: CLAIM_LIMITS.map((id): Condition => ({ deadline: id, withinDays: 28 })),
};

/** A claim deadline is 28 days away or less and has not passed. */
const LIMIT_CLOSE: Condition = {
  any: CLAIM_LIMITS.map(
    (id): Condition => ({
      all: [{ deadline: id, withinDays: 28 }, { not: { deadline: id, withinDays: -1 } }],
    }),
  ),
};

/** A claim deadline has passed. */
const LIMIT_PASSED: Condition = {
  any: CLAIM_LIMITS.map((id): Condition => ({ deadline: id, withinDays: -1 })),
};

// ---------------------------------------------------------------------------
// Shared route blocks
// ---------------------------------------------------------------------------

const NOT_FOR_PERSON_COMPLAINED_ABOUT: Block = {
  when: { fact: "userPosition", is: "person_complained_about" },
  reason: "DraftHR does not use the grievance playbook to help the person complained about (K29).",
};

const CLIENT_SIGNER_NEEDED: Block = {
  when: { all: [{ lens: "consultant" }, { not: { known: "clientDecisionMaker" } }] },
  reason: "Confirm who at the client makes the decisions and signs the letters first.",
};

const RESIGNATION_WARNING_UNREAD: Block = {
  when: {
    all: [
      { fact: "resignationIntent", in: ["thinking_about_it", "decided"] },
      { not: { fact: "resignationAdviceRead", is: true } },
    ],
  },
  reason: "Read the warning about resigning (K12) and confirm you have read it before resignation letters unlock.",
};

// ---------------------------------------------------------------------------

const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export const grievancePlaybook: Playbook = {
  id: "grievance",
  name: "Grievance",
  version: "0.1",
  status: "draft",

  // Part 2
  recognise: {
    phrases: [
      "I want to raise a grievance",
      "formal complaint",
      "put it in writing",
      "bullied",
      "picked on",
      "singled out",
      "shouted at in front of everyone",
      "left out",
      "undermined",
      "harassed",
      "inappropriate comments",
      "messages late at night",
      "touched me",
      "sexual jokes",
      "it's just banter",
      "because I'm pregnant",
      "because I'm a mum",
      "because I'm gay",
      "because I'm disabled",
      "because I'm Muslim",
      "because I'm Black",
      "because I'm older",
      "they cut my pay",
      "changed my hours",
      "took my commission",
      "without asking me",
      "since I came back from maternity leave",
      "HR never replied",
      "nobody has got back to me",
      "I can't take any more, I'm going to hand in my notice",
      "an employee has put in a grievance",
      "a complaint about a manager",
      "allegation of sexual harassment",
      "how do we investigate this",
      "my client has received a grievance",
      "the MD wants to reject it",
    ],
    notThis: [
      "A request for flexible working, or a refusal of one, with no wider complaint: flexible working playbook.",
      "\"I want to see everything they hold about me\": a subject access request, which can run alongside a grievance.",
      "Reporting wrongdoing that affects others (fraud, safety, cover-up) with no personal complaint: whistleblowing playbook. Mixed cases stay here and trigger K16.",
      "\"Someone has raised a grievance about me\": the user is the person complained about. Disciplinary or allegation-response playbook.",
      "An appeal against a warning or dismissal: disciplinary playbook (appeal).",
      "Someone at risk of redundancy asking about the process: redundancy playbook. A formal complaint about selection or process comes back here as a linked case.",
      "A grievance raised by a trade union for two or more employees: out of scope in v0.1; the employer's collective procedure.",
      "A request for a pay rise or promotion with no complaint of unfair treatment: not covered in v0.1. Alleged unequal pay stays here.",
      "A request for reasonable adjustments with no complaint: health and disability playbook.",
      "A self-employed contractor complaining about the client business: out of scope in v0.1; check status first.",
    ],
  },

  // Part 3
  facts: [
    // 3.1 Who and where
    {
      key: "jurisdiction",
      label: "Where the person normally works",
      type: "choice",
      choices: ["england", "wales", "scotland", "northern_ireland", "united_states"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Where do you normally work? (Country, or US state.)",
        hr: "Where does the employee normally work?",
        consultant: "Where does the employee normally work?",
      },
      why: "Law, time limits and the conciliation body differ across England and Wales, Scotland, Northern Ireland and the US.",
    },
    {
      key: "userPosition",
      label: "Whose side the user is on",
      type: "choice",
      choices: ["complainant", "employer_handler", "employer_adviser", "person_complained_about", "other"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Is this about how you have been treated?",
        hr: "Are you handling this complaint for the employer?",
        consultant: "Are you advising the employer? Who at the client will sign letters?",
      },
      why: "Makes sure we are helping the right side, and catches the person complained about.",
    },
    {
      key: "clientDecisionMaker",
      label: "Client and decision maker",
      type: "text",
      priority: { consultant: "must" },
      question: {
        consultant: "Which client is this, and who there makes the decisions on this grievance?",
      },
      why: "Letters go out for the client and must be signed by the right person.",
    },
    {
      key: "employmentStatus",
      label: "Employment status",
      type: "choice",
      choices: ["employee", "worker", "agency_worker", "self_employed"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Are you an employee, a worker (for example casual or zero-hours), an agency worker, or self-employed?",
        hr: "Is the person an employee, worker, agency worker or contractor?",
        consultant: "Is the person an employee, worker, agency worker or contractor?",
      },
      why: "The right to be accompanied covers workers; constructive dismissal needs an employee.",
    },
    {
      key: "stillEmployed",
      label: "Still employed",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Do you still work there?",
        hr: "Is the person still employed?",
        consultant: "Is the person still employed?",
      },
      why: "Changes which letters and time limits apply.",
    },
    {
      // The date half of the draft's `stillEmployed` and of `resignationDates`.
      key: "terminationDate",
      label: "Date employment ended or ends",
      type: "date",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "When did your job end, or when is your last day?",
        hr: "When did employment end, or what is the termination date?",
        consultant: "When did employment end, or what is the termination date?",
      },
      askIf: {
        any: [
          { fact: "stillEmployed", is: false },
          { fact: "resignationIntent", is: "already_resigned" },
        ],
      },
      why: "The time limit for an unfair or constructive dismissal claim runs from the end of employment.",
    },
    {
      key: "employmentStartDate",
      label: "Start date",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "When did you start working there?",
        hr: "What is the employee's start date?",
        consultant: "What is the employee's start date?",
      },
      askIf: { any: [EMPLOYEE, RESIGNATION_IN_PLAY] },
      why: "Length of service matters for constructive dismissal.",
    },

    // 3.2 What happened
    {
      key: "complaintSummary",
      label: "What the complaint is about",
      type: "text",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Tell us what has happened, in your own words.",
        hr: "What does the grievance say? You can paste it or upload it.",
        consultant: "What does the grievance say? You can paste it or upload it.",
      },
      why: "The Reader builds the list of issues from this.",
    },
    {
      key: "complaintCategories",
      label: "Kinds of complaint",
      type: "list",
      choices: [
        "bullying",
        "harassment",
        "sexual_harassment",
        "discrimination",
        "pay",
        "contract_or_hours",
        "workload",
        "health_and_safety",
        "other",
      ],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Is this mainly about bullying, harassment, sexual harassment, discrimination, pay, changes to your contract or hours, workload, health and safety, or something else?",
        hr: "Which of these does the grievance raise: bullying, harassment, sexual harassment, discrimination, pay, changes to contract or hours, workload, health and safety, or something else?",
        consultant:
          "Which of these does the grievance raise: bullying, harassment, sexual harassment, discrimination, pay, changes to contract or hours, workload, health and safety, or something else?",
      },
      why: "Each category opens different checks.",
    },
    {
      key: "lastActDate",
      label: "Date of the most recent incident",
      type: "date",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "When did the most recent thing you are complaining about happen? If you are not sure of the exact day, give your best guess and tell us it is a guess.",
        hr: "What is the date of the most recent incident the employee complains about?",
        consultant: "What is the date of the most recent incident the employee complains about?",
      },
      why: "Most time limits run from this date. It is the most important date we collect. Ask again whenever a later event is mentioned.",
    },
    {
      // The "exact or estimate" half of the draft's `lastActDate`.
      key: "lastActDateEstimated",
      label: "Most recent incident date is an estimate",
      type: "boolean",
      priority: { employee: "nice", hr: "nice", consultant: "nice" },
      question: {
        employee: "Is that the exact day, or your best guess?",
        hr: "Is that date exact or an estimate?",
        consultant: "Is that date exact or an estimate?",
      },
      askIf: { known: "lastActDate" },
      why: "Records whether the most important date is exact or a guess.",
    },
    {
      key: "firstActDate",
      label: "When it started",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "When did it start?",
        hr: "When does the employee say it started?",
        consultant: "When does the employee say it started?",
      },
      why: "Shows a one-off or a pattern over time.",
    },
    {
      key: "isContinuing",
      label: "Still happening",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Is it still happening?",
        hr: "Is the conduct still going on?",
        consultant: "Is the conduct still going on?",
      },
      why: "Ongoing conduct can move the relevant date and needs protection now.",
    },
    {
      key: "incidentLog",
      label: "Incidents with dates",
      type: "text",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Can you list the main incidents: date, what was said or done, who was there?",
        hr: "Has the employee given dates and details for each incident?",
        consultant: "Has the employee given dates and details for each incident?",
      },
      why: "Dated, specific facts make a better letter and a fairer investigation.",
    },
    {
      key: "personComplainedAbout",
      label: "Who the complaint is about",
      type: "list",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Who is the complaint about?",
        hr: "Who is the complaint about?",
        consultant: "Who is the complaint about?",
      },
      askIf: {
        fact: "complaintCategories",
        in: ["bullying", "harassment", "sexual_harassment", "discrimination"],
      },
      why: "They need to be told and given a chance to respond; it also drives conflict checks.",
    },
    {
      key: "complainedAboutRole",
      label: "Their role",
      type: "list",
      choices: ["line_manager", "senior_manager", "colleague", "director_or_owner", "third_party"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Are they your manager, a more senior manager, a colleague, a director or owner, or someone outside the organisation such as a client or customer?",
        hr: "What is their role relative to the employee?",
        consultant: "What is their role relative to the employee?",
      },
      askIf: { known: "personComplainedAbout" },
      why: "Decides who can fairly hear it and whether third-party rules apply.",
    },
    {
      key: "protectedCharacteristicLink",
      label: "Link to a protected characteristic",
      type: "list",
      choices: [...CHARACTERISTICS, "not_sure", "none", "prefer_not_to_say"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Do you think any of this is connected to who you are? For example your sex, age, race, disability, religion or belief, sexual orientation, pregnancy or maternity, gender reassignment, or marriage or civil partnership. \"Not sure\" is fine.",
        hr: "Does the grievance suggest the treatment is linked to a protected characteristic?",
        consultant: "Does the grievance suggest the treatment is linked to a protected characteristic?",
      },
      specialCategory: true,
      why: "A link opens discrimination and harassment law and protects the complaint itself against victimisation. Northern Ireland adds political opinion; the US list includes national origin.",
    },
    {
      key: "sexualConduct",
      label: "Conduct of a sexual nature",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Did any of it involve unwanted conduct of a sexual nature, such as comments, messages, images or touching?",
        hr: "Does the complaint allege conduct of a sexual nature?",
        consultant: "Does the complaint allege conduct of a sexual nature?",
      },
      askIf: { fact: "complaintCategories", in: ["harassment", "sexual_harassment"] },
      specialCategory: true,
      why: "Triggers the employer's duty to prevent sexual harassment. Never ask for graphic detail.",
    },
    {
      key: "physicalHarmOrThreat",
      label: "Physical contact, harm or threats",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Has anyone touched you, hurt you or threatened you?",
        hr: "Does the complaint allege physical contact, assault or threats?",
        consultant: "Does the complaint allege physical contact, assault or threats?",
      },
      askIf: { fact: "complaintCategories", in: ["bullying", "harassment", "sexual_harassment"] },
      specialCategory: true,
      why: "Possible crimes need safety steps and a choice about the police.",
    },
    {
      key: "witnesses",
      label: "Witnesses",
      type: "list",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Did anyone see or hear what happened?",
        hr: "Has the employee named witnesses?",
        consultant: "Has the employee named witnesses?",
      },
      why: "Needed for the investigation.",
    },
    {
      key: "evidenceHeld",
      label: "Documents and messages",
      type: "text",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Do you have messages, emails, notes, payslips or other documents?",
        hr: "What documents does the employee rely on?",
        consultant: "What documents does the employee rely on?",
      },
      why: "Evidence supports each point.",
    },

    // 3.3 Process so far
    {
      key: "raisedInformally",
      label: "Raised informally",
      type: "boolean",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Have you mentioned this to anyone at work? When, and how?",
        hr: "Was this raised informally before?",
        consultant: "Was this raised informally before?",
      },
      why: "Acas suggests informal steps first but does not require them.",
    },
    {
      key: "grievanceStage",
      label: "Stage reached",
      type: "choice",
      choices: ["not_raised", ...RAISED_STAGES],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Where are you up to: not raised yet, raised and waiting, meeting arranged, meeting held, outcome received, appealed, or appeal decided?",
        hr: "What stage has it reached?",
        consultant: "What stage has it reached?",
      },
      why: "Decides which letter comes next.",
    },
    {
      key: "grievanceDate",
      label: "Date the grievance was sent or received",
      type: "date",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "On what date did you send your written grievance, and to whom?",
        hr: "On what date was it received, and by whom?",
        consultant: "On what date was it received, and by whom?",
      },
      askIf: { fact: "grievanceStage", in: RAISED_STAGES },
      why: "Measures delay and starts the process timetable.",
    },
    {
      key: "grievanceInWriting",
      label: "Grievance in writing",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Was it in writing (email or letter)?",
        hr: "Was it in writing? If not, how was it raised?",
        consultant: "Was it in writing? If not, how was it raised?",
      },
      askIf: { fact: "grievanceStage", in: RAISED_STAGES },
      why: "The Code expects a written grievance.",
    },
    {
      key: "policyDocument",
      label: "Grievance policy",
      type: "text",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Does your employer have a grievance policy? Upload it if you can.",
        hr: "Upload your grievance policy and any anti-harassment policy.",
        consultant: "Upload the client's grievance and anti-harassment policies.",
      },
      why: "Policies set timescales and appeal deadlines that letters must follow.",
    },
    {
      key: "outcomeDate",
      label: "Date of the outcome",
      type: "date",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "When did you get the outcome, and what does it say about appealing?",
        hr: "When was the outcome sent?",
        consultant: "When was the outcome sent?",
      },
      askIf: { fact: "grievanceStage", in: ["outcome_received", "appealed", "appeal_decided"] },
      why: "Policy appeal deadlines usually run from here.",
    },
    {
      // Needed for E5: "the employee is not satisfied".
      key: "satisfiedWithOutcome",
      label: "Satisfied with the outcome",
      type: "boolean",
      priority: { employee: "must" },
      question: { employee: "Are you satisfied with the outcome?" },
      askIf: { known: "outcomeDate" },
      why: "An appeal is offered only if you are not.",
    },
    {
      key: "desiredOutcome",
      label: "Outcome wanted",
      type: "text",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "What would you like to happen? For example an apology, the behaviour to stop, a change of manager, pay put right, a decision changed.",
        hr: "What outcome has the employee asked for?",
        consultant: "What outcome has the employee asked for?",
      },
      why: "The Code expects the employee to say how they think it should be settled.",
    },
    {
      // Part 5 (right to be accompanied) needs the meeting date.
      key: "meetingDate",
      label: "Grievance meeting date",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "When is (or was) the grievance meeting?",
        hr: "What date is proposed for the grievance meeting?",
        consultant: "What date has your client proposed for the grievance meeting?",
      },
      askIf: {
        any: [
          { all: [EMPLOYER_SIDE, { fact: "grievanceStage", in: ["raised_waiting", "meeting_arranged"] }] },
          { fact: "grievanceStage", in: ["meeting_arranged", "meeting_held"] },
        ],
      },
      why: "Sets the window for postponing so a companion can attend.",
    },
    {
      key: "companion",
      label: "Companion at the meeting",
      type: "text",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee:
          "Would you like someone with you at the meeting, such as a colleague or a trade union representative? Who?",
        hr: "Has the employee asked to be accompanied? By whom?",
        consultant: "Has the employee asked to be accompanied? By whom?",
      },
      askIf: { fact: "grievanceStage", in: ["raised_waiting", "meeting_arranged"] },
      why: "A statutory right where the grievance concerns a duty the employer owes.",
    },
    {
      // K21 needs it.
      key: "companionRefused",
      label: "Companion or postponement refused",
      type: "boolean",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Has your employer refused your companion, or refused to move the meeting so they can come?",
        hr: "Has a request for a companion, or to move the meeting so they can come, been refused?",
        consultant: "Has a request for a companion, or to move the meeting so they can come, been refused?",
      },
      askIf: { known: "companion" },
      why: "Refusing a permitted companion or a reasonable postponement can lead to an award.",
    },
    {
      key: "adjustmentsNeeded",
      label: "Adjustments for the meeting",
      type: "text",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee:
          "Is there anything that would make the meeting easier, such as breaks, giving a written statement, an interpreter, or a different place?",
        hr: "Does the employee need adjustments or an interpreter?",
        consultant: "Does the employee need adjustments or an interpreter?",
      },
      askIf: { fact: "grievanceStage", in: ["raised_waiting", "meeting_arranged"] },
      specialCategory: true,
      why: "Acas expects adjustments and interpreters to be considered.",
    },

    // 3.4 Things that change the route
    {
      key: "disciplinaryInProgress",
      label: "Disciplinary or other formal process running",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Are you going through a disciplinary, performance or absence process at the moment?",
        hr: "Is the employee in a disciplinary or other formal process now?",
        consultant: "Is the employee in a disciplinary or other formal process now?",
      },
      why: "A grievance raised during a disciplinary may pause it or run alongside it.",
    },
    {
      key: "familyLeaveStatus",
      label: "Pregnancy or family leave",
      type: "choice",
      choices: ["none", "pregnant", "on_leave", "returned", "prefer_not_to_say"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Are you pregnant, on maternity or other family leave, or back from it recently?",
        hr: "Is the employee pregnant, on family leave, or recently back?",
        consultant: "Is the employee pregnant, on family leave, or recently back?",
      },
      specialCategory: true,
      why: "Extra protections apply, including redundancy priority until 18 months after birth.",
    },
    {
      // The date half of the draft's `familyLeaveStatus`.
      key: "familyLeaveReturnDate",
      label: "Date back from family leave",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "When did you return?",
        hr: "When did they return?",
        consultant: "When did they return?",
      },
      askIf: { fact: "familyLeaveStatus", is: "returned" },
      specialCategory: true,
      why: "Shows how recent the return is.",
    },
    {
      // Part 3.4 ("only if a role change or redundancy is in play"), K11 and the redundancy hand-off.
      key: "roleChange",
      label: "Role changed, at risk or removed",
      type: "choice",
      choices: ["no", "changed", "at_risk_of_redundancy", "removed"],
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Is your job being changed, put at risk of redundancy, or removed?",
        hr: "Is the employee's role being changed, put at risk of redundancy, or removed?",
        consultant: "Is the employee's role being changed, put at risk of redundancy, or removed?",
      },
      askIf: FAMILY_LEAVE,
      why: "A role change while protected makes the family leave check urgent and opens the redundancy priority window.",
    },
    {
      key: "childBirthDate",
      label: "Child's date of birth",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee:
          "If you are happy to say, what is your child's date of birth? We only ask because it sets how long your redundancy protection lasts.",
        hr: "What is the child's date of birth? We only ask because a role change or redundancy is in play.",
        consultant: "What is the child's date of birth? We only ask because a role change or redundancy is in play.",
      },
      askIf: { all: [{ fact: "familyLeaveStatus", in: ["on_leave", "returned"] }, ROLE_CHANGING] },
      specialCategory: true,
      why: "Redundancy priority lasts until 18 months after the birth.",
    },
    {
      key: "healthImpact",
      label: "Effect on health",
      type: "boolean",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Has this affected your health or your ability to work? You don't need to give details.",
        hr: "Has the employee mentioned effects on their health?",
        consultant: "Has the employee mentioned effects on their health?",
      },
      specialCategory: true,
      why: "Signals adjustments and a possible disability issue. Never ask for a diagnosis.",
    },
    {
      // The second yes-no of the draft's `healthImpact`.
      key: "offSick",
      label: "Off sick",
      type: "boolean",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "Are you off sick at the moment?",
        hr: "Is the employee off sick?",
        consultant: "Is the employee off sick?",
      },
      askIf: { fact: "healthImpact", is: true },
      specialCategory: true,
      why: "Meetings may need to be in writing or somewhere else.",
    },
    {
      key: "resignationIntent",
      label: "Thinking of resigning",
      type: "choice",
      choices: ["no", "thinking_about_it", "decided", "already_resigned"],
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Are you thinking about leaving because of this? (No; thinking about it; decided; already resigned)",
        hr: "Has the employee mentioned resigning, or resigned?",
        consultant: "Has the employee mentioned resigning, or resigned?",
      },
      why: "Resigning has serious legal effects, so we flag them before any letter.",
    },
    {
      // K12: "The user must confirm they have read this before resignation letters unlock."
      key: "resignationAdviceRead",
      label: "Read the warning about resigning",
      type: "boolean",
      priority: { employee: "must" },
      question: {
        employee: "Before we draft anything about leaving, please read the warning about resigning. Have you read it?",
      },
      askIf: { fact: "resignationIntent", in: ["thinking_about_it", "decided"] },
      why: "Resignation letters stay locked until you confirm.",
    },
    {
      // The first date of the draft's `resignationDates`; the second is `terminationDate`.
      key: "resignationDate",
      label: "Date of resignation",
      type: "date",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "When did you resign?",
        hr: "When did they resign?",
        consultant: "When did they resign?",
      },
      askIf: { fact: "resignationIntent", is: "already_resigned" },
      why: "Records when notice was given. The claim time limit runs from the termination date.",
    },
    {
      key: "publicInterestElement",
      label: "Wrongdoing that affects others",
      type: "boolean",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee:
          "Does this also involve wrongdoing that could affect others, such as a crime, a breach of the law, danger to health or safety, sexual harassment, or a cover-up?",
        hr: "Does the grievance also report wrongdoing that could affect others?",
        consultant: "Does the grievance also report wrongdoing that could affect others?",
      },
      why: "It may be a protected disclosure, with separate protection.",
    },
    {
      key: "retaliationSinceRaising",
      label: "Treated badly since complaining",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee:
          "Has anything happened to you since you complained, such as being moved, criticised, left out or threatened?",
        hr: "Has anything changed for the employee since they complained?",
        consultant: "Has anything changed for the employee since they complained?",
      },
      askIf: {
        any: [
          { fact: "raisedInformally", is: true },
          { fact: "grievanceStage", in: RAISED_STAGES },
          { known: "grievanceDate" },
          { known: "dateReceived" },
        ],
      },
      why: "Treatment because of a complaint can be victimisation or a whistleblowing detriment. It may also be a new last act.",
    },
    {
      key: "earlyConciliation",
      label: "Acas or LRA contacted",
      type: "boolean",
      priority: { employee: "must", hr: "nice", consultant: "nice" },
      question: {
        employee: "Have you contacted Acas (or the LRA in Northern Ireland)?",
        hr: "Has the employee or their adviser mentioned Acas, the LRA, or a claim?",
        consultant: "Has the employee or their adviser mentioned Acas, the LRA, or a claim?",
      },
      askIf: { all: [UK, CLAIM_POSSIBLE] },
      why: "Early conciliation dates change the time limit.",
    },
    {
      key: "earlyConciliationDayA",
      label: "Date Acas or the LRA was contacted (Day A)",
      type: "date",
      priority: { employee: "must", hr: "nice", consultant: "nice" },
      question: {
        employee: "On what date did you contact Acas (or the LRA)?",
        hr: "On what date was Acas (or the LRA) contacted?",
        consultant: "On what date was Acas (or the LRA) contacted?",
      },
      askIf: { fact: "earlyConciliation", is: true },
      why: "The rules code needs Day A to extend the time limit.",
    },
    {
      key: "earlyConciliationDayB",
      label: "Date of the early conciliation certificate (Day B)",
      type: "date",
      priority: { employee: "should", hr: "nice", consultant: "nice" },
      question: {
        employee: "Have you had the early conciliation certificate? On what date?",
        hr: "On what date was the early conciliation certificate issued?",
        consultant: "On what date was the early conciliation certificate issued?",
      },
      askIf: { known: "earlyConciliationDayA" },
      why: "The rules code needs Day B to extend the time limit.",
    },
    {
      key: "tradeUnion",
      label: "Trade union",
      type: "boolean",
      priority: { employee: "nice", hr: "nice", consultant: "nice" },
      question: {
        employee: "Are you in a trade union?",
        hr: "Is there a recognised union?",
        consultant: "Is there a recognised union?",
      },
      specialCategory: true,
      why: "A union representative can accompany; collective grievances follow another route.",
    },
    {
      key: "organisationSize",
      label: "Number of people employed",
      type: "number",
      priority: { employee: "nice", hr: "nice", consultant: "nice" },
      question: "Roughly how many people work there?",
      askIf: { any: [US, { known: "intendedHearer" }] },
      why: "Small employers may need an outside hearer; US laws have size thresholds (to verify).",
    },
    {
      // K22 needs it.
      key: "collectiveGrievance",
      label: "Collective grievance",
      type: "boolean",
      priority: { hr: "nice", consultant: "nice" },
      question: {
        hr: "Was the grievance raised by a union or representative for two or more employees?",
        consultant: "Was the grievance raised by a union or representative for two or more employees?",
      },
      why: "The Acas Code does not apply to collective grievances.",
    },
    {
      // K28 needs it.
      key: "settlementMentioned",
      label: "Settlement or confidentiality mentioned",
      type: "boolean",
      priority: { employee: "nice", hr: "nice", consultant: "nice" },
      question: {
        employee: "Has anyone mentioned a settlement, a confidentiality agreement, or paying you to leave?",
        hr: "Has a settlement or a confidentiality agreement been mentioned?",
        consultant: "Has a settlement or a confidentiality agreement been mentioned?",
      },
      why: "Settlement talks are kept separate from the open grievance.",
    },
    {
      // The flexible working hand-off needs it.
      key: "flexibleWorkingRefused",
      label: "Flexible working request refused",
      type: "boolean",
      priority: { employee: "nice", hr: "nice", consultant: "nice" },
      question: {
        employee: "Is part of this about a flexible working request that was refused?",
        hr: "Does the grievance involve a refused flexible working request?",
        consultant: "Does the grievance involve a refused flexible working request?",
      },
      why: "Flexible working has its own statutory process.",
    },
    {
      // Part 5 tribunalTimeLimit needs "payment dates" for deductions claims.
      key: "lastDeductionDate",
      label: "Payday of the last short payment",
      type: "date",
      priority: { employee: "should", hr: "should", consultant: "should" },
      question: {
        employee: "On what payday was your pay short? If it has happened more than once, give the latest.",
        hr: "On what payday was the employee's pay short? If more than once, the latest.",
        consultant: "On what payday was the employee's pay short? If more than once, the latest.",
      },
      askIf: PAY,
      why: "The time limit for an unlawful deductions claim runs from this payment, or the last in a series.",
    },

    // 3.5 HR team and consultant only
    {
      key: "dateReceived",
      label: "Date the complaint was received",
      type: "date",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "On what date did you receive the complaint?",
        consultant: "On what date did your client receive the complaint?",
      },
      why: "Starts the response timetable and records how fast the employer acted.",
    },
    {
      // The "how" half of the draft's `dateReceived`.
      key: "receivedHow",
      label: "How the complaint was received",
      type: "choice",
      choices: ["letter", "email", "verbal", "exit_interview", "anonymous_report"],
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "How did you receive it: letter, email, verbal, exit interview or anonymous report?",
        consultant: "How did your client receive it: letter, email, verbal, exit interview or anonymous report?",
      },
      why: "A verbal or anonymous complaint still needs a response; treat it as formal if in doubt.",
    },
    {
      key: "intendedHearer",
      label: "Who will hear the grievance",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Who will hear the grievance?",
        consultant: "Who will hear the grievance for your client?",
      },
      why: "The Code expects a manager who is not the subject of the grievance, and impartial appeals.",
    },
    {
      // The first yes-no half of the draft's `intendedHearer` (K9).
      key: "hearerConflict",
      label: "Hearer is involved",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Is the person who will hear it (or would normally hear it) the person complained about, involved in the events, or closely linked to that person?",
        consultant:
          "Is the person who will hear it (or would normally hear it) the person complained about, involved in the events, or closely linked to that person?",
      },
      why: "If so, someone else must hear it.",
    },
    {
      // The second yes-no half of the draft's `intendedHearer` (K10).
      key: "hearerPrejudged",
      label: "Decision maker has already given a view",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Has the person who will decide already expressed a view on the complaint?",
        consultant: "Has the person who will decide already expressed a view on the complaint?",
      },
      why: "A decision maker who has prejudged it is an impartiality risk.",
    },
    {
      key: "interimMeasures",
      label: "Interim protection",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "What has been done to protect the employee while this is looked at, such as changes to rotas, reporting lines or location?",
        consultant:
          "What has your client done to protect the employee while this is looked at, such as changes to rotas, reporting lines or location?",
      },
      askIf: INTERIM_NEEDED,
      why: "Protection during the process, presented as temporary and not as a punishment.",
    },
    {
      key: "priorComplaints",
      label: "Earlier complaints",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Have there been earlier complaints about the same person or issue?",
        consultant: "Have there been earlier complaints about the same person or issue?",
      },
      askIf: { known: "personComplainedAbout" },
      why: "Affects the scope of the investigation and the prevention duty.",
    },
    {
      key: "preventionMeasures",
      label: "Steps taken to prevent sexual harassment",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Before this, what had the organisation done to prevent sexual harassment: policy, training, risk assessment, reporting routes? When were they last reviewed?",
        consultant:
          "Before this, what had your client done to prevent sexual harassment: policy, training, risk assessment, reporting routes? When were they last reviewed?",
      },
      askIf: { fact: "sexualConduct", is: true },
      why: "Tests the employer's duty to prevent sexual harassment.",
    },
    {
      // The disciplinary hand-off needs it.
      key: "caseToAnswer",
      label: "Misconduct by the person complained about",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Does the investigation or outcome suggest misconduct by the person complained about?",
        consultant: "Does the investigation or outcome suggest misconduct by the person complained about?",
      },
      askIf: { fact: "grievanceStage", in: ["meeting_held", "outcome_received", "appealed", "appeal_decided"] },
      why: "If so, the disciplinary playbook runs as a linked case.",
    },
    {
      // H5 needs it: "Appeal hearing held".
      key: "appealHearingHeld",
      label: "Appeal hearing held",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Has the appeal hearing been held?",
        consultant: "Has the appeal hearing been held?",
      },
      askIf: { fact: "grievanceStage", is: "appealed" },
      why: "The appeal outcome waits for the hearing.",
    },

    // 3.6 United States only (outline)
    {
      key: "usState",
      label: "US state",
      type: "choice",
      choices: US_STATES,
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Which state do you work in?",
        hr: "Which state does the employee work in?",
        consultant: "Which state does the employee work in?",
      },
      askIf: US,
      why: "Sets the 180 or 300 day EEOC deadline and any state agency.",
    },
    {
      key: "federalEmployee",
      label: "Federal employee",
      type: "boolean",
      priority: { employee: "must", hr: "must", consultant: "must" },
      question: {
        employee: "Do you work for a federal government agency?",
        hr: "Does the employee work for a federal government agency?",
        consultant: "Does the employee work for a federal government agency?",
      },
      askIf: US,
      why: "Federal employees must contact an EEO counsellor within 45 days.",
    },
  ],

  // Part 4
  checks: [
    {
      id: "K1",
      level: "act_now",
      when: { all: [EMPLOYEE, LIMIT_CLOSE] },
      message:
        "Your earliest likely claim deadline is 28 days away or less. Your grievance does not pause it, and you must contact Acas (or the LRA in Northern Ireland) before it. You can start early conciliation now, alongside your grievance.",
      sources: ["S8", "S9"],
      toVerify: true,
      proposal: true,
    },
    {
      id: "K1-hr",
      level: "worth_checking",
      when: { all: [EMPLOYER_SIDE, LIMIT_CLOSE] },
      message: {
        hr: "The employee's earliest likely claim deadline is 28 days away or less. The grievance does not pause it, so expect contact from Acas (or the LRA) about early conciliation.",
        consultant:
          "The employee's earliest likely claim deadline is 28 days away or less. The grievance does not pause it, so your client should expect contact from Acas (or the LRA) about early conciliation.",
      },
      sources: ["S8", "S9"],
      toVerify: true,
      proposal: true,
    },
    {
      id: "K2",
      level: "act_now",
      when: { all: [EMPLOYEE, LIMIT_PASSED] },
      message:
        "The earliest claim deadline has passed. A late claim depends on the tribunal agreeing to extend time, which is never certain, so get urgent advice. You can still carry on with your grievance.",
      sources: ["S8", "S20 s123(1)(b)", "S26 s111(2)(b)"],
    },
    {
      id: "K3",
      level: "for_information",
      when: { all: [EMPLOYEE, CLAIM_POSSIBLE] },
      message: "Your grievance and any appeal do not change the deadline for a claim.",
      sources: ["S8"],
    },
    {
      id: "K4",
      level: "worth_checking",
      when: {
        all: [
          GB,
          {
            any: [
              {
                all: [
                  { fact: "firstActDate", before: "2026-10-01" },
                  { fact: "lastActDate", onOrAfter: "2026-10-01" },
                ],
              },
              {
                all: [
                  { fact: "lastActDate", before: "2026-10-01" },
                  { not: { fact: "isContinuing", is: false } },
                ],
              },
              {
                all: [{ fact: "firstActDate", before: "2026-10-01" }, { fact: "isContinuing", is: true }],
              },
            ],
          },
        ],
      },
      message:
        "What happened may run across 1 October 2026, when most time limits went from 3 to 6 months. Which applies depends on the \"relevant date\": for most claims the act or the last act in a series, and for Equality Act claims the end of conduct over a period. The deadline is worked out again if a later act is reported. Plan to the earlier date until a lawyer confirms.",
      sources: ["S39", "S40"],
      toVerify: true,
    },
    {
      id: "K5",
      level: "worth_checking",
      // Sexual conduct counts too: sexual harassment is harassment under the
      // Equality Act, and T2 expects K5 without a stated characteristic.
      when: { any: [LINKED_TO_CHARACTERISTIC, { fact: "sexualConduct", is: true }] },
      message: {
        employee:
          "This may be discrimination or harassment. Your letter should state a belief (\"I believe this is connected to...\") rather than a legal conclusion. Making this complaint is a protected act, so being treated badly because of it later may be victimisation.",
        hr: "This may be a discrimination or harassment complaint: investigate it as one. Raising it is a protected act, so any later detriment because of it may be victimisation.",
        consultant:
          "This may be a discrimination or harassment complaint, and your client should investigate it as one. Raising it is a protected act, so any later detriment because of it may be victimisation.",
      },
      sources: ["S18"],
    },
    {
      id: "K6",
      level: "act_now",
      when: { all: [{ fact: "sexualConduct", is: true }, EMPLOYER_SIDE, GB] },
      message: {
        hr: "Act promptly: put interim protection in place, appoint an independent handler, support everyone involved, discuss the police with the complainant where the conduct may be criminal, and keep records. Employers have had a duty to take reasonable steps to prevent sexual harassment since 26 October 2024; from 30 October 2026 it is all reasonable steps. A tribunal must consider a breach and may add up to 25% to sexual harassment compensation, and the EHRC can enforce the duty. Review prevention measures afterwards.",
        consultant:
          "Your client should act promptly: interim protection, an independent handler, support for everyone involved, a discussion with the complainant about the police where the conduct may be criminal, and records. Employers have had a duty to take reasonable steps to prevent sexual harassment since 26 October 2024; from 30 October 2026 it is all reasonable steps. A tribunal must consider a breach and may add up to 25% to sexual harassment compensation, and the EHRC can enforce the duty. Review prevention measures afterwards.",
      },
      sources: ["S19", "S21", "S31", "S42", "S45", "S46"],
    },
    {
      // Part 5.2 and T3: in Northern Ireland K6 is a good-practice note only.
      id: "K6-ni",
      level: "for_information",
      when: { all: [{ fact: "sexualConduct", is: true }, EMPLOYER_SIDE, NI] },
      message:
        "The Great Britain duty to prevent sexual harassment does not extend to Northern Ireland, and whether an equivalent duty exists there is not yet confirmed. DraftHR still recommends the same good practice: interim protection, an independent handler, support for those involved, and records.",
      sources: ["S23", "S31"],
      toVerify: true,
    },
    {
      id: "K7",
      level: "worth_checking",
      when: { all: [{ fact: "sexualConduct", is: true }, EMPLOYEE, GB] },
      message:
        "This sounds very hard, and support is available. Your employer has a legal duty to prevent sexual harassment. Whether to go to the police is your choice, and there is no pressure either way. Since 6 April 2026, reporting sexual harassment can also count as a whistleblowing disclosure, if the other conditions are met.",
      sources: ["S19", "S24", "S34"],
    },
    {
      id: "K8",
      level: "worth_checking",
      when: { all: [{ fact: "complainedAboutRole", is: "third_party" }, GB] },
      message: {
        employee:
          "Part of your complaint is about someone outside the organisation. From 30 October 2026 an employer must not permit a third party to harass its employees, and fails only if it did not take all reasonable steps. Before that date, third-party sexual harassment is covered only by the duty to prevent sexual harassment.",
        hr: "The complaint involves someone outside the organisation. From 30 October 2026 you must not permit a third party to harass your employees, and you fail only if you did not take all reasonable steps. Before that date, third-party sexual harassment is covered only by the duty to prevent sexual harassment.",
        consultant:
          "The complaint involves someone outside the organisation. From 30 October 2026 your client must not permit a third party to harass its employees, and fails only if it did not take all reasonable steps. Before that date, third-party sexual harassment is covered only by the duty to prevent sexual harassment.",
      },
      sources: ["S32", "S42", "S45"],
      toVerify: true,
    },
    {
      id: "K9",
      level: "act_now",
      when: { all: [{ fact: "hearerConflict", is: true }, EMPLOYER_SIDE] },
      message: {
        hr: "The person who would hear this is the person complained about, was involved, or is closely linked to them. Appoint someone else: their manager, another manager, or an outside person. In a small organisation, record why you chose the hearer.",
        consultant:
          "The person who would hear this is the person complained about, was involved, or is closely linked to them. Your client should appoint someone else: their manager, another manager, or an outside person. In a small organisation, record why the hearer was chosen.",
      },
      sources: ["S1 para 32", "S47 para 76"],
    },
    {
      id: "K10",
      level: "worth_checking",
      when: { all: [{ fact: "hearerPrejudged", is: true }, EMPLOYER_SIDE] },
      message: {
        hr: "The person who will decide has already given a view (for example that it was banter). That is an impartiality risk. Appoint someone else to hear it: their manager, another manager, or an outside person.",
        consultant:
          "The person who will decide has already given a view (for example that it was banter). That is an impartiality risk. Advise your client to appoint someone else to hear it: their manager, another manager, or an outside person.",
      },
      sources: ["S1 paras 4, 43"],
    },
    {
      id: "K11",
      level: "worth_checking",
      when: FAMILY_LEAVE,
      message: {
        employee:
          "Because you are pregnant, on family leave or recently back, this may be pregnancy and maternity discrimination, or sex discrimination; which applies after you return is not yet settled. If your role is changing or at risk, you have priority for suitable alternative work until 18 months after the birth.",
        hr: "The employee is pregnant, on family leave or recently back. Treat this as a possible pregnancy and maternity, or sex, discrimination complaint. If their role is changing or at risk, redundancy priority applies until 18 months after the birth.",
        consultant:
          "The employee is pregnant, on family leave or recently back. Your client should treat this as a possible pregnancy and maternity, or sex, discrimination complaint. If the role is changing or at risk, redundancy priority applies until 18 months after the birth.",
      },
      sources: ["S11", "S17"],
      toVerify: true,
    },
    {
      // The draft's K11: "Level is act now if a role is being removed." T1 applies it to a role change.
      id: "K11-role",
      level: "act_now",
      when: { all: [FAMILY_LEAVE, ROLE_CHANGING] },
      message: {
        employee:
          "Your role is being changed or removed while you are protected. This needs attention now: your priority for suitable alternative work lasts until 18 months after the birth, and we will ask for your child's date of birth to work out that date.",
        hr: "A role is being changed or removed for someone who is pregnant, on family leave or recently back. Act now: check the reasons, and remember redundancy priority for suitable alternative work lasts until 18 months after the birth.",
        consultant:
          "A role is being changed or removed for someone who is pregnant, on family leave or recently back. Your client should act now: check the reasons, and remember redundancy priority for suitable alternative work lasts until 18 months after the birth.",
      },
      sources: ["S11", "S17"],
    },
    {
      id: "K12",
      level: "act_now",
      when: { all: [EMPLOYEE, { fact: "resignationIntent", in: ["thinking_about_it", "decided"] }] },
      message:
        "Please do not resign without advice. Constructive dismissal needs a serious breach of contract by your employer. You usually need 2 years' service to claim, with some exceptions; for dismissals from 1 January 2027 this becomes 6 months. Raise a grievance first if you can. Signing a settlement agreement ends the claim. Please confirm you have read this before we draft any resignation letter.",
      sources: ["S10", "S25", "S36", "S43", "S44"],
      toVerify: true,
    },
    {
      id: "K13",
      level: "act_now",
      when: { all: [EMPLOYEE, { fact: "resignationIntent", is: "already_resigned" }] },
      message:
        "You have already resigned. Tell us your last day of employment: the time limit for a claim runs from it. If your resignation did not set out your reasons, we can draft a resignation with grievance letter.",
      sources: ["S8", "S26"],
    },
    {
      id: "K14",
      level: "worth_checking",
      when: { all: [EMPLOYER_SIDE, RESIGNATION_IN_PLAY] },
      message: {
        hr: "The employee has mentioned resigning, or has resigned. There is a constructive dismissal risk. Keep dealing with the grievance. Whether the Acas Code still applies once employment has ended is not yet settled.",
        consultant:
          "The employee has mentioned resigning, or has resigned. There is a constructive dismissal risk for your client. Keep dealing with the grievance. Whether the Acas Code still applies once employment has ended is not yet settled.",
      },
      sources: ["S10"],
      toVerify: true,
    },
    {
      id: "K15",
      level: "worth_checking",
      when: { fact: "disciplinaryInProgress", is: true },
      message: {
        employee:
          "You are in a disciplinary or other formal process. Your employer may pause it to deal with your grievance, or deal with both together if they are related. If your grievance is about the manager running the disciplinary, you can ask for someone else.",
        hr: "The employee is in a disciplinary or other formal process. You may pause it to deal with the grievance, or deal with both together if they are related. If the grievance is about the disciplinary manager, consider changing them.",
        consultant:
          "The employee is in a disciplinary or other formal process. Your client may pause it to deal with the grievance, or deal with both together if they are related. If the grievance is about the disciplinary manager, consider changing them.",
      },
      sources: ["S1 para 46", "S4"],
    },
    {
      id: "K16",
      level: "worth_checking",
      when: POSSIBLE_DISCLOSURE,
      message: {
        employee:
          "This may also be a protected disclosure (whistleblowing), if you reasonably believe it is in the public interest and it shows a listed failure such as a crime, a breach of a legal obligation, danger to health or safety, or sexual harassment. That gives separate protection from detriment and dismissal.",
        hr: "The complaint may also be a protected disclosure (whistleblowing), if the employee reasonably believes it is in the public interest and it shows a listed failure, which since 6 April 2026 includes sexual harassment. The employee would then have separate protection from detriment and dismissal.",
        consultant:
          "The complaint may also be a protected disclosure (whistleblowing), if the employee reasonably believes it is in the public interest and it shows a listed failure, which since 6 April 2026 includes sexual harassment. The employee would then have separate protection from detriment and dismissal.",
      },
      sources: ["S24"],
    },
    {
      id: "K17",
      level: "worth_checking",
      when: { any: [{ fact: "healthImpact", is: true }, { fact: "offSick", is: true }] },
      message: {
        employee:
          "This is affecting your health. You can ask for adjustments to the meeting, such as giving a written statement, breaks, a different place, or a companion. You do not need to give us any medical details.",
        hr: "The employee's health is affected. Offer meeting adjustments: a written statement, breaks, another location, a companion. There may be a disability. Never ask for a diagnosis.",
        consultant:
          "The employee's health is affected. Your client should offer meeting adjustments: a written statement, breaks, another location, a companion. There may be a disability. Never ask for a diagnosis.",
      },
      sources: ["S5"],
    },
    {
      id: "K18",
      level: "act_now",
      when: { fact: "retaliationSinceRaising", is: true },
      message: {
        employee:
          "Something has happened to you since you complained. That may be victimisation (if your complaint was about discrimination or harassment) or a whistleblowing detriment. It may also be a new last act, which can change your deadline, so tell us when it happened.",
        hr: "The employee says they have been treated badly since complaining. That may be victimisation or a whistleblowing detriment. Stop it now and record the date: it may be a new last act.",
        consultant:
          "The employee says they have been treated badly since complaining. That may be victimisation or a whistleblowing detriment. Your client should stop it now and record the date: it may be a new last act.",
      },
      sources: ["S18"],
    },
    {
      id: "K19",
      level: "for_information",
      when: { all: [EMPLOYEE, { fact: "grievanceInWriting", is: false }] },
      message:
        "Put your grievance in writing. The Code expects it, and an unreasonable failure to follow the Code can reduce an award by up to 25%.",
      sources: ["S1 para 32", "S15"],
    },
    {
      id: "K20",
      level: "worth_checking",
      when: { all: [EMPLOYEE, AWAITING_REPLY] },
      message:
        "If 10 working days have passed with no acknowledgement, or 20 with no meeting, chase your employer in writing. The Code expects a meeting without unreasonable delay, and Acas suggests ideally within 5 working days. An unreasonable failure by your employer can increase an award by up to 25%.",
      sources: ["S1 para 33", "S5", "S15"],
      proposal: true,
    },
    {
      id: "K20-hr",
      level: "act_now",
      when: { all: [EMPLOYER_SIDE, AWAITING_REPLY] },
      message: {
        hr: "Acknowledge the grievance within 10 working days of receipt and hold the meeting within 20. The Code expects a meeting without unreasonable delay; Acas suggests ideally within 5 working days. An unreasonable failure can increase an award by up to 25%.",
        consultant:
          "Your client should acknowledge the grievance within 10 working days of receipt and hold the meeting within 20. The Code expects a meeting without unreasonable delay; Acas suggests ideally within 5 working days. An unreasonable failure can increase an award by up to 25%.",
      },
      sources: ["S1 para 33", "S5", "S15"],
      proposal: true,
    },
    {
      id: "K21",
      level: "worth_checking",
      when: { fact: "companionRefused", is: true },
      message: {
        employee:
          "Your employer must let you bring a permitted companion. If your companion cannot come on the date proposed, the meeting must move to a reasonable time within 5 working days. A tribunal can award up to 2 weeks' pay if this right is refused.",
        hr: "Allow a permitted companion. If they cannot come on the date proposed, postpone to a reasonable time within 5 working days. Refusing can lead to an award of up to 2 weeks' pay.",
        consultant:
          "Your client must allow a permitted companion. If they cannot come on the date proposed, postpone to a reasonable time within 5 working days. Refusing can lead to an award of up to 2 weeks' pay.",
      },
      sources: ["S12", "S13"],
    },
    {
      id: "K22",
      level: "for_information",
      when: { all: [EMPLOYER_SIDE, { fact: "collectiveGrievance", is: true }] },
      message: {
        hr: "This grievance is raised by a union or representative for two or more employees. The Acas Code does not apply; follow your collective procedure.",
        consultant:
          "This grievance is raised by a union or representative for two or more employees. The Acas Code does not apply; your client should follow its collective procedure.",
      },
      sources: ["S1 para 47"],
    },
    {
      id: "K23",
      level: "worth_checking",
      when: {
        any: [
          { fact: "grievanceDate", onOrAfter: { fact: "terminationDate" } },
          { fact: "dateReceived", onOrAfter: { fact: "terminationDate" } },
        ],
      },
      message: {
        employee:
          "You raised this after your employment ended. Your former employer should still reply in writing. Time limits keep running. Whether the Acas Code applies is not yet settled.",
        hr: "The grievance was raised after employment ended. Still respond in writing. Time limits keep running. Whether the Acas Code applies is not yet settled.",
        consultant:
          "The grievance was raised after employment ended. Your client should still respond in writing. Time limits keep running. Whether the Acas Code applies is not yet settled.",
      },
      sources: ["Open question 5"],
      toVerify: true,
    },
    {
      id: "K24",
      level: "worth_checking",
      when: PAY,
      message: {
        employee:
          "Pay is part of your complaint, so you may have an unlawful deductions claim. The time limit runs from the payment date, or the last payment in a series. We can draft a pay dispute letter alongside your grievance.",
        hr: "Pay is part of the complaint: a possible unlawful deductions claim. The time limit runs from the payment date, or the last payment in a series.",
        consultant:
          "Pay is part of the complaint: a possible unlawful deductions claim against your client. The time limit runs from the payment date, or the last payment in a series.",
      },
      sources: ["S16", "S40"],
    },
    {
      id: "K25",
      level: "act_now",
      when: { fact: "physicalHarmOrThreat", is: true },
      message: {
        employee:
          "Your safety comes first. Whether to go to the police is your decision. Your employer should discuss it with you, support you, and protect you without waiting for the investigation to finish.",
        hr: "Safety first. The complainant decides whether to go to the police; discuss it with them and support them. Take protective steps now, without waiting for the investigation.",
        consultant:
          "Safety first. The complainant decides whether to go to the police; your client should discuss it with them and support them, and take protective steps now without waiting for the investigation.",
      },
      sources: ["S4", "S46"],
    },
    {
      id: "K26",
      level: "for_information",
      when: NI,
      message:
        "Northern Ireland rules apply: the LRA Code instead of the Acas Code, awards adjustable by up to 50%, early conciliation through the LRA, time limits that stay at 3 months, and no statutory duty to prevent sexual harassment under the Equality Act.",
      sources: ["S23", "S38", "S47 to S50"],
      toVerify: true,
    },
    {
      id: "K27",
      level: "for_information",
      when: US,
      message:
        "This is a US case, which DraftHR covers in outline only. An internal complaint does not extend the deadline for a charge with the EEOC or a state agency.",
      sources: ["S55", "S56"],
    },
    {
      id: "K28",
      level: "worth_checking",
      when: { fact: "settlementMentioned", is: true },
      message: {
        employee:
          "Keep settlement talks separate from your open grievance. New law makes some confidentiality terms about harassment and discrimination void; it is only partly in force, with regulations due in 2027.",
        hr: "Keep settlement talks separate from the open grievance, with a settlement cover letter. New law makes some confidentiality terms about harassment and discrimination void; it is only partly in force, with regulations due in 2027.",
        consultant:
          "Your client should keep settlement talks separate from the open grievance, with a settlement cover letter. New law makes some confidentiality terms about harassment and discrimination void; it is only partly in force, with regulations due in 2027.",
      },
      sources: ["S35", "S44"],
    },
    {
      id: "K29",
      level: "act_now",
      when: { fact: "userPosition", is: "person_complained_about" },
      message:
        "It looks as though you are the person the grievance is about. DraftHR does not use the grievance playbook to help the person complained about, so we will move you to the right place.",
      sources: ["Part 2"],
    },
  ],

  // Parts 5 and 9. Dates come from the rules code only.
  rules: [
    {
      id: "tribunal_discrimination",
      label: "Last day for a discrimination or harassment claim, before early conciliation",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "lastActDate" } },
      when: {
        all: [
          UK,
          {
            any: [
              LINKED_TO_CHARACTERISTIC,
              { fact: "sexualConduct", is: true },
              { fact: "complaintCategories", in: ["discrimination", "sexual_harassment"] },
            ],
          },
        ],
      },
    },
    {
      // Northern Ireland deductions are not in v0.1 (part 9, T3).
      id: "tribunal_deduction",
      label: "Last day for an unlawful deductions claim, before early conciliation",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "deduction" }, relevantDate: { fact: "lastDeductionDate" } },
      when: { all: [GB, PAY] },
    },
    {
      id: "tribunal_detriment",
      label: "Last day for a whistleblowing detriment claim, before early conciliation",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "detriment" }, relevantDate: { fact: "lastActDate" } },
      when: { all: [UK, { fact: "publicInterestElement", is: true }] },
    },
    {
      id: "tribunal_unfair_dismissal",
      label: "Last day for a constructive dismissal claim, before early conciliation",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "unfair_dismissal" }, relevantDate: { fact: "terminationDate" } },
      when: {
        all: [
          UK,
          { fact: "resignationIntent", in: ["decided", "already_resigned"] },
          { not: { fact: "employmentStatus", in: ["worker", "agency_worker", "self_employed"] } },
        ],
      },
    },
    {
      id: "tribunal_companion",
      label: "Last day for a claim about the right to be accompanied, before early conciliation",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "companion" }, relevantDate: { fact: "meetingDate" } },
      when: { all: [UK, { fact: "companionRefused", is: true }] },
    },
    {
      // limitDate is the earliest of the claim deadlines above.
      id: "early_conciliation",
      label: "Claim deadline after the early conciliation extension",
      rule: "uk.earlyConciliation",
      inputs: {
        limitDate: {
          deadline: [
            "tribunal_discrimination",
            "tribunal_deduction",
            "tribunal_detriment",
            "tribunal_unfair_dismissal",
            "tribunal_companion",
          ],
        },
        dayA: { fact: "earlyConciliationDayA" },
        dayB: { fact: "earlyConciliationDayB" },
      },
      when: { all: [GB, { fact: "earlyConciliation", is: true }] },
    },
    {
      id: "companion_postponement",
      label: "Latest date for a postponed meeting so the companion can attend",
      rule: "uk.companionPostponement",
      inputs: { proposedDate: { fact: "meetingDate" } },
      when: { all: [UK, { known: "meetingDate" }] },
    },
    {
      id: "qualifying_service",
      label: "Date the qualifying service for constructive dismissal is met",
      rule: "uk.qualifyingService",
      inputs: { startDate: { fact: "employmentStartDate" }, terminationDate: { fact: "terminationDate" } },
      when: { all: [UK, RESIGNATION_IN_PLAY] },
    },
    {
      // No date: detail.standard and detail.thirdParty say which duty applied.
      id: "sexual_harassment_duty",
      label: "Which duty to prevent sexual harassment applied",
      rule: "uk.sexualHarassmentDuty",
      inputs: { conductDate: { fact: "lastActDate" } },
      when: { all: [GB, { fact: "sexualConduct", is: true }] },
    },
    {
      // The draft's maternityRedundancyWindow: maternity only, and only when a role change is in play.
      id: "maternity_redundancy_window",
      label: "End of redundancy priority protection",
      rule: "uk.familyLeaveProtectedPeriod",
      inputs: { leaveType: { value: "maternity" }, birthDate: { fact: "childBirthDate" } },
      when: { all: [UK, FAMILY_LEAVE, ROLE_CHANGING] },
    },
    {
      // California has a state agency, so 300 days. A table of other states is to verify.
      id: "eeoc_charge",
      label: "Last day to file an EEOC charge (300 days: California has a state agency)",
      rule: "us.eeocCharge",
      inputs: { actDate: { fact: "lastActDate" }, deferralState: { value: true } },
      when: { all: [{ state: "CA" }, { not: { fact: "federalEmployee", is: true } }] },
    },
    {
      // The safe, earlier date for every other state until the state agency table exists.
      id: "eeoc_charge_180",
      label: "Last day to file an EEOC charge (180 days until a state agency is confirmed)",
      rule: "us.eeocCharge",
      inputs: { actDate: { fact: "lastActDate" }, deferralState: { value: false } },
      when: { all: [US, { not: { state: "CA" } }, { not: { fact: "federalEmployee", is: true } }] },
    },
    {
      id: "ca_civil_rights",
      label: "Last day to file with the California Civil Rights Department",
      rule: "us.caCivilRights",
      inputs: { actDate: { fact: "lastActDate" } },
      when: { state: "CA" },
    },
  ],

  // Part 6. Steps with no letter (E0, E4, H0) are folded into the `needs`
  // and `blockedIf` of the letter that follows them.
  route: [
    // 6.1 Employee route
    {
      // E1. Also a further grievance when something new has happened since the first one.
      id: "grievance",
      title: "Grievance letter",
      letter: "employee/grievance",
      lens: ["employee"],
      when: {
        any: [
          { fact: "grievanceStage", is: "not_raised" },
          { fact: "lastActDate", onOrAfter: { fact: "grievanceDate" } },
        ],
      },
      needs: [
        "jurisdiction",
        "employmentStatus",
        "stillEmployed",
        "complaintSummary",
        "complaintCategories",
        "lastActDate",
        "isContinuing",
        "protectedCharacteristicLink",
        "desiredOutcome",
      ],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E1a
      id: "pay_dispute",
      title: "Pay dispute letter",
      letter: "employee/pay_dispute",
      lens: ["employee"],
      when: PAY,
      needs: ["complaintSummary", "lastDeductionDate", "desiredOutcome"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E3 (new letter type, suggested)
      id: "grievance_follow_up",
      title: "Grievance follow-up",
      letter: "new:grievance_follow_up",
      lens: ["employee"],
      when: AWAITING_REPLY,
      needs: ["grievanceDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E5
      id: "appeal",
      title: "Appeal against the grievance outcome",
      letter: "employee/appeal",
      lens: ["employee"],
      when: {
        all: [
          { known: "outcomeDate" },
          { not: { fact: "satisfiedWithOutcome", is: true } },
          { not: { fact: "grievanceStage", in: ["appealed", "appeal_decided"] } },
        ],
      },
      needs: ["outcomeDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E6. Recommended now when K1 fires or the appeal ends unresolved.
      id: "acas_ec_notification",
      title: "Acas early conciliation notification",
      letter: "employee/acas_ec_notification",
      lens: ["employee"],
      when: {
        all: [
          GB,
          { not: { fact: "earlyConciliation", is: true } },
          { any: [LIMIT_WITHIN_28, { fact: "grievanceStage", is: "appeal_decided" }] },
        ],
      },
      needs: ["lastActDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E6, Northern Ireland variant (6.4): the LRA. No letter yet.
      id: "lra_ec_notification",
      title: "LRA early conciliation notification",
      letter: "new:lra_ec_notification",
      lens: ["employee"],
      when: {
        all: [
          NI,
          { not: { fact: "earlyConciliation", is: true } },
          { any: [LIMIT_WITHIN_28, { fact: "grievanceStage", is: "appeal_decided" }] },
        ],
      },
      needs: ["lastActDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E7
      id: "tribunal_cover",
      title: "Tribunal claim cover letter",
      letter: "employee/tribunal_cover",
      lens: ["employee"],
      when: { all: [GB, { known: "earlyConciliationDayB" }] },
      needs: ["earlyConciliationDayB"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // E7, Northern Ireland variant (6.4): industrial tribunal or Fair Employment Tribunal. No letter yet.
      id: "tribunal_cover_ni",
      title: "Industrial tribunal claim cover letter",
      letter: "new:tribunal_cover_ni",
      lens: ["employee"],
      when: { all: [NI, { known: "earlyConciliationDayB" }] },
      needs: ["earlyConciliationDayB"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
    {
      // R1. Grievance first where possible.
      id: "constructive_dismissal_warning",
      title: "Constructive dismissal warning",
      letter: "employee/constructive_dismissal_warning",
      lens: ["employee"],
      when: {
        all: [
          { fact: "resignationIntent", in: ["thinking_about_it", "decided"] },
          { not: { fact: "stillEmployed", is: false } },
        ],
      },
      after: ["grievance"],
      needs: ["stillEmployed", "complaintSummary"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, RESIGNATION_WARNING_UNREAD],
    },
    {
      // R2. K13 also offers it after resignation if the reasons were not set out.
      id: "resignation_with_grievance",
      title: "Resignation with grievance",
      letter: "employee/resignation_with_grievance",
      lens: ["employee"],
      when: { fact: "resignationIntent", in: ["decided", "already_resigned"] },
      needs: ["complaintSummary", "lastActDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, RESIGNATION_WARNING_UNREAD],
    },
    {
      // R3. Strong recommendation to take legal advice first.
      id: "resignation_constructive",
      title: "Resignation relying on a serious breach",
      letter: "employee/resignation_constructive",
      lens: ["employee"],
      when: { fact: "resignationIntent", is: "decided" },
      after: ["grievance"],
      needs: ["complaintSummary", "lastActDate"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, RESIGNATION_WARNING_UNREAD],
    },
    {
      // E2. Optional, any time after the grievance. Placed last among the
      // employee steps (the draft lists it third) so this optional letter is
      // only "next" when nothing else is ready. Not offered in the US (6.4).
      id: "subject_access_request",
      title: "Subject access request",
      letter: "employee/subject_access_request",
      lens: ["employee"],
      when: UK,
      after: ["grievance"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },

    // 6.2 HR team route, and 6.3 consultant route (same steps, signed by the client)
    {
      // H1, after H0 triage: interim measures set and an independent hearer chosen.
      id: "acknowledgement",
      title: "Grievance acknowledgement",
      letter: "new:grievance_acknowledgement",
      lens: ["hr", "consultant"],
      when: { not: { fact: "grievanceStage", in: PAST_ARRANGING } },
      needs: ["dateReceived", "complaintSummary", "intendedHearer", "disciplinaryInProgress"],
      blockedIf: [
        NOT_FOR_PERSON_COMPLAINED_ABOUT,
        CLIENT_SIGNER_NEEDED,
        {
          when: { all: [INTERIM_NEEDED, { not: { known: "interimMeasures" } }] },
          reason: "Record what has been done to protect the employee while this is looked at first.",
        },
      ],
    },
    {
      // H1b (new letter type, suggested): before investigation interviews.
      id: "notice_to_person_complained_about",
      title: "Notice to the person complained about",
      letter: "new:notice_to_person_complained_about",
      lens: ["hr", "consultant"],
      when: { known: "personComplainedAbout" },
      after: ["acknowledgement"],
      needs: ["personComplainedAbout"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, CLIENT_SIGNER_NEEDED],
    },
    {
      // H2: H1 sent and K9 clear.
      id: "meeting_invite",
      title: "Grievance meeting invitation",
      letter: "new:grievance_meeting_invite",
      lens: ["hr", "consultant"],
      when: { not: { fact: "grievanceStage", in: PAST_ARRANGING } },
      after: ["acknowledgement"],
      needs: ["intendedHearer", "meetingDate"],
      blockedIf: [
        NOT_FOR_PERSON_COMPLAINED_ABOUT,
        CLIENT_SIGNER_NEEDED,
        {
          when: { fact: "hearerConflict", is: true },
          reason: "Appoint someone other than the person complained about, or anyone involved, to hear it (K9).",
        },
        {
          when: { fact: "hearerPrejudged", is: true },
          reason: "The decision maker has already given a view; appoint someone else to hear it (K10).",
        },
      ],
    },
    {
      // H3: meeting held and investigation finished.
      id: "outcome",
      title: "Grievance outcome",
      letter: "new:grievance_outcome",
      lens: ["hr", "consultant"],
      when: { not: { fact: "grievanceStage", in: ["outcome_received", "appealed", "appeal_decided"] } },
      after: ["meeting_invite"],
      needs: ["complaintSummary", "intendedHearer"],
      blockedIf: [
        NOT_FOR_PERSON_COMPLAINED_ABOUT,
        CLIENT_SIGNER_NEEDED,
        {
          when: { not: { fact: "grievanceStage", is: "meeting_held" } },
          reason:
            "No outcome until the grievance meeting has been held and the investigation is finished. A reply that decides the grievance before then prejudges it.",
        },
      ],
    },
    {
      // H4: appeal received. Heard by someone not previously involved, where possible.
      id: "appeal_hearing_invite",
      title: "Appeal hearing invitation",
      letter: "new:appeal_hearing_invite",
      lens: ["hr", "consultant"],
      when: { all: [{ fact: "grievanceStage", is: "appealed" }, { not: { fact: "appealHearingHeld", is: true } }] },
      after: ["outcome"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, CLIENT_SIGNER_NEEDED],
    },
    {
      // H5: appeal hearing held.
      id: "appeal_outcome",
      title: "Appeal outcome",
      letter: "new:appeal_outcome",
      lens: ["hr", "consultant"],
      when: { fact: "grievanceStage", is: "appealed" },
      after: ["appeal_hearing_invite"],
      blockedIf: [
        NOT_FOR_PERSON_COMPLAINED_ABOUT,
        CLIENT_SIGNER_NEEDED,
        {
          when: { not: { fact: "appealHearingHeld", is: true } },
          reason: "No appeal outcome until the appeal hearing has been held.",
        },
      ],
    },
    {
      // Branch: the employee resigns during the process (K14).
      id: "resignation_acceptance",
      title: "Resignation acceptance",
      letter: "employer/resignation_acceptance",
      lens: ["hr", "consultant"],
      when: { fact: "resignationIntent", is: "already_resigned" },
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, CLIENT_SIGNER_NEEDED],
    },
    {
      // Branch: settlement discussed, kept separate (K28).
      id: "settlement_cover",
      title: "Settlement cover letter",
      letter: "employer/settlement_cover",
      lens: ["hr", "consultant"],
      when: { fact: "settlementMentioned", is: true },
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT, CLIENT_SIGNER_NEEDED],
    },
    {
      // 6.3: advice note to the client (no letter type yet; suggested).
      id: "client_advice_note",
      title: "Advice note to the client",
      letter: "new:client_advice_note",
      lens: ["consultant"],
      needs: ["complaintSummary"],
      blockedIf: [NOT_FOR_PERSON_COMPLAINED_ABOUT],
    },
  ],

  // Part 7. Playbooks that are not a SituationId yet (health, family leave,
  // whistleblowing, resignation, flexible working, settlement) go to "expert".
  handOffs: [
    {
      id: "disciplinary_person_complained_about",
      to: "disciplinary",
      when: { fact: "caseToAnswer", is: true },
      message: {
        hr: "The findings suggest misconduct by the person complained about. Issue the grievance outcome first; the disciplinary then runs as its own linked case. Pass on findings and evidence references, and no special category data beyond what is needed.",
        consultant:
          "The findings suggest misconduct by the person complained about. Your client should issue the grievance outcome first; the disciplinary then runs as its own linked case. Pass on findings and evidence references, and no special category data beyond what is needed.",
      },
    },
    {
      id: "disciplinary_complainant",
      to: "disciplinary",
      when: { fact: "disciplinaryInProgress", is: true },
      message:
        "A disciplinary is running alongside this grievance. The employer may pause it, or run both together if they are related; it is not automatic. The grievance summary and dates pass across.",
    },
    {
      id: "health",
      to: "expert",
      when: {
        any: [
          { fact: "healthImpact", is: true },
          { fact: "offSick", is: true },
          { fact: "protectedCharacteristicLink", is: "disability" },
        ],
      },
      message:
        "Health and disability playbook: the adjustments needed pass across, never a diagnosis. The grievance continues with adjustments.",
    },
    {
      id: "pregnancy_family_leave",
      to: "expert",
      when: FAMILY_LEAVE,
      message:
        "Pregnancy and family leave playbook: leave dates pass across, and the birth date only if needed. The grievance does not pause.",
    },
    {
      id: "whistleblowing",
      to: "expert",
      when: POSSIBLE_DISCLOSURE,
      message: "Whistleblowing playbook: the disclosure text and date pass across. Both run.",
    },
    {
      id: "resignation",
      to: "expert",
      when: { fact: "resignationIntent", in: ["decided", "already_resigned"] },
      message:
        "Resignation and constructive dismissal playbook: grievance status, dates and start date pass across. Resignation and notice do not pause time limits.",
    },
    {
      id: "redundancy",
      to: "redundancy",
      when: { fact: "roleChange", in: ["at_risk_of_redundancy", "removed"] },
      message:
        "Redundancy playbook, as a linked case: dates and role details pass across. Nothing pauses by default; the user chooses whether to deal with it inside consultation or appeal, or to pause the affected person's outcome until the grievance ends.",
    },
    {
      id: "flexible_working",
      to: "expert",
      when: { fact: "flexibleWorkingRefused", is: true },
      message:
        "Flexible working playbook: the request and decision dates pass across. A complaint about wider treatment stays here.",
    },
    {
      id: "settlement",
      to: "expert",
      when: { fact: "settlementMentioned", is: true },
      message: "Settlement: only the status passes across. The grievance does not pause.",
    },
    {
      // K29 and part 2: the user is the person complained about.
      id: "person_complained_about",
      to: "disciplinary",
      when: { fact: "userPosition", is: "person_complained_about" },
      message: "The user is the person complained about: disciplinary or allegation-response playbook.",
    },
  ],

  // Part 8
  tone: {
    lens: {
      employee: [
        "Calm, warm and plain. One question at a time.",
        "Acknowledge feelings briefly (\"That sounds very hard\") and move on. Offer to pause.",
        "Explain why a question is asked when it is personal.",
        "If meeting the person complained about is hard, offer alternatives such as a written statement or separate meetings rather than pressing.",
        "Never ask why they did not report sooner, what they were wearing, whether they encouraged it, or whether they are sure.",
        "Never ask for graphic detail of sexual conduct, for a diagnosis or medical records, for proof of a characteristic (such as sexual orientation or religion), or about immigration status.",
        "Never promise an outcome or say \"you have a strong case\".",
        "Never call something \"discrimination\" or \"unlawful\" as a fact.",
      ],
      hr: [
        "Neutral, procedural and fair to both sides.",
        "Say \"the person complained about\", not \"the harasser\" or \"the victim\".",
        "Prompt for interim protection and records.",
        "If the complainant finds a meeting with the person complained about hard, offer alternatives such as a written statement or separate meetings.",
        "Never suggest discouraging a complaint, treating a sexual harassment complaint as informal to avoid process, or deciding the outcome before investigating.",
      ],
      consultant: [
        "Concise and risk-focused, written as advice points for the client.",
        "Same neutrality as HR: say \"the person complained about\", not \"the harasser\" or \"the victim\".",
        "Never draft a dismissive reply that prejudges the grievance, even when the client asks for one; explain the risk instead (K10).",
      ],
    },
    privacy: [
      "Collect the minimum. Every special category question allows \"prefer not to say\".",
      "Special category answers are stored in flagged fields. A letter includes one only after the user confirms (for example \"I believe this is connected to my sexual orientation\").",
      "Employee lens: only the employee's account and anyone they share with can see the case.",
      "HR lens: the assigned case handlers see the case and the hearing manager sees what they need. The person complained about receives the allegations in enough detail to respond, but not the complainant's health details or unrelated special category data.",
      "Consultant lens: the consultant and the named client contacts.",
      "Special category answers never feed analytics or model training.",
      "Exports offer redaction of third-party names and special category data.",
    ],
  },
};
