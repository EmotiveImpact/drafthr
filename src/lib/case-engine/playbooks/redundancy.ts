import type { Condition, Playbook } from "../types";

/**
 * Redundancy (individual and collective), version 0.2, from the draft
 * playbook dated 13 October 2026 and updated with the Great Britain, Northern
 * Ireland and US region reviews (draft for legal review, not for customers).
 *
 * Source tags such as "S1" point to section 11 of the draft. Dates, periods
 * and money are never worked out here: rule uses name a rule and the facts
 * that feed it.
 *
 * Facts marked "Reader signal" below are not in part 3 of the draft. They are
 * yes-or-no signals the Reader can pull from a story so the draft's checks,
 * branches and hand-offs can be written as conditions. Most are `nice`, so
 * the interviewer never asks for them.
 *
 * Messages vary by lens only, not by nation. Where Great Britain and Northern
 * Ireland differ in level or trigger, the Northern Ireland version is its own
 * check (noAppealNI, familyLeaveNIOnLeave, underTwoYearsNI, timeOffJobSearchNI);
 * where only the wording differs, one message carries both, each labelled.
 */

// ---------------------------------------------------------------------------
// Shared conditions
// ---------------------------------------------------------------------------

const UK: Condition = { country: "uk" };
const US: Condition = { country: "us" };
const GB: Condition = { nation: ["england-wales", "scotland"] };
const NI: Condition = { nation: "northern-ireland" };
const EMPLOYER: Condition = { lens: ["hr", "consultant"] };

/** 20 or more proposed at one establishment within 90 days (GB or NI). */
const COLLECTIVE: Condition = { all: [UK, { fact: "rolesAtEstablishment", atLeast: 20 }] };
const COLLECTIVE_GB: Condition = { all: [GB, { fact: "rolesAtEstablishment", atLeast: 20 }] };
/** True unless the case is known to be collective. */
const NOT_COLLECTIVE: Condition = { not: { fact: "rolesAtEstablishment", atLeast: 20 } };

const VACANCY_EXISTS: Condition = {
  all: [{ known: "alternativeVacancies" }, { not: { fact: "alternativeVacancies", is: "none" } }],
};

const ATTENDANCE_SCORED: Condition = { fact: "selectionCriteria", is: "attendance" };
const FAMILY_LEAVE_ANY: Condition = {
  fact: "familyLeaveStatus",
  in: ["pregnant", "on_leave", "returned"],
};
const ABSENCE_MAY_BE_LINKED: Condition = {
  any: [
    { fact: "absenceInScoring", is: true },
    { fact: "healthOrDisability", is: true },
    FAMILY_LEAVE_ANY,
  ],
};

/**
 * Inside the family leave priority period in Great Britain: pregnant, on
 * leave, or back from leave while the rules code says the protected period
 * has not ended (no date yet counts as protected). The rules code applies the
 * six consecutive weeks rule for shared parental, neonatal care and bereaved
 * partner's paternity leave [S18, S72, S73].
 */
const FAMILY_PROTECTED_GB: Condition = {
  all: [
    GB,
    {
      any: [
        { fact: "familyLeaveStatus", in: ["pregnant", "on_leave"] },
        {
          all: [
            { fact: "familyLeaveStatus", is: "returned" },
            { not: { deadline: "family_leave_protection", withinDays: -1 } },
          ],
        },
      ],
    },
  ],
};
/** Northern Ireland: only while on maternity, adoption or shared parental leave [S40, S84]. */
const FAMILY_PROTECTED_NI: Condition = {
  all: [
    NI,
    { fact: "familyLeaveStatus", is: "on_leave" },
    { fact: "familyLeaveType", in: ["maternity", "adoption", "shared_parental"] },
  ],
};
const FAMILY_PROTECTED: Condition = { any: [FAMILY_PROTECTED_GB, FAMILY_PROTECTED_NI] };

/** A protected person, a vacancy that may be suitable, and no offer or recorded reason. */
const FAMILY_VACANCY_OPEN: Condition = {
  all: [
    FAMILY_PROTECTED,
    VACANCY_EXISTS,
    { not: { known: "alternativeOffer" } },
    { not: { known: "vacancyNotSuitableReason" } },
  ],
};

const TUPE_OPEN: Condition = {
  all: [
    { fact: "replacementPlanned", in: ["outside_provider", "business_sold"] },
    { not: { fact: "tupeRuledOut", is: true } },
  ],
};
const REPLACED_BY_OTHERS: Condition = {
  fact: "replacementPlanned",
  in: ["new_hire", "agency_workers", "contractor"],
};
const NOT_REALLY_REDUNDANCY: Condition = {
  any: [{ fact: "jobsContinue", is: true }, { fact: "concernIsPerformance", is: true }],
};
const CONSULTANT_WITHOUT_SIGNER: Condition = {
  all: [{ lens: "consultant" }, { not: { known: "clientDecisionMaker" } }],
};
const AT_OUTCOME: Condition = {
  any: [
    { fact: "processStage", in: ["notice_given", "ended"] },
    { all: [EMPLOYER, { known: "meetingDates" }] },
  ],
};
const NOTICE_STAGE: Condition = { fact: "processStage", in: ["notice_given", "ended"] };

const LISTED_CONCERNS = [
  "grievance",
  "whistleblowing",
  "health_and_safety",
  "discrimination_complaint",
  "flexible_working",
  "pay_complaint",
  "representative",
];

/**
 * Closest safe version of "less than 2 years' service": the Condition
 * language cannot read the rules code's detail.qualifies or compare a fact
 * with a rules-code date, so it is written as at most 728 days from start to
 * end. Two years beginning with the start day end 729 or 730 days later, so
 * this never fires for someone with 2 years, but misses the last day or two
 * before the 2-year point.
 */
const SERVICE_UNDER_TWO_YEARS: Condition = {
  any: [
    { fact: "employmentEndDate", withinDays: 728, from: { fact: "serviceStartDate" } },
    {
      all: [
        { not: { known: "employmentEndDate" } },
        { fact: "firstDismissalDate", withinDays: 728, from: { fact: "serviceStartDate" } },
      ],
    },
  ],
};
/**
 * Notice given with 2 years' service. Closest safe version, as above: fires
 * only from 730 days after the start, so never before 2 years but a day late
 * in some years; it tests service at the notice date, not at the end of notice.
 */
const NOTICE_WITH_TWO_YEARS: Condition = {
  all: [
    { known: "noticeDate" },
    { known: "serviceStartDate" },
    { fact: "noticeDate", onOrAfter: { fact: "serviceStartDate" } },
    { not: { fact: "noticeDate", withinDays: 729, from: { fact: "serviceStartDate" } } },
  ],
};

// United States. The case's state is a code ("TX"). The state rules run for
// one state: usState when it is given, or else the case's state (the rules
// code's default). usStates lists every state where affected staff work.

/** The state the state rules run for is one of these codes. */
const STATE_IS = (codes: string[]): Condition => ({
  any: [{ fact: "usState", in: codes }, { all: [{ not: { known: "usState" } }, { state: codes }] }],
});
/** Anyone affected may work in one of these states (codes and names, as usStates is free text). */
const ANYONE_IN = (codes: string[], names: string[]): Condition => ({
  any: [STATE_IS(codes), { fact: "usStates", in: [...codes, ...names] }],
});
const ANYONE_IN_STATE_WARN_STATE = ANYONE_IN(["CA", "NY", "IL"], ["California", "New York", "Illinois"]);

/** The rule use has a date. A passed date counts, as for any `deadline` test. */
const HAS_DATE = (ruleUseId: string): Condition => ({ deadline: ruleUseId, withinDays: 36500 });
/** Fewer than 100 full-time staff, and the 4,000-hour test not shown to be met. */
const WARN_TOO_SMALL: Condition = {
  all: [{ fact: "usEmployerHeadcount", below: 100 }, { not: { fact: "usEmployer4000Hours", is: true } }],
};
/**
 * Federal WARN applies, or may apply on the counts given: the rules code
 * returns no date only when the counts show it does not apply [S48, S52].
 */
const WARN_FEDERAL: Condition = { all: [US, HAS_DATE("warn_notice"), { not: WARN_TOO_SMALL }] };
/** A California, New York or Illinois layoff notice law applies, or may apply [S55, S56, S58]. */
const WARN_STATE: Condition = { all: [US, HAS_DATE("us_state_warn_notice")] };
const WARN_DUE: Condition = { any: [WARN_FEDERAL, WARN_STATE] };

/** From `from` up to, but not including, `to`. */
const BETWEEN = (fact: string, from: number, to: number): Condition => ({
  all: [
    { fact, atLeast: from },
    { fact, below: to },
  ],
});

/** First-turn must facts: "no letter without it" (part 3, levels). */
const EMPLOYER_FIRST = [
  "employmentStatus",
  "proposalReason",
  "replacementPlanned",
  "processStage",
];
const EMPLOYEE_FIRST = [
  "employmentStatus",
  "proposalReason",
  "replacementPlanned",
  "processStage",
  "employeeGoal",
];

const SIGNER_BLOCK = {
  when: CONSULTANT_WITHOUT_SIGNER,
  reason: "Name who at the client will sign letters, hold meetings and hear any appeal first.",
};
const TUPE_BLOCK = {
  when: TUPE_OPEN,
  reason: "TUPE may apply. Redundancy pauses until TUPE is ruled out.",
};
const NOT_REDUNDANCY_BLOCK = {
  when: NOT_REALLY_REDUNDANCY,
  reason:
    "This looks like a change of terms, or a concern about how someone does the job, rather than a redundancy. Use the right playbook first.",
};

// ---------------------------------------------------------------------------
// The playbook
// ---------------------------------------------------------------------------

export const redundancyPlaybook: Playbook = {
  id: "redundancy",
  name: "Redundancy (individual and collective)",
  version: "0.2",
  status: "draft",

  recognise: {
    phrases: [
      // Employer side
      "restructure",
      "headcount reduction",
      "the role is no longer needed",
      "closing the branch",
      "closing the site",
      "closing the lab",
      "lost our main contract",
      "merging two roles into one",
      "outsourcing",
      "making people redundant",
      "at risk",
      "selection pool",
      "scoring matrix",
      "voluntary redundancy",
      "HR1",
      "collective consultation",
      "RIF",
      "layoff",
      // Employee side
      "my job is at risk",
      "I've been put at risk",
      "they're scoring us",
      "my role is being deleted",
      "they're cutting the team",
      "they offered me another job but it's worse",
      "I've been made redundant",
      "redundancy pay",
      "I'm on maternity leave and they say my job is going",
      "laid off",
    ],
    notThis: [
      "The role continues, one named person goes, the reasons are about how they work, or someone is being hired into the same job: capability or disciplinary playbook, flagged as possible sham redundancy.",
      "The business or part of it is sold, or work moves to a new contractor or comes back in-house and staff may follow: TUPE playbook.",
      "The jobs stay but pay, hours, shifts or place of work change (\"sign the new contract or leave\"): contract change playbook.",
      "No work for a while and no plan to end jobs (temporary lay-off or short-time working): lay-off playbook (planned).",
      "Administration, liquidation or unpaid wages: insolvency outline (planned). Redundancy pay may come from the Redundancy Payments Service.",
      "\"Can I get a package?\" with no role reduction: settlement playbook.",
      "Stays here after one question: a fixed-term contract ending because the work is no longer needed, and voluntary redundancy.",
      "If redundancy and another situation score close together, ask: \"Is the job itself going, or is the concern about how someone does the job?\"",
    ],
  },

  // -------------------------------------------------------------------------
  // Facts (part 3)
  // -------------------------------------------------------------------------
  facts: [
    // A. Opening
    {
      key: "jurisdiction",
      label: "Where the affected employees work",
      type: "choice",
      choices: ["england-wales", "scotland", "northern-ireland", "us"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Where do the affected employees work?",
        employee: "Where do you work?",
        consultant: "Where does your client's affected team work?",
      },
      why: "Law, pay caps and time limits differ by country and US state.",
    },
    {
      key: "employmentStatus",
      label: "Employment status",
      type: "choice",
      choices: ["employee", "agency_worker", "worker", "contractor", "mixed", "not_sure"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Are the people affected employees, or are any agency staff, workers or contractors?",
        employee: "Are you employed directly, or through an agency or as a contractor?",
        consultant: "Are the people affected your client's own employees?",
      },
      why: "Redundancy pay and most redundancy rights belong to employees.",
    },
    {
      key: "proposalReason",
      label: "Business reason",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Why are these roles going? Describe the change in the business.",
        employee: "What reason were you given?",
        consultant: "What business reason does your client give?",
      },
      why: "The reason must fit the legal meaning of redundancy.",
    },
    {
      key: "replacementPlanned",
      label: "Who does the work afterwards",
      type: "choice",
      choices: [
        "no_one",
        "existing_staff",
        "new_hire",
        "agency_workers",
        "contractor",
        "outside_provider",
        "business_sold",
        "not_known",
      ],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "After the change, will anyone do this work: staff, agency workers, a contractor or another company?",
        employee: "Do you know if anyone will do your work after you go?",
        consultant: "Will anyone do this work after the change?",
      },
      why: "Spots sham redundancy, TUPE and replacement by contractors.",
    },
    {
      key: "processStage",
      label: "Stage reached",
      type: "choice",
      choices: ["planning", "announced", "consulting", "notice_given", "ended"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Where are you now: planning, announced, consulting, notice given, or employment ended?",
        employee:
          "What has happened so far: told at risk, in consultation, given notice, or already left?",
        consultant: "What stage has your client reached?",
      },
      why: "Decides the next letter and which deadlines are running.",
    },
    {
      key: "employeeGoal",
      label: "What the employee wants",
      type: "choice",
      choices: ["keep_job", "move_role", "leave_best_terms", "understand_rights"],
      priority: { employee: "must" },
      question:
        "What would you like to happen: keep your job, move to another role, leave on the best terms, or first understand your rights?",
      why: "Shapes the route and the tone of letters.",
    },
    {
      key: "clientDecisionMaker",
      label: "Client decision maker",
      type: "text",
      priority: { consultant: "must" },
      question: "Who at your client will sign letters, hold meetings and hear any appeal?",
      why: "Letters come from the employer. The appeal needs someone not involved earlier.",
    },

    // B. Numbers and timing
    {
      key: "rolesAtEstablishment",
      label: "Proposed dismissals at the site within 90 days",
      type: "number",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "How many employees could be dismissed as redundant at this site within 90 days, counting every proposal?",
        employee: "Do you know roughly how many people are affected where you work?",
        consultant:
          "How many of your client's employees at this site could be dismissed as redundant within 90 days?",
      },
      askIf: UK,
      why: "20 or more triggers collective consultation and the HR1.",
    },
    {
      key: "establishment",
      label: "Site",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Which site or workplace is this?",
        employee: "Which site do you work at?",
        consultant: "Which site is this?",
      },
      askIf: UK,
      why: "The numbers are counted per establishment.",
    },
    {
      key: "otherDismissals90Days",
      label: "Other redundancies at the site in the same 90 days",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Are any other redundancies planned at this site that could take effect in the same 90-day period? How many (0 if none)?",
        consultant:
          "Are any other redundancies planned at your client's site that could take effect in the same 90-day period? How many (0 if none)?",
      },
      askIf: { all: [UK, { fact: "rolesAtEstablishment", atLeast: 10 }] },
      why: "Separate proposals can add up to 20.",
    },
    {
      key: "firstDismissalDate",
      label: "First dismissal date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When do you want the first dismissal to take effect?",
        employee: "Have you been given a leaving date?",
        consultant: "When does your client want the first dismissal to take effect?",
      },
      why: "Drives the consultation, HR1 and notice dates.",
    },
    {
      key: "totalAtEstablishment",
      label: "Employees of the affected types at the site",
      type: "number",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "How many employees of the affected types work at the site in total?",
        consultant: "How many employees of the affected types work at your client's site in total?",
      },
      askIf: COLLECTIVE,
      why: "Must be given to representatives and on the HR1.",
    },

    // C. Collective consultation (20 or more)
    {
      key: "recognisedUnion",
      label: "Recognised union",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Do you recognise a trade union for these employees?",
        employee: "Is there a recognised union where you work?",
        consultant: "Does your client recognise a union for these employees?",
      },
      askIf: COLLECTIVE,
      why: "Decides who must be consulted.",
    },
    {
      key: "existingReps",
      label: "Existing employee representatives",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Are there existing employee representatives with authority to be consulted about redundancies?",
        employee: "Are there staff representatives?",
        consultant:
          "Does your client have existing employee representatives with authority to be consulted about redundancies?",
      },
      askIf: { all: [COLLECTIVE, { fact: "recognisedUnion", is: false }] },
      why: "If not, representatives must be elected.",
    },
    {
      key: "consultationStartDate",
      label: "Collective consultation start",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did, or will, collective consultation start?",
        employee: "Do you know when consultation with the union or representatives started?",
        consultant: "When did, or will, your client's collective consultation start?",
      },
      askIf: COLLECTIVE,
      why: "The minimum period is measured back from the first dismissal.",
    },
    {
      key: "hr1Date",
      label: "HR1 submitted",
      type: "date",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Has the HR1 been submitted? On what date? If not yet, say so and we will keep it on the list.",
        consultant: "Has your client submitted the HR1? When?",
      },
      askIf: COLLECTIVE,
      why: "It must be in time and before any notice of dismissal.",
    },
    {
      key: "agencyWorkers",
      label: "Agency workers at the site",
      type: "text",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "How many agency workers work at the site, where, and doing what? Say none if there are none.",
        consultant:
          "How many agency workers work at your client's site, where, and doing what? Say none if there are none.",
      },
      askIf: COLLECTIVE,
      why: "Must be disclosed to representatives.",
    },

    // D. Pool, criteria and alternatives
    {
      key: "poolDescription",
      label: "Selection pool",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Which roles are in the selection pool, and why those?",
        employee: "Who else is in the same position as you?",
        consultant: "Which roles are in your client's pool, and why?",
      },
      why: "The pool should include roles that are the same or similar.",
    },
    {
      key: "poolSize",
      label: "People in the pool",
      type: "number",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "How many people are in the pool?",
        employee: "How many people are in your group?",
        consultant: "How many people are in your client's pool?",
      },
      why: "Shows whether selection is needed.",
    },
    {
      key: "rolesRemaining",
      label: "Roles remaining after the change",
      type: "number",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "How many roles will remain after the change?",
        employee: "How many roles will be left?",
        consultant: "How many roles will remain at your client after the change?",
      },
      why: "Shows how many must be selected.",
    },
    {
      key: "selectionCriteria",
      label: "Selection criteria",
      type: "list",
      choices: [
        "skills",
        "performance",
        "attendance",
        "qualifications",
        "experience",
        "disciplinary_record",
        "attitude",
        "fit",
        "potential",
        "other",
      ],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What criteria will you use to choose between people?",
        employee: "Have you been told how people will be chosen? Please share anything in writing.",
        consultant: "What criteria will your client use to choose between people?",
      },
      // US cases ask usSelectionCriteria instead (part 3 G).
      askIf: { all: [UK, { fact: "rolesRemaining", atLeast: 1 }] },
      why: "Criteria must be objective, applied the same way to all, and non-discriminatory.",
    },
    {
      // Split from the draft's selectionCriteria so the criteria can be a list.
      key: "scoringMethod",
      label: "How each criterion is scored",
      type: "text",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "How will each criterion be scored, and what evidence will you use?",
        employee: "Have you been told how each criterion is scored, or seen your scores?",
        consultant: "How will your client score each criterion, and what evidence will it use?",
      },
      askIf: { known: "selectionCriteria" },
      why: "Scores must rest on evidence and be applied the same way to everyone.",
    },
    {
      key: "voluntaryRedundancy",
      label: "Volunteers sought",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Will you ask for volunteers first? On what terms?",
        employee: "Has voluntary redundancy been offered?",
        consultant: "Will your client ask for volunteers first? On what terms?",
      },
      why: "Can reduce compulsory dismissals.",
    },
    {
      key: "alternativeVacancies",
      label: "Alternative vacancies",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What vacancies exist now, or are expected, in this business or any associated employer? Say none if there are none.",
        employee: "Are there any jobs you could do, including any you have seen advertised?",
        consultant:
          "What vacancies exist now, or are expected, at your client or anywhere in its group? Say none if there are none.",
      },
      why: "Suitable alternatives must be looked for, and some people must be offered them first.",
    },

    // E. Each person (one value per case in this prototype; see the report)
    {
      key: "personName",
      label: "People in the pool",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Who is in the pool? Name and job title for each.",
        consultant: "Who is in your client's pool? Name and job title for each.",
      },
      why: "Each person gets their own letters and checks.",
    },
    {
      key: "serviceStartDate",
      label: "Continuous employment start",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did each person's continuous employment start?",
        employee: "When did you start, counting any time with an earlier employer that transferred?",
        consultant: "When did each person's continuous employment with your client start?",
      },
      why: "Service decides redundancy pay, notice and unfair dismissal rights.",
    },
    {
      key: "dateOfBirth",
      label: "Date of birth",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Each person's date of birth (used only for redundancy pay).",
        employee: "Your date of birth? We use it only to estimate redundancy pay.",
        consultant: "Each person's date of birth (used only for redundancy pay).",
      },
      askIf: UK,
      why: "Redundancy pay depends on age in each year of service.",
    },
    {
      key: "weeklyPay",
      label: "Gross weekly pay",
      type: "number",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Gross weekly pay for each person, and whether it varies (overtime, commission, shifts).",
        employee: "Your usual weekly pay before tax, and whether it varies.",
        consultant: "Gross weekly pay for each person, and whether it varies (overtime, commission, shifts).",
      },
      why: "Needed for redundancy pay and notice pay.",
    },
    {
      key: "contractNotice",
      label: "Contractual notice",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Contractual notice for each person, and whether the contract allows pay in lieu.",
        employee: "What notice does your contract give?",
        consultant: "Contractual notice for each person, and whether the contract allows pay in lieu.",
      },
      askIf: UK,
      why: "Contract notice can be longer than the statutory minimum.",
    },
    {
      key: "enhancedTerms",
      label: "Enhanced redundancy terms",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is there an enhanced redundancy policy or a past practice of paying more?",
        employee: "Has your employer paid more than statutory redundancy pay before?",
        consultant: "Does your client have an enhanced redundancy policy or a past practice of paying more?",
      },
      askIf: UK,
      why: "Enhanced terms can be contractual.",
    },
    {
      key: "familyLeaveStatus",
      label: "Pregnancy or family leave",
      type: "choice",
      choices: ["none", "pregnant", "on_leave", "returned", "prefer_not_to_say"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is anyone in the pool pregnant (and has told you), on maternity, adoption, shared parental, neonatal care or bereaved partner's paternity leave, or back from one of these in the last 18 months?",
        employee:
          "Are you pregnant, on family leave, or back from maternity, adoption, shared parental or neonatal care leave in the last 18 months? You can choose not to say.",
        consultant:
          "Is anyone in your client's pool pregnant (and has told the client), on maternity, adoption, shared parental, neonatal care or bereaved partner's paternity leave, or back from one of these in the last 18 months?",
      },
      askIf: UK,
      specialCategory: true,
      why: "These people have priority for suitable alternative vacancies. Great Britain: from when the employer is told of a pregnancy, during these leaves, and for a period after maternity or adoption leave, or after six or more consecutive weeks of shared parental, neonatal care or bereaved partner's paternity leave; ordinary paternity leave is not covered. Northern Ireland: only while on maternity, adoption or shared parental leave.",
    },
    // The draft's familyLeaveDates, split into the inputs the rules code takes.
    {
      key: "familyLeaveType",
      label: "Type of family leave",
      type: "choice",
      choices: ["maternity", "adoption", "shared_parental", "neonatal", "bereaved_partner"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Which leave is it (for a pregnancy, maternity)?",
        employee: "Which leave is it (for a pregnancy, maternity)?",
        consultant: "Which leave is it (for a pregnancy, maternity)?",
      },
      askIf: FAMILY_LEAVE_ANY,
      specialCategory: true,
      why: "The rules code works out the protected period from the type of leave and its dates.",
    },
    {
      key: "familyLeaveNotifiedDate",
      label: "Date the employer was told of the pregnancy",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When were you told of the pregnancy?",
        employee: "When did you tell your employer?",
        consultant: "When was your client told of the pregnancy?",
      },
      askIf: { fact: "familyLeaveStatus", is: "pregnant" },
      specialCategory: true,
      why: "Protection starts when the employer is told.",
    },
    {
      key: "familyLeaveStartDate",
      label: "Family leave start",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did the leave start?",
        employee: "When did your leave start?",
        consultant: "When did the leave start?",
      },
      askIf: { fact: "familyLeaveStatus", in: ["on_leave", "returned"] },
      specialCategory: true,
      why: "The rules code works out the protected period from these dates.",
    },
    {
      key: "familyLeaveEndDate",
      label: "Family leave end (actual or expected)",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did, or will, the leave end?",
        employee: "When did, or will, your leave end?",
        consultant: "When did, or will, the leave end?",
      },
      askIf: { fact: "familyLeaveStatus", in: ["on_leave", "returned"] },
      specialCategory: true,
      why: "The rules code works out the protected period from these dates.",
    },
    {
      key: "familyLeaveBirthDate",
      label: "Date of birth",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What was the date of birth (or of placement, if the leave follows an adoption)?",
        employee: "What was the birth date (or the placement date, if your leave follows an adoption)?",
        consultant: "What was the date of birth (or of placement, if the leave follows an adoption)?",
      },
      // Great Britain only: in Northern Ireland the protection ends with the leave.
      askIf: {
        all: [
          GB,
          { fact: "familyLeaveStatus", in: ["on_leave", "returned"] },
          { not: { fact: "familyLeaveType", is: "adoption" } },
        ],
      },
      specialCategory: true,
      why: "The extended protected period runs from the birth or placement.",
    },
    {
      // Split from the draft's familyLeaveDates: the rules code takes the
      // adoption placement date as its own input.
      key: "familyLeavePlacementDate",
      label: "Adoption placement date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What was the placement date (or, for an overseas adoption, the date the child entered Great Britain)?",
        employee:
          "What was the placement date (or, for an overseas adoption, the date the child entered Great Britain)?",
        consultant:
          "What was the placement date (or, for an overseas adoption, the date the child entered Great Britain)?",
      },
      askIf: {
        all: [
          GB,
          { fact: "familyLeaveStatus", in: ["on_leave", "returned"] },
          { fact: "familyLeaveType", is: "adoption" },
        ],
      },
      specialCategory: true,
      why: "The protected period after adoption leave runs from the placement.",
    },
    {
      key: "familyLeaveSixWeeks",
      label: "Six or more consecutive weeks of leave taken",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Did they take six or more consecutive weeks of this leave?",
        employee: "Did you take six weeks or more of this leave in one go?",
        consultant: "Did they take six or more consecutive weeks of this leave?",
      },
      askIf: {
        all: [GB, { fact: "familyLeaveType", in: ["shared_parental", "neonatal", "bereaved_partner"] }],
      },
      specialCategory: true,
      why: "After shared parental, neonatal care or bereaved partner's paternity leave, the protection runs on for 18 months only after six or more consecutive weeks of it.",
    },
    {
      key: "familyLeaveBirthNotified",
      label: "Birth date notified to the employer",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Has the birth date been notified to you?",
        employee: "Have you told your employer the date of birth?",
        consultant: "Has the birth date been notified to your client?",
      },
      askIf: { all: [{ known: "familyLeaveBirthDate" }, { fact: "familyLeaveType", is: "maternity" }] },
      specialCategory: true,
      why: "If the birth date was not notified, the period runs from the expected week of childbirth instead.",
    },
    {
      key: "familyLeaveExpectedWeek",
      label: "Expected week of childbirth (start)",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When does, or did, the expected week of childbirth start?",
        employee: "When does, or did, your expected week of childbirth start?",
        consultant: "When does, or did, the expected week of childbirth start?",
      },
      askIf: {
        any: [
          { fact: "familyLeaveStatus", is: "pregnant" },
          { fact: "familyLeaveBirthNotified", is: false },
        ],
      },
      specialCategory: true,
      why: "Used for the protected period when there is no notified birth date.",
    },
    {
      key: "healthOrDisability",
      label: "Disability or health-related absence",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is anyone in the pool disabled, or had long or repeated absence linked to a health condition?",
        employee:
          "Do you have a health condition or disability you would like taken into account? You can skip this.",
        consultant:
          "Is anyone in your client's pool disabled, or had long or repeated absence linked to a health condition?",
      },
      specialCategory: true,
      why: "The process and scoring may need adjustments.",
    },
    {
      key: "absenceInScoring",
      label: "Scored absence linked to disability, pregnancy or maternity",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Does any attendance score count absence linked to disability, pregnancy or maternity?",
        employee: "Is any of the absence being counted linked to a health condition, pregnancy or maternity?",
        consultant:
          "Does any attendance score at your client count absence linked to disability, pregnancy or maternity?",
      },
      askIf: ATTENDANCE_SCORED,
      specialCategory: true,
      why: "Counting that absence risks discrimination.",
    },
    {
      key: "recentConcernsRaised",
      label: "Concerns raised or representative roles in the last 12 months",
      type: "list",
      choices: [
        "none",
        "grievance",
        "whistleblowing",
        "health_and_safety",
        "discrimination_complaint",
        "flexible_working",
        "pay_complaint",
        "representative",
      ],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "In the last 12 months, has anyone in the pool raised a grievance, a whistleblowing concern, a health and safety concern, a discrimination complaint or a flexible working or pay complaint, or acted as a union or employee representative? When?",
        employee:
          "In the last year, have you raised any complaints or concerns at work, or been a union or staff representative? When?",
        consultant:
          "In the last 12 months, has anyone in your client's pool raised a grievance, a whistleblowing concern, a health and safety concern, a discrimination complaint or a flexible working or pay complaint, or acted as a union or employee representative? When?",
      },
      why: "Selecting someone for some of these reasons is automatically unfair or victimisation.",
    },
    {
      // Reader signal from the draft's T4 and the protectedReasonSelection check.
      key: "grievanceAllegedDiscrimination",
      label: "Grievance alleged discrimination",
      type: "boolean",
      priority: { hr: "should", employee: "must", consultant: "should" },
      question: {
        hr: "Did that grievance say the person was treated badly because of a protected characteristic, such as disability, sex, race or age?",
        employee:
          "Did your grievance say you were treated badly because of something like a health condition, your sex, race or age?",
        consultant:
          "Did that grievance say the person was treated badly because of a protected characteristic, such as disability, sex, race or age?",
      },
      askIf: { fact: "recentConcernsRaised", is: "grievance" },
      why: "A grievance that alleged discrimination may also be a protected act.",
    },
    {
      key: "partTimeOrFixedTerm",
      label: "Part-time or fixed-term",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is anyone part-time or on a fixed-term contract?",
        employee: "Are you part-time or on a fixed-term contract?",
        consultant: "Is anyone in your client's pool part-time or on a fixed-term contract?",
      },
      askIf: UK,
      why: "Selecting someone for that reason is unlawful unless objectively justified.",
    },

    // F. Process and outcome
    {
      key: "atRiskDate",
      label: "Told at risk",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When was, or will, each person be told they are at risk?",
        employee: "When were you told you were at risk? Did you get a letter?",
        consultant: "When was, or will, each person be told they are at risk?",
      },
      askIf: UK,
      why: "Starts the individual process and the record.",
    },
    {
      key: "meetingDates",
      label: "Consultation meeting dates",
      type: "list",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When were consultation meetings held, and is there a note of each?",
        employee: "When are, or were, your meetings?",
        consultant: "When were your client's consultation meetings held, and is there a note of each?",
      },
      askIf: UK,
      why: "The outcome letter must reflect real consultation.",
    },
    {
      // Added: a single date so reminders and invites can use it.
      key: "nextMeetingDate",
      label: "Next consultation meeting",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "When is the next consultation meeting?",
        employee: "When is your next meeting?",
        consultant: "When is your client's next consultation meeting?",
      },
      askIf: UK,
      why: "Used for the meeting invite and for reminders.",
    },
    {
      key: "employeeSuggestions",
      label: "Employee suggestions and responses",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "What did the employee suggest, and how did you respond?",
        employee: "What ideas have you raised to avoid your redundancy?",
        consultant: "What did the employee suggest, and how did your client respond?",
      },
      askIf: UK,
      why: "The record should show suggestions were considered.",
    },
    {
      key: "alternativeOffer",
      label: "Alternative role offered",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What role, pay, place, hours and start date are you offering?",
        employee: "What role were you offered, and how is it different from your job?",
        consultant: "What role, pay, place, hours and start date is your client offering?",
      },
      askIf: {
        any: [
          { all: [EMPLOYER, VACANCY_EXISTS] },
          { all: [{ lens: "employee" }, { known: "offerResponse" }] },
        ],
      },
      why: "Decides suitability, the trial period and redundancy pay.",
    },
    {
      // Added: the draft says "when an offer is accepted" but has no fact for it.
      key: "offerResponse",
      label: "Response to the offer",
      type: "choice",
      choices: ["accepted", "declined", "undecided"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has the offer been accepted, turned down, or not decided yet?",
        employee: "Have you accepted the offer, turned it down, or not decided yet?",
        consultant: "Has the offer been accepted, turned down, or not decided yet?",
      },
      askIf: { known: "alternativeOffer" },
      why: "Acceptance starts the trial period; refusal raises the question of redundancy pay.",
    },
    {
      key: "trialStartDate",
      label: "Start in the new role",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When will the employee start work in the new role?",
        employee: "When did, or will, you start the new role?",
        consultant: "When will the employee start work in the new role?",
      },
      askIf: { all: [UK, { fact: "offerResponse", is: "accepted" }] },
      why: "The trial period runs from here.",
    },
    {
      key: "retrainingAgreed",
      label: "Longer trial agreed for retraining",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Have you agreed in writing a longer trial for retraining, with an end date?",
        employee: "Have you agreed a longer trial for training?",
        consultant: "Has your client agreed in writing a longer trial for retraining, with an end date?",
      },
      askIf: { all: [UK, { fact: "offerResponse", is: "accepted" }] },
      why: "A longer trial must be agreed in writing before the new job starts.",
    },
    {
      key: "retrainingEndDate",
      label: "Agreed end of the retraining trial",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: "What end date was agreed in writing for the retraining trial?",
      askIf: { fact: "retrainingAgreed", is: true },
      why: "The rules code uses it for the end of the trial.",
    },
    {
      key: "noticeDate",
      label: "Notice of dismissal given",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When will notice of dismissal be given?",
        employee: "When were you given notice?",
        consultant: "When will your client give notice of dismissal?",
      },
      askIf: AT_OUTCOME,
      why: "Starts notice and the right to time off to look for work.",
    },
    {
      key: "employmentEndDate",
      label: "Employment end date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When will employment end? Will you pay in lieu of notice?",
        employee: "What is your last day of employment? Are you being paid in lieu of notice?",
        consultant: "When will employment end? Will your client pay in lieu of notice?",
      },
      askIf: AT_OUTCOME,
      why: "Starts the tribunal and redundancy pay time limits.",
    },
    {
      // Added: the noAppeal checks need to know whether an appeal is offered.
      key: "appealOffered",
      label: "Right of appeal offered",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Will you offer a right of appeal against the outcome, heard by someone not involved earlier?",
        consultant:
          "Will your client offer a right of appeal against the outcome, heard by someone not involved earlier?",
      },
      askIf: UK,
      why: "An appeal is good practice in Great Britain and required in Northern Ireland for most dismissals.",
    },
    {
      key: "appealReceived",
      label: "Appeal received",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did the appeal arrive, and who will hear it?",
        employee: "Have you appealed? When?",
        consultant: "When did the appeal arrive, and who at your client will hear it?",
      },
      askIf: { drafted: "appeal" },
      why: "Unlocks the appeal letters.",
    },
    {
      key: "settlementOffered",
      label: "Settlement agreement",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Are you thinking of offering a settlement agreement?",
        employee: "Have you been offered a settlement agreement or a package?",
        consultant: "Is your client thinking of offering a settlement agreement?",
      },
      why: "Hands off to the settlement playbook.",
    },
    {
      key: "insolvency",
      label: "Insolvency",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: {
        hr: "Is the business insolvent, or close to it?",
        employee: "Is your employer in administration or liquidation?",
        consultant: "Is your client insolvent, or close to it?",
      },
      why: "Redundancy pay may then come from the state scheme.",
    },

    // Reader signals (not in part 3; see the header comment)
    {
      key: "outcomeDecided",
      label: "Outcome already decided",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question:
        "Has the decision, or who will go, already been settled or announced as final before consultation?",
      why: "Reader signal for the predetermined check: consultation must be genuine.",
    },
    {
      key: "poolLimitedToOneTeam",
      label: "Pool limited to one team or shift",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Is the pool limited to one team, shift or site while similar roles exist elsewhere?",
      why: "Reader signal for the poolOfOne check.",
    },
    {
      key: "jobsContinue",
      label: "Jobs stay, terms change",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Will the jobs themselves continue, with only pay, hours, shifts or place of work changing?",
      why: "Reader signal for the termsOnly check and the contract change hand-off.",
    },
    {
      key: "concernIsPerformance",
      label: "Real concern is how someone does the job",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Is the job itself going, or is the concern about how someone does the job?",
      why: "Reader signal for the capability or disciplinary hand-off (possible sham redundancy).",
    },
    {
      key: "tupeRuledOut",
      label: "TUPE ruled out",
      type: "boolean",
      priority: { hr: "should", employee: "nice", consultant: "should" },
      question: {
        hr: "Has TUPE been ruled out, for example by a lawyer or adviser?",
        employee: "Has your employer said whether TUPE applies?",
        consultant: "Has TUPE been ruled out for your client, for example by a lawyer?",
      },
      askIf: { fact: "replacementPlanned", in: ["outside_provider", "business_sold"] },
      why: "Redundancy pauses until TUPE is ruled out.",
    },
    {
      key: "vacancyNotSuitableReason",
      label: "Why the vacancy is not suitable for a protected person",
      type: "text",
      priority: { hr: "nice", consultant: "nice" },
      question:
        "If the vacancy is not offered to the person with family leave priority, why is it not suitable and appropriate for them?",
      why: "Clears the familyLeaveVacancyMissed block when recorded.",
    },
    {
      key: "processGrievance",
      label: "Grievance about selection or process",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: {
        hr: "Has anyone raised a grievance about the selection or the process?",
        employee: "Do you want to complain formally about the selection or the process?",
        consultant: "Has anyone raised a grievance about your client's selection or process?",
      },
      why: "Reader signal for the grievance letter and hand-off.",
    },
    {
      key: "nextStepsWanted",
      label: "What the employee wants to do next",
      type: "list",
      choices: ["see_scores_or_notes", "bring_a_claim"],
      priority: { employee: "nice" },
      question: "Would you like to see your scores or meeting notes, or are you thinking of bringing a claim?",
      why: "Reader signal for the subject access request and Acas early conciliation steps.",
    },
    {
      key: "redundancyPayUnpaid",
      label: "Statutory redundancy pay unpaid",
      type: "boolean",
      priority: { employee: "nice" },
      question: "Has your employer failed to pay statutory redundancy pay?",
      why: "A written claim within six months protects the right.",
    },
    {
      // Added: Day A for the early conciliation rule.
      key: "acasNotifiedDate",
      label: "Acas (or LRA) notified for early conciliation",
      type: "date",
      priority: { hr: "nice", employee: "should", consultant: "nice" },
      question: {
        hr: "When was Acas (or the LRA in Northern Ireland) notified for early conciliation?",
        employee: "When did you notify Acas (or the LRA in Northern Ireland) for early conciliation?",
        consultant: "When was Acas (or the LRA in Northern Ireland) notified for early conciliation?",
      },
      askIf: { drafted: "acas_ec" },
      why: "Early conciliation can extend the tribunal time limit.",
    },
    {
      key: "acasCertificateDate",
      label: "Early conciliation certificate received",
      type: "date",
      priority: { hr: "nice", employee: "should", consultant: "nice" },
      question: {
        hr: "When was the early conciliation certificate received?",
        employee: "When did you receive the early conciliation certificate?",
        consultant: "When was the early conciliation certificate received?",
      },
      askIf: { known: "acasNotifiedDate" },
      why: "Unlocks the tribunal cover letter and fixes the extended time limit.",
    },
    {
      key: "actComplainedOfDate",
      label: "Date of the act complained of",
      type: "date",
      priority: { employee: "nice" },
      question: "If you think you were treated unfairly because of a protected characteristic, when did it happen?",
      why: "The discrimination time limit runs from the act complained of.",
    },
    {
      key: "tribunalClaimStarted",
      label: "Tribunal claim started",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Has a tribunal claim been started?",
      why: "Hands off to the tribunal playbook.",
    },

    // G. United States (part 3 G, from the US review)
    {
      key: "usStates",
      label: "US states of affected employees",
      type: "list",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "In which state does each affected employee work? For remote staff, which state do they work from?",
        employee: "Which state do you work in, or work from if you are remote?",
        consultant:
          "In which state does each of your client's affected employees work? For remote staff, which state do they work from?",
      },
      askIf: US,
      why: "Sets the state layoff notice law, final pay, separation notices and state agency. DraftHR covers California, New York, Texas, Florida and Illinois; other states get the federal baseline only.",
    },
    {
      // Added: the state rules run for one state (the rules agent's report).
      // Without an answer they use the case's own state.
      key: "usState",
      label: "State the state-law dates follow",
      type: "choice",
      choices: ["CA", "NY", "TX", "FL", "IL", "other"],
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Which one state should the state-law dates in this case follow (layoff notice, final pay, separation notices)? Use the state where the affected employees work; if they work in several, choose one and run another case for each of the others.",
        consultant:
          "Which one state should the state-law dates in this case follow (layoff notice, final pay, separation notices)? Use the state where your client's affected employees work; if they work in several, choose one and run another case for each of the others.",
      },
      askIf: US,
      why: "State rules run for one state at a time. Without an answer, the case's own state is used.",
    },
    {
      key: "usPublicEmployer",
      label: "Government employer",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is the employer a federal, state or local government body?",
        employee: "Do you work for a government body?",
        consultant: "Is your client a federal, state or local government body?",
      },
      askIf: US,
      why: "Government employers follow different rules and are out of scope for now.",
    },
    {
      key: "usEmployerHeadcount",
      label: "US employer headcount, not counting part-time staff",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "How many employees does the employer have in the US, not counting part-time staff? Part-time means working on average under 20 hours a week, or employed for under 6 of the last 12 months.",
        consultant:
          "How many employees does your client have in the US, not counting part-time staff? Part-time means working on average under 20 hours a week, or employed for under 6 of the last 12 months.",
      },
      askIf: US,
      why: "Federal WARN covers employers with 100 or more employees not counting part-time staff, or 100 or more working 4,000 hours a week in total.",
    },
    {
      key: "usEmployerPartTime",
      label: "US employer part-time headcount",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "How many part-time employees does the employer have in the US?",
        consultant: "How many part-time employees does your client have in the US?",
      },
      askIf: US,
      why: "Part-time staff are counted separately for WARN, but still get notice.",
    },
    {
      // Split from the draft's usEmployerHeadcount, which asks three things.
      // Only asked when the full-time count alone does not settle coverage.
      key: "usEmployer4000Hours",
      label: "100 or more employees working 4,000 hours a week",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Counting part-time staff, do you have 100 or more employees who together work at least 4,000 hours a week, not counting overtime?",
        consultant:
          "Counting part-time staff, does your client have 100 or more employees who together work at least 4,000 hours a week, not counting overtime?",
      },
      askIf: { all: [US, { fact: "usEmployerHeadcount", below: 100 }] },
      why: "An employer with fewer than 100 full-time employees is still covered by WARN if this test is met.",
    },
    {
      key: "usStateHeadcount",
      label: "Employees in California, New York or Illinois",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "How many employees do you have in that state? New York and Illinois: full-time staff only. California: full and part-time staff at the establishment with 6 of the last 12 months' service.",
        consultant:
          "How many employees does your client have in that state? New York and Illinois: full-time staff only. California: full and part-time staff at the establishment with 6 of the last 12 months' service.",
      },
      askIf: { all: [US, ANYONE_IN_STATE_WARN_STATE] },
      why: "State laws start lower than federal WARN: New York 50, California 75 (part-time included), Illinois 75.",
    },
    {
      // Split from the draft's usSiteHeadcount, which asks for the address and
      // the headcount together.
      key: "usSiteAddress",
      label: "Address of each affected site",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "For each site with affected employees: the address, city and county.",
        consultant: "For each of your client's sites with affected employees: the address, city and county.",
      },
      askIf: US,
      why: "The city and county decide which local official gets the WARN notice.",
    },
    {
      key: "usSiteHeadcount",
      label: "Full-time headcount at the site",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "For each site with affected employees, how many full-time employees work there? Leave out part-time staff, but include anyone on temporary layoff or leave who expects to be recalled.",
        consultant:
          "For each of your client's sites with affected employees, how many full-time employees work there? Leave out part-time staff, but include anyone on temporary layoff or leave who expects to be recalled.",
      },
      askIf: US,
      why: "The plant closing and mass layoff tests apply site by site.",
    },
    {
      // Added: the draft folds this into usRemoteAssignedSite's condition.
      key: "usRemoteStaff",
      label: "Affected employees who work remotely",
      type: "boolean",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "Do any affected employees work remotely?",
        employee: "Do you work remotely?",
        consultant: "Do any of your client's affected employees work remotely?",
      },
      askIf: US,
      why: "Which site a remote employee counts at is not settled, and it can change the WARN result.",
    },
    {
      key: "usRemoteAssignedSite",
      label: "Site each remote employee is assigned to",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "For each remote employee: which site do they report to, or which site assigns their work?",
        consultant: "For each of your client's remote employees: which site do they report to, or which site assigns their work?",
      },
      askIf: { all: [US, { fact: "usRemoteStaff", is: true }] },
      why: "Decides which site's numbers they count in; the law on this is not settled.",
    },
    {
      key: "usLossesIn30Days",
      label: "Job losses at the site within 30 days",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "At each site, how many people will lose their jobs, be laid off for more than 6 months, or have their hours cut by more than half in each month of a 6-month period, within 30 days of the first separation?",
        consultant:
          "At each of your client's sites, how many people will lose their jobs, be laid off for more than 6 months, or have their hours cut by more than half in each month of a 6-month period, within 30 days of the first separation?",
      },
      askIf: US,
      why: "Plant closing and mass layoff tests count losses in 30 days.",
    },
    {
      key: "usLossesIn90Days",
      label: "Job losses at the site within 90 days",
      type: "number",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "And how many at each site within 90 days before or after the first separation, counting later groups?",
        consultant:
          "And how many at each of your client's sites within 90 days before or after the first separation, counting later groups?",
      },
      askIf: US,
      why: "Groups within 90 days can be added together.",
    },
    {
      key: "usSeparationDates",
      label: "Separation dates for each group",
      type: "list",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "What is the first separation date, and the date (or the first day of the 14-day window) for each later group?",
        consultant:
          "What is your client's first separation date, and the date (or the first day of the 14-day window) for each later group?",
      },
      askIf: US,
      why: "Every notice deadline runs from these dates, and each later group needs its own 60 days.",
    },
    {
      key: "usTransferOffers",
      label: "Transfers to another site",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Will anyone be offered a job at another site? Is it within commuting distance? Say none if not.",
        employee: "Have you been offered a job at another site?",
        consultant: "Will your client offer anyone a job at another site? Is it within commuting distance? Say none if not.",
      },
      askIf: US,
      why: "Some transfer offers mean there is no employment loss.",
    },
    {
      key: "usUnion",
      label: "Union (US)",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Are any affected employees covered by a union agreement?",
        employee: "Are you covered by a union agreement?",
        consultant: "Are any of your client's affected employees covered by a union agreement?",
      },
      askIf: US,
      why: "Notice goes to the union, not to each employee. The agreement may set seniority and recall rules.",
    },
    {
      key: "usUnionOfficer",
      label: "Union's chief elected officer",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: "What are the name and address of the union's chief elected officer?",
      askIf: { all: [US, { fact: "usUnion", is: true }] },
      why: "The WARN notice is served on the chief elected officer.",
    },
    {
      // A yes-or-no version of the draft's text and date: the check needs to
      // know only whether an exception is claimed.
      key: "usWarnExceptionClaimed",
      label: "WARN exception claimed",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Are you relying on a WARN exception because the reason was sudden or unforeseen (for example a lost client, lost funding or a natural disaster)?",
        consultant:
          "Is your client relying on a WARN exception because the reason was sudden or unforeseen (for example a lost client, lost funding or a natural disaster)?",
      },
      askIf: { all: [US, WARN_DUE] },
      why: "An exception may shorten notice. Counsel must confirm it.",
    },
    {
      key: "usSelectionCriteria",
      label: "How people were chosen (US)",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "How were people chosen? List the criteria, the data used and who applied them.",
        employee: "Do you know how people were chosen?",
        consultant: "How did your client choose people? List the criteria, the data used and who applied them.",
      },
      askIf: US,
      why: "Selection must not be because of age or another protected characteristic, or a complaint.",
    },
    {
      key: "usReleaseOffered",
      label: "Severance depends on a release",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Will severance be paid only if the employee signs a release of claims? What is offered?",
        employee: "Have you been offered severance if you sign something?",
        consultant: "Will your client pay severance only if the employee signs a release of claims? What is offered?",
      },
      askIf: US,
      why: "OWBPA and state release rules apply.",
    },
    {
      // Added: the us.owbpa rule takes "group programme" as an input.
      key: "usGroupProgramme",
      label: "Release offered to a group",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Is the release offered to two or more employees as part of the layoff?",
      askIf: { all: [US, { fact: "usReleaseOffered", is: true }] },
      why: "A group programme has 45 days to consider and needs written information.",
    },
    {
      // Added: the usOwbpa check applies only when people aged 40 or over are affected.
      key: "usOver40Affected",
      label: "People aged 40 or over affected",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Is anyone aged 40 or over among the people affected?",
      askIf: { all: [US, { fact: "usReleaseOffered", is: true }] },
      why: "OWBPA protects workers aged 40 or over.",
    },
    {
      key: "usAgesInUnit",
      label: "Job titles and ages in the decisional unit",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question:
        "For the part of the organisation from which people were chosen: the job title and age of everyone selected and everyone not selected.",
      askIf: {
        all: [US, { fact: "usReleaseOffered", is: true }, { fact: "usGroupProgramme", is: true }],
      },
      why: "OWBPA written information for a group programme; also used for the age impact check. Kept without names.",
    },
    {
      // Added: input to the us.owbpa rule.
      key: "usReleaseGivenDate",
      label: "Date the release was given",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "When were the agreement and any written information given, or when will they be?",
        employee: "When were you given the agreement?",
        consultant: "When were your client's agreement and any written information given, or when will they be?",
      },
      askIf: { all: [US, { fact: "usReleaseOffered", is: true }] },
      why: "The consideration period runs from this day.",
    },
    {
      key: "usReleaseSignedDate",
      label: "Date the release was signed",
      type: "date",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "When was the release signed?",
      askIf: { all: [US, { fact: "usReleaseOffered", is: true }] },
      why: "The revocation period runs from signing.",
    },
    {
      key: "usSeveranceAlreadyPromised",
      label: "Severance already promised in writing",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is severance promised in a written policy, handbook or contract? Please upload it, or say none.",
        employee: "Does your handbook or contract mention severance?",
        consultant: "Is severance promised in your client's written policy, handbook or contracts? Please upload it, or say none.",
      },
      askIf: { all: [US, { fact: "usReleaseOffered", is: true }] },
      why: "A release needs something beyond what is already owed. Texas enforces written severance promises.",
    },
    {
      key: "usNextPayday",
      label: "Next regular payday after separation",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When is the first regular payday after the separation date?",
        employee: "When is your next payday after your last day?",
        consultant: "When is your client's first regular payday after the separation date?",
      },
      askIf: US,
      why: "Final pay deadlines differ by state, and some run to the next regular payday.",
    },
    {
      key: "usIncentives",
      label: "State or local economic development incentives",
      type: "boolean",
      priority: { hr: "nice", consultant: "nice" },
      question: "Does the employer receive state or local economic development incentives?",
      askIf: US,
      why: "Illinois: a copy of the notice goes to the Governor and others. New York: incentive terms may require more notice.",
    },
    {
      // Added for the usPostponement check: the history cannot yet compare an
      // old and a new date.
      key: "usSeparationMoved",
      label: "A notified separation date has moved later",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Has any separation date given in a WARN notice moved later?",
      askIf: { all: [US, { any: [{ drafted: "us_warn_union" }, { drafted: "us_warn_notices" }] }] },
      why: "A later date needs additional notice, or a new notice if it moves by 60 days or more.",
    },
    {
      // Added: unlocks the US final pay claim, once the final pay date has passed.
      key: "usFinalPayLate",
      label: "Final pay late",
      type: "boolean",
      priority: { employee: "should" },
      question: "Is any of your final pay still unpaid?",
      askIf: { all: [US, { deadline: "us_final_pay", withinDays: -1 }] },
      why: "Late final pay can be claimed in writing, and through the state's wage claim process.",
    },
  ],

  // -------------------------------------------------------------------------
  // Checks (part 4)
  // -------------------------------------------------------------------------
  checks: [
    {
      id: "collective20",
      level: "act_now",
      when: COLLECTIVE_GB,
      message:
        "20 or more redundancies are proposed at one site within 90 days. Collective consultation with the union or employee representatives must start in good time and at least 30 days before the first dismissal takes effect (45 days for 100 or more). The HR1 must reach the Redundancy Payments Service at least 30 or 45 days before the first dismissal and before any individual notice, with a copy to the representatives.",
      sources: ["S1", "S3", "S26", "S27"],
    },
    {
      id: "collectiveNI",
      level: "act_now",
      when: { all: [NI, { fact: "rolesAtEstablishment", atLeast: 20 }] },
      message:
        "20 or more redundancies are proposed at one site within 90 days in Northern Ireland. Minimum consultation periods are 30 days, or 90 days for 100 or more (ERNIO art. 216). Notify the Department for the Economy in writing, using the HR1 online form run by NISRA, before any notice of dismissal is given and at least 30 or 90 days before the first dismissal takes effect. Copy it to the representatives (ERNIO art. 221). Failing to notify is an offence (art. 222).",
      sources: ["S35", "S82", "S86", "S43"],
    },
    {
      id: "noRepresentatives",
      level: "act_now",
      when: {
        all: [COLLECTIVE, { fact: "recognisedUnion", is: false }, { not: { fact: "existingReps", is: true } }],
      },
      message: {
        hr: "There is no recognised union and no confirmed employee representatives. Representatives must be elected. If staff do not elect them within a reasonable time, the s.188(4) information goes to each affected employee.",
        employee:
          "There is no recognised union and no confirmed staff representatives. Your employer must arrange for representatives to be elected, or give the consultation information to each affected employee if none are elected.",
        consultant:
          "Your client has no recognised union and no confirmed employee representatives. Representatives must be elected. If staff do not elect them within a reasonable time, the s.188(4) information goes to each affected employee.",
      },
      sources: ["S1"],
    },
    {
      id: "noticesBeforeHR1",
      level: "act_now",
      when: {
        all: [
          COLLECTIVE,
          { known: "noticeDate" },
          {
            any: [
              { not: { known: "hr1Date" } },
              { fact: "noticeDate", before: { fact: "hr1Date" } },
              { not: { known: "consultationStartDate" } },
              { fact: "noticeDate", before: { fact: "consultationStartDate" } },
            ],
          },
        ],
      },
      message:
        "Notices of dismissal are planned before the HR1 or before collective consultation. The HR1 must come before any notice of dismissal (Northern Ireland: ERNIO art. 221). Notices given while consultation is still open also carry risk; whether notices may be given before collective consultation ends is still to be confirmed.",
      sources: ["S3", "S26", "S82"],
      toVerify: true,
    },
    {
      // Closest safe version: the rules-code date cannot be compared with a
      // fact date, so this fires only when a rules-code deadline has passed
      // without the step being recorded.
      id: "dateTooSoon",
      level: "act_now",
      when: {
        all: [
          COLLECTIVE,
          {
            any: [
              {
                all: [
                  { not: { known: "consultationStartDate" } },
                  { deadline: "collective_consultation_start", withinDays: 0 },
                ],
              },
              {
                all: [
                  { deadline: "collective_consultation_start", withinDays: -1 },
                  { fact: "consultationStartDate", onOrAfter: { today: true } },
                ],
              },
              {
                all: [{ not: { known: "hr1Date" } }, { deadline: "hr1_deadline", withinDays: 0 }],
              },
            ],
          },
        ],
      },
      message:
        "The first dismissal date is earlier than the rules allow. Move the date. Special circumstances are a narrow defence, and the employer must still do all it reasonably can; record them in writing.",
      sources: ["S1"],
    },
    {
      id: "protectiveAwardRisk",
      level: "for_information",
      when: {
        all: [
          COLLECTIVE,
          {
            any: [
              { not: { known: "consultationStartDate" } },
              { fact: "noticeDate", before: { fact: "consultationStartDate" } },
              { fact: "consultationStartDate", onOrAfter: { fact: "firstDismissalDate" } },
            ],
          },
        ],
      },
      message:
        "If collective consultation is late, short or missing, a tribunal may award pay for each affected employee. Great Britain: up to 180 days' pay for dismissals taking effect on or after 6 April 2026, and each dismissal's own date decides which maximum applies (SI 2026/323 reg 5). Northern Ireland: up to 90 days' pay.",
      sources: ["S2", "S22", "S29", "S36"],
    },
    {
      id: "nearThreshold",
      level: "worth_checking",
      when: {
        all: [
          GB,
          {
            any: [
              {
                all: [
                  { fact: "rolesAtEstablishment", atLeast: 10 },
                  { fact: "rolesAtEstablishment", below: 20 },
                ],
              },
              { fact: "otherDismissals90Days", atLeast: 1 },
            ],
          },
        ],
      },
      message:
        "Check whether separate proposals fall in one 90-day period and together reach 20. The Employment Rights Act 2025 adds a second, employer-wide threshold to be set by regulations; it is not yet set, and it cannot be below 20 (TULRCA s.195A(3)).",
      sources: ["S5", "S24"],
    },
    {
      // "Agency workers on site" is unknown until asked, so this fires unless
      // the user has said there are none.
      id: "agencyDisclosure",
      level: "for_information",
      when: { all: [COLLECTIVE, { not: { fact: "agencyWorkers", is: "none" } }] },
      message:
        "If there are agency workers at the site, disclose their numbers, where they work and the work they do to the representatives (Great Britain: TULRCA s.188(4); Northern Ireland: ERNIO art. 216(6)).",
      sources: ["S1", "S35"],
    },
    {
      id: "poolOfOne",
      level: "worth_checking",
      when: {
        all: [UK, { any: [{ fact: "poolSize", is: 1 }, { fact: "poolLimitedToOneTeam", is: true }] }],
      },
      message: {
        hr: "The pool is one person, or limited to one team or shift. Record why similar roles elsewhere are outside the pool. Acas says to include all roles that are the same or similar.",
        employee:
          "The pool is just you, or limited to one team or shift. You can ask why people doing the same or similar work elsewhere are not in the pool.",
        consultant:
          "Your client's pool is one person, or limited to one team or shift. Record why similar roles elsewhere are outside the pool. Acas says to include all roles that are the same or similar.",
      },
      sources: ["S30"],
    },
    {
      id: "subjectiveCriteria",
      level: "worth_checking",
      when: { all: [UK, { fact: "selectionCriteria", in: ["attitude", "fit", "potential"] }] },
      message: {
        hr: "A criterion such as attitude, fit or potential has no clear measure. Make every criterion objective and measurable, with evidence.",
        employee:
          "Scoring on something like attitude, fit or potential is hard to measure fairly. You can ask how it is measured and what evidence is used.",
        consultant:
          "A criterion such as attitude, fit or potential has no clear measure. Your client should make every criterion objective and measurable, with evidence.",
      },
      sources: ["S30"],
    },
    {
      id: "absenceDisability",
      level: "act_now",
      when: { all: [UK, ATTENDANCE_SCORED, ABSENCE_MAY_BE_LINKED] },
      message: {
        hr: "Attendance is scored and some absence may be linked to disability, pregnancy or maternity. Remove that absence from scoring. Great Britain: counting it risks discrimination arising from disability, and the employer has a defence only if it did not know, and could not reasonably have known, of the disability, so ask early. Northern Ireland: removing or discounting the absence is the reasonable adjustment to consider (Disability Discrimination Act 1995 s4A), and less favourable treatment for a reason related to the disability needs justification (s3A(1), (3)). Where it is unclear whether the absence is linked to a disability, take advice. The disability playbook runs alongside.",
        employee:
          "Attendance is being scored and some of your absence may be linked to a health condition. You can ask for absence linked to a disability, pregnancy or maternity to be left out of your score.",
        consultant:
          "Attendance is scored and some absence may be linked to disability, pregnancy or maternity. Your client should remove that absence from scoring. Great Britain: counting it risks discrimination arising from disability, and the employer has a defence only if it did not know, and could not reasonably have known, of the disability, so ask early. Northern Ireland: removing or discounting the absence is the reasonable adjustment to consider (Disability Discrimination Act 1995 s4A), and less favourable treatment for a reason related to the disability needs justification (s3A(1), (3)). Where it is unclear whether the absence is linked to a disability, take advice. The disability playbook runs alongside.",
      },
      sources: ["S30", "S17", "S89"],
      // Unclear disability, and how far the NI s3A(1) test reaches (question 12).
      toVerify: true,
    },
    {
      id: "familyLeavePriority",
      level: "act_now",
      when: FAMILY_PROTECTED_GB,
      message: {
        hr: "Someone is pregnant (and has told you), on maternity, adoption, shared parental, neonatal care or bereaved partner's paternity leave, or inside the protected period after it. Ordinary paternity leave does not count. They must be offered a suitable alternative vacancy, where one exists, ahead of others. For maternity, failing to do so makes the dismissal automatically unfair (MPL Regs reg 20(1)(b)). The family leave playbook runs alongside.",
        employee:
          "Because you are pregnant, on family leave or recently back, you have priority for any suitable alternative vacancy. Your employer must offer it to you ahead of others.",
        consultant:
          "Someone in your client's pool is pregnant (and has told your client), on maternity, adoption, shared parental, neonatal care or bereaved partner's paternity leave, or inside the protected period after it. Ordinary paternity leave does not count. They must be offered a suitable alternative vacancy, where one exists, ahead of others. For maternity, failing to do so makes the dismissal automatically unfair (MPL Regs reg 20(1)(b)). The family leave playbook runs alongside.",
      },
      sources: ["S18", "S33", "S71"],
    },
    {
      // Great Britain only (NI review R29); in Northern Ireland the outcome
      // step is blocked instead, alongside familyLeaveNIOnLeave.
      id: "familyLeaveVacancyMissed",
      level: "act_now",
      when: { all: [GB, FAMILY_VACANCY_OPEN] },
      message: {
        hr: "A person with family leave priority has not been offered a vacancy that may be suitable. Their outcome letter is blocked until the vacancy is offered, or you record why it is not suitable and appropriate. Any new contract must start immediately when the old one ends, on terms not substantially less favourable (reg 10(2), (3)).",
        employee:
          "There is a vacancy that may suit you and it has not been offered to you. You can ask for it to be offered to you first. The new job should start straight after your current one ends, on terms not substantially less favourable.",
        consultant:
          "A person with family leave priority has not been offered a vacancy that may be suitable. Their outcome letter is blocked until your client offers the vacancy, or records why it is not suitable and appropriate. Any new contract must start immediately when the old one ends, on terms not substantially less favourable (reg 10(2), (3)).",
      },
      sources: ["S18"],
    },
    {
      // For information when no one is on a covered leave; familyLeaveNIOnLeave
      // is the act now version (a check has one level).
      id: "familyLeaveNI",
      level: "for_information",
      when: { all: [NI, FAMILY_LEAVE_ANY, { not: FAMILY_PROTECTED_NI }] },
      message:
        "In Northern Ireland, priority for a suitable alternative vacancy applies only while the employee is on maternity, adoption or shared parental leave, and ends when the leave ends. There is no protection from notification of pregnancy and no 18-month extension; the 2023 Act extends to Great Britain only. A redundancy dismissal that breaches the priority is automatically unfair (reg 20). Still check that scoring does not penalise pregnancy or leave, which risks sex or pregnancy discrimination.",
      sources: ["S40", "S84", "S19", "S90"],
    },
    {
      id: "disability",
      level: "worth_checking",
      when: { fact: "healthOrDisability", is: true },
      message: {
        hr: "Someone may be disabled or has had long or repeated health absence. Consider adjustments to meetings, scoring and alternative roles. Northern Ireland: a person who has cancer, HIV infection or multiple sclerosis is treated as disabled from diagnosis, unless a prescribed exception applies (Disability Discrimination Act 1995 Sch 1 para 6A). The disability playbook runs alongside.",
        employee:
          "You can ask for adjustments to meetings, scoring or alternative roles because of your health. We can help you ask. In Northern Ireland, cancer, HIV infection and multiple sclerosis count as a disability from diagnosis.",
        consultant:
          "Someone in your client's pool may be disabled or has had long or repeated health absence. Consider adjustments to meetings, scoring and alternative roles. Northern Ireland: a person who has cancer, HIV infection or multiple sclerosis is treated as disabled from diagnosis, unless a prescribed exception applies (Disability Discrimination Act 1995 Sch 1 para 6A). The disability playbook runs alongside.",
      },
      sources: ["S89"],
    },
    {
      id: "protectedReasonSelection",
      level: "worth_checking",
      when: {
        all: [
          UK,
          {
            any: [
              { fact: "recentConcernsRaised", in: LISTED_CONCERNS },
              { fact: "grievanceAllegedDiscrimination", is: true },
            ],
          },
        ],
      },
      message: {
        hr: "Someone raised a concern or was a representative in the last 12 months. Check what each concern was about. Selection is automatically unfair if the main reason is a listed one, such as a health and safety concern, a protected disclosure, asserting a statutory right, or acting as a representative, and no qualifying period applies. A grievance that alleged discrimination is a protected act, so selection because of it may be victimisation (Equality Act s27; in Northern Ireland, the NI equality Orders). Any other grievance is not a listed reason, but selection because of it can still be unfair.",
        employee:
          "You raised a concern in the last year. Being selected mainly because of a listed reason, such as a health and safety concern, whistleblowing, asserting a legal right, or acting as a representative, is automatically unfair, whatever your length of service. If your grievance said you were treated badly because of something like a health condition, your sex, race or age, being selected because of it may be victimisation. An ordinary grievance is not a listed reason, but being selected because of it can still be unfair.",
        consultant:
          "Someone in your client's pool raised a concern or was a representative in the last 12 months. Check what each concern was about. Selection is automatically unfair if the main reason is a listed one, such as a health and safety concern, a protected disclosure, asserting a statutory right, or acting as a representative, and no qualifying period applies. A grievance that alleged discrimination is a protected act, so selection because of it may be victimisation (Equality Act s27; in Northern Ireland, the NI equality Orders). Any other grievance is not a listed reason, but selection because of it can still be unfair.",
      },
      sources: ["S8", "S9", "S70"],
    },
    {
      // "Featured in selection" has no fact of its own; this fires whenever
      // someone is part-time or fixed-term, as a reminder.
      id: "partTimeFixedTerm",
      level: "worth_checking",
      when: { all: [UK, { fact: "partTimeOrFixedTerm", is: true }] },
      message:
        "Someone is part-time or on a fixed-term contract. Selecting someone because they are part-time or fixed-term is unlawful unless objectively justified (Part-time Workers Regulations 2000 reg 5; Fixed-term Employees Regulations 2002 reg 3). Selecting them because they asserted those rights is automatically unfair. Make sure it plays no part in selection.",
      sources: ["S77", "S8", "S30"],
    },
    {
      id: "noMeeting",
      level: "act_now",
      when: { all: [UK, { not: { known: "meetingDates" } }] },
      message: {
        hr: "No individual consultation meeting is planned yet. Plan at least one meeting before any decision. The law sets no minimum length, but Acas expects discussion of the proposal, alternatives and selection.",
        employee:
          "No consultation meeting has been arranged yet. Your employer should meet you before any decision to discuss the proposal, alternatives and how people are chosen.",
        consultant:
          "Your client has no individual consultation meeting planned yet. Plan at least one meeting before any decision. The law sets no minimum length, but Acas expects discussion of the proposal, alternatives and selection.",
      },
      sources: ["S29"],
    },
    {
      id: "predetermined",
      level: "act_now",
      when: { all: [UK, { fact: "outcomeDecided", is: true }] },
      message: {
        hr: "The decision looks final, or names were chosen, before consultation. Reopen the process: consultation must be genuine.",
        employee:
          "It sounds as if the decision was made before consultation. Consultation must be genuine, and you can say so in your response.",
        consultant:
          "Your client's decision looks final, or names were chosen, before consultation. Reopen the process: consultation must be genuine.",
      },
      sources: ["S1", "S29"],
    },
    {
      id: "replacement",
      level: "act_now",
      when: { all: [GB, REPLACED_BY_OTHERS] },
      message:
        "Someone will be hired, or agency workers or a contractor engaged, to do the same work. This may be a sham redundancy. Under the Employment Rights Act 2025, dismissal to replace an employee with a non-employee doing the same work will be automatically unfair once in force (new ERA 1996 s104K, inserted by ERA 2025 s28). It is expected in January 2027; no commencement regulations had been made by 13 October 2026, so the date is still to be confirmed.",
      sources: ["S21", "S24"],
      toVerify: true,
    },
    {
      id: "outsourcingTUPE",
      level: "worth_checking",
      when: { all: [UK, { fact: "replacementPlanned", in: ["outside_provider", "business_sold"] }] },
      message:
        "Work is moving to an outside provider, or part of the business is being sold. TUPE may apply, and staff may transfer instead of being made redundant. Check TUPE first. There is no service provision change where the activities are wholly or mainly the supply of goods for the client's use (TUPE reg 3(3)(b)); whether that applies here depends on the facts and is still to be confirmed.",
      sources: ["S78"],
      toVerify: true,
    },
    {
      id: "termsOnly",
      level: "worth_checking",
      when: { all: [GB, { fact: "jobsContinue", is: true }] },
      message:
        "The jobs stay but terms change. Use the contract change playbook. Employment Rights Act 2025 fire and rehire protections are due in January 2027.",
      sources: ["S24"],
    },
    {
      id: "underTwoYears",
      level: "for_information",
      when: { all: [GB, SERVICE_UNDER_TWO_YEARS] },
      message:
        "Less than 2 years' continuous service: no statutory redundancy pay. Unfair dismissal needs 2 years where employment ends before 1 January 2027, and 6 months where the effective date of termination is on or after that date, even if notice was given earlier (SI 2026/559 reg 4). Automatically unfair reasons and discrimination have no qualifying period.",
      sources: ["S14", "S9", "S24", "S74"],
    },
    {
      id: "trialPeriod",
      level: "for_information",
      when: { all: [UK, { any: [{ fact: "offerResponse", is: "accepted" }, { known: "trialStartDate" }] }] },
      message:
        "Where the new role is on different terms, there is a statutory trial period of four weeks from starting work in it (Northern Ireland: ERNIO art. 173(3), (6)). It can be longer only for retraining, agreed in writing before the new job starts, with an end date. If the offer is accepted during maternity leave, when the trial runs is still to be confirmed.",
      sources: ["S11", "S31", "S82"],
      toVerify: true,
    },
    {
      id: "refusalOfOffer",
      level: "worth_checking",
      when: {
        all: [
          UK,
          {
            any: [
              { fact: "offerResponse", is: "declined" },
              {
                all: [
                  { lens: "employee" },
                  { known: "alternativeOffer" },
                  { not: { fact: "offerResponse", is: "accepted" } },
                ],
              },
            ],
          },
        ],
      },
      message: {
        hr: "Redundancy pay can be withheld only if the offer was suitable and the refusal unreasonable, and the employer must prove both. Northern Ireland: ERNIO art. 176, whose text is still to be confirmed.",
        employee:
          "You lose redundancy pay by refusing only if the job offered was suitable and your refusal was unreasonable, and your employer has to prove that. In Northern Ireland the rule is in ERNIO art. 176, whose text is still to be confirmed.",
        consultant:
          "Your client can withhold redundancy pay only if the offer was suitable and the refusal unreasonable, and it must prove both. Northern Ireland: ERNIO art. 176, whose text is still to be confirmed.",
      },
      sources: ["S13", "S31", "S82"],
      toVerify: true,
    },
    {
      id: "noAppeal",
      level: "worth_checking",
      when: {
        all: [
          GB,
          { not: { fact: "appealOffered", is: true } },
          { any: [EMPLOYER, NOTICE_STAGE] },
        ],
      },
      message: {
        hr: "No appeal is offered yet. Acas treats an appeal as good practice. The Acas Code does not apply to redundancy dismissals, so there is no Code uplift, but an appeal still helps show the process was fair.",
        employee: "You have not been offered an appeal. Acas treats an appeal as good practice, and you can still ask for one.",
        consultant:
          "Your client has not offered an appeal yet. Acas treats an appeal as good practice. The Acas Code does not apply to redundancy dismissals, so there is no Code uplift, but an appeal still helps show the process was fair.",
      },
      sources: ["S32", "S79"],
    },
    {
      // The draft's noAppeal is act now in Northern Ireland; a check has one
      // level, so the NI version has its own id.
      id: "noAppealNI",
      level: "act_now",
      when: {
        all: [
          NI,
          NOT_COLLECTIVE,
          { not: { fact: "appealOffered", is: true } },
          { any: [EMPLOYER, NOTICE_STAGE] },
        ],
      },
      message: {
        hr: "In Northern Ireland the statutory procedure requires an appeal for most non-collective dismissals. Offer one.",
        employee:
          "In Northern Ireland your employer must offer an appeal for most dismissals of this kind.",
        consultant:
          "In Northern Ireland the statutory procedure requires an appeal for most non-collective dismissals. Your client must offer one.",
      },
      sources: ["S38", "S39", "S83"],
    },
    {
      id: "niStatutoryProcedure",
      level: "act_now",
      when: { all: [NI, NOT_COLLECTIVE] },
      message:
        "In Northern Ireland the statutory dismissal procedure applies (Employment (NI) Order 2003 Sch 1; SR 2004/521 regs 3 and 4). It needs: a written statement of the grounds with an invitation to a meeting; the basis for the grounds, meaning the selection criteria and the employee's own scores, given before the meeting; the meeting; the decision with notice of the right to appeal; and an appeal meeting if the employee asks for one. If it is not completed wholly or mainly because of the employer, the dismissal is automatically unfair (ERNIO art. 130A), awards rise by 10 to 50 per cent (2003 Order Art 17), and the basic award is at least four weeks' pay (art. 154(1A)). It does not apply where the collective duty applies (20 or more redundancies proposed at the site within 90 days).",
      sources: ["S38", "S39", "S83"],
    },
    {
      id: "timeOffJobSearch",
      level: "for_information",
      when: { all: [GB, NOTICE_WITH_TWO_YEARS] },
      message:
        "With notice given and 2 years' service by the end of the notice, there is a right to reasonable paid time off to look for work or arrange training. A tribunal award for refusing it is capped at 40 per cent of a week's pay (ERA s.53(5)).",
      sources: ["S6", "S69"],
    },
    {
      id: "deadlineClose",
      level: "act_now",
      when: {
        all: [
          UK,
          { lens: "employee" },
          {
            any: [
              { deadline: "tribunal_unfair_dismissal", withinDays: 42 },
              { deadline: "redundancy_pay_claim", withinDays: 42 },
              { deadline: "protective_award_claim", withinDays: 42 },
              { deadline: "tribunal_notice_pay", withinDays: 42 },
              { deadline: "tribunal_discrimination", withinDays: 42 },
              { deadline: "early_conciliation", withinDays: 42 },
              { fact: "nextMeetingDate", withinDays: 7 },
            ],
          },
        ],
      },
      message:
        "A date that matters is close. If it is a tribunal time limit, the first step is early conciliation (Acas in Great Britain, the LRA in Northern Ireland), and we show the date first. If it is a meeting, prepare now.",
    },
    {
      id: "settlement",
      level: "for_information",
      when: { fact: "settlementOffered", is: true },
      message: "A settlement or package is mentioned. The settlement playbook takes this part.",
    },
    {
      // Now covers all of Great Britain (GB review R29). The id is kept.
      id: "scotlandContract",
      level: "for_information",
      when: {
        all: [
          GB,
          {
            any: [{ known: "noticeDate" }, { known: "employmentEndDate" }, { known: "firstDismissalDate" }],
          },
        ],
      },
      message:
        "A tribunal claim for breach of contract (for example unpaid notice) is possible only after employment ends, and awards are capped at £25,000. England and Wales: 6 months where the effective date of termination is on or after 1 October 2026 (SI 2026/759). Scotland: 6 months where the effective date of termination is on or after 9 November 2026, if the Scottish order is made as drafted; otherwise 3 months.",
      sources: ["S24", "S76"],
      // Whether the Scottish order is made as drafted (question 27).
      toVerify: true,
    },
    {
      id: "usWarn",
      level: "act_now",
      when: WARN_FEDERAL,
      message:
        "Federal WARN notice is due, or may be on the counts so far (the WARN date shows which). Notice must arrive at least 60 days before each group's separation date. It goes to the union, or to each affected employee (part-time staff included), and to the state dislocated worker unit and the chief elected official of the local government.",
      sources: ["S48", "S51", "S52"],
    },
    {
      id: "usOwbpa",
      level: "act_now",
      when: {
        all: [US, { fact: "usReleaseOffered", is: true }, { fact: "usOver40Affected", is: true }],
      },
      message:
        "A release of claims is sought and people aged 40 or over are affected. Individual: a plain-language agreement that refers to the ADEA, waives no future claims, gives something beyond what is already owed, advises in writing to consult an attorney, and allows at least 21 days to consider and 7 days to revoke. Group (offered to two or more): 45 days to consider, and at the start of the 45 days written information on who is covered, the eligibility factors, the time limits, and the job titles and ages of those selected and not selected in the decisional unit.",
      sources: ["S50", "S53"],
    },

    // New in 0.2
    {
      // In code the suppression itself is the GB gate on each Great Britain
      // check; this check only tells the user.
      id: "niGate",
      level: "for_information",
      when: NI,
      message:
        "This case is in Northern Ireland, which has its own employment law. Checks that apply only in Great Britain are not shown: the coming employer-wide collective threshold, replacement by non-employees, fire and rehire, contract claim time limits, and the 18-month family leave priority (the Northern Ireland family leave check applies instead). Where a check covers both, follow its Northern Ireland line. Early conciliation is with the Labour Relations Agency (LRA), not Acas.",
    },
    {
      // The act now half of the draft's familyLeaveNI (a check has one level).
      id: "familyLeaveNIOnLeave",
      level: "act_now",
      when: FAMILY_PROTECTED_NI,
      message: {
        hr: "Someone is on maternity, adoption or shared parental leave in Northern Ireland. While the leave lasts, they must be offered a suitable alternative vacancy, where one exists, ahead of others, and a redundancy dismissal that breaches this is automatically unfair (reg 20). The priority ends when the leave ends. Their outcome letter is blocked until the vacancy is offered, or you record why it is not suitable and appropriate.",
        employee:
          "Because you are on maternity, adoption or shared parental leave, you have priority for any suitable alternative vacancy while your leave lasts. Your employer must offer it to you ahead of others.",
        consultant:
          "Someone in your client's pool is on maternity, adoption or shared parental leave in Northern Ireland. While the leave lasts, they must be offered a suitable alternative vacancy, where one exists, ahead of others, and a redundancy dismissal that breaches this is automatically unfair (reg 20). The priority ends when the leave ends. Their outcome letter is blocked until your client offers the vacancy, or records why it is not suitable and appropriate.",
      },
      sources: ["S40", "S84"],
    },
    {
      id: "underTwoYearsNI",
      level: "for_information",
      when: { all: [NI, SERVICE_UNDER_TWO_YEARS] },
      message:
        "Less than 2 years' continuous service: no statutory redundancy pay (ERNIO art. 190). In Northern Ireland unfair dismissal needs one year (art. 140(1)), with statutory notice added to the termination date (art. 129(2)); the Great Britain six-month change does not apply. Automatically unfair reasons and discrimination have no qualifying period.",
      sources: ["S37", "S82"],
    },
    {
      id: "timeOffJobSearchNI",
      level: "for_information",
      when: { all: [NI, NOTICE_WITH_TWO_YEARS] },
      message:
        "With notice given and 2 years' service, there is likely to be a right to reasonable paid time off to look for work or arrange training, as in Great Britain. For Northern Ireland the article, the service condition and the pay limit are still to be confirmed.",
      // Question 9(a).
      toVerify: true,
    },
    {
      id: "usStateWarn",
      level: "act_now",
      when: WARN_STATE,
      message:
        "A state layoff notice law applies, or may on the counts so far, and it can apply when federal WARN does not. New York: 90 days, to more recipients. California: 60 days, part-time staff counted, no percentage test, any closure. Illinois: 60 days, to the Department of Commerce and Economic Opportunity (DCEO) and local officials.",
      sources: ["S55", "S56", "S58"],
    },
    {
      // "Close" is within 10% below a threshold (Proposal). The Condition
      // language cannot compare two facts, so "more losses within 90 days"
      // is approximated as 90-day losses reaching 50 while 30-day losses do not.
      id: "usWarnNearMiss",
      level: "worth_checking",
      when: {
        all: [
          US,
          {
            any: [
              BETWEEN("usEmployerHeadcount", 90, 100),
              BETWEEN("usLossesIn30Days", 45, 50),
              BETWEEN("usLossesIn90Days", 45, 50),
              BETWEEN("usLossesIn30Days", 450, 500),
              BETWEEN("usLossesIn90Days", 450, 500),
              { all: [{ fact: "usLossesIn30Days", below: 50 }, { fact: "usLossesIn90Days", atLeast: 50 }] },
              { all: [STATE_IS(["NY"]), BETWEEN("usStateHeadcount", 45, 50)] },
              { all: [STATE_IS(["CA", "IL"]), BETWEEN("usStateHeadcount", 68, 75)] },
              {
                all: [
                  ANYONE_IN(["NY", "IL"], ["New York", "Illinois"]),
                  {
                    any: [
                      BETWEEN("usLossesIn30Days", 23, 25),
                      BETWEEN("usLossesIn90Days", 23, 25),
                      BETWEEN("usLossesIn30Days", 225, 250),
                      BETWEEN("usLossesIn90Days", 225, 250),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      message:
        "The numbers are close to a federal or state WARN threshold, or more losses fall within 90 days of the first. Recount on the date the first notice is due, test the 30 and 90-day aggregation, and think about giving notice anyway. Close means within 10% of the threshold, a DraftHR choice.",
      sources: ["S52"],
      proposal: true,
    },
    {
      id: "usWarnException",
      level: "act_now",
      when: { all: [US, { fact: "usWarnExceptionClaimed", is: true }] },
      message:
        "A WARN exception is claimed. A shorter notice period may apply (faltering company, unforeseeable business circumstances or natural disaster), but notice must still be given as early as possible, with a brief statement of why it is short. DraftHR does not decide that an exception applies: involve counsel.",
      sources: ["S52"],
    },
    {
      id: "usRemoteSite",
      level: "worth_checking",
      when: { all: [US, { fact: "usRemoteStaff", is: true }] },
      message:
        "Some affected employees work remotely. Which site a remote employee counts at for WARN is not settled. Count them at the site they report to, or that assigns their work, and check the result with and without them.",
      sources: ["S52", "S65"],
      // Question 17.
      toVerify: true,
    },
    {
      id: "usPostponement",
      level: "worth_checking",
      when: { all: [US, { fact: "usSeparationMoved", is: true }] },
      message:
        "A separation date given in a WARN notice has moved later. If it moves by less than 60 days, give additional notice as soon as possible. If it moves by 60 days or more, give a new notice.",
      sources: ["S52"],
    },
    {
      id: "usUnion",
      level: "act_now",
      when: { all: [US, { fact: "usUnion", is: true }] },
      message:
        "Affected employees are covered by a union agreement. Serve the WARN notice on the union's chief elected officer, with job titles and the names of the workers in affected jobs. Check the agreement for seniority, recall and consultation terms, and involve counsel on any duty to bargain.",
      sources: ["S52"],
      // Question 24.
      toVerify: true,
    },
    {
      id: "usSelectionImpact",
      level: "worth_checking",
      when: {
        all: [
          US,
          { known: "usSelectionCriteria" },
          {
            any: [
              { fact: "usOver40Affected", is: true },
              { fact: "recentConcernsRaised", in: LISTED_CONCERNS },
            ],
          },
        ],
      },
      message:
        "Check the selection. It must not be because of age, race, colour, religion, sex, national origin, disability or genetic information, or because of a complaint. A criterion that falls harder on older workers is lawful only if it rests on a reasonable factor other than age. Record the business reason for each criterion.",
      sources: ["S59"],
    },
    {
      // The sexual harassment limb of the draft's trigger needs a fact of its
      // own; the federal sentence is in the message.
      id: "usStateRelease",
      level: "act_now",
      when: {
        all: [US, { fact: "usReleaseOffered", is: true }, ANYONE_IN(["CA", "NY"], ["California", "New York"])],
      },
      message:
        "A release is offered to staff in California or New York. California: tell the employee in writing they may consult an attorney and give at least 5 business days; any clause limiting disclosure carries the set wording on unlawful acts. New York: if the release settles a discrimination, harassment or retaliation claim, keep the facts confidential only if the employee prefers it, with up to 21 days to consider and 7 days to revoke. Federal: pre-dispute confidentiality, non-disparagement and arbitration terms cannot be enforced in sexual harassment or assault disputes. Wording for staff covered by the National Labor Relations Act is still to be confirmed.",
      sources: ["S63"],
      // Question 23.
      toVerify: true,
    },
    {
      id: "usSeverance",
      level: "for_information",
      when: US,
      message:
        "Federal law does not require severance pay, so DraftHR works out none. A written severance promise can be enforced (in Texas, only a written one). Whether a severance plan is an employee benefit plan, and continued group health cover, are still to be confirmed.",
      sources: ["S60"],
      // Question 25.
      toVerify: true,
    },
    {
      id: "usFinalPay",
      level: "act_now",
      when: { all: [US, { known: "firstDismissalDate" }] },
      message:
        "Final pay has a state deadline, shown with the other dates. Texas: within 6 calendar days of a layoff. New York: by the regular payday for the period in which employment ended. Illinois: by the next regular payday at the latest, with earned vacation. California: pay in full on the last day (still to be confirmed for layoffs). Florida: no state rule found.",
      sources: ["S61"],
      // California layoffs (question 20).
      toVerify: true,
    },
    {
      id: "usSeparationNotice",
      level: "act_now",
      when: { all: [US, { known: "firstDismissalDate" }] },
      message:
        "State separation notices are due, shown with the other dates. New York: form IA 12.3, and written notice of the end date and the date benefits end within 5 working days. Illinois: the IDES unemployment insurance pamphlet. Texas: notice of the right to claim unemployment. California: written notice immediately.",
      sources: ["S62"],
    },
    {
      // "An employee says selection was discriminatory" is read from the date
      // of the act complained of, which also feeds the charge deadlines.
      id: "usAgencyDeadlines",
      level: "worth_checking",
      when: { all: [US, { known: "actComplainedOfDate" }] },
      message:
        "Selection may have been discriminatory. The EEOC and state agency deadlines are shown with the other dates. All five covered states are 300-day states for an EEOC charge (employers with 15 or more employees; 20 or more for age). Texas: 180 days to the Texas Workforce Commission Civil Rights Division, shorter than the EEOC's 300.",
    },
  ],

  // -------------------------------------------------------------------------
  // Rules (parts 5 and 9). Dates come from the rules code.
  // -------------------------------------------------------------------------
  rules: [
    {
      id: "collective_consultation_start",
      label: "Latest day collective consultation must begin",
      rule: "uk.collectiveConsultation",
      inputs: {
        proposedCount: { fact: "rolesAtEstablishment" },
        firstDismissalDate: { fact: "firstDismissalDate" },
      },
      when: COLLECTIVE,
    },
    {
      id: "hr1_deadline",
      label: "Latest day the HR1 must be received",
      rule: "uk.hr1Deadline",
      inputs: {
        proposedCount: { fact: "rolesAtEstablishment" },
        firstDismissalDate: { fact: "firstDismissalDate" },
        firstNoticeDate: { fact: "noticeDate" },
      },
      when: COLLECTIVE,
      lens: ["hr", "consultant"],
    },
    {
      id: "protective_award_max",
      label: "Maximum protective award",
      rule: "uk.protectiveAwardMax",
      inputs: { dismissalDate: { fact: "firstDismissalDate" } },
      when: COLLECTIVE,
    },
    {
      id: "statutory_notice",
      label: "Earliest end of statutory notice",
      rule: "uk.statutoryNotice",
      inputs: {
        startDate: { fact: "serviceStartDate" },
        noticeDate: { fact: "noticeDate" },
      },
      when: UK,
    },
    {
      id: "statutory_redundancy_pay",
      label: "Statutory redundancy pay",
      rule: "uk.statutoryRedundancyPay",
      inputs: {
        startDate: { fact: "serviceStartDate" },
        terminationDate: { fact: "employmentEndDate" },
        dateOfBirth: { fact: "dateOfBirth" },
        weeklyPay: { fact: "weeklyPay" },
      },
      when: UK,
    },
    {
      id: "unfair_dismissal_qualifying",
      label: "Unfair dismissal qualifying period met",
      rule: "uk.qualifyingService",
      inputs: {
        startDate: { fact: "serviceStartDate" },
        terminationDate: { fact: "employmentEndDate" },
      },
      when: UK,
    },
    {
      id: "family_leave_protection",
      label: "End of family leave priority for vacancies",
      rule: "uk.familyLeaveProtectedPeriod",
      inputs: {
        leaveType: { fact: "familyLeaveType" },
        birthDate: { fact: "familyLeaveBirthDate" },
        expectedWeekStart: { fact: "familyLeaveExpectedWeek" },
        notifiedPregnancyDate: { fact: "familyLeaveNotifiedDate" },
        leaveEndDate: { fact: "familyLeaveEndDate" },
        placementDate: { fact: "familyLeavePlacementDate" },
        sixConsecutiveWeeks: { fact: "familyLeaveSixWeeks" },
        birthNotified: { fact: "familyLeaveBirthNotified" },
      },
      when: { all: [UK, FAMILY_LEAVE_ANY] },
    },
    {
      id: "trial_period_end",
      label: "End of the statutory trial period",
      rule: "uk.trialPeriodEnd",
      inputs: {
        newRoleStartDate: { fact: "trialStartDate" },
        retrainingEndDate: { fact: "retrainingEndDate" },
      },
      when: {
        all: [UK, { any: [{ fact: "offerResponse", is: "accepted" }, { known: "trialStartDate" }] }],
      },
    },
    {
      id: "tribunal_unfair_dismissal",
      label: "Unfair dismissal claim time limit",
      rule: "uk.tribunalTimeLimit",
      inputs: {
        claimType: { value: "unfair_dismissal" },
        relevantDate: { fact: "employmentEndDate" },
      },
      when: UK,
    },
    {
      id: "redundancy_pay_claim",
      label: "Statutory redundancy pay claim time limit",
      rule: "uk.tribunalTimeLimit",
      inputs: {
        claimType: { value: "redundancy_pay" },
        relevantDate: { fact: "employmentEndDate" },
      },
      when: UK,
    },
    {
      id: "protective_award_claim",
      label: "Protective award complaint time limit",
      rule: "uk.tribunalTimeLimit",
      inputs: {
        claimType: { value: "protective_award" },
        relevantDate: { fact: "employmentEndDate" },
      },
      when: COLLECTIVE,
    },
    {
      id: "tribunal_notice_pay",
      label: "Breach of contract (notice pay) claim time limit",
      rule: "uk.tribunalTimeLimit",
      inputs: {
        claimType: { value: "breach_of_contract" },
        relevantDate: { fact: "employmentEndDate" },
      },
      when: UK,
    },
    {
      id: "tribunal_discrimination",
      label: "Discrimination claim time limit",
      rule: "uk.tribunalTimeLimit",
      inputs: {
        claimType: { value: "discrimination" },
        relevantDate: { fact: "actComplainedOfDate" },
      },
      when: {
        all: [
          UK,
          {
            any: [
              { known: "actComplainedOfDate" },
              { fact: "healthOrDisability", is: true },
              { fact: "grievanceAllegedDiscrimination", is: true },
              FAMILY_LEAVE_ANY,
            ],
          },
        ],
      },
      lens: ["employee"],
    },
    {
      // One date for every claim that early conciliation extends: the
      // earliest primary limit worked out above, extended.
      id: "early_conciliation",
      label: "Tribunal time limit with early conciliation (earliest claim)",
      rule: "uk.earlyConciliation",
      inputs: {
        limitDate: {
          deadline: [
            "tribunal_unfair_dismissal",
            "tribunal_discrimination",
            "protective_award_claim",
            "tribunal_notice_pay",
          ],
        },
        dayA: { fact: "acasNotifiedDate" },
        dayB: { fact: "acasCertificateDate" },
      },
      when: { all: [UK, { known: "acasNotifiedDate" }] },
    },
    {
      // With the counts, the rules code also tests coverage, a plant closing
      // or mass layoff, and 90-day aggregation; its date is null only when
      // the counts show WARN does not apply. There is no closure fact, so a
      // plant closing is left open when the losses reach 50.
      id: "warn_notice",
      label: "Latest day for WARN notice",
      rule: "us.warnNotice",
      inputs: {
        firstSeparationDate: { fact: "firstDismissalDate" },
        separationDates: { fact: "usSeparationDates" },
        employerFullTime: { fact: "usEmployerHeadcount" },
        employer4000Hours: { fact: "usEmployer4000Hours" },
        siteFullTimeHeadcount: { fact: "usSiteHeadcount" },
        siteLosses30: { fact: "usLossesIn30Days" },
        siteLosses90: { fact: "usLossesIn90Days" },
      },
      when: US,
    },
    {
      // Run only where the state these rules follow is California, New York
      // or Illinois: Texas and Florida have no state law, and other states
      // are not held.
      id: "us_state_warn_notice",
      label: "Latest day for state layoff notice",
      rule: "us.stateWarnNotice",
      inputs: {
        state: { fact: "usState" },
        firstSeparationDate: { fact: "firstDismissalDate" },
        stateHeadcount: { fact: "usStateHeadcount" },
        siteLosses30: { fact: "usLossesIn30Days" },
        siteLosses90: { fact: "usLossesIn90Days" },
        siteFullTimeHeadcount: { fact: "usSiteHeadcount" },
      },
      when: { all: [US, STATE_IS(["CA", "NY", "IL"])] },
    },
    {
      id: "us_final_pay",
      label: "Latest day for final pay",
      rule: "us.finalPay",
      inputs: {
        state: { fact: "usState" },
        separationDate: { fact: "firstDismissalDate" },
        separationType: { value: "layoff" },
        nextPayday: { fact: "usNextPayday" },
      },
      when: US,
    },
    {
      id: "us_separation_notice",
      label: "Latest day for the state separation notice",
      rule: "us.separationNotice",
      inputs: {
        state: { fact: "usState" },
        separationDate: { fact: "firstDismissalDate" },
        separationType: { value: "layoff" },
      },
      when: US,
    },
    {
      // Employer size is left out: usEmployerHeadcount leaves out part-time
      // staff, who count for the EEOC's 15 and 20 employee tests.
      id: "eeoc_charge",
      label: "EEOC charge deadline",
      rule: "us.eeocCharge",
      inputs: {
        actDate: { fact: "actComplainedOfDate" },
        state: { fact: "usState" },
      },
      when: { all: [US, { known: "actComplainedOfDate" }] },
    },
    {
      id: "state_agency_charge",
      label: "State fair employment agency deadline",
      rule: "us.stateAgencyDeadline",
      inputs: {
        actDate: { fact: "actComplainedOfDate" },
        state: { fact: "usState" },
      },
      when: { all: [US, { known: "actComplainedOfDate" }] },
    },
    {
      id: "owbpa_consideration",
      label: "End of the release consideration period",
      rule: "us.owbpa",
      inputs: {
        agreementGivenDate: { fact: "usReleaseGivenDate" },
        groupProgramme: { fact: "usGroupProgramme" },
        signedDate: { fact: "usReleaseSignedDate" },
      },
      when: { all: [US, { fact: "usReleaseOffered", is: true }] },
    },
  ],

  // -------------------------------------------------------------------------
  // Route (part 6). Consultant letters are drafted for the client to sign.
  // -------------------------------------------------------------------------
  route: [
    // HR team and consultant
    {
      id: "rep_election_notice",
      title: {
        hr: "Notice inviting election of employee representatives",
        consultant: "Notice inviting election of employee representatives (for the client to sign)",
      },
      letter: "new:rep_election_notice",
      lens: ["hr", "consultant"],
      when: {
        all: [COLLECTIVE, { fact: "recognisedUnion", is: false }, { not: { fact: "existingReps", is: true } }],
      },
      needs: [...EMPLOYER_FIRST, "rolesAtEstablishment", "existingReps"],
      blockedIf: [SIGNER_BLOCK],
    },
    {
      id: "collective_consultation_letter",
      title: {
        hr: "Collective consultation letter to representatives",
        consultant: "Collective consultation letter to representatives (for the client to sign)",
      },
      letter: "new:collective_consultation_letter",
      lens: ["hr", "consultant"],
      when: COLLECTIVE,
      after: ["rep_election_notice"],
      needs: [
        ...EMPLOYER_FIRST,
        "rolesAtEstablishment",
        "recognisedUnion",
        "firstDismissalDate",
        "totalAtEstablishment",
      ],
      blockedIf: [SIGNER_BLOCK, TUPE_BLOCK, NOT_REDUNDANCY_BLOCK],
    },
    {
      id: "hr1_checklist",
      title: {
        hr: "HR1 checklist (form to file, copy to representatives)",
        consultant: "HR1 checklist for the client to file (copy to representatives)",
      },
      letter: "new:hr1_checklist",
      lens: ["hr", "consultant"],
      when: COLLECTIVE,
      needs: [...EMPLOYER_FIRST, "rolesAtEstablishment", "firstDismissalDate"],
    },
    {
      id: "at_risk",
      title: {
        hr: "At-risk letter (one per person)",
        consultant: "At-risk letter, one per person (for the client to sign)",
      },
      letter: "new:at_risk_letter",
      lens: ["hr", "consultant"],
      when: UK,
      after: ["collective_consultation_letter"],
      needs: [
        ...EMPLOYER_FIRST,
        "rolesAtEstablishment",
        "poolDescription",
        "poolSize",
        "rolesRemaining",
        "personName",
        "familyLeaveStatus",
      ],
      blockedIf: [
        TUPE_BLOCK,
        NOT_REDUNDANCY_BLOCK,
        SIGNER_BLOCK,
        {
          when: { all: [COLLECTIVE, { not: { known: "consultationStartDate" } }] },
          reason: "In a collective case, at-risk letters follow the start of collective consultation.",
        },
      ],
    },
    {
      id: "meeting_invite",
      title: {
        hr: "Consultation meeting invite",
        consultant: "Consultation meeting invite (for the client to sign)",
      },
      letter: "new:consultation_meeting_invite",
      lens: ["hr", "consultant"],
      when: UK,
      after: ["at_risk"],
      needs: ["atRiskDate", "nextMeetingDate"],
      blockedIf: [
        {
          // NI statutory procedure: the basis for the grounds comes before the meeting.
          when: {
            all: [
              NI,
              NOT_COLLECTIVE,
              { fact: "rolesRemaining", atLeast: 1 },
              { any: [{ not: { known: "selectionCriteria" } }, { not: { known: "scoringMethod" } }] },
            ],
          },
          reason:
            "In Northern Ireland, give the employee the basis for selection, including the criteria and their own scores, before the meeting. Record the criteria and how they are scored first.",
        },
      ],
    },
    {
      id: "alternative_offer",
      title: {
        hr: "Offer of suitable alternative employment with trial period",
        consultant: "Offer of suitable alternative employment with trial period (for the client to sign)",
      },
      letter: "new:suitable_alternative_offer",
      lens: ["hr", "consultant"],
      when: { all: [UK, VACANCY_EXISTS] },
      after: ["at_risk"],
      needs: ["alternativeOffer"],
    },
    {
      id: "trial_outcome",
      title: "Trial outcome: confirm the new role",
      letter: "employer/contract_amendment",
      lens: ["hr", "consultant"],
      when: {
        all: [UK, { any: [{ fact: "offerResponse", is: "accepted" }, { known: "trialStartDate" }] }],
      },
      after: ["alternative_offer"],
      needs: ["trialStartDate"],
      blockedIf: [
        {
          when: { not: { deadline: "trial_period_end", withinDays: 0 } },
          reason: "The trial period has not ended yet.",
        },
      ],
    },
    {
      id: "outcome",
      title: {
        hr: "Redundancy outcome and notice",
        consultant: "Redundancy outcome and notice (for the client to sign)",
      },
      letter: "employer/redundancy",
      lens: ["hr", "consultant"],
      when: UK,
      after: ["meeting_invite"],
      needs: [
        ...EMPLOYER_FIRST,
        "rolesAtEstablishment",
        "alternativeVacancies",
        "serviceStartDate",
        "dateOfBirth",
        "weeklyPay",
        "meetingDates",
        "noticeDate",
        "employmentEndDate",
      ],
      blockedIf: [
        {
          when: { all: [GB, FAMILY_VACANCY_OPEN] },
          reason:
            "Offer the vacancy to the person with family leave priority first, or record why it is not suitable and appropriate.",
        },
        {
          // NI review R29: familyLeaveVacancyMissed is Great Britain only, so
          // the Northern Ireland block goes with familyLeaveNIOnLeave.
          when: { all: [NI, FAMILY_VACANCY_OPEN] },
          reason:
            "Offer the vacancy first to the person on maternity, adoption or shared parental leave, or record why it is not suitable and appropriate.",
        },
        TUPE_BLOCK,
        NOT_REDUNDANCY_BLOCK,
        {
          when: REPLACED_BY_OTHERS,
          reason: "Someone else will do the same work: possible sham redundancy. Resolve this first.",
        },
        {
          when: { fact: "outcomeDecided", is: true },
          reason: "The outcome was decided before consultation. Reopen consultation first.",
        },
        {
          when: { all: [COLLECTIVE, { not: { known: "consultationStartDate" } }] },
          reason: "Collective consultation has not begun.",
        },
        {
          when: { all: [COLLECTIVE, { not: { known: "hr1Date" } }] },
          reason: "The HR1 must be filed before any notice of dismissal.",
        },
        {
          when: {
            all: [
              ATTENDANCE_SCORED,
              { not: { fact: "absenceInScoring", is: false } },
              ABSENCE_MAY_BE_LINKED,
            ],
          },
          reason:
            "Remove absence linked to disability, pregnancy or maternity from attendance scores, and record that it is done.",
        },
        {
          when: { fact: "nextMeetingDate", onOrAfter: { today: true } },
          reason: "A consultation meeting is still to come. Hold it before deciding the outcome.",
        },
        {
          when: { all: [NI, NOT_COLLECTIVE, { not: { fact: "appealOffered", is: true } }] },
          reason: "In Northern Ireland the statutory procedure needs an appeal stage. Confirm one is offered.",
        },
      ],
    },
    {
      id: "appeal_invite",
      title: {
        hr: "Appeal hearing invite",
        consultant: "Appeal hearing invite (for the client to sign)",
      },
      letter: "new:appeal_hearing_invite",
      lens: ["hr", "consultant"],
      when: { all: [UK, { known: "appealReceived" }] },
      after: ["outcome"],
      needs: ["appealReceived"],
      blockedIf: [SIGNER_BLOCK],
    },
    {
      id: "appeal_outcome",
      title: {
        hr: "Appeal outcome",
        consultant: "Appeal outcome (for the client to sign)",
      },
      letter: "new:appeal_outcome",
      lens: ["hr", "consultant"],
      when: { all: [UK, { known: "appealReceived" }] },
      after: ["appeal_invite"],
      needs: ["appealReceived"],
    },
    {
      id: "reference",
      title: "Reference (optional)",
      letter: "employer/reference",
      lens: ["hr", "consultant"],
      when: { fact: "employmentEndDate", before: { today: true } },
      after: ["outcome"],
    },
    {
      id: "settlement_cover",
      title: "Settlement cover letter",
      letter: "employer/settlement_cover",
      lens: ["hr", "consultant"],
      // Not used in US cases: a US release is us_release.
      when: { all: [UK, { fact: "settlementOffered", is: true }] },
    },
    // United States (part 6, US route tables). UK-only steps are not offered.
    {
      id: "us_warn_union",
      title: {
        hr: "WARN notice to the union",
        consultant: "WARN notice to the union (for the client to sign)",
      },
      letter: "new:warn_notice",
      lens: ["hr", "consultant"],
      when: { all: [WARN_DUE, { fact: "usUnion", is: true }] },
      needs: [...EMPLOYER_FIRST, "firstDismissalDate", "usSiteAddress", "usUnionOfficer"],
    },
    {
      id: "us_warn_notices",
      title: {
        hr: "WARN notice to each affected employee (part-time staff included)",
        consultant: "WARN notice to each affected employee, part-time staff included (for the client to sign)",
      },
      letter: "new:warn_notice",
      lens: ["hr", "consultant"],
      when: { all: [WARN_DUE, { not: { fact: "usUnion", is: true } }] },
      needs: [...EMPLOYER_FIRST, "firstDismissalDate", "usLossesIn30Days", "usSeparationDates"],
    },
    {
      id: "us_warn_government",
      title: {
        hr: "WARN notice to the state dislocated worker unit and the chief elected local official",
        consultant:
          "WARN notice to the state dislocated worker unit and the chief elected local official (for the client to sign)",
      },
      letter: "new:warn_notice",
      lens: ["hr", "consultant"],
      when: WARN_DUE,
      needs: [...EMPLOYER_FIRST, "firstDismissalDate", "usSiteAddress"],
    },
    {
      id: "us_warn_additional",
      title: {
        hr: "Additional WARN notice for a later date",
        consultant: "Additional WARN notice for a later date (for the client to sign)",
      },
      letter: "new:warn_notice",
      lens: ["hr", "consultant"],
      when: { all: [US, { fact: "usSeparationMoved", is: true }] },
      after: ["us_warn_union", "us_warn_notices"],
    },
    {
      id: "us_layoff",
      title: {
        hr: "Layoff letter (US form)",
        consultant: "Layoff letter, US form (for the client to sign)",
      },
      letter: "employer/redundancy",
      lens: ["hr", "consultant"],
      when: US,
      after: ["us_warn_union", "us_warn_notices", "us_warn_government"],
      needs: [...EMPLOYER_FIRST, "firstDismissalDate", "usStates", "usNextPayday"],
    },
    {
      // Proposal: whether DraftHR drafts US releases at all is question 18.
      id: "us_release",
      title: {
        hr: "Separation agreement and release (OWBPA terms; for a group, an exhibit of job titles and ages)",
        consultant:
          "Separation agreement and release, with OWBPA terms and any group exhibit of job titles and ages (for the client and its counsel)",
      },
      letter: "new:us_separation_agreement",
      lens: ["hr", "consultant"],
      when: { all: [US, { fact: "usReleaseOffered", is: true }] },
      after: ["us_layoff"],
      needs: ["usReleaseGivenDate", "usSeveranceAlreadyPromised"],
      blockedIf: [
        {
          when: {
            all: [
              { fact: "usGroupProgramme", is: true },
              { fact: "usOver40Affected", is: true },
              { not: { known: "usAgesInUnit" } },
            ],
          },
          reason: "List the job titles and ages in the decisional unit first.",
        },
      ],
    },
    {
      // A checklist, like the HR1 checklist, not a letter.
      id: "us_separation_checklist",
      title: "State separation notices checklist",
      letter: "new:us_separation_checklist",
      lens: ["hr", "consultant"],
      when: { all: [US, { known: "firstDismissalDate" }] },
      needs: [...EMPLOYER_FIRST, "firstDismissalDate"],
    },

    // Employee
    {
      id: "consultation_response",
      title: "Consultation response",
      letter: "employee/redundancy_consultation_response",
      lens: ["employee"],
      when: { all: [UK, { not: NOTICE_STAGE }] },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      id: "subject_access",
      title: "Subject access request for scores and notes",
      letter: "employee/subject_access_request",
      lens: ["employee"],
      when: { all: [UK, { fact: "nextStepsWanted", is: "see_scores_or_notes" }] },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      id: "adjustments_request",
      title: "Adjustments request",
      letter: "employee/accommodation_request",
      lens: ["employee"],
      when: { fact: "healthOrDisability", is: true },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      // US: the internal complaint variant, with the EEOC and state agency
      // dates from the grievance playbook.
      id: "selection_grievance",
      title: "Grievance about selection",
      letter: "employee/grievance",
      lens: ["employee"],
      when: { fact: "processGrievance", is: true },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      // The statutory appeal is a UK letter; it is not offered in US cases.
      id: "appeal",
      title: "Appeal",
      letter: "employee/appeal",
      lens: ["employee"],
      when: { all: [UK, { any: [NOTICE_STAGE, { known: "noticeDate" }] }] },
      needs: [...EMPLOYEE_FIRST, "noticeDate"],
    },
    {
      // US: a release offered with severance, via the settlement playbook (US variant).
      id: "settlement_counter",
      title: "Settlement counter-offer",
      letter: "employee/settlement_counter_offer",
      lens: ["employee"],
      when: {
        any: [{ fact: "settlementOffered", is: true }, { all: [US, { fact: "usReleaseOffered", is: true }] }],
      },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      id: "pay_claim",
      title: "Written claim for redundancy pay",
      letter: "employee/pay_dispute",
      lens: ["employee"],
      when: { all: [UK, { fact: "redundancyPayUnpaid", is: true }] },
      needs: [...EMPLOYEE_FIRST, "employmentEndDate"],
    },
    {
      id: "acas_ec",
      title: "Acas early conciliation",
      letter: "employee/acas_ec_notification",
      lens: ["employee"],
      when: { all: [UK, { fact: "nextStepsWanted", is: "bring_a_claim" }] },
      needs: [...EMPLOYEE_FIRST],
    },
    {
      id: "tribunal_cover",
      title: "Tribunal cover letter",
      letter: "employee/tribunal_cover",
      lens: ["employee"],
      when: { all: [UK, { known: "acasCertificateDate" }] },
      after: ["acas_ec"],
      needs: [...EMPLOYEE_FIRST],
    },
    // Employee, United States
    {
      // Proposal (US route, employee step 1).
      id: "us_layoff_questions",
      title: "Questions about the layoff",
      letter: "new:us_layoff_questions",
      lens: ["employee"],
      when: US,
      needs: [...EMPLOYEE_FIRST],
    },
    {
      id: "us_final_pay_claim",
      title: "Final pay claim",
      letter: "employee/pay_dispute",
      lens: ["employee"],
      when: { all: [US, { fact: "usFinalPayLate", is: true }] },
      needs: [...EMPLOYEE_FIRST, "firstDismissalDate"],
    },
  ],

  // -------------------------------------------------------------------------
  // Hand-offs (part 7)
  // -------------------------------------------------------------------------
  handOffs: [
    {
      id: "grievance",
      to: "grievance",
      when: { fact: "processGrievance", is: true },
      message:
        "Grievance about selection or process. Redundancy does not pause by default: the user chooses to deal with it inside consultation or appeal, or to pause that person's outcome until the grievance ends. No rule requiring a pause was found, and the Acas Code does not apply to redundancy dismissals; whether the law ever requires a pause is still to be confirmed. Passes across the pool, criteria, scores and meeting notes.",
    },
    {
      id: "family_leave",
      to: "expert",
      when: {
        any: [FAMILY_PROTECTED, { all: [NI, { fact: "familyLeaveStatus", in: ["pregnant", "on_leave"] }] }],
      },
      message:
        "Family leave playbook, alongside. The outcome letter for that person is locked until familyLeaveVacancyMissed is cleared. Passes across the leave type and dates, the protected period from the rules code, and the vacancy list.",
    },
    {
      id: "disability",
      to: "expert",
      when: {
        any: [{ fact: "healthOrDisability", is: true }, { fact: "absenceInScoring", is: true }],
      },
      message:
        "Disability and adjustments playbook, alongside. Scoring for that person pauses until absence is reviewed and adjustments are considered. Passes across the criteria, attendance data and adjustments asked for.",
    },
    {
      id: "whistleblowing",
      to: "expert",
      when: {
        any: [
          {
            fact: "recentConcernsRaised",
            in: [
              "whistleblowing",
              "health_and_safety",
              "discrimination_complaint",
              "flexible_working",
              "pay_complaint",
              "representative",
            ],
          },
          { fact: "grievanceAllegedDiscrimination", is: true },
        ],
      },
      message:
        "Whistleblowing or other protected reason. That person's selection pauses for a human review; the rest of the pool continues. Passes across the dates of disclosure and selection, and who knew.",
    },
    {
      id: "settlement",
      to: "expert",
      // A US release has its own hand-off, us_settlement.
      when: { fact: "settlementOffered", is: true },
      message:
        "Settlement playbook. The individual route pauses while terms are discussed; collective duties do not pause. In Northern Ireland the agreement is a compromise agreement (ERNIO art. 245), and ERA 1996 s.111A does not apply, so take legal advice before raising an exit. Passes across pay, notice and redundancy pay figures, and the claims in issue.",
    },
    {
      id: "tupe",
      to: "expert",
      when: { all: [UK, TUPE_OPEN] },
      message:
        "TUPE playbook. Redundancy stops until TUPE is ruled out. Passes across a description of the transfer, dates and the staff list.",
    },
    {
      id: "contract_change",
      to: "expert",
      when: { fact: "jobsContinue", is: true },
      message: "Contract change playbook. Exit this playbook. Passes across the proposed changes and numbers.",
    },
    {
      id: "sham_redundancy",
      to: "disciplinary",
      when: { fact: "concernIsPerformance", is: true },
      message:
        "Capability or disciplinary playbook. Exit with a note: possible sham redundancy. If the real reason is conduct or performance, the Acas Code applies. Passes across the story and dates.",
    },
    {
      id: "tribunal",
      to: "expert",
      when: { any: [{ fact: "tribunalClaimStarted", is: true }, { drafted: "tribunal_cover" }] },
      message: "Tribunal playbook. The internal process may continue. Passes across the full case file.",
    },
    {
      id: "us_settlement",
      to: "expert",
      when: { all: [US, { fact: "usReleaseOffered", is: true }] },
      message:
        "Settlement playbook (US variant) for the release. WARN notice duties do not pause. Passes across the separation dates, severance terms, the OWBPA list of job titles and ages without names, and the state.",
    },
  ],

  // -------------------------------------------------------------------------
  // Tone and privacy (part 8)
  // -------------------------------------------------------------------------
  tone: {
    lens: {
      hr: [
        "Practical and precise. Short questions in a sensible order.",
        "Explain in one line why each fact is needed.",
        "Flag risk plainly and without blame.",
        "Never suggest who to select, and never treat leave, illness or a complaint as a reason to choose someone.",
        "Never ask who they would prefer to lose.",
      ],
      employee: [
        "Warm, calm and plain. No jargon without a one-line meaning.",
        "Start with what happens next and any date that matters.",
        "Never promise an outcome or say a claim will win.",
        "Make clear the employee can skip any personal question.",
        "Point to Acas, a union or a solicitor where the stakes are high.",
        "Never ask for colleagues' personal details or scores.",
      ],
      consultant: [
        "Professional and brief. Assume HR knowledge.",
        "Keep each client's case separate.",
        "Produce drafts for the client to approve and sign, with a review step before each is sent.",
        "Note where the client must make the decision.",
      ],
    },
    privacy: [
      "Never ask for medical records, diagnoses or details of a health condition beyond whether any absence is linked to a health condition or disability.",
      "Never ask about religion, sexuality, gender identity, ethnicity or plans for a family unless the user raises them.",
      "Health, disability and absence reasons are special category: case owner and named reviewers only, and never in collective letters or letters to other staff.",
      "Pregnancy and family leave are special category or high risk: case owner and named reviewers only, and in letters only to the person concerned.",
      "Grievances and whistleblowing are high risk: case owner and named reviewers only, and never in the redundancy outcome letter.",
      "Dates of birth are used only for the redundancy pay rule and appear in letters only in the pay calculation.",
      "Scores for each person: in the HR and consultant lenses only the case owner sees them; each employee may see their own scores.",
      "In the Employee lens, the employee's own story is never shared with the employer.",
      "Collective letters give numbers and job descriptions, not names.",
      "Retention follows DraftHR's general policy (to verify with the privacy lead).",
    ],
  },
};
