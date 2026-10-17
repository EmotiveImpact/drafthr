import type { Condition, FactValue, Lens, LensText, Playbook } from "../types.js";

/**
 * Disciplinary playbook, draft 0.2, translated from
 * case-engine/playbooks/disciplinary.md (13 October 2026, for legal review,
 * updated with the Great Britain, Northern Ireland and United States region
 * reviews).
 *
 * Fact keys follow part 3 of the draft. Where a part 3 fact combines several
 * answers ("yes-no + date + text"), it is split into one fact per answer and
 * the parts keep the parent's priority. A few facts are added so that checks,
 * the route and the hand-offs can be expressed; each says so in its `why`
 * or in the comment above it.
 *
 * Where a draft check has a Northern Ireland line, the code has two entries:
 * the draft id for Great Britain and the same id plus "NI" for Northern
 * Ireland, because a check's message can differ by lens but not by place.
 *
 * Nothing here works out a date. Deadlines come from the rules code; the
 * only literal dates are the fixed window around the 1 January 2027
 * qualifying period change used by check C23.
 */

// ---------------------------------------------------------------------------
// Building blocks for conditions. Plain data; they only save repetition.
// ---------------------------------------------------------------------------

const UK: Condition = { country: "uk" };
const US: Condition = { country: "us" };
const NI: Condition = { nation: "northern-ireland" };
/** England, Wales and Scotland. */
const GB: Condition = { all: [UK, { not: NI }] };

const EMPLOYER: Lens[] = ["hr", "consultant"];
const EMPLOYEE: Lens[] = ["employee"];

const STAGES = [
  "not_started",
  "suspended",
  "investigating",
  "investigation_finished",
  "hearing_arranged",
  "hearing_held",
  "outcome_given",
  "appeal_lodged",
  "appeal_decided",
  "dismissed",
];
const FROM_INVESTIGATION = STAGES.slice(2);
const INVESTIGATION_DONE = STAGES.slice(3);
const FROM_HEARING = STAGES.slice(4);
const PAST_HEARING = STAGES.slice(5);
const AFTER_OUTCOME = STAGES.slice(6);
const APPEAL_STAGES = ["appeal_lodged", "appeal_decided"];

const stageIn = (stages: FactValue[]): Condition => ({ fact: "processStage", in: stages });
const isTrue = (fact: string): Condition => ({ fact, is: true });
const notTrue = (fact: string): Condition => ({ not: { fact, is: true } });

const DISMISSALS = ["dismissal_with_notice", "dismissal_without_notice"];
const SANCTIONS = ["first_written_warning", "final_written_warning", ...DISMISSALS, "other"];
const NON_DISMISSAL_OUTCOMES = ["no_action", "informal", "first_written_warning", "final_written_warning", "other"];

/** Dismissal is on the table. */
const DISMISSAL_POSSIBLE: Condition = {
  any: [
    { fact: "treatedAsGrossMisconduct", in: ["yes", "not_sure"] },
    { fact: "outcome", in: DISMISSALS },
    { fact: "processStage", is: "dismissed" },
    { fact: "liveWarnings", is: "final_written_warning" },
  ],
};

/** Something that may make an act the subject of a discrimination or victimisation claim. */
const RISK: Condition = {
  any: [
    { fact: "pregnancyOrFamilyLeave", is: "yes" },
    isTrue("healthCondition"),
    isTrue("protectedCharacteristic"),
    isTrue("recentComplaint"),
  ],
};

/** An act the employee may complain about to a tribunal (C30, E10). */
const ACT_COMPLAINED_OF: Condition = {
  any: [{ known: "terminationDate" }, { all: [{ fact: "outcome", in: SANCTIONS }, RISK] }],
};

/**
 * Northern Ireland: the statutory dismissal and disciplinary procedure applies
 * to dismissal and to "relevant disciplinary action", a sanction short of
 * dismissal other than a warning or suspension on full pay (C33; SR 2004/521 reg 2).
 */
const NI_SANCTIONS = ["dismissal", "demotion", "unpaid_suspension", "loss_of_pay", "transfer"];
const NI_PROCEDURE_APPLIES: Condition = {
  all: [
    NI,
    {
      any: [DISMISSAL_POSSIBLE, { fact: "sanctionsConsidered", in: NI_SANCTIONS }, { fact: "outcome", is: "other" }],
    },
  ],
};

// United States. The case's state is a code ("IL"); the usState fact may hold a code or a name.
const US_COVERED_STATES = ["CA", "NY", "TX", "FL", "IL", "California", "New York", "Texas", "Florida", "Illinois"];
/** California, New York, Texas, Florida or Illinois: the states DraftHR covers in full. */
const US_COVERED: Condition = {
  all: [US, { any: [{ state: US_COVERED_STATES }, { fact: "usState", in: US_COVERED_STATES }] }],
};
const MONTANA: Condition = { any: [{ state: "MT" }, { fact: "usState", in: ["Montana", "MT"] }] };
const CALIFORNIA: Condition = { any: [{ state: "CA" }, { fact: "usState", in: ["California", "CA"] }] };
/** A US state DraftHR does not cover (C39): the federal baseline only. */
const US_NOT_COVERED: Condition = { all: [US, { not: US_COVERED }, { not: MONTANA }] };

/** The employee has been dismissed (US checks C45 and C46, rules R13 and R14). */
const DISMISSED: Condition = {
  any: [{ fact: "outcome", in: DISMISSALS }, { fact: "processStage", is: "dismissed" }, { known: "terminationDate" }],
};

/** No investigation on record: said not to have happened, or nothing recorded about one. */
const NO_INVESTIGATION_ON_RECORD: Condition = {
  any: [
    { fact: "investigationHeld", is: false },
    { all: [{ not: { known: "investigationHeld" } }, { not: { known: "investigator" } }] },
  ],
};

const HEARING_HELD: Condition = {
  any: [
    { fact: "hearingDate", before: { today: true } },
    { fact: "hearingDate", withinDays: 0 },
    { fact: "processStage", is: "hearing_held" },
  ],
};

const APPEAL_HEARING_HELD: Condition = {
  any: [
    { fact: "appealHearingDate", before: { today: true } },
    { fact: "appealHearingDate", withinDays: 0 },
    { fact: "processStage", is: "appeal_decided" },
  ],
};

/** A written hearing invite exists, sent before DraftHR or drafted here. */
const INVITE_IN_WRITING: Condition = {
  any: [
    { fact: "invitationLetter", is: "in_writing" },
    { drafted: "hearing_invite" },
    { drafted: "hearing_invite_rearranged" },
  ],
};

const INVITE_GAPS_C08 = [
  "allegation_detail",
  "evidence",
  "time_and_place",
  "right_to_be_accompanied",
  "possible_outcomes",
];

const C08_WHEN: Condition = {
  all: [
    UK,
    {
      any: [
        { fact: "inviteGaps", in: INVITE_GAPS_C08 },
        // After a hearing, with no written invite on record (D1, D3).
        { all: [stageIn(PAST_HEARING), { not: INVITE_IN_WRITING }] },
      ],
    },
  ],
};

const C11_WHEN: Condition = {
  all: [
    UK,
    {
      any: [
        { fact: "companionRightOffered", is: false },
        isTrue("companionRefused"),
        { fact: "inviteGaps", is: "right_to_be_accompanied" },
        // After a hearing, with no written invite and no record of the right being offered.
        {
          all: [stageIn(PAST_HEARING), { not: { known: "companionRightOffered" } }, { not: INVITE_IN_WRITING }],
        },
      ],
    },
  ],
};

/**
 * The termination date has passed (or is today) and the date the qualifying
 * period is met (rule use qualifying_service) is still ahead. The Condition
 * language cannot read the rule's `qualifies` detail or compare a fact with a
 * rule's date, so a future termination never fires C22 or C34.
 */
const SHORT_SERVICE: Condition = {
  all: [
    { any: [{ fact: "terminationDate", before: { today: true } }, { fact: "terminationDate", withinDays: 0 }] },
    // "Has a date at all": any date within a hundred years passes.
    { deadline: "qualifying_service", withinDays: 36500 },
    { not: { deadline: "qualifying_service", withinDays: 0 } },
  ],
};

/** 4 December 2026 to 29 January 2027: four weeks either side of 1 January 2027. */
const nearQualifyingChange = (fact: string): Condition => ({ fact, withinDays: 56, from: "2026-12-04" });

const C23_WHEN: Condition = {
  all: [
    GB,
    {
      any: [
        nearQualifyingChange("terminationDate"),
        // No termination date yet: the hearing date stands in for the expected one.
        { all: [{ not: { known: "terminationDate" } }, nearQualifyingChange("hearingDate")] },
        // Service within four weeks of the threshold (relative to today).
        {
          all: [
            { deadline: "qualifying_service", withinDays: 28 },
            { not: { deadline: "qualifying_service", withinDays: -29 } },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Route gates. Part 6 proposes that a letter does not unlock while an act now
// check for that step is open, with an override (a recorded reason) for HR
// and consultants. Soft gates lift when gateOverrideReason is known; hard
// gates (sign-off, a decider named in a complaint, no hearing yet, the NI
// statutory procedure) do not.
// ---------------------------------------------------------------------------

type Gate = { when: Condition; reason: LensText };

const NOT_OVERRIDDEN: Condition = { not: { known: "gateOverrideReason" } };

const CONSULTANT_SIGN_OFF: Gate = {
  when: { all: [{ lens: "consultant" }, { not: { known: "consultantInstructions" } }] },
  reason: "Confirm who at your client instructs you and who will sign the letters first.",
};

const GRIEVANCE_PAUSE: Gate = {
  when: {
    all: [
      isTrue("grievanceDuringProcess"),
      { not: { known: "grievanceHandling" } },
    ],
  },
  reason: {
    hr: "Paused: a grievance has been raised (C15). Record whether to deal with it first or together with the disciplinary.",
    consultant:
      "Paused: a grievance has been raised (C15). Record whether your client will deal with it first or together with the disciplinary.",
  },
};

const GRIEVANCE_HELD: Gate = {
  when: { all: [isTrue("grievanceDuringProcess"), { fact: "grievanceHandling", is: "pause_until_grievance_decided" }] },
  reason: {
    hr: "Paused until the grievance is decided. Hear the grievance first, with a manager it does not name.",
    consultant:
      "Paused until the grievance is decided. Your client should hear the grievance first, with a manager it does not name.",
  },
};

const DECIDER_NAMED: Gate = {
  when: isTrue("decisionMakerLinkToComplaint"),
  reason:
    "The person due to decide is named in the employee's complaint or grievance (C16; in the US, C35). Choose someone not named, then update the case.",
};

const PREGNANCY_PAUSE: Gate = {
  when: {
    all: [
      { fact: "pregnancyOrFamilyLeave", is: "yes" },
      { not: { fact: "conductLinkedToPregnancy", is: "no" } },
      NOT_OVERRIDDEN,
    ],
  },
  reason:
    "Paused: check whether the conduct is linked to pregnancy, pregnancy-related illness or leave first (C17).",
};

const HEALTH_PAUSE: Gate = {
  when: { all: [isTrue("healthCondition"), notTrue("adjustmentsAgreed"), NOT_OVERRIDDEN] },
  reason: "Paused until adjustments are agreed or occupational health advice is received (C18).",
};

const NI_PROCEDURE: Gate = {
  when: { all: [NI, { not: INVITE_IN_WRITING }] },
  reason:
    "Northern Ireland statutory dismissal and disciplinary procedure: send a written statement of the allegation, with an invitation, and hold the meeting before any dismissal or sanction short of dismissal other than a warning (C33).",
};

/** US dismissal letter: it must say when final pay will be paid (R13). */
const US_PAYDAY_UNKNOWN: Gate = {
  when: { all: [US, { not: { known: "nextPayday" } }, notTrue("finalPayMade")] },
  reason: "Say when final pay will be paid: give the next regular payday first (R13).",
};

const HEARING_NOT_HELD: Gate = {
  when: { all: [UK, { not: HEARING_HELD }] },
  reason: "Hold the disciplinary hearing first. An outcome letter only follows a hearing.",
};

const NO_INVESTIGATION: Gate = {
  when: { all: [UK, NO_INVESTIGATION_ON_RECORD, NOT_OVERRIDDEN] },
  reason: "No investigation is on record (C05). Investigate first, even where gross misconduct is alleged.",
};

const INVITE_DEFECT: Gate = {
  when: {
    all: [UK, { any: [{ fact: "inviteGaps", in: INVITE_GAPS_C08 }, { not: INVITE_IN_WRITING }] }, NOT_OVERRIDDEN],
  },
  reason:
    "The hearing invite is missing or incomplete (C08). Put that right, for example with a fresh hearing, before an outcome.",
};

const COMPANION_DENIED: Gate = {
  when: {
    all: [
      UK,
      {
        any: [
          { fact: "companionRightOffered", is: false },
          isTrue("companionRefused"),
          { fact: "inviteGaps", is: "right_to_be_accompanied" },
        ],
      },
      NOT_OVERRIDDEN,
    ],
  },
  reason: "The right to be accompanied was not offered, or was refused (C11).",
};

const DISMISSAL_NOT_FLAGGED: Gate = {
  when: {
    all: [
      UK,
      { fact: "treatedAsGrossMisconduct", is: "yes" },
      { fact: "inviteGaps", is: "dismissal_possible" },
      NOT_OVERRIDDEN,
    ],
  },
  reason: "The invite did not say that dismissal was a possible outcome (C09).",
};

const OUTCOME_GATES: Gate[] = [
  CONSULTANT_SIGN_OFF,
  GRIEVANCE_PAUSE,
  GRIEVANCE_HELD,
  DECIDER_NAMED,
  PREGNANCY_PAUSE,
  HEALTH_PAUSE,
  HEARING_NOT_HELD,
  NO_INVESTIGATION,
  INVITE_DEFECT,
  COMPANION_DENIED,
];

/** The handbook offers an appeal, or the case is in the UK (US: steps 6 and 7 only if offered). */
const APPEAL_AVAILABLE: Condition = { any: [UK, { fact: "handbookOrContract", is: "offers_appeal" }] };

// ---------------------------------------------------------------------------
// The playbook
// ---------------------------------------------------------------------------

export const disciplinaryPlaybook: Playbook = {
  id: "disciplinary",
  name: "Disciplinary: alleged misconduct, including gross misconduct and suspension",
  version: "0.2",
  status: "draft",

  recognise: {
    phrases: [
      // HR team and consultant
      "gross misconduct",
      "we've suspended him",
      "pending investigation",
      "caught on CCTV",
      "theft",
      "fiddling expenses",
      "fiddling timesheets",
      "fight on shift",
      "drunk at work",
      "abusive to a customer",
      "inappropriate messages",
      "complaint about his comments",
      "breach of policy",
      "data breach",
      "social media post",
      "refused an instruction",
      "disciplinary hearing",
      "final written warning",
      "can we sack them",
      "dismiss on the spot",
      // Employee
      "I've been suspended",
      "I've been accused of",
      "they've called me to a disciplinary",
      "investigation meeting",
      "they say it's gross misconduct",
      "I got a final written warning",
      "I was sacked on the spot",
      "can I bring someone",
      "I want to appeal",
    ],
    notThis: [
      "Told by the person who complained about a colleague: grievance playbook, Employee lens. If HR asks about both sides, run this playbook for the accused and the grievance playbook for the complainant, as two linked cases.",
      "About ability, skill or output, with no wilful fault: capability playbook. Ask: is the concern that they can't do it, or that they won't?",
      "About genuine sickness absence: sickness absence playbook. Unauthorised absence (not calling in, lying about being sick) stays here.",
      "About a role disappearing: redundancy playbook.",
      "A general probation review: the existing probation_outcome letter. A specific misconduct allegation during probation stays here.",
      "About whether someone who reported wrongdoing is protected: whistleblowing playbook.",
      "Both conduct and capability: ask which one the employer intends to act on. Do not run both on the same facts at once.",
      "About a US federal, state or local government employee: out of scope for v0.1. Say so and stop. Federal employees must contact an agency EEO counsellor within 45 days.",
      "About a US state other than California, New York, Texas, Florida, Illinois or Montana: stay in this playbook, show the federal baseline only, and flag that state law is not covered (C39).",
    ],
  },

  facts: [
    // -- 3.1 Setting ---------------------------------------------------------
    {
      key: "workLocation",
      label: "Where the employee works",
      type: "choice",
      choices: ["england", "wales", "scotland", "northern_ireland", "us"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Where does the employee normally work: England, Wales, Scotland, Northern Ireland, or a US state?",
        employee: "Where do you normally work (country, or US state)?",
        consultant:
          "Where does your client's employee normally work: England, Wales, Scotland, Northern Ireland, or a US state?",
      },
      why: "The law, the Code, bank holidays and time limits all depend on it.",
    },
    {
      key: "employeeName",
      label: "Employee's name",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What is the employee's full name?",
        employee: "What name should go on your letters?",
        consultant: "What is the employee's full name, and the name of your client's organisation?",
      },
      why: "Letters need it.",
    },
    {
      key: "consultantInstructions",
      label: "Who instructs and signs at the client",
      type: "text",
      priority: { consultant: "must" },
      question: { consultant: "Who at your client instructs you, and who will sign the letters?" },
      why: "Letters go out in the client's name and the client makes the decisions.",
    },
    {
      key: "employmentStartDate",
      label: "Employment start date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did the employee start? An exact date if you can.",
        employee: "When did you start working there?",
        consultant: "When did the employee start with your client? An exact date if you can.",
      },
      why: "The rules use it for qualifying service and statutory notice.",
    },
    {
      key: "employmentStatus",
      label: "Employment status",
      type: "choice",
      choices: ["employee", "worker", "agency"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is this person an employee, a worker (for example casual or zero hours), or agency staff?",
        employee: "Do you have an employment contract, or are you casual, zero hours or agency?",
        consultant: "Is this person your client's employee, a worker (for example casual or zero hours), or agency staff?",
      },
      why: "The right to be accompanied covers workers; unfair dismissal, and any Acas Code uplift, cover employees only.",
    },
    {
      key: "disciplinaryPolicy",
      label: "Disciplinary policy",
      type: "text",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "Do you have a written disciplinary policy? Please upload it.",
        employee: "Do you have the disciplinary policy or staff handbook? Upload it if you can.",
        consultant: "Does your client have a written disciplinary policy? Please upload it.",
      },
      why: "It sets the steps, the appeal deadline, and whether a companion is allowed at investigation meetings.",
    },
    {
      key: "contractNotice",
      label: "Contractual notice period",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "What notice period does the contract give?",
        employee: "What notice period is in your contract?",
        consultant: "What notice period does your client's contract give?",
      },
      askIf: DISMISSAL_POSSIBLE,
      why: "Needed for dismissal letters and notice pay.",
    },
    {
      key: "employeeIsUnionRep",
      label: "Employee is a union rep",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is the employee a trade union representative?",
        employee: "Are you a union rep?",
        consultant: "Is the employee a trade union representative?",
      },
      // Draft: "if a union is mentioned or recognised". The closest fact is a union rep as companion.
      askIf: { fact: "companion", is: "union_rep" },
      specialCategory: true,
      why: "The Code suggests early discussion with a union official, with the employee's agreement (Code para 30).",
    },

    // -- 3.2 The allegation --------------------------------------------------
    {
      key: "allegationSummary",
      label: "The allegation",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "In a sentence or two, what is the employee alleged to have done?",
        employee: "What are you accused of? Use the wording from any letter.",
        consultant: "In a sentence or two, what is the employee alleged to have done?",
      },
      why: "Letters must set out the allegation clearly enough to prepare (Code para 9).",
    },
    {
      key: "incidentDate",
      label: "Date of the incident",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did it happen? If it happened more than once, give the most recent date.",
        employee: "When is it supposed to have happened? If more than once, give the most recent date.",
        consultant: "When did it happen? If it happened more than once, give the most recent date.",
      },
      why: "Dates go in letters, and delay matters (Code para 5).",
    },
    {
      key: "discoveredDate",
      label: "Date the employer found out",
      type: "date",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "When did the organisation find out?",
        consultant: "When did your client find out?",
      },
      // Draft: only if the incident was more than a few weeks ago. "Weeks before today" cannot be expressed.
      askIf: { known: "incidentDate" },
      why: "Shows whether the employer acted without unreasonable delay.",
    },
    {
      key: "treatedAsGrossMisconduct",
      label: "Treated as gross misconduct",
      type: "choice",
      choices: ["yes", "no", "not_sure"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Are you treating this as possible gross misconduct?",
        employee: "Has anyone said it could be gross misconduct?",
        consultant: "Is your client treating this as possible gross misconduct?",
      },
      why: "Gross misconduct can justify dismissal for a first offence (Code para 23), which changes the letters.",
    },
    // Added for C21.
    {
      key: "grossMisconductInPolicy",
      label: "Policy lists it as gross misconduct",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Does your disciplinary policy list this kind of conduct as gross misconduct?",
        employee: "Does the policy or handbook list this kind of conduct as gross misconduct?",
        consultant: "Does your client's policy list this kind of conduct as gross misconduct?",
      },
      askIf: { fact: "treatedAsGrossMisconduct", in: ["yes", "not_sure"] },
      why: "Rules should say what counts as gross misconduct (Code paras 23 and 24).",
    },
    {
      key: "evidenceHeld",
      label: "Evidence",
      type: "text",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "What evidence do you have, for example CCTV, emails, statements, system records?",
        employee: "Have you been shown any evidence? Do you have anything that supports your side?",
        consultant: "What evidence does your client have, for example CCTV, emails, statements, system records?",
      },
      why: "Evidence should normally go out with the hearing invite (Code para 9).",
    },
    {
      key: "witnesses",
      label: "Witnesses",
      type: "list",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Who saw it or knows about it?",
        employee: "Is there anyone who could support your account?",
        consultant: "Who saw it or knows about it?",
      },
      why: "The employee may call witnesses (Code para 12).",
    },
    {
      key: "othersInvolved",
      label: "Others involved and their treatment",
      type: "choice",
      choices: ["no_one_else", "same_treatment", "different_treatment", "not_known"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Was anyone else involved, and how are they being treated?",
        employee: "Was anyone else involved? Are they being treated the same way?",
        consultant: "Was anyone else involved, and how is your client treating them?",
      },
      why: "Different treatment for the same conduct needs a reason (Acas, deciding the outcome).",
    },
    {
      key: "criminalAspect",
      label: "Possible crime or police involvement",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: "Could this be a crime? Are the police involved?",
      specialCategory: true,
      why: "Criminal matters need care (Code para 31), and the data is criminal offence data.",
    },
    {
      key: "liveWarnings",
      label: "Warnings still in force",
      type: "choice",
      choices: ["none", "first_written_warning", "final_written_warning"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Does the employee have any warnings still in force? Please upload them.",
        employee: "Do you have any warnings that are still in date?",
        consultant: "Does the employee have any warnings still in force? Please upload them.",
      },
      // "Must at outcome": asked before the outcome step.
      askIf: stageIn(["investigation_finished", "hearing_arranged", "hearing_held"]),
      why: "A live final warning changes the outcomes open to the employer.",
    },
    {
      key: "employeeAccount",
      label: "Employee's account",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "What has the employee said about it so far?",
        employee: "In your own words, what happened? Keep to facts; we will help with the wording later.",
        consultant: "What has the employee said about it so far?",
      },
      why: "The employer must hear the employee's side (Code para 12).",
    },

    // -- 3.3 The process so far ----------------------------------------------
    {
      key: "processStage",
      label: "Stage",
      type: "choice",
      choices: STAGES,
      priority: { hr: "must", employee: "must", consultant: "must" },
      question:
        "Where are things now: not started, suspended, investigating, investigation finished, hearing arranged, hearing held, outcome given, appeal lodged, appeal decided, or dismissed?",
      why: "Decides where the route starts.",
    },
    {
      key: "suspended",
      label: "Suspended",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: { hr: "Is the employee suspended?", employee: "Are you suspended?", consultant: "Is the employee suspended?" },
      why: "Triggers the suspension checks and letter.",
    },
    {
      key: "suspensionDate",
      label: "Suspension start date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When did the suspension start?",
        employee: "When were you suspended?",
        consultant: "When did the suspension start?",
      },
      askIf: isTrue("suspended"),
      why: "Feeds the review reminder and length check.",
    },
    {
      key: "suspensionInWriting",
      label: "Suspension confirmed in writing",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Has the suspension been confirmed in writing?",
        employee: "Have you had anything in writing about it?",
        consultant: "Has the suspension been confirmed in writing?",
      },
      askIf: isTrue("suspended"),
      why: "Acas recommends written confirmation.",
    },
    {
      key: "suspensionPay",
      label: "Suspended on full pay",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is the employee on full pay?",
        employee: "Are you being paid in full?",
        consultant: "Is the employee on full pay?",
      },
      askIf: isTrue("suspended"),
      why: "Suspension is normally on full pay.",
    },
    {
      key: "suspensionReason",
      label: "Reason for suspension",
      type: "choice",
      choices: ["protect_evidence_or_witnesses", "risk_to_others", "risk_to_business", "protect_employee", "other"],
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Why was suspension needed: to protect evidence or witnesses, a risk to others, a risk to the business, or to protect the employee?",
        consultant:
          "Why did your client need to suspend: to protect evidence or witnesses, a risk to others, a risk to the business, or to protect the employee?",
      },
      askIf: isTrue("suspended"),
      why: "Acas limits suspension to these purposes.",
    },
    {
      key: "suspensionLastReviewed",
      label: "Suspension last reviewed",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "When was the suspension last reviewed?",
        employee: "Has anyone been in touch since you were suspended? When?",
        consultant: "When was the suspension last reviewed?",
      },
      askIf: isTrue("suspended"),
      why: "Suspension should be kept under review (Code para 8).",
    },
    // Added for C05: "there was no investigation".
    {
      key: "investigationHeld",
      label: "Investigation held",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Was there an investigation before the hearing, such as a fact-finding meeting or gathering statements?",
        employee: "Did anyone investigate before the hearing, for example by meeting you or taking statements?",
        consultant:
          "Did your client investigate before the hearing, for example with a fact-finding meeting or statements?",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING)] },
      why: "Investigate first, even where gross misconduct is alleged (Code para 5).",
    },
    {
      key: "investigator",
      label: "Investigator",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Who is investigating?",
        employee: "Who has been asking you about it?",
        consultant: "Who is investigating for your client?",
      },
      askIf: stageIn(FROM_INVESTIGATION),
      why: "Different people should investigate and decide, where practicable (Code para 6).",
    },
    // Added for C06.
    {
      key: "sanctionAtInvestigationMeeting",
      label: "Sanction given at investigation meeting",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: {
        hr: "Was a warning or other sanction given at the investigation meeting itself?",
        employee: "Were you given a warning or other sanction at the investigation meeting itself?",
        consultant: "Was a warning or other sanction given at the investigation meeting itself?",
      },
      why: "An investigation meeting alone should not lead to disciplinary action (Code para 7).",
    },
    {
      key: "decisionMaker",
      label: "Decision maker",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Who will hold the hearing and decide? Can they dismiss?",
        employee: "Who is holding the hearing?",
        consultant: "Who at your client will hold the hearing and decide? Can they dismiss?",
      },
      askIf: stageIn(FROM_HEARING),
      why: "Code paras 6 and 22.",
    },
    // Added for C07: the Condition language cannot compare two facts.
    {
      key: "investigatorIsDecisionMaker",
      label: "Same person investigates and decides",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is the person deciding the same person who investigated?",
        employee: "Is the person holding the hearing the same person who investigated?",
        consultant: "Is the person deciding the same person who investigated?",
      },
      askIf: { all: [{ known: "investigator" }, { known: "decisionMaker" }] },
      why: "Where practicable, different people should investigate and decide (Code para 6).",
    },
    {
      key: "appealManager",
      label: "Appeal manager",
      type: "text",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Who could hear an appeal who has not been involved so far?",
        consultant: "Who at your client could hear an appeal who has not been involved so far?",
      },
      askIf: stageIn(["hearing_arranged", "hearing_held", "outcome_given", "appeal_lodged", "dismissed"]),
      why: "Code para 27.",
    },
    // Added for C28.
    {
      key: "appealManagerInvolvedEarlier",
      label: "Appeal manager involved earlier",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Has the appeal manager been involved in the case so far?",
      askIf: { known: "appealManager" },
      why: "Where possible, the appeal should be heard by a manager not previously involved (Code para 27).",
    },
    // hearingDetails in the draft is "date + text": the date is its own fact for the rules.
    {
      key: "hearingDate",
      label: "Hearing date",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What date is proposed for the hearing?",
        employee: "What date is the hearing?",
        consultant: "What date is proposed for the hearing?",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING)] },
      why: "Needed for the invite and the postponement rule.",
    },
    {
      key: "hearingDetails",
      label: "Hearing time and place",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What time and place are proposed for the hearing? In person or by video?",
        employee: "What time and where is the hearing? In person or by video?",
        consultant: "What time and place are proposed for the hearing? In person or by video?",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING)] },
      why: "Needed for the invite.",
    },
    {
      key: "invitationLetter",
      label: "Hearing invitation",
      type: "choice",
      choices: ["in_writing", "verbal_only", "none"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Has an invitation to the hearing gone out in writing? Please upload it.",
        employee: "Did you get a letter inviting you to the hearing? Please upload it.",
        consultant: "Has your client sent a written invitation to the hearing? Please upload it.",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING)] },
      why: "Lets us check it against Code paras 9 and 10.",
    },
    // Added for C10.
    {
      key: "inviteReceivedDate",
      label: "Date the invite was received",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "When did the employee receive the invitation?",
        employee: "When did you receive the letter?",
        consultant: "When did the employee receive the invitation?",
      },
      askIf: { fact: "invitationLetter", is: "in_writing" },
      why: "The employee needs reasonable time to prepare (Code para 11).",
    },
    // Added for C08, C09 and C11: what the written invite leaves out. Read from the upload.
    {
      key: "inviteGaps",
      label: "What the invite leaves out",
      type: "list",
      choices: [...INVITE_GAPS_C08, "dismissal_possible"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Which of these does the invitation leave out: the allegation in detail, copies of the evidence, the time and place, the right to be accompanied, the possible outcomes, or (if gross misconduct is alleged) that dismissal is possible? Upload it and we can check.",
        employee:
          "Which of these does the letter leave out: what you are accused of in detail, copies of the evidence, the time and place, your right to be accompanied, the possible outcomes, or that dismissal is possible? Upload it and we can check.",
        consultant:
          "Which of these does the invitation leave out: the allegation in detail, copies of the evidence, the time and place, the right to be accompanied, the possible outcomes, or (if gross misconduct is alleged) that dismissal is possible? Upload it and we can check.",
      },
      askIf: { fact: "invitationLetter", is: "in_writing" },
      why: "The invite must give enough to prepare (Code paras 9 and 10; Acas step 4).",
    },
    // Added for route step 3 (decision after investigation).
    {
      key: "caseToAnswer",
      label: "Case to answer",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Having investigated, is there a case to answer?",
        consultant: "Having investigated, does your client think there is a case to answer?",
      },
      askIf: { fact: "processStage", is: "investigation_finished" },
      why: "Decides between no further action and a disciplinary hearing.",
    },
    {
      key: "companion",
      label: "Companion",
      type: "choice",
      choices: ["colleague", "union_rep", "someone_else", "none"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has the employee asked to bring someone? Who?",
        employee: "Do you want to bring a colleague or union rep? Who?",
        consultant: "Has the employee asked to bring someone? Who?",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING)] },
      why: "Statutory right to be accompanied (ERA 1999 s10).",
    },
    // Added for C11: the right offered where there is no written invite to read.
    {
      key: "companionRightOffered",
      label: "Right to be accompanied offered",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Was the employee told they could bring a colleague or union rep to the hearing?",
        employee: "Were you told you could bring a colleague or union rep?",
        consultant: "Was the employee told they could bring a colleague or union rep to the hearing?",
      },
      askIf: { all: [UK, stageIn(FROM_HEARING), { not: { fact: "invitationLetter", is: "in_writing" } }] },
      why: "A worker has a statutory right to be accompanied at a disciplinary hearing (ERA 1999 s10).",
    },
    // Added for C11.
    {
      key: "companionRefused",
      label: "Companion request refused",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has the request to bring that person been refused?",
        employee: "Has your employer refused to let that person come?",
        consultant: "Has your client refused the request to bring that person?",
      },
      askIf: { fact: "companion", in: ["colleague", "union_rep"] },
      why: "Refusing a colleague or union rep breaches the statutory right (ERA 1999 s10).",
    },
    // companionAlternativeDate in the draft is "unavailable? + date": the yes-no is its own fact.
    {
      key: "companionUnavailable",
      label: "Companion unavailable",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is the companion unable to attend on the date proposed?",
        employee: "Is your companion unable to make that date?",
        consultant: "Is the companion unable to attend on the date proposed?",
      },
      askIf: { fact: "companion", in: ["colleague", "union_rep", "someone_else"] },
      why: "If the companion cannot attend, the employee can propose another time (ERA 1999 s10(4)).",
    },
    {
      key: "companionAlternativeDate",
      label: "Alternative date proposed",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What date has the employee proposed instead?",
        employee: "Which date can your companion do instead?",
        consultant: "What date has the employee proposed instead?",
      },
      askIf: isTrue("companionUnavailable"),
      why: "Feeds the postponement rule.",
    },
    {
      key: "attendanceIssue",
      label: "Unable to attend",
      type: "choice",
      choices: ["no", "off_sick", "other_reason"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Is the employee off sick or saying they cannot attend the hearing?",
        employee: "Are you able to attend the hearing? If not, is that because you are off sick?",
        consultant: "Is the employee off sick or saying they cannot attend the hearing?",
      },
      askIf: stageIn(FROM_HEARING),
      specialCategory: true,
      why: "Acas says rearrange and consider medical advice before going ahead without them.",
    },
    // Added for C33 (NI review D3): the NI statutory procedure covers sanctions short of dismissal too.
    {
      key: "sanctionsConsidered",
      label: "Sanctions being considered",
      type: "list",
      choices: ["dismissal", "demotion", "unpaid_suspension", "loss_of_pay", "transfer", "warning"],
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Which outcomes are you considering: dismissal, demotion, unpaid suspension, loss of pay, a transfer, or a warning?",
        employee: "What has your employer said could happen: dismissal, demotion, unpaid suspension, loss of pay, a transfer, or a warning?",
        consultant:
          "Which outcomes is your client considering: dismissal, demotion, unpaid suspension, loss of pay, a transfer, or a warning?",
      },
      askIf: { all: [NI, stageIn(FROM_HEARING)] },
      why: "In Northern Ireland the statutory procedure applies to dismissal and to sanctions short of it, other than a warning or suspension on full pay.",
    },
    {
      key: "outcome",
      label: "Outcome",
      type: "choice",
      choices: [
        "no_action",
        "informal",
        "first_written_warning",
        "final_written_warning",
        "dismissal_with_notice",
        "dismissal_without_notice",
        "other",
      ],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: { hr: "What was decided?", employee: "What did they decide?", consultant: "What did your client decide?" },
      askIf: stageIn(PAST_HEARING),
      why: "Drives the outcome letter.",
    },
    {
      key: "outcomeDate",
      label: "Date the outcome was given",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When was the employee told?",
        employee: "When were you told?",
        consultant: "When was the employee told?",
      },
      askIf: stageIn(PAST_HEARING),
      why: "Starts the policy appeal window.",
    },
    // Added for step 5d and C26.
    {
      key: "sanctionPermitted",
      label: "Other sanction allowed or agreed",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Does the contract allow this sanction, or has the employee agreed to it?",
        consultant: "Does your client's contract allow this sanction, or has the employee agreed to it?",
      },
      askIf: { fact: "outcome", is: "other" },
      why: "A demotion, transfer or loss of pay needs a contractual right or agreement (Acas step 5).",
    },
    // Added for C27.
    {
      key: "appealRightOffered",
      label: "Right of appeal offered",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Was the employee told they could appeal, and how?",
        employee: "Were you told you could appeal, and by when?",
        consultant: "Was the employee told they could appeal, and how?",
      },
      askIf: { all: [UK, { fact: "outcome", in: SANCTIONS }, notTrue("appealLodged")] },
      why: "The employee should be offered an appeal (Code paras 4, 22 and 26).",
    },
    {
      key: "terminationDate",
      label: "Last day of employment",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What is, or will be, the last day of employment?",
        employee: "What was your last day of employment?",
        consultant: "What is, or will be, the last day of employment?",
      },
      askIf: { any: [{ fact: "outcome", in: DISMISSALS }, { fact: "processStage", is: "dismissed" }] },
      why: "The effective date of termination drives qualifying service and time limits.",
    },
    // Added for R4 (GB review D21, NI review D13): statutory notice is added to the termination
    // date when counting service where employment ended without it (ERA 1996 s97(2); ERO 1996 Art 129(2)).
    {
      key: "endedWithoutStatutoryNotice",
      label: "Ended with less than statutory notice",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Did employment end with less than the statutory minimum notice, for example a dismissal without notice or with pay in lieu of notice?",
        employee:
          "Did your employment end without your full notice being worked, for example a dismissal on the spot or with pay in lieu of notice?",
        consultant:
          "Did employment end with less than the statutory minimum notice, for example a dismissal without notice or with pay in lieu of notice?",
      },
      askIf: { all: [UK, DISMISSED] },
      why: "Where it did, statutory notice is added to the termination date when counting service for unfair dismissal.",
    },
    // Added for R5 (GB review D30, NI review D14): written reasons are automatic for a woman
    // dismissed while pregnant, or on maternity or adoption leave that ends because of the dismissal.
    {
      key: "pregnantOrOnLeaveAtDismissal",
      label: "Pregnant or on maternity or adoption leave when dismissed",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Was the employee pregnant, or on maternity or adoption leave, when dismissed?",
        employee: "Were you pregnant, or on maternity or adoption leave, when you were dismissed? (You can skip this.)",
        consultant: "Was the employee pregnant, or on maternity or adoption leave, when dismissed?",
      },
      askIf: { all: [UK, { fact: "pregnancyOrFamilyLeave", is: "yes" }, DISMISSED] },
      specialCategory: true,
      why: "Written reasons are then given without a request, whatever the length of service.",
    },
    // Added for step 5c (US: only if no written notice) and E8.
    {
      key: "dismissalInWriting",
      label: "Dismissal and reasons in writing",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has the dismissal, with its reasons, been confirmed in writing?",
        employee: "Have you been given the reasons for your dismissal in writing?",
        consultant: "Has your client confirmed the dismissal, with its reasons, in writing?",
      },
      askIf: { known: "terminationDate" },
      why: "Dismissal letters should give reasons; an employee can ask for written reasons (ERA 1996 s92).",
    },
    // appealLodged in the draft is "yes-no + date + document": date and grounds are their own facts.
    {
      key: "appealLodged",
      label: "Appeal lodged",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Has the employee appealed? Please upload it.",
        employee: "Have you appealed yet? If not, what deadline does your letter give for an appeal?",
        consultant: "Has the employee appealed? Please upload it.",
      },
      askIf: {
        any: [{ fact: "outcome", in: SANCTIONS }, stageIn(["appeal_lodged", "appeal_decided", "dismissed"])],
      },
      why: "Unlocks the appeal letters.",
    },
    {
      key: "appealLodgedDate",
      label: "Date of appeal",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: { hr: "When did the employee appeal?", employee: "When did you appeal?", consultant: "When did the employee appeal?" },
      askIf: isTrue("appealLodged"),
      why: "Shows the appeal was made in time under the policy.",
    },
    {
      key: "appealGrounds",
      label: "Grounds of appeal",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "On what grounds has the employee appealed?",
        employee: "What are your grounds of appeal?",
        consultant: "On what grounds has the employee appealed?",
      },
      askIf: isTrue("appealLodged"),
      why: "The appeal invite must address the grounds received.",
    },
    // Added for step 6 and the postponement rule at an appeal hearing.
    {
      key: "appealHearingDate",
      label: "Appeal hearing date",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "What date is proposed for the appeal hearing?",
        employee: "What date is the appeal hearing?",
        consultant: "What date is your client proposing for the appeal hearing?",
      },
      askIf: isTrue("appealLodged"),
      why: "Needed for the appeal invite and the postponement rule (ERA 1999 s13(4)).",
    },
    // Added for step 7.
    {
      key: "appealDecision",
      label: "Appeal decision",
      type: "choice",
      choices: ["original_decision_upheld", "overturned", "different_sanction"],
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "What did the appeal decide: keep the original decision, overturn it, or substitute a different sanction?",
        employee: "What did the appeal decide?",
        consultant:
          "What did your client decide on appeal: keep the original decision, overturn it, or substitute a different sanction?",
      },
      askIf: APPEAL_HEARING_HELD,
      why: "Drives the appeal outcome letter.",
    },

    // -- 3.4 Risk screen -----------------------------------------------------
    {
      key: "recentComplaint",
      label: "Recent complaint or concern",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "In the last year, has the employee raised any complaint or concern, for example about discrimination, harassment, safety, pay or wrongdoing?",
        employee: "Have you raised a complaint or concern at work recently?",
        consultant:
          "In the last year, has the employee raised any complaint or concern with your client, for example about discrimination, harassment, safety, pay or wrongdoing?",
      },
      // US cases ask protectedActivityUS (part 3.5) instead.
      askIf: UK,
      why: "Action soon after a complaint can look like victimisation or whistleblowing detriment.",
    },
    {
      key: "recentComplaintDate",
      label: "Date of the complaint",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "When was the complaint or concern raised?",
        employee: "When did you raise it?",
        consultant: "When was the complaint or concern raised?",
      },
      askIf: isTrue("recentComplaint"),
      why: "Whether it came before the allegation surfaced matters for victimisation and whistleblowing.",
    },
    {
      key: "recentComplaintTopic",
      label: "What the complaint was about",
      type: "choice",
      choices: ["discrimination_or_harassment", "safety", "pay", "wrongdoing", "other"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What was it about: discrimination or harassment, safety, pay, wrongdoing, or something else?",
        employee: "What was it about?",
        consultant: "What was it about: discrimination or harassment, safety, pay, wrongdoing, or something else?",
      },
      askIf: isTrue("recentComplaint"),
      why: "Decides whether victimisation or whistleblowing protection may apply.",
    },
    // Added for the D5 grievance hand-off ("if the complaint was never investigated").
    {
      key: "recentComplaintHandled",
      label: "Complaint looked into",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Was the complaint looked into? What happened?",
        consultant: "Did your client look into the complaint? What happened?",
      },
      askIf: { any: [isTrue("recentComplaint"), isTrue("protectedActivityUS")] },
      why: "A complaint that was never investigated may need its own grievance process.",
    },
    // Part 3.5 (US) fact, also asked in the UK when there is a complaint or grievance (C07, C16).
    // The US draft wording adds "or aware of" the complaint. A question cannot vary by
    // place, and the UK gate DECIDER_NAMED reads "named in", so the UK wording is kept.
    {
      key: "decisionMakerLinkToComplaint",
      label: "Decision maker named in a complaint",
      type: "boolean",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "Is anyone involved in the investigation or the decision named in an earlier complaint or grievance by the employee?",
        employee: "Is anyone investigating or deciding your case named in a complaint or grievance you have made?",
        consultant:
          "Is anyone involved in the investigation or the decision named in an earlier complaint or grievance by the employee?",
      },
      askIf: { any: [US, isTrue("recentComplaint"), isTrue("grievanceDuringProcess")] },
      why: "Retaliation and victimisation risk; the decider should not be someone named in the complaint.",
    },
    {
      key: "grievanceDuringProcess",
      label: "Grievance raised during the process",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Has the employee raised a grievance since this started?",
        employee: "Have you raised, or do you want to raise, a grievance?",
        consultant: "Has the employee raised a grievance since this started?",
      },
      why: "The Code says pause or deal with both together (Code para 46).",
    },
    {
      key: "grievanceDate",
      label: "Date of the grievance",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: { hr: "When was the grievance raised?", employee: "When did you raise it?", consultant: "When was the grievance raised?" },
      askIf: isTrue("grievanceDuringProcess"),
      why: "Shows how the grievance and the disciplinary overlap.",
    },
    {
      key: "grievanceSubject",
      label: "What the grievance is about",
      type: "text",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What is the grievance about?",
        employee: "What is it about?",
        consultant: "What is the grievance about?",
      },
      askIf: isTrue("grievanceDuringProcess"),
      why: "If it is about the investigator or decider, they may need replacing.",
    },
    // Added for the part 7 pause: "until HR records a decision".
    {
      key: "grievanceHandling",
      label: "How the grievance is being handled",
      type: "choice",
      choices: ["pause_until_grievance_decided", "deal_with_together", "grievance_decided"],
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Will you pause the disciplinary until the grievance is decided, or deal with both together? Tell us when the grievance has been decided.",
        consultant:
          "Will your client pause the disciplinary until the grievance is decided, or deal with both together? Tell us when the grievance has been decided.",
      },
      askIf: isTrue("grievanceDuringProcess"),
      why: "The disciplinary pauses until this decision is recorded (Code para 46).",
    },
    {
      key: "pregnancyOrFamilyLeave",
      label: "Pregnancy or family leave",
      type: "choice",
      choices: ["yes", "no", "not_known"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "As far as you know, is the employee pregnant, on family leave, or back from maternity or other family leave?",
        employee: "Are you pregnant, on maternity or other family leave, or back from it? (You can skip this.)",
        consultant:
          "As far as your client knows, is the employee pregnant, on family leave, or back from maternity or other family leave?",
      },
      specialCategory: true,
      why: "Extra legal protection applies, including after a return from maternity leave (Equality Act s18(2), (4)).",
    },
    // Added for the part 7 pregnancy pause ("if the conduct may be linked").
    {
      key: "conductLinkedToPregnancy",
      label: "Conduct linked to pregnancy or leave",
      type: "choice",
      choices: ["yes", "no", "not_sure"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Could any of the conduct be linked to the pregnancy, pregnancy-related illness or leave, for example absences reported as sickness?",
        employee: "Could any of what you are accused of be linked to your pregnancy, pregnancy-related illness or leave?",
        consultant:
          "Could any of the conduct be linked to the pregnancy, pregnancy-related illness or leave, for example absences reported as sickness?",
      },
      askIf: { fact: "pregnancyOrFamilyLeave", is: "yes" },
      specialCategory: true,
      why: "The disciplinary pauses if the conduct may be linked to the pregnancy or leave.",
    },
    {
      key: "healthCondition",
      label: "Health condition",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is there a health condition, including mental health or neurodivergence, that may be linked to what happened or make the process harder? We do not need a diagnosis.",
        employee:
          "Do you have a health condition, including mental health or neurodivergence, that is linked to this or makes the process harder? You do not need to give a diagnosis.",
        consultant:
          "Is there a health condition, including mental health or neurodivergence, that may be linked to what happened or make the process harder? We do not need a diagnosis.",
      },
      specialCategory: true,
      why: "Possible disability: the conduct may arise from it, and adjustments may be needed.",
    },
    {
      key: "adjustmentsRequested",
      label: "Adjustments asked for",
      type: "text",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has the employee asked for any changes to the process, such as breaks, written questions or a different time?",
        employee: "What would help you take part, for example breaks, questions in writing, or a different time?",
        consultant:
          "Has the employee asked for any changes to the process, such as breaks, written questions or a different time?",
      },
      askIf: isTrue("healthCondition"),
      specialCategory: true,
      why: "Duty to make reasonable adjustments.",
    },
    // Added for the part 7 health pause.
    {
      key: "adjustmentsAgreed",
      label: "Adjustments agreed",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Have adjustments been agreed, or occupational health advice received?",
        employee: "Has your employer agreed any changes to the process?",
        consultant: "Has your client agreed adjustments, or received occupational health advice?",
      },
      askIf: isTrue("healthCondition"),
      specialCategory: true,
      why: "The process pauses only until adjustments are agreed or advice is received.",
    },
    // Added for test story 4 (R1 from a refused adjustment).
    {
      key: "adjustmentRefusedDate",
      label: "Date a requested change was refused",
      type: "date",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has a request for changes, such as a postponement, been refused? When?",
        employee: "Has your employer refused a request for changes, such as moving the hearing? When?",
        consultant: "Has your client refused a request for changes, such as a postponement? When?",
      },
      askIf: isTrue("healthCondition"),
      specialCategory: true,
      why: "A refusal may start the time limit for a claim.",
    },
    {
      key: "protectedCharacteristic",
      label: "Protected characteristic relevant",
      type: "boolean",
      priority: { hr: "should", employee: "should", consultant: "should" },
      question: {
        hr: "Has anyone mentioned the employee's age, race, sex, religion, sexuality, disability or similar in connection with this?",
        employee: "Do you think your age, race, sex, religion, sexuality, disability or something similar has played a part?",
        consultant:
          "Has anyone mentioned the employee's age, race, sex, religion, sexuality, disability or similar in connection with this?",
      },
      specialCategory: true,
      why: "Possible discrimination. We ask whether it is relevant, never which characteristic the person has.",
    },
    {
      key: "employeeGoal",
      label: "What the employee wants",
      type: "choice",
      choices: ["keep_job", "clear_name", "agree_exit", "leave", "not_sure"],
      priority: { employee: "must" },
      question: { employee: "What would you like to happen: keep my job, clear my name, agree an exit, leave, or not sure?" },
      why: "Shapes the Employee route.",
    },
    {
      key: "lettersSoFar",
      label: "Letters so far",
      type: "text",
      priority: { hr: "should", employee: "must", consultant: "should" },
      question: {
        hr: "Please upload any letters already sent about this.",
        employee: "Please upload any letters or emails you have received about this.",
        consultant: "Please upload any letters your client has already sent about this.",
      },
      why: "Lets us check what has already happened.",
    },

    // -- Added for the route branches, hand-offs and rules ---------------------
    {
      key: "gateOverrideReason",
      label: "Reason for going ahead despite a check",
      type: "text",
      priority: { hr: "nice", consultant: "nice" },
      question: {
        hr: "Why do you want to go ahead while an act now check is open? The letter will carry the legal review badge.",
        consultant:
          "Why does your client want to go ahead while an act now check is open? The letter will carry the legal review badge.",
      },
      why: "Gate rule (proposed): going ahead needs a recorded reason.",
    },
    {
      key: "writtenReasonsRequestDate",
      label: "Date written reasons were requested",
      type: "date",
      priority: { hr: "nice", employee: "should", consultant: "nice" },
      question: {
        hr: "When did the employee ask for written reasons for the dismissal?",
        employee: "When did you ask for written reasons for your dismissal?",
        consultant: "When did the employee ask for written reasons for the dismissal?",
      },
      askIf: { drafted: "e_written_reasons" },
      why: "Written reasons are due within 14 days of a request (ERA 1996 s92).",
    },
    {
      key: "acasNotifiedDate",
      label: "Date Acas or the LRA was notified",
      type: "date",
      priority: { hr: "nice", employee: "should", consultant: "nice" },
      question: {
        hr: "When did the employee notify Acas (or the LRA in Northern Ireland)?",
        employee: "When did you notify Acas (or the LRA in Northern Ireland)?",
        consultant: "When did the employee notify Acas (or the LRA in Northern Ireland)?",
      },
      askIf: { any: [{ drafted: "e_acas_notification" }, { drafted: "e_lra_notification" }] },
      why: "Early conciliation can extend the time limit.",
    },
    {
      key: "acasCertificateDate",
      label: "Date the conciliation certificate arrived",
      type: "date",
      priority: { hr: "nice", employee: "should", consultant: "nice" },
      question: {
        hr: "When did the employee receive the early conciliation certificate?",
        employee: "When did you receive the early conciliation certificate?",
        consultant: "When did the employee receive the early conciliation certificate?",
      },
      askIf: { known: "acasNotifiedDate" },
      why: "No claim can be made without a certificate.",
    },
    {
      key: "exitBeingDiscussed",
      label: "Exit or settlement being discussed",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: {
        hr: "Is an exit or settlement being discussed?",
        employee: "Has your employer offered, or are you discussing, an exit or settlement?",
        consultant: "Is your client discussing an exit or settlement?",
      },
      why: "Settlement letters are kept apart from the disciplinary letters.",
    },
    {
      key: "referenceRequested",
      label: "Reference requested",
      type: "boolean",
      priority: { hr: "nice", consultant: "nice" },
      question: "Has anyone asked for a reference for the employee?",
      why: "References are fact-only by default.",
    },
    {
      key: "employeeResigned",
      label: "Employee resigned",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: {
        hr: "Has the employee resigned during the process?",
        employee: "Have you resigned?",
        consultant: "Has the employee resigned during the process?",
      },
      why: "The process stops; it may be completed or closed by policy.",
    },
    {
      key: "redundancyProposed",
      label: "Redundancy proposed",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Is a redundancy being proposed that could affect this role?",
      why: "Redundancy and disciplinary processes stay separate.",
    },
    {
      key: "capabilityConcern",
      label: "Really a capability concern",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Is the concern really that they can't do it, rather than that they won't?",
      why: "Ability, not conduct, belongs in the capability playbook.",
    },
    {
      key: "sicknessAbsence",
      label: "Genuine sickness absence",
      type: "boolean",
      priority: { hr: "nice", employee: "nice", consultant: "nice" },
      question: "Was the absence genuine sickness?",
      specialCategory: true,
      why: "Genuine sickness absence belongs in the sickness absence playbook.",
    },
    {
      key: "wantsOwnRecords",
      label: "Wants their records",
      type: "boolean",
      priority: { employee: "nice" },
      question: { employee: "Do you want copies of the documents your employer holds about you?" },
      why: "A subject access request can be made at any stage.",
    },
    // -- 3.5 United States ------------------------------------------------------
    // Asked of the HR team and consultant. Facts the employee route (6.2a) reads
    // also have an employee question.
    {
      key: "usState",
      label: "US state",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: "Which state does the employee work in? If they work remotely, which state do they work from?",
      askIf: US,
      why: "Sets the state agency and its deadline, final pay timing, the notices due at separation, and whether the EEOC deadline is 180 or 300 days. Montana is not at-will after probation. DraftHR covers California, New York, Texas, Florida and Illinois in full; other states get the federal baseline only.",
    },
    {
      key: "publicEmployer",
      label: "Government employer",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Is the employer a federal, state or local government body?",
        consultant: "Is your client a federal, state or local government body?",
      },
      askIf: US,
      why: "Government employers follow different rules and are out of scope for v0.1.",
    },
    {
      key: "usEmployerHeadcount",
      label: "US employer headcount",
      type: "choice",
      // Bands as the rules read them (lower bound first).
      choices: ["1 to 4", "5 to 14", "15 to 19", "20 to 49", "50 or more"],
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Roughly how many employees does the employer have in total, counting part-time staff? Has it had at least that many for 20 weeks this year or last year?",
        consultant:
          "Roughly how many employees does your client have in total, counting part-time staff? Has it had at least that many for 20 weeks this year or last year?",
      },
      askIf: US,
      why: "Federal laws apply only above a size: Title VII, the ADA and the PWFA from 15, the ADEA from 20, the FMLA from 50. State laws reach smaller employers (shared table T1).",
    },
    {
      key: "handbookOrContract",
      label: "Handbook, contract or union agreement",
      type: "list",
      choices: ["promises_process", "for_cause", "union_agreement", "offers_appeal", "disclaims_contract", "none"],
      priority: { hr: "must", consultant: "must" },
      question:
        "Is there a handbook, contract or union agreement that promises a disciplinary process, an appeal, or dismissal only \"for cause\"? Does the handbook say it is not a contract? Please upload it.",
      askIf: US,
      why: "At-will employment has exceptions: signed contracts, union agreements and, in some states, clear handbook promises. Montana needs good cause after probation.",
    },
    {
      key: "unionRepresented",
      label: "Covered by a union agreement",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: "Is the employee covered by a union agreement?",
      askIf: US,
      why: "The agreement usually sets the process. A union-represented employee may ask for a union representative at an investigatory interview.",
    },
    {
      key: "employeeIsSupervisor",
      label: "Employee is a supervisor",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Can the employee hire, discipline, assign or direct others using their own judgement?",
      askIf: US,
      why: "Supervisors are outside the National Labor Relations Act.",
    },
    {
      key: "concertedActivity",
      label: "Acting with or for co-workers",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question:
        "Does the conduct involve the employee acting with or for co-workers about pay, hours or conditions, for example a group complaint, a petition, or posts about pay?",
      askIf: US,
      why: "Protected concerted activity covers non-union employees too. Discipline for it is unlawful unless protection was lost.",
    },
    {
      key: "concertedActivityDetail",
      label: "What the co-worker activity was",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: "What did the employee do with or for co-workers, and when?",
      askIf: { all: [US, isTrue("concertedActivity")] },
      why: "Protection can be lost by egregiously offensive or knowingly and maliciously false statements.",
    },
    {
      key: "protectedActivityUS",
      label: "Protected activity in the last year",
      type: "boolean",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "In the last year, has the employee complained about discrimination or harassment, been a witness in an investigation, asked for a disability, pregnancy or religious accommodation, asked for or taken family or medical leave, asked about pay, or reported a breach of the law?",
        employee:
          "In the last year, have you complained about discrimination or harassment, been a witness in an investigation, asked for a disability, pregnancy or religious accommodation, asked for or taken family or medical leave, asked about pay, or reported a breach of the law?",
        consultant:
          "In the last year, has the employee complained to your client about discrimination or harassment, been a witness in an investigation, asked for a disability, pregnancy or religious accommodation, asked for or taken family or medical leave, asked about pay, or reported a breach of the law?",
      },
      askIf: US,
      why: "Action after protected activity can be retaliation, the most common US claim. California presumes retaliation for some activity within 90 days.",
    },
    {
      key: "protectedActivityDate",
      label: "Date of the protected activity",
      type: "date",
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: { hr: "When was that?", employee: "When was that?", consultant: "When was that?" },
      askIf: { all: [US, isTrue("protectedActivityUS")] },
      why: "How close the activity is to the action matters for retaliation; California presumes it within 90 days.",
    },
    {
      key: "protectedActivityKind",
      label: "Kind of protected activity",
      type: "list",
      choices: [
        "discrimination_complaint",
        "witness",
        "accommodation_request",
        "family_medical_leave",
        "pay_question",
        "law_breach_report",
      ],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "What was it: a discrimination or harassment complaint, being a witness, an accommodation request, family or medical leave, a question about pay, or a report of a breach of the law?",
        employee:
          "What was it: a discrimination or harassment complaint, being a witness, an accommodation request, family or medical leave, a question about pay, or a report of a breach of the law?",
        consultant:
          "What was it: a discrimination or harassment complaint, being a witness, an accommodation request, family or medical leave, a question about pay, or a report of a breach of the law?",
      },
      askIf: { all: [US, isTrue("protectedActivityUS")] },
      why: "Decides which retaliation law applies.",
    },
    {
      key: "protectedActivityRecipient",
      label: "Who the activity was raised with",
      type: "text",
      priority: { hr: "should", consultant: "should" },
      question: "To whom was it raised?",
      askIf: { all: [US, isTrue("protectedActivityUS")] },
      why: "Shows who knew of it, which matters for retaliation.",
    },
    {
      key: "healthPregnancyLeaveLink",
      label: "Linked to health, pregnancy or leave",
      type: "choice",
      choices: ["health", "pregnancy", "leave", "none", "not_known"],
      priority: { hr: "must", employee: "must", consultant: "must" },
      question: {
        hr: "Is the conduct linked to a health condition, pregnancy or a period of leave? We do not need a diagnosis.",
        employee:
          "Is what you are accused of linked to a health condition, pregnancy or a period of leave? You do not need to give a diagnosis. (You can skip this.)",
        consultant:
          "Is the conduct linked to a health condition, pregnancy or a period of leave? We do not need a diagnosis.",
      },
      askIf: US,
      specialCategory: true,
      why: "Disability, pregnancy and leave laws limit what the employer may do.",
    },
    {
      key: "ageFortyPlus",
      label: "Employee is 40 or over",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: "Is the employee 40 or over?",
      askIf: US,
      why: "Age is protected from 40. A release of age claims needs special terms.",
    },
    // Not in part 3.5: the basis input for R10 and R12 (age, sexual harassment and
    // disability change the dates or the employer size). One main basis, as the rules read one.
    {
      key: "usClaimBasis",
      label: "Main basis of a possible claim",
      type: "choice",
      choices: [
        "age",
        "race",
        "sex",
        "sexual_harassment",
        "disability",
        "religion",
        "national_origin",
        "pregnancy",
        "retaliation",
      ],
      priority: { hr: "should", consultant: "should" },
      question:
        "If the employee were to complain to the EEOC or a state agency, what would it mainly be about: age, race, sex, sexual harassment, disability, religion, national origin, pregnancy, or retaliation?",
      askIf: { all: [US, { any: [isTrue("protectedActivityUS"), isTrue("protectedCharacteristic"), isTrue("lawyerOrAgency")] }] },
      why: "The EEOC and state agency deadlines and employer size limits differ for age, sexual harassment and disability.",
    },
    {
      key: "nextPayday",
      label: "Next regular payday",
      type: "date",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "When is the next regular payday after the last day of work?",
        employee: "When is the next regular payday after your last day of work?",
        consultant: "When is your client's next regular payday after the last day of work?",
      },
      askIf: { all: [US, DISMISSED] },
      why: "Final pay timing depends on the state.",
    },
    {
      key: "payFrequency",
      label: "How often staff are paid",
      type: "choice",
      choices: ["weekly", "every_two_weeks", "twice_a_month", "monthly"],
      priority: { hr: "must", consultant: "must" },
      question: "How often are staff paid?",
      askIf: { all: [US, DISMISSED] },
      why: "Final pay timing depends on the state.",
    },
    // Not in part 3.5: C45 and the US-E6 final pay request need to know whether final pay was made.
    {
      key: "finalPayMade",
      label: "Final pay made",
      type: "boolean",
      priority: { hr: "must", employee: "should", consultant: "must" },
      question: {
        hr: "Has final pay been made, including any earned vacation pay the state requires?",
        employee: "Have you received your final pay?",
        consultant: "Has your client made final pay, including any earned vacation pay the state requires?",
      },
      askIf: { all: [US, DISMISSED] },
      why: "Late final pay can carry a penalty; California's is up to 30 days' wages.",
    },
    // Not in part 3.5: C46 fires until the state's separation notice is confirmed.
    {
      key: "separationNoticesGiven",
      label: "Separation notices given",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Has the employee been given the state's separation notices, for example the unemployment insurance notice (in Illinois, the IDES pamphlet)?",
        consultant:
          "Has your client given the employee the state's separation notices, for example the unemployment insurance notice (in Illinois, the IDES pamphlet)?",
      },
      askIf: { all: [US, DISMISSED] },
      why: "Each state sets notices due at separation, some within days (R14).",
    },
    {
      key: "releaseOffered",
      label: "Severance for a release",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question: {
        hr: "Are you thinking of offering severance in return for a release of claims?",
        consultant: "Is your client thinking of offering severance in return for a release of claims?",
      },
      askIf: US,
      why: "Federal and state rules apply to the agreement.",
    },
    // Not in part 3.5: for R15 (OWBPA periods) when a release is offered to someone 40 or over.
    {
      key: "releaseGivenDate",
      label: "Date the release was given",
      type: "date",
      priority: { hr: "nice", consultant: "nice" },
      question: "When was the release agreement given to the employee?",
      askIf: { all: [US, isTrue("releaseOffered")] },
      why: "Starts the 21-day consideration period for a release of age claims.",
    },
    {
      key: "releaseSignedDate",
      label: "Date the release was signed",
      type: "date",
      priority: { hr: "nice", consultant: "nice" },
      question: "When did the employee sign the release?",
      askIf: { all: [US, isTrue("releaseOffered"), { known: "releaseGivenDate" }] },
      why: "Starts the 7-day revocation period, which cannot be shortened.",
    },
    {
      key: "lawyerOrAgency",
      label: "Lawyer's letter or agency charge",
      type: "boolean",
      priority: { hr: "must", consultant: "must" },
      question: {
        hr: "Has the employee, or a lawyer for them, written to you, or filed with the EEOC or a state agency? Please upload it.",
        consultant:
          "Has the employee, or a lawyer for them, written to your client, or filed with the EEOC or a state agency? Please upload it.",
      },
      askIf: US,
      why: "Records must be kept; involve counsel before writing further.",
    },
    // Not in part 3.5: C44 (a blanket instruction not to discuss the case, pay or conditions).
    {
      key: "confidentialityInstruction",
      label: "Instruction not to discuss",
      type: "boolean",
      priority: { hr: "should", consultant: "should" },
      question:
        "Does the investigation invite, or a handbook rule, tell staff not to discuss the investigation, their pay or their conditions?",
      askIf: US,
      why: "A blanket rule may be unlawful for staff covered by the National Labor Relations Act.",
    },
  ],

  checks: [
    // -- 4.1 Great Britain. A check with a Northern Ireland line has an NI entry (id plus "NI")
    // next to it; the others also run in Northern Ireland, where the LRA Code is similar (C32).
    {
      id: "C01",
      level: "worth_checking",
      when: { all: [UK, isTrue("suspended"), { fact: "suspensionInWriting", is: false }] },
      message: {
        hr: "The suspension has not been confirmed in writing. There is no legal requirement, but Acas recommends it to avoid misunderstandings. We can draft it now.",
        employee: "You can ask for written confirmation of the reason for your suspension, your pay and who to contact.",
        consultant:
          "The suspension has not been confirmed in writing. There is no legal requirement, but Acas recommends it to avoid misunderstandings. We can draft it for your client now.",
      },
      sources: ["Acas, suspension process"],
    },
    {
      id: "C02",
      level: "act_now",
      when: { all: [UK, isTrue("suspended"), { fact: "suspensionPay", is: false }] },
      message: {
        hr: "Suspension is normally on full pay. Unpaid suspension needs a contractual right and must still be reasonable; otherwise there may be an unlawful deduction from wages claim.",
        employee:
          "Suspension is normally on full pay. Unless your contract allows unpaid suspension and it is reasonable, stopping your pay may be an unlawful deduction from wages.",
      },
      sources: ["gov.uk, suspension from work", "Code para 8"],
    },
    {
      id: "C03",
      level: "worth_checking",
      when: { all: [UK, isTrue("suspended"), { deadline: "suspension_review", withinDays: 0 }] },
      message: {
        hr: "The suspension is past its review date. Suspension should be as brief as possible and kept under review. Long suspensions risk the employee's health and trust.",
        employee:
          "Suspension should be as brief as possible and kept under review. You can ask when it will be reviewed and how long it is expected to last.",
      },
      sources: ["Code para 8", "Acas, suspension process", "R11"],
      // The review interval is open question 3.
      toVerify: true,
      proposal: true,
    },
    {
      id: "C04",
      level: "worth_checking",
      when: {
        all: [
          UK,
          { lens: ["hr", "consultant"] },
          isTrue("suspended"),
          { any: [{ not: { known: "suspensionReason" } }, { fact: "suspensionReason", is: "other" }] },
        ],
      },
      message:
        "Suspension should not be automatic. Consider alternatives such as different duties, site, shift or customers. [Draft Code para 28 narrows the grounds further.]",
      sources: ["Acas, deciding to suspend", "Draft Code para 28"],
    },
    {
      id: "C05",
      level: "act_now",
      when: { all: [UK, stageIn(FROM_HEARING), NO_INVESTIGATION_ON_RECORD] },
      message: {
        hr: "No investigation is on record before this hearing or outcome. Investigate first, even where gross misconduct is alleged.",
        employee:
          "There should be an investigation before a disciplinary hearing, even where gross misconduct is alleged. If there was none, you can say so in writing.",
      },
      sources: ["Code para 5", "Acas step 1"],
    },
    {
      id: "C06",
      level: "act_now",
      when: { all: [UK, isTrue("sanctionAtInvestigationMeeting")] },
      message: {
        hr: "An investigatory meeting alone should not lead to disciplinary action. Hold a disciplinary hearing first.",
        employee:
          "An investigation meeting alone should not lead to a warning or other sanction. You can challenge it in writing or on appeal.",
      },
      sources: ["Code para 7"],
    },
    {
      id: "C07",
      level: "worth_checking",
      when: { all: [UK, isTrue("investigatorIsDecisionMaker"), notTrue("decisionMakerLinkToComplaint")] },
      message: {
        hr: "Where practicable, different people should investigate and decide. If the organisation is too small, record why.",
        employee: "Where practicable, different people should investigate and decide. You can ask for someone else to chair the hearing.",
      },
      sources: ["Code paras 3 and 6"],
      // Level and wording for a very small employer: open question 5.
      toVerify: true,
    },
    // C07 raised to act now when the same person is named in a complaint or grievance (C15 or C16).
    {
      id: "C07A",
      level: "act_now",
      when: {
        all: [
          UK,
          isTrue("investigatorIsDecisionMaker"),
          isTrue("decisionMakerLinkToComplaint"),
          { any: [isTrue("grievanceDuringProcess"), isTrue("recentComplaint")] },
        ],
      },
      message: {
        hr: "The same person investigated and is due to decide, and they are named in the employee's complaint or grievance. Use a different decision maker, and consider whether the investigation needs an independent review.",
        employee:
          "The same person investigated and is due to decide, and they are named in your complaint or grievance. You can ask in writing for someone else to hear the case.",
      },
      sources: ["Code paras 3 and 6", "Code para 46"],
      toVerify: true,
    },
    {
      id: "C08",
      level: "act_now",
      when: C08_WHEN,
      message: {
        hr: "The hearing invite is missing or incomplete. It should give the allegation in enough detail to prepare, normally with copies of the evidence, the time and place, the right to be accompanied, and the possible outcomes.",
        employee:
          "The invite should tell you what you are accused of in enough detail to prepare, normally with copies of the evidence, the time and place, your right to be accompanied, and the possible outcomes. You can ask for anything missing.",
      },
      sources: ["Code paras 9 and 10", "Acas step 4"],
    },
    {
      id: "C09",
      level: "act_now",
      when: { all: [UK, { fact: "treatedAsGrossMisconduct", is: "yes" }, { fact: "inviteGaps", is: "dismissal_possible" }] },
      message: {
        hr: "Gross misconduct is alleged but the invite does not say dismissal is possible. Say clearly that dismissal is a possible outcome.",
        employee:
          "Gross misconduct is alleged, but the letter does not say clearly that dismissal is a possible outcome. You can ask them to confirm the possible outcomes.",
      },
      sources: ["Acas step 4 (the possible outcomes)"],
    },
    // Threshold is open question 4 (suggested: fewer than three working days). The Condition
    // language has no working days, so 5 calendar days or fewer stands in; it can over-fire.
    {
      id: "C10",
      level: "worth_checking",
      when: { all: [UK, { fact: "hearingDate", withinDays: 5, from: { fact: "inviteReceivedDate" } }] },
      message: {
        hr: "The employee may not have had reasonable time to prepare. Allow reasonable time between the invite and the hearing.",
        employee: "You may not have had reasonable time to prepare. You can ask for more time.",
      },
      sources: ["Code para 11"],
      toVerify: true,
      proposal: true,
    },
    {
      id: "C11",
      level: "act_now",
      when: { all: [GB, C11_WHEN] },
      message: {
        hr: "A worker has a statutory right to one companion at a disciplinary or appeal hearing. A tribunal can award up to two weeks' pay (subject to the weekly pay cap). The weekly pay cap comes from the dated rules table (£751 for failures on or after 6 April 2026). Make sure the right was offered and not refused.",
        employee: "You are entitled to bring a colleague or union rep to a disciplinary or appeal hearing.",
      },
      sources: [
        "ERA 1999 ss10, 11, 13(4)",
        "Code paras 13, 14, 28",
        "Employment Rights (Increase of Limits) Order 2026 (SI 2026/310)",
      ],
    },
    // C11, Northern Ireland line. The choice of companion is open question 11.
    {
      id: "C11NI",
      level: "act_now",
      when: { all: [NI, C11_WHEN] },
      message: {
        hr: "A worker has a statutory right to one companion at a disciplinary or appeal hearing. A tribunal can award up to two weeks' pay, each week capped at £783 for a failure on or after 6 April 2026. A claim must be made within three months of the failure, after LRA early conciliation. DraftHR treats any companion in the Art 12(3) categories as permitted; whether an employer may refuse one as an unreasonable choice (LRA Code para 103) is not settled. Make sure the right was offered and not refused.",
        employee:
          "You are entitled to bring a colleague or union rep to a disciplinary or appeal hearing. If the right is refused, you can complain to a tribunal within three months, after LRA early conciliation.",
      },
      sources: ["ER(NI)O 1999 Arts 12 and 13", "LRA Code para 103"],
      toVerify: true,
    },
    {
      id: "C12",
      level: "act_now",
      when: { all: [UK, isTrue("companionUnavailable"), { known: "companionAlternativeDate" }] },
      message: {
        hr: "If the alternative date is reasonable and falls within the window the rules give, the employer must postpone to it. [Draft Code para 86 adds that a longer postponement may be reasonable, especially where dismissal is possible.]",
        employee:
          "If your companion cannot make the date, you can propose another time. If it is reasonable and within the window shown, your employer must move the hearing to it.",
      },
      sources: ["ERA 1999 s10(4), (5)", "Code para 16", "Draft Code para 86"],
    },
    {
      id: "C13",
      level: "for_information",
      when: { all: [UK, { fact: "companion", is: "someone_else" }] },
      message: {
        hr: "There is no statutory right to this companion. Check the policy, and consider allowing it as a reasonable adjustment if there is a health condition.",
        employee:
          "There is no legal right to bring a relative, friend or lawyer, but the policy may allow it, and it can be a reasonable adjustment if you have a health condition.",
      },
      sources: ["ERA 1999 s10(3)", "Draft Code paras 81 and 82"],
      // Allowing this companion as a reasonable adjustment is open question 17.
      toVerify: true,
    },
    {
      id: "C14",
      level: "worth_checking",
      when: { all: [GB, { fact: "attendanceIssue", in: ["off_sick", "other_reason"] }] },
      message: {
        hr: "Rearrange first and consider a medical opinion (with consent). If going ahead without the employee, tell them and accept a written statement. The five-day postponement rule only covers companion unavailability.",
        employee:
          "If you cannot attend, tell your employer in writing and ask for the hearing to be rearranged. They should consider medical advice before going ahead without you, and you can send a written statement. The five-day postponement rule only covers your companion being unavailable.",
      },
      sources: ["Acas step 4", "Code para 25"],
    },
    // C14, Northern Ireland line.
    {
      id: "C14NI",
      level: "worth_checking",
      when: { all: [NI, { fact: "attendanceIssue", in: ["off_sick", "other_reason"] }] },
      message: {
        hr: "Rearrange first and consider a medical opinion (with consent). If going ahead without the employee, tell them and accept a written statement. The five-day postponement rule only covers companion unavailability. If the employee or their companion cannot attend a statutory procedure meeting for a reason that was not foreseeable, invite them again. After two such meetings the duty ends. Missing a meeting without good reason can end the procedure and reduce compensation.",
        employee:
          "If you cannot attend, tell your employer in writing and ask for the meeting to be rearranged. They should consider medical advice before going ahead without you, and you can send a written statement. If you or your companion cannot attend a meeting under the statutory procedure for a reason you could not foresee, your employer must invite you again, up to two meetings. Missing a meeting without good reason can end the procedure and reduce compensation.",
      },
      sources: ["SR 2004/521 reg 13", "LRA Code para 36"],
    },
    {
      id: "C15",
      level: "act_now",
      when: { all: [UK, isTrue("grievanceDuringProcess"), { not: { known: "grievanceHandling" } }] },
      message: {
        hr: "Decide whether to pause the disciplinary to deal with the grievance, or deal with both together if they are related. See the grievance playbook.",
        employee:
          "Your employer should decide whether to pause the disciplinary to deal with your grievance, or deal with both together if they are related.",
      },
      sources: ["Code para 46"],
    },
    {
      id: "C16",
      level: "act_now",
      when: { all: [GB, isTrue("recentComplaint")] },
      message: {
        hr: "Possible victimisation (if the complaint alleged discrimination or harassment) or whistleblowing protection (if it reported wrongdoing; protection for disclosures about sexual harassment was strengthened from 6 April 2026). Keep the processes separate, use a decider not named in the complaint, and record the reasons for each decision.",
        employee:
          "Being disciplined soon after raising a complaint can be victimisation (if you complained about discrimination or harassment) or whistleblowing detriment (if you reported wrongdoing). Note the dates and keep copies of what you raised.",
      },
      sources: ["Equality Act s27", "ERA 1996 ss43B(1)(da), 47B and 103A", "gov.uk ERA 2025 timeline"],
    },
    // C16, Northern Ireland line: no 6 April 2026 change; NI law for disclosures and victimisation.
    {
      id: "C16NI",
      level: "act_now",
      when: { all: [NI, isTrue("recentComplaint")] },
      message: {
        hr: "Possible victimisation (if the complaint alleged discrimination or harassment) or whistleblowing protection (if it reported wrongdoing). A disclosure is protected only if it falls within ERO 1996 Art 67B and is made in the public interest. Victimisation is under the NI equality Orders, not the Equality Act. Keep the processes separate, use a decider not named in the complaint, and record the reasons for each decision.",
        employee:
          "Being disciplined soon after raising a complaint can be victimisation (if you complained about discrimination or harassment) or whistleblowing detriment (if you reported wrongdoing in the public interest). Note the dates and keep copies of what you raised.",
      },
      sources: ["ERO 1996 Art 67B", "ERO 1996 Art 140(3)(ee)"],
    },
    {
      id: "C17",
      level: "act_now",
      when: { all: [GB, { fact: "pregnancyOrFamilyLeave", is: "yes" }] },
      message: {
        hr: "Check whether anything in the allegation is linked to pregnancy, pregnancy-related illness or maternity leave. Unfavourable treatment because of the pregnancy, during or after the protected period, or because she is taking or has taken maternity leave, is discrimination. Dismissal for a reason connected with pregnancy, childbirth, maternity or family leave needs no qualifying service. A woman dismissed while pregnant, or whose maternity leave ends because of the dismissal, gets written reasons without asking.",
        employee:
          "If anything you are accused of is linked to your pregnancy, pregnancy-related illness or maternity leave, treating you unfavourably because of the pregnancy, during or after the protected period, or because you are taking or have taken maternity leave, is discrimination. A dismissal for a reason connected with pregnancy, childbirth, maternity or family leave needs no minimum service. If you are dismissed while pregnant, or your maternity leave ends because of the dismissal, you get written reasons without asking.",
      },
      sources: ["Equality Act s18(2), (4) and (7)", "ERA 1996 ss99, 108(3)(b) and 92(4)"],
    },
    // C17, Northern Ireland line.
    {
      id: "C17NI",
      level: "act_now",
      when: { all: [NI, { fact: "pregnancyOrFamilyLeave", is: "yes" }] },
      message: {
        hr: "Check whether anything in the allegation is linked to pregnancy, pregnancy-related illness or maternity leave. The Sex Discrimination (NI) Order 1976 treats pregnancy-related illness as pregnancy. A dismissal for a reason connected with pregnancy or maternity leave is automatically unfair whatever the service. Written reasons are automatic for a woman dismissed while pregnant, or during maternity or adoption leave that ends because of the dismissal.",
        employee:
          "If anything you are accused of is linked to your pregnancy, pregnancy-related illness or maternity leave, treating you unfavourably because of it is discrimination; illness related to pregnancy counts as pregnancy. A dismissal for a reason connected with pregnancy or maternity leave is automatically unfair, whatever your length of service. If you are dismissed while pregnant, or during maternity or adoption leave that ends because of the dismissal, you get written reasons without asking.",
      },
      sources: ["SDO 1976 Art 5A", "ERO 1996 Art 131 and Art 140(3)(b)", "ERO 1996 Art 124(4)"],
    },
    {
      id: "C18",
      level: "act_now",
      when: { all: [GB, isTrue("healthCondition")] },
      message: {
        hr: "Possible disability. Ask whether the conduct arises from the condition, and what adjustments the process needs. Consider an occupational health referral.",
        employee:
          "Your condition may count as a disability. If what happened is linked to it, or you need changes to take part, your employer must consider reasonable adjustments. You can ask for them in writing.",
      },
      sources: ["Equality Act ss15 and 20", "Draft Code para 14"],
    },
    // C18, Northern Ireland line: the DDA 1995 as it applies in NI, with no "arises from" test.
    {
      id: "C18NI",
      level: "act_now",
      when: { all: [NI, isTrue("healthCondition")] },
      message: {
        hr: "Possible disability under the Disability Discrimination Act 1995 as it applies in Northern Ireland. Ask what adjustments the process needs (s4A). Treating the employee less favourably for a reason related to the disability needs justification (s3A(1), (3)). Consider an occupational health referral.",
        employee:
          "Your condition may count as a disability. Your employer must consider reasonable adjustments so you can take part, and treating you less favourably for a reason related to it needs justification. You can ask for adjustments in writing.",
      },
      sources: ["DDA 1995 ss3A and 4A"],
    },
    {
      id: "C19",
      level: "worth_checking",
      when: { all: [GB, isTrue("protectedCharacteristic")] },
      message: {
        hr: "Check that each decision has a reason unconnected to the characteristic, and record it.",
        employee: "If you think a protected characteristic has played a part, write down what was said or done, and when.",
      },
      sources: ["Equality Act s13"],
    },
    // C19, Northern Ireland line: the same message under the NI equality law.
    {
      id: "C19NI",
      level: "worth_checking",
      when: { all: [NI, isTrue("protectedCharacteristic")] },
      message: {
        hr: "Check that each decision has a reason unconnected to the characteristic, and record it.",
        employee: "If you think a protected characteristic has played a part, write down what was said or done, and when.",
      },
      sources: ["SDO 1976", "RRO 1997", "FETO 1998", "DDA 1995", "SR 2006/261", "SR 2003/497"],
    },
    {
      id: "C20",
      level: "worth_checking",
      when: { fact: "othersInvolved", is: "different_treatment" },
      message: {
        hr: "Someone else involved is being treated differently for similar conduct. Be ready to explain the difference.",
        employee: "Someone else involved is being treated differently for similar conduct. You can raise this at the hearing or on appeal.",
      },
      sources: ["Acas step 5"],
    },
    // Fires until the policy is confirmed to list the conduct (closest safe version).
    {
      id: "C21",
      level: "worth_checking",
      when: { all: [UK, { fact: "treatedAsGrossMisconduct", is: "yes" }, notTrue("grossMisconductInPolicy")] },
      message: {
        hr: "Check the policy lists this conduct as gross misconduct. The Code's examples are theft or fraud, physical violence, gross negligence and serious insubordination.",
        employee:
          "Check whether the policy lists this conduct as gross misconduct. The Code's examples are theft or fraud, physical violence, gross negligence and serious insubordination.",
      },
      sources: ["Code paras 23 and 24"],
    },
    {
      id: "C22",
      level: "for_information",
      when: { all: [GB, SHORT_SERVICE] },
      message: {
        hr: "Ordinary unfair dismissal is not available. Discrimination, whistleblowing, other automatically unfair reasons and notice pay claims still are. Follow the same fair process.",
        employee:
          "You do not have enough service to claim ordinary unfair dismissal. Claims for discrimination, whistleblowing, other automatically unfair reasons and notice pay are still open.",
      },
      sources: ["ERA 1996 s108", "business.gov.uk, unfair dismissal"],
    },
    {
      id: "C23",
      level: "worth_checking",
      when: C23_WHEN,
      message: {
        hr: "The qualifying period for ordinary unfair dismissal is six months, not two years, where the effective date of termination is on or after 1 January 2027, even if notice was given in 2026. Where the employer gave less than the statutory minimum notice, that notice is added to the termination date when counting service. Whether the added date also decides which period applies is not settled. DraftHR does not suggest timing a dismissal to avoid a right.",
        employee:
          "The qualifying period for unfair dismissal is six months, not two years, where your employment ends on or after 1 January 2027, even if notice was given in 2026. Where you were given less than the statutory minimum notice, that notice is added to your termination date when counting service. Whether the added notice decides which period applies is not settled. Your dates are close to that change.",
      },
      sources: ["ERA 2025 s25", "SI 2026/559 regs 3 and 4", "ERA 1996 s97(2)"],
      // Open question 7.
      toVerify: true,
    },
    {
      id: "C24",
      level: "worth_checking",
      when: { all: [UK, isTrue("employeeIsUnionRep")] },
      message: {
        hr: "Discuss with a union official early, with the employee's agreement.",
        employee: "As a union rep, your employer should discuss the case early with a union official, with your agreement.",
      },
      sources: ["Code para 30"],
    },
    {
      id: "C25",
      level: "worth_checking",
      when: { all: [UK, isTrue("criminalAspect")] },
      message: {
        hr: "A criminal charge or conviction is not by itself a reason for disciplinary action. Consider the effect on the job and working relationships.",
        employee:
          "A criminal charge or conviction is not by itself a reason for disciplinary action. Your employer should consider its effect on the job and working relationships.",
      },
      sources: ["Code para 31"],
    },
    {
      id: "C26",
      level: "worth_checking",
      when: { all: [UK, { fact: "outcome", is: "other" }] },
      message: {
        hr: "Check the contract allows a demotion, transfer or loss of pay, or get agreement. The employee can be accompanied when it is discussed.",
        employee:
          "A demotion, transfer or loss of pay needs a right in your contract or your agreement. You can be accompanied when it is discussed.",
      },
      sources: ["Acas step 5"],
    },
    // Draft: "an outcome letter is drafted without an appeal right". Letters drafted here always
    // include one, so this fires for an outcome given outside DraftHR with no appeal right on record.
    {
      id: "C27",
      level: "act_now",
      when: {
        all: [
          UK,
          { fact: "outcome", in: SANCTIONS },
          notTrue("appealLodged"),
          notTrue("appealRightOffered"),
          {
            not: {
              any: [{ drafted: "outcome_warning" }, { drafted: "outcome_dismissal" }, { drafted: "outcome_other" }],
            },
          },
        ],
      },
      message: {
        hr: "No appeal right is on record for this outcome. Offer an appeal.",
        employee:
          "You should be offered an appeal against a warning, dismissal or other sanction. If your letter does not mention one, you can still appeal in writing.",
      },
      sources: ["Code paras 4, 22 and 26"],
    },
    {
      id: "C28",
      level: "worth_checking",
      when: { all: [UK, isTrue("appealManagerInvolvedEarlier")] },
      message: "Where possible, the appeal should be heard by a manager not previously involved.",
      sources: ["Code para 27"],
    },
    // The plain-words test for summary dismissal is open question 30.
    {
      id: "C29",
      level: "for_information",
      when: { all: [GB, { fact: "outcome", is: "dismissal_without_notice" }] },
      message: {
        hr: "Notice is only lost if the conduct justifies it; otherwise notice pay is owed. A tribunal can hear a notice pay claim only once employment has ended, and can award up to £25,000. Larger claims, or claims out of the tribunal's time limit, may go to the civil courts (six years in England and Wales; five years in Scotland).",
        employee:
          "You only lose your notice if the conduct justified it; otherwise notice pay is owed. A tribunal can hear a notice pay claim only once your employment has ended, and can award up to £25,000. Larger claims, or claims out of the tribunal's time limit, may go to the civil courts (six years in England and Wales; five years in Scotland).",
      },
      sources: [
        "ERA 1996 s86(6)",
        "Common law test for summary dismissal (lawyer to confirm, open question 30)",
        "ETEJ Orders 1994 arts 3 and 10",
        "Limitation Act 1980 s5",
        "Prescription and Limitation (Scotland) Act 1973 s6",
      ],
      toVerify: true,
    },
    // C29 without the Great Britain forum sentence, so nothing GB-only runs in NI (NI review, jurisdiction gate).
    {
      id: "C29NI",
      level: "for_information",
      when: { all: [NI, { fact: "outcome", is: "dismissal_without_notice" }] },
      message: {
        hr: "Notice is only lost if the conduct justifies it; otherwise notice pay is owed.",
        employee: "You only lose your notice if the conduct justified it; otherwise notice pay is owed.",
      },
      sources: ["ERO 1996 Art 118(6)", "Common law test for summary dismissal (lawyer to confirm, open question 30)"],
      toVerify: true,
    },
    {
      id: "C30",
      level: "act_now",
      when: {
        all: [UK, { lens: "employee" }, { any: [ACT_COMPLAINED_OF, { known: "adjustmentRefusedDate" }] }],
      },
      message:
        "Early conciliation and tribunal deadlines are running now. Raising the matter with your employer, including an appeal, does not change them.",
      sources: ["Acas, early conciliation", "R1", "R2", "R3", "Employment Act (NI) 2011 s3"],
    },
    // Great Britain, and a Northern Ireland warning (outside the NI statutory procedure, so
    // the 10 to 50 per cent line in C31NI does not fit it).
    {
      id: "C31",
      level: "act_now",
      when: {
        all: [
          UK,
          { lens: "employee" },
          { fact: "outcome", in: SANCTIONS },
          notTrue("appealLodged"),
          { not: { all: [NI, { fact: "outcome", in: [...DISMISSALS, "other"] }] } },
        ],
      },
      message: "Your employer's policy sets an appeal deadline. Appeal in writing, in time, giving your grounds.",
      sources: ["Code para 26"],
    },
    // C31, Northern Ireland line: dismissal or a sanction under the statutory procedure.
    {
      id: "C31NI",
      level: "act_now",
      when: {
        all: [NI, { lens: "employee" }, { fact: "outcome", in: [...DISMISSALS, "other"] }, notTrue("appealLodged")],
      },
      message:
        "Your employer's policy sets an appeal deadline. In Northern Ireland, if you were dismissed, or given a sanction such as demotion or unpaid suspension, and you do not appeal, any tribunal award can be cut by 10 to 50 per cent. Appeal in writing, in time, giving your grounds.",
      sources: ["Employment (NI) Order 2003 Art 17(2)"],
    },

    // -- 4.2 Northern Ireland differences --------------------------------------
    {
      id: "C32",
      level: "for_information",
      when: NI,
      message:
        "The LRA Code applies, not the Acas Code. Its guidance is similar on suspension (paras 11 and 38: brief, on full pay, kept under review, and not disciplinary action), on a grievance raised during a disciplinary (paras 37 and 88) and on the right to be accompanied (paras 97 to 116). Two things differ: the statutory dismissal and disciplinary procedure (C33), and para 103 on the choice of companion.",
      sources: ["LRA Code paras 11, 37, 38, 88, 97 to 116", "ER(NI)O 1999 Art 12"],
    },
    // Dismissal, or "relevant disciplinary action": a sanction short of dismissal other than a
    // warning or suspension on full pay (SR 2004/521 reg 2).
    {
      id: "C33",
      level: "act_now",
      when: NI_PROCEDURE_APPLIES,
      message: {
        hr: "The statutory dismissal and disciplinary procedure applies. Step 1: a written statement of the alleged conduct, with an invitation to a meeting. Before the meeting, the employee must be told the basis for the allegations (normally the evidence) and have a reasonable chance to consider a response. Step 2: the meeting, held before any action is taken (suspension apart). Afterwards, the employee must be told the decision and the right to appeal. Step 3: if the employee says they want to appeal, a further meeting, chaired where reasonably practicable by a more senior manager. The appeal can take place after the dismissal takes effect. Each step must be taken without unreasonable delay. A shorter two-step procedure applies only to an on-the-spot dismissal for gross misconduct where it was reasonable to dismiss before enquiring. DraftHR does not suggest relying on it. If the procedure is not completed wholly or mainly because of the employer, the dismissal is automatically unfair for an employee with the qualifying service, and the basic award is at least four weeks' pay. The tribunal must also increase awards in most employment claims by at least 10 per cent, and may increase them by up to 50 per cent. If non-completion is the employee's fault, including not appealing, awards are reduced by the same amounts. Art 130A does not help an employee with less than one year's service, because the qualifying period in Art 140(1) still applies. The procedure still matters for them: the 10 to 50 per cent adjustment applies to other claims, such as discrimination and breach of contract.",
        employee:
          "Before dismissing you, or giving a sanction such as demotion or unpaid suspension, your employer must follow the statutory procedure. Step 1: a written statement of what you are said to have done, with an invitation to a meeting, and the basis for it (normally the evidence) before the meeting. Step 2: the meeting, after which you are told the decision and your right to appeal. Step 3: an appeal meeting, if you say you want to appeal. If your employer does not complete the procedure, awards can be increased by 10 to 50 per cent, and a dismissal is automatically unfair if you have one year's service. If you do not appeal, any award can be cut by 10 to 50 per cent.",
      },
      sources: [
        "Employment (NI) Order 2003 Sch 1, Art 17 and Sch 2",
        "SR 2004/521 regs 2 and 3",
        "ERO 1996 Art 130A, Art 140(1), Art 154(1A)",
        "LRA Code paras 6, 30, 32",
      ],
    },
    {
      id: "C34",
      level: "for_information",
      when: { all: [NI, SHORT_SERVICE] },
      message: {
        hr: "Ordinary unfair dismissal is not available below one year's service. The GB change to six months does not apply in Northern Ireland.",
        employee:
          "You do not have the one year's service needed to claim ordinary unfair dismissal in Northern Ireland. The GB change to six months does not apply there.",
      },
      sources: ["ERO 1996 Art 140(1) (one year, unchanged by the Employment Rights Act 2025)", "business.gov.uk"],
    },

    // -- 4.3 United States -----------------------------------------------------
    // The GB and NI checks above do not run in US cases, except C20. C40 takes the
    // place of C18 and C41 the place of C17.
    {
      id: "C35",
      level: "act_now",
      when: { all: [US, { any: [isTrue("protectedActivityUS"), isTrue("decisionMakerLinkToComplaint")] }] },
      message: {
        hr: "Any adverse step after protected activity (dismissal, suspension, transfer, schedule change, worse review) can be retaliation if it might dissuade a reasonable worker from complaining. Record who decided, what they knew of the activity, and the evidence for the reason. California: action within 90 days of activity protected by Labor Code 98.6 (for example a wage complaint or a report of a breach of law) is presumed to be retaliation unless the employer rebuts it.",
        employee:
          "Any step taken against you after you complained, were a witness, asked for an accommodation or leave, asked about pay or reported a breach of the law can be retaliation. Note the dates and who knew, and keep copies of what you raised.",
      },
      sources: [
        "42 USC 2000e-3(a)",
        "29 USC 623(d)",
        "42 USC 12203(a)",
        "42 USC 2000gg-2(f)",
        "29 USC 2615(a)",
        "EEOC retaliation page",
        "Burlington Northern v White (2006)",
        "Muldrow v City of St. Louis (2024)",
        "Cal. Labor Code 98.6(b)(1)",
        "R12",
      ],
    },
    // Also fires while the handbook is not yet known (closest safe version).
    {
      id: "C36",
      level: "worth_checking",
      when: {
        all: [
          US,
          {
            any: [
              { fact: "handbookOrContract", in: ["promises_process", "for_cause", "union_agreement", "offers_appeal"] },
              { not: { known: "handbookOrContract" } },
            ],
          },
        ],
      },
      message: {
        hr: "Check the handbook, contract and any union agreement, and follow what was promised. A signed contract or union agreement replaces at-will. In some states a clear handbook promise binds the employer (Illinois: a clear promise, given to the employee, accepted by working).",
        employee:
          "Check your handbook, contract and any union agreement. A signed contract or union agreement replaces at-will employment, and in some states a clear handbook promise binds the employer. If a process was promised, you can ask for it to be followed.",
      },
      sources: [
        "Ross v May Co. (Ill. App. 2007) applying Duldulao (1987)",
        "Cal. Labor Code 2922",
        "Goldman v White Plains Center (NY 2008)",
        "TWC wrongful discharge page",
        "usa.gov",
      ],
    },
    {
      id: "C37",
      level: "act_now",
      when: { all: [US, MONTANA] },
      message:
        "After probation (12 months unless the employer sets another; at most 18 months with extensions), dismissal needs good cause: reasonable job-related grounds such as poor performance, disruption, a material or repeated breach of written policy, or another legitimate business reason. Managers and supervisors: the employer has the broadest discretion. If there is a written internal appeal procedure, tell the employee and send a copy within 14 days of dismissal. Claims: 1 year. DraftHR does not cover Montana in full: involve counsel.",
      sources: ["Mont. Code Ann. 39-2-903(5)", "Mont. Code Ann. 39-2-904", "Mont. Code Ann. 39-2-910", "Mont. Code Ann. 39-2-911"],
    },
    {
      id: "C38",
      level: "for_information",
      when: {
        all: [
          US,
          {
            any: [
              { fact: "usEmployerHeadcount", in: ["1 to 4", "5 to 14"] },
              {
                all: [
                  { fact: "usEmployerHeadcount", is: "15 to 19" },
                  { any: [isTrue("ageFortyPlus"), { fact: "usClaimBasis", is: "age" }] },
                ],
              },
            ],
          },
        ],
      },
      message:
        "Federal discrimination law may not apply, so there may be no EEOC route. State law usually still applies: California from 5 (harassment from 1), New York all employers, Illinois from 1, Texas and Florida from 15 (Texas sexual harassment from 1). Full list: shared table T1.",
      sources: ["42 USC 2000e(b)", "29 USC 630(b)", "R12", "Table T1"],
    },
    {
      id: "C39",
      level: "worth_checking",
      when: US_NOT_COVERED,
      message:
        "DraftHR shows the federal baseline only for this state. State law may add protections, a state agency deadline, and final pay and notice rules.",
      sources: ["DraftHR coverage: California, New York, Texas, Florida, Illinois"],
      proposal: true,
    },
    {
      id: "C40",
      level: "worth_checking",
      when: { all: [US, { fact: "healthPregnancyLeaveLink", is: "health" }] },
      message: {
        hr: "Disability does not excuse misconduct if the conduct rule is job-related, consistent with business necessity and applied to everyone. Past misconduct need not be excused, but consider any accommodation request for the future. Keep medical information in a separate confidential file.",
        employee:
          "A health condition does not excuse misconduct if the rule is job-related and applied to everyone, but you can ask for an accommodation for the future. Asking is itself protected.",
      },
      sources: ["EEOC, Applying performance and conduct standards (2008), III.A Q5 and III.B Q9", "29 CFR 1630.14(c)(1)"],
    },
    {
      id: "C41",
      level: "act_now",
      when: { all: [US, { fact: "healthPregnancyLeaveLink", in: ["pregnancy", "leave"] }] },
      message: {
        hr: "Pregnancy discrimination is sex discrimination. Employers with 15 or more must not act against an employee for asking for or using a pregnancy accommodation. Employers with 50 or more: do not count FMLA-protected absence against the employee.",
        employee:
          "Pregnancy discrimination is sex discrimination. An employer with 15 or more employees must not act against you for asking for or using a pregnancy accommodation, and one with 50 or more must not count FMLA-protected leave against you.",
      },
      sources: ["42 USC 2000e(k)", "42 USC 2000gg-1(5)", "29 USC 2615(a)"],
    },
    {
      id: "C42",
      level: "act_now",
      when: { all: [US, isTrue("concertedActivity"), notTrue("employeeIsSupervisor"), notTrue("publicEmployer")] },
      message: {
        hr: "Discipline for protected concerted activity is unlawful, with or without a union. Protection can be lost by egregiously offensive or knowingly and maliciously false statements. A charge to the NLRB must be filed within 6 months (R16).",
        employee:
          "Acting with or for co-workers about pay, hours or conditions is protected, with or without a union. A charge to the NLRB must be filed within 6 months.",
      },
      sources: ["29 USC 157", "NLRB concerted activity page", "29 USC 160(b)", "R16"],
    },
    {
      id: "C43",
      level: "act_now",
      when: { all: [US, isTrue("unionRepresented"), stageIn(["not_started", "suspended", "investigating"])] },
      message: {
        hr: "If the employee asks for a union representative at an interview they reasonably believe could lead to discipline, either wait for the representative or end the interview. Do not carry on questioning. The employer need not tell the employee about the right.",
        employee:
          "If you are covered by a union agreement, you can ask for a union representative at an interview you reasonably believe could lead to discipline. Your employer does not have to tell you about this right.",
      },
      sources: ["NLRB Weingarten rights page"],
    },
    // The Board's current test is open question 25.
    {
      id: "C44",
      level: "worth_checking",
      when: { all: [US, isTrue("confidentialityInstruction")] },
      message:
        "A blanket rule not to discuss the investigation, pay or conditions may be unlawful for staff covered by the NLRA if it would reasonably tend to chill concerted activity. Use a case-specific request with reasons. The Board's current test is not settled.",
      sources: ["NLRB, Interfering with employee rights page", "Stericycle (2023)"],
      toVerify: true,
    },
    // C45 has two levels: worth checking here, act now in California (C45A).
    {
      id: "C45",
      level: "worth_checking",
      when: { all: [US, DISMISSED, notTrue("finalPayMade"), { not: CALIFORNIA }] },
      message: {
        hr: "Pay final wages, including any earned vacation pay the state requires, by the state's deadline (R13, shown with the deadlines for the states DraftHR covers).",
        employee:
          "Your final pay, including any earned vacation pay your state requires, is due by the state's deadline (R13, shown with the deadlines for the states DraftHR covers).",
      },
      sources: ["R13", "Table T3"],
    },
    {
      id: "C45A",
      level: "act_now",
      when: { all: [US, DISMISSED, notTrue("finalPayMade"), CALIFORNIA] },
      message: {
        hr: "California: final pay is due immediately on discharge, with a penalty of up to 30 days' wages for wilful lateness (R13).",
        employee:
          "California: your final pay is due immediately on discharge. Wilful lateness carries a penalty of up to 30 days' wages.",
      },
      sources: ["R13", "Table T3", "Cal. Labor Code 201 and 203"],
    },
    // Fires while the notices are not confirmed (the safe version, as C36).
    {
      id: "C46",
      level: "act_now",
      when: { all: [US, DISMISSED, notTrue("separationNoticesGiven")] },
      message: {
        hr: "Give the notices due at separation by the state's deadline (R14, shown with the deadlines for the states DraftHR covers). For example, New York: the exact termination date and the date benefits end, in writing within 5 working days, plus form IA 12.3; Illinois: the IDES pamphlet.",
        employee:
          "Your employer may owe you notices at separation, for example about unemployment insurance and when benefits end. You can ask for them in writing.",
      },
      sources: ["R14", "Table T4"],
    },
    {
      id: "C47",
      level: "act_now",
      when: { all: [US, isTrue("releaseOffered")] },
      message: {
        hr: "Age 40 or over: the release must meet the OWBPA terms (21 days to consider, 7 days to revoke, written advice to consult an attorney). California: at least 5 business days to consult an attorney and the set wording on unlawful acts. New York: a term hiding the facts of a discrimination, harassment or retaliation claim only if that is the complainant's preference. Sexual harassment: pre-dispute confidentiality and arbitration terms cannot be enforced. Hand off to the settlement playbook (US variant).",
        employee:
          "If you are offered severance in return for a release of claims, take advice before signing. At 40 or over you get at least 21 days to consider it and 7 days to change your mind after signing.",
      },
      sources: [
        "29 USC 626(f)(1)",
        "29 CFR 1625.22(e)",
        "Cal. Gov. Code 12964.5(b)",
        "NY Gen. Oblig. Law 5-336",
        "42 USC 19403",
        "9 USC 402",
      ],
    },
    {
      id: "C48",
      level: "for_information",
      when: { all: [US, { any: [isTrue("appealLodged"), { fact: "handbookOrContract", is: "offers_appeal" }] }] },
      message:
        "The appeal does not pause the EEOC or state agency deadline. Montana: the employee must use a written internal procedure first; it pauses the 1-year limit for up to 120 days.",
      sources: ["EEOC time limits page", "Mont. Code Ann. 39-2-911"],
    },
    // Replaces the 0.1 code-only check lawyerLetter.
    {
      id: "C49",
      level: "act_now",
      when: { all: [US, isTrue("lawyerOrAgency")] },
      message: {
        hr: "Keep the dismissed employee's personnel records for at least one year from dismissal and, once a charge is filed, every relevant record until it is resolved. Involve counsel before writing anything further. DraftHR does not draft a reply.",
        consultant:
          "Your client must keep the dismissed employee's personnel records for at least one year from dismissal and, once a charge is filed, every relevant record until it is resolved. It should involve counsel before writing anything further. DraftHR does not draft a reply.",
      },
      sources: ["29 CFR 1602.14"],
    },
  ],

  rules: [
    // R1 (GB) and R3 (NI): uk.tribunalTimeLimit reads the nation from the case.
    {
      id: "tribunal_unfair_dismissal",
      label: "Last day for an unfair dismissal claim, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "unfair_dismissal" }, relevantDate: { fact: "terminationDate" } },
      when: { all: [UK, { known: "terminationDate" }] },
    },
    {
      id: "tribunal_discrimination_dismissal",
      label: "Last day for a discrimination claim about the dismissal, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "terminationDate" } },
      when: { all: [UK, { known: "terminationDate" }] },
    },
    {
      id: "tribunal_breach_of_contract",
      label: "Last day for a notice pay (breach of contract) claim, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "breach_of_contract" }, relevantDate: { fact: "terminationDate" } },
      when: { all: [UK, { known: "terminationDate" }] },
    },
    {
      id: "tribunal_discrimination_suspension",
      label: "Last day for a discrimination or victimisation claim about the suspension, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "suspensionDate" } },
      when: { all: [UK, isTrue("suspended"), RISK] },
    },
    {
      id: "tribunal_discrimination_outcome",
      label: "Last day for a discrimination claim about the warning or sanction, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "outcomeDate" } },
      when: {
        all: [UK, { fact: "outcome", in: ["first_written_warning", "final_written_warning", "other"] }, RISK],
      },
    },
    {
      id: "tribunal_discrimination_adjustments",
      label:
        "Last day for a claim about the refused adjustment (decision date for a failure to act), before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "adjustmentRefusedDate" } },
      when: { all: [UK, isTrue("healthCondition"), { known: "adjustmentRefusedDate" }] },
    },
    // R1 and R3, companion claims (C11, C11NI): ERA 1999 s11 in GB (six months for a failure
    // on or after 1 October 2026), ER(NI)O 1999 Art 13(2) in NI (three months). The hearing
    // date stands in for the date of the failure or threat.
    {
      id: "tribunal_companion",
      label: "Last day for a claim about the right to be accompanied, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "companion" }, relevantDate: { fact: "hearingDate" } },
      when: { all: [C11_WHEN, { known: "hearingDate" }] },
    },
    // R2 (GB) and the LRA equivalent (NI): extends the earliest tribunal limit worked out above.
    {
      id: "early_conciliation",
      label: "Earliest claim deadline once early conciliation is counted",
      rule: "uk.earlyConciliation",
      inputs: {
        limitDate: {
          deadline: [
            "tribunal_unfair_dismissal",
            "tribunal_discrimination_dismissal",
            "tribunal_breach_of_contract",
            "tribunal_discrimination_suspension",
            "tribunal_discrimination_outcome",
            "tribunal_discrimination_adjustments",
            "tribunal_companion",
          ],
        },
        dayA: { fact: "acasNotifiedDate" },
        dayB: { fact: "acasCertificateDate" },
      },
      when: { all: [UK, { known: "acasNotifiedDate" }] },
    },
    // R4.
    {
      id: "qualifying_service",
      label: "Date the unfair dismissal qualifying period is met",
      rule: "uk.qualifyingService",
      inputs: {
        startDate: { fact: "employmentStartDate" },
        terminationDate: { fact: "terminationDate" },
        withoutNotice: { fact: "endedWithoutStatutoryNotice" },
        resignation: { fact: "employeeResigned" },
      },
      when: { all: [UK, { any: [{ known: "terminationDate" }, DISMISSAL_POSSIBLE] }] },
    },
    // R5.
    {
      id: "written_reasons",
      label: "Last day to give written reasons for dismissal",
      rule: "uk.writtenReasons",
      inputs: {
        requestDate: { fact: "writtenReasonsRequestDate" },
        pregnantOrOnLeave: { fact: "pregnantOrOnLeaveAtDismissal" },
        startDate: { fact: "employmentStartDate" },
        terminationDate: { fact: "terminationDate" },
      },
      when: { all: [UK, { known: "writtenReasonsRequestDate" }] },
    },
    // R6.
    {
      id: "companion_postponement",
      label: "Latest date for the employee's alternative hearing time",
      rule: "uk.companionPostponement",
      inputs: { proposedDate: { fact: "hearingDate" } },
      when: { all: [UK, { known: "hearingDate" }] },
    },
    {
      id: "companion_postponement_appeal",
      label: "Latest date for the employee's alternative appeal hearing time",
      rule: "uk.companionPostponement",
      inputs: { proposedDate: { fact: "appealHearingDate" } },
      when: { all: [UK, { known: "appealHearingDate" }] },
    },
    // R7. The date notice is given is the date the dismissal outcome is given.
    {
      id: "statutory_notice",
      label: "Earliest end of statutory minimum notice",
      rule: "uk.statutoryNotice",
      inputs: { startDate: { fact: "employmentStartDate" }, noticeDate: { fact: "outcomeDate" } },
      when: { all: [UK, { not: { fact: "outcome", in: NON_DISMISSAL_OUTCOMES } }] },
    },
    // R11 (product rule, not law).
    {
      id: "suspension_review",
      label: "Next suspension review",
      rule: "uk.suspensionReview",
      inputs: {
        suspensionStart: { fact: "suspensionDate" },
        lastReview: { fact: "suspensionLastReviewed" },
      },
      when: { all: [UK, isTrue("suspended"), { not: stageIn(AFTER_OUTCOME) }] },
    },
    // R9, information only: no date. GB: no cap where the effective date of termination is on
    // or after 1 January 2027; NI keeps a cap.
    {
      id: "compensation_cap",
      label: "Cap on the unfair dismissal compensatory award",
      rule: "uk.compensationCap",
      inputs: { terminationDate: { fact: "terminationDate" } },
      when: { all: [UK, { known: "terminationDate" }] },
    },
    // C11 and C11NI: the weekly pay cap for a companion award, from the dated rules table.
    {
      id: "weekly_pay_cap",
      label: "Cap on a week's pay for a right to be accompanied award",
      rule: "uk.weeklyPayCap",
      inputs: { appropriateDate: { fact: "hearingDate" } },
      when: { all: [C11_WHEN, { known: "hearingDate" }] },
    },

    // R10. Covered states (California, New York, Texas, Florida, Illinois) and Montana give 300
    // days. For a state DraftHR does not cover (C39) both dates are shown, as DraftHR should not
    // guess whether a state agency covers the claim. Below 15 employees (20 for age) the rule
    // returns no date: there is no EEOC route.
    {
      id: "eeoc_charge_180",
      label: "Last day to file an EEOC charge if no state or local agency covers the claim (180 days)",
      rule: "us.eeocCharge",
      inputs: {
        actDate: { fact: "terminationDate" },
        deferralState: { value: false },
        basis: { fact: "usClaimBasis" },
        employerHeadcount: { fact: "usEmployerHeadcount" },
      },
      when: { all: [US_NOT_COVERED, { known: "terminationDate" }] },
    },
    {
      id: "eeoc_charge_300",
      label: "Last day to file an EEOC charge where a state or local agency covers the claim (300 days)",
      rule: "us.eeocCharge",
      inputs: {
        actDate: { fact: "terminationDate" },
        deferralState: { value: true },
        basis: { fact: "usClaimBasis" },
        employerHeadcount: { fact: "usEmployerHeadcount" },
      },
      when: { all: [US, { known: "terminationDate" }] },
    },
    // R12. The rule covers the five states and is not applicable elsewhere.
    {
      id: "state_agency_deadline",
      label: "Last day to file with the state fair employment agency",
      rule: "us.stateAgencyDeadline",
      inputs: {
        actDate: { fact: "terminationDate" },
        basis: { fact: "usClaimBasis" },
        employerHeadcount: { fact: "usEmployerHeadcount" },
      },
      when: { all: [US_COVERED, { known: "terminationDate" }] },
    },
    // R13. Needs the next regular payday in New York and Illinois.
    {
      id: "us_final_pay",
      label: "Latest day for final pay",
      rule: "us.finalPay",
      inputs: {
        separationDate: { fact: "terminationDate" },
        separationType: { value: "discharge" },
        nextPayday: { fact: "nextPayday" },
      },
      when: { all: [US, { known: "terminationDate" }] },
    },
    // R14.
    {
      id: "us_separation_notice",
      label: "Latest day for the state's separation notices",
      rule: "us.separationNotice",
      inputs: { separationDate: { fact: "terminationDate" }, separationType: { value: "discharge" } },
      when: { all: [US, { known: "terminationDate" }] },
    },
    // R15. A release of age claims: 21 days to consider (45 for a group programme), 7 to revoke.
    {
      id: "owbpa_periods",
      label: "End of the period to consider the release",
      rule: "us.owbpa",
      inputs: { agreementGivenDate: { fact: "releaseGivenDate" }, signedDate: { fact: "releaseSignedDate" } },
      when: { all: [US, isTrue("releaseOffered"), isTrue("ageFortyPlus"), { known: "releaseGivenDate" }] },
    },
    // R16 (C42). The outcome date is the date of the adverse act, dismissal included.
    {
      id: "nlrb_charge",
      label: "Last day to file an unfair labour practice charge with the NLRB",
      rule: "us.nlrbChargeLimit",
      inputs: { actDate: { fact: "outcomeDate" } },
      when: {
        all: [US, isTrue("concertedActivity"), notTrue("employeeIsSupervisor"), notTrue("publicEmployer"), { known: "outcomeDate" }],
      },
    },
  ],

  route: [
    // -- 6.1 HR team and consultant ------------------------------------------
    // Template notes from draft 0.2 are kept as comments on the steps they belong to.
    // US: pay continues unless the policy says otherwise (open question 23).
    {
      id: "suspension_confirmation",
      title: "Suspension confirmation",
      letter: "new:suspension_confirmation",
      lens: EMPLOYER,
      when: { all: [isTrue("suspended"), { not: stageIn(AFTER_OUTCOME) }] },
      needs: ["employeeName", "suspensionDate", "suspensionPay"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },
    // US: a union representative note where C43 fires; no blanket confidentiality instruction (C44).
    {
      id: "investigation_invite",
      title: "Investigation meeting invite",
      letter: "new:investigation_meeting_invite",
      lens: EMPLOYER,
      when: {
        any: [
          { not: stageIn(INVESTIGATION_DONE) },
          // Later stage with no investigation on record (C05): investigate now.
          { all: [UK, stageIn(FROM_HEARING), NO_INVESTIGATION_ON_RECORD] },
        ],
      },
      needs: ["employeeName", "allegationSummary", "investigator"],
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, GRIEVANCE_HELD, HEALTH_PAUSE],
    },
    // Step 3 (decision after investigation) has no letter: caseToAnswer decides between 4 and 5a.
    // Template: a colleague companion gets time off to attend (ERA 1999 s10(6)). NI: the evidence
    // enclosed is how the employer tells the employee the basis for the allegations (Employment
    // (NI) Order 2003 Sch 1 para 2(2)).
    {
      id: "hearing_invite",
      title: "Disciplinary hearing invite",
      letter: "new:disciplinary_hearing_invite",
      lens: EMPLOYER,
      when: {
        all: [
          { not: { fact: "invitationLetter", is: "in_writing" } },
          { not: stageIn(PAST_HEARING) },
          { any: [{ fact: "processStage", is: "hearing_arranged" }, isTrue("caseToAnswer")] },
        ],
      },
      after: ["investigation_invite"],
      needs: ["employeeName", "allegationSummary", "decisionMaker", "evidenceHeld", "hearingDate", "hearingDetails"],
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, GRIEVANCE_HELD, DECIDER_NAMED, PREGNANCY_PAUSE, HEALTH_PAUSE, NO_INVESTIGATION],
    },
    // Step 4r: companion unavailable (C12, date from R6) or employee unable to attend (C14).
    {
      id: "hearing_invite_rearranged",
      title: "Rearranged disciplinary hearing invite",
      letter: "new:disciplinary_hearing_invite",
      lens: EMPLOYER,
      when: {
        all: [
          { not: stageIn(PAST_HEARING) },
          {
            any: [
              { all: [isTrue("companionUnavailable"), { known: "companionAlternativeDate" }] },
              { fact: "attendanceIssue", in: ["off_sick", "other_reason"] },
            ],
          },
        ],
      },
      after: ["hearing_invite"],
      needs: ["employeeName", "allegationSummary", "decisionMaker", "evidenceHeld", "hearingDetails"],
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, GRIEVANCE_HELD, DECIDER_NAMED, PREGNANCY_PAUSE],
    },
    {
      id: "outcome_no_action",
      title: "No further action",
      letter: "new:no_further_action",
      lens: EMPLOYER,
      when: { any: [{ fact: "outcome", is: "no_action" }, { fact: "caseToAnswer", is: false }] },
      needs: ["employeeName", "allegationSummary"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },
    // Template: the appeal right cites Code paras 4 and 26.
    {
      id: "outcome_warning",
      title: "Warning",
      letter: "employer/warning",
      lens: EMPLOYER,
      when: {
        all: [
          { fact: "outcome", in: ["first_written_warning", "final_written_warning"] },
          { not: stageIn(APPEAL_STAGES) },
        ],
      },
      needs: ["employeeName", "allegationSummary", "outcome"],
      blockedIf: OUTCOME_GATES,
    },
    // Step 5c. Also on the route (and so shown as blocked) while gross misconduct is alleged and
    // no lesser outcome has been given, or there is already a live final warning.
    // US variant of the template: the last day; when final pay will be paid (R13); the date
    // benefits end (New York: in writing within 5 working days, R14); the state's unemployment
    // notice (R14); a short factual reason with no labels; any handbook appeal. Montana: enclose
    // any written internal appeal procedure (C37). Health cover wording is open question 28.
    {
      id: "outcome_dismissal",
      title: "Dismissal",
      letter: "employer/termination",
      lens: EMPLOYER,
      when: {
        all: [
          {
            any: [
              { fact: "outcome", in: DISMISSALS },
              { fact: "processStage", is: "dismissed" },
              {
                all: [
                  { fact: "treatedAsGrossMisconduct", is: "yes" },
                  {
                    any: [
                      { not: { fact: "outcome", in: NON_DISMISSAL_OUTCOMES } },
                      { fact: "liveWarnings", is: "final_written_warning" },
                    ],
                  },
                ],
              },
            ],
          },
          { not: stageIn(APPEAL_STAGES) },
          notTrue("dismissalInWriting"),
        ],
      },
      needs: ["employeeName", "allegationSummary", "outcome", "terminationDate"],
      blockedIf: [...OUTCOME_GATES, NI_PROCEDURE, DISMISSAL_NOT_FLAGGED, US_PAYDAY_UNKNOWN],
    },
    // Step 5d. Open question 14: is contract_amendment the right vehicle?
    {
      id: "outcome_other",
      title: "Other sanction",
      letter: "employer/contract_amendment",
      lens: EMPLOYER,
      when: { all: [{ fact: "outcome", is: "other" }, { not: stageIn(APPEAL_STAGES) }] },
      needs: ["employeeName", "allegationSummary", "outcome"],
      blockedIf: [
        ...OUTCOME_GATES,
        // NI: a sanction short of dismissal also needs step 4 sent and the meeting held (C33).
        NI_PROCEDURE,
        {
          when: notTrue("sanctionPermitted"),
          reason: "Check the contract allows this sanction, or get the employee's agreement first (C26).",
        },
      ],
    },
    // NI: compulsory when the employee says they want to appeal, chaired where reasonably
    // practicable by a more senior manager (C33). US: the appeal does not pause agency deadlines (C48).
    {
      id: "appeal_hearing_invite",
      title: "Appeal hearing invite",
      letter: "new:appeal_hearing_invite",
      lens: EMPLOYER,
      when: { all: [isTrue("appealLodged"), APPEAL_AVAILABLE] },
      needs: ["employeeName", "appealGrounds", "appealManager", "appealHearingDate"],
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, GRIEVANCE_HELD],
    },
    {
      id: "appeal_outcome",
      title: "Appeal outcome",
      letter: "new:appeal_outcome",
      lens: EMPLOYER,
      when: { all: [isTrue("appealLodged"), APPEAL_AVAILABLE] },
      needs: ["employeeName", "appealDecision"],
      blockedIf: [
        CONSULTANT_SIGN_OFF,
        { when: { not: APPEAL_HEARING_HELD }, reason: "Hold the appeal hearing first." },
      ],
    },
    // NI: a compromise agreement (ERO 1996 Art 245); no s111A protection, so take legal advice
    // before raising an exit (open question 11). US: a release is a separate agreement (C47).
    {
      id: "settlement",
      title: "Settlement cover letter",
      letter: "employer/settlement_cover",
      lens: EMPLOYER,
      when: isTrue("exitBeingDiscussed"),
      needs: ["employeeName"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },
    {
      id: "reference",
      title: "Reference",
      letter: "employer/reference",
      lens: EMPLOYER,
      when: isTrue("referenceRequested"),
      needs: ["employeeName"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },
    // Branch: the employee resigns during the process (open question 13).
    {
      id: "resignation_acceptance",
      title: "Resignation acceptance",
      letter: "employer/resignation_acceptance",
      lens: EMPLOYER,
      when: isTrue("employeeResigned"),
      needs: ["employeeName"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },

    // -- 6.2 Employee ----------------------------------------------------------
    {
      id: "e_suspension_query",
      title: "Suspension query",
      letter: "new:disciplinary_response",
      lens: EMPLOYEE,
      when: {
        all: [
          isTrue("suspended"),
          { any: [{ fact: "suspensionInWriting", is: false }, { fact: "suspensionPay", is: false }] },
        ],
      },
      needs: ["employeeName", "suspensionDate"],
    },
    {
      id: "e_adjustments",
      title: "Adjustments request",
      letter: "employee/accommodation_request",
      lens: EMPLOYEE,
      // US-E2: health or pregnancy linked (US wording in the template).
      when: {
        any: [isTrue("healthCondition"), { all: [US, { fact: "healthPregnancyLeaveLink", in: ["health", "pregnancy"] }] }],
      },
      needs: ["employeeName"],
    },
    {
      id: "e_sickness",
      title: "Sickness notice",
      letter: "employee/sickness_notification",
      lens: EMPLOYEE,
      // Not in the US employee route (6.2a).
      when: { all: [UK, { fact: "attendanceIssue", is: "off_sick" }] },
      needs: ["employeeName"],
    },
    {
      id: "e_pre_hearing",
      title: "Pre-hearing letter",
      letter: "new:disciplinary_response",
      lens: EMPLOYEE,
      // Not in the US employee route (6.2a).
      when: { all: [UK, { fact: "invitationLetter", is: "in_writing" }, { not: stageIn(PAST_HEARING) }] },
      needs: ["employeeName", "hearingDate"],
    },
    {
      id: "e_written_statement",
      title: "Written statement",
      letter: "new:disciplinary_response",
      lens: EMPLOYEE,
      when: { all: [{ known: "hearingDate" }, { not: stageIn(PAST_HEARING) }] },
      after: ["e_pre_hearing"],
      needs: ["employeeName", "employeeAccount"],
    },
    {
      id: "e_grievance",
      title: "Grievance",
      letter: "employee/grievance",
      lens: EMPLOYEE,
      when: {
        any: [
          isTrue("recentComplaint"),
          isTrue("protectedActivityUS"),
          isTrue("protectedCharacteristic"),
          isTrue("grievanceDuringProcess"),
        ],
      },
      needs: ["employeeName"],
    },
    {
      id: "e_appeal",
      title: "Appeal",
      letter: "employee/appeal",
      lens: EMPLOYEE,
      // US-E5: only where the handbook offers an appeal; it does not pause agency deadlines (C48).
      when: { all: [{ fact: "outcome", in: SANCTIONS }, notTrue("appealLodged"), APPEAL_AVAILABLE] },
      needs: ["employeeName", "outcome"],
    },
    // Template: "ERA 1996 s92 request (NI: ERO 1996 Art 124)". Not offered in the US.
    {
      id: "e_written_reasons",
      title: "Written reasons request",
      letter: "new:disciplinary_response",
      lens: EMPLOYEE,
      when: { all: [UK, { known: "terminationDate" }, { fact: "dismissalInWriting", is: false }] },
      needs: ["employeeName", "terminationDate"],
    },
    {
      id: "e_subject_access",
      title: "Subject access request",
      letter: "employee/subject_access_request",
      lens: EMPLOYEE,
      // Not offered in the US (open question 26).
      when: { all: [UK, isTrue("wantsOwnRecords")] },
      needs: ["employeeName"],
    },
    {
      id: "e_acas_notification",
      title: "Acas early conciliation notification",
      letter: "employee/acas_ec_notification",
      lens: EMPLOYEE,
      when: { all: [GB, ACT_COMPLAINED_OF] },
      needs: ["employeeName"],
    },
    {
      id: "e_lra_notification",
      title: "LRA early conciliation notification",
      letter: "new:lra_ec_notification",
      lens: EMPLOYEE,
      when: { all: [NI, ACT_COMPLAINED_OF] },
      needs: ["employeeName"],
    },
    {
      id: "e_tribunal_cover",
      title: "Tribunal cover letter",
      letter: "employee/tribunal_cover",
      lens: EMPLOYEE,
      when: { all: [UK, { known: "acasCertificateDate" }] },
      needs: ["employeeName"],
    },
    // NI: the agreement is a compromise agreement (ERO 1996 Art 245); s111A does not apply.
    {
      id: "e_settlement_counter",
      title: "Settlement counter-offer",
      letter: "employee/settlement_counter_offer",
      lens: EMPLOYEE,
      when: isTrue("exitBeingDiscussed"),
      needs: ["employeeName"],
    },
    // US-E6 (proposal: state wage claim routes are not yet mapped). Final pay is later than R13.
    {
      id: "e_us_final_pay",
      title: "Final pay request",
      letter: "employee/pay_dispute",
      lens: EMPLOYEE,
      when: { all: [US, { deadline: "us_final_pay", withinDays: -1 }, notTrue("finalPayMade")] },
      needs: ["employeeName"],
    },
  ],

  handOffs: [
    {
      id: "grievance",
      to: "grievance",
      when: isTrue("grievanceDuringProcess"),
      message: {
        hr: "Grievance playbook. The disciplinary may pause, or both may run together if related (Code para 46). By default it pauses at the current step until you record a decision. If the grievance is about the investigator or decider, consider replacing them. Case facts, dates, people and letters carry over.",
        employee:
          "Grievance playbook. Your employer may pause the disciplinary to deal with your grievance, or deal with both together if they are related. Your case facts, dates, people and letters carry over.",
        consultant:
          "Grievance playbook. The disciplinary may pause, or both may run together if related (Code para 46). By default it pauses at the current step until your client records a decision. If the grievance is about the investigator or decider, propose replacing them. Case facts, dates, people and letters carry over.",
      },
    },
    {
      id: "complaint_not_investigated",
      to: "grievance",
      when: {
        all: [
          { any: [isTrue("recentComplaint"), isTrue("protectedActivityUS")] },
          { fact: "recentComplaintHandled", is: false },
        ],
      },
      message:
        "Grievance playbook, employer side. The employee's earlier complaint does not appear to have been investigated. Deal with it separately from this disciplinary.",
    },
    {
      id: "health_adjustments",
      to: "expert",
      // US: C40.
      when: { any: [isTrue("healthCondition"), { all: [US, { fact: "healthPregnancyLeaveLink", is: "health" }] }] },
      message:
        "Health and adjustments playbook. The disciplinary pauses only until adjustments are agreed or occupational health advice is received. The health condition, adjustments and sickness dates carry over.",
    },
    {
      id: "pregnancy_maternity",
      to: "expert",
      // US: C41.
      when: {
        any: [
          { fact: "pregnancyOrFamilyLeave", is: "yes" },
          { all: [US, { fact: "healthPregnancyLeaveLink", in: ["pregnancy", "leave"] }] },
        ],
      },
      message:
        "Pregnancy and maternity playbook. The disciplinary pauses if the conduct may be linked to the pregnancy or leave (for example pregnancy-related absence). Otherwise it continues, with every step checked. Pregnancy and leave dates carry over.",
    },
    {
      id: "whistleblowing",
      to: "expert",
      when: { all: [UK, isTrue("recentComplaint")] },
      message:
        "Whistleblowing playbook. The disciplinary continues only once the two matters are separated and the decider is not named in the complaint. The complaint date and topic carry over.",
    },
    {
      id: "redundancy",
      to: "redundancy",
      when: isTrue("redundancyProposed"),
      message:
        "Redundancy playbook. The two stay separate: a disciplinary is never used in place of a redundancy process, or the other way round. Employee details carry over.",
    },
    {
      id: "capability",
      to: "expert",
      when: isTrue("capabilityConcern"),
      message: "Capability playbook. This disciplinary stops; restart under capability. Facts and evidence carry over.",
    },
    {
      id: "sickness_absence",
      to: "expert",
      when: isTrue("sicknessAbsence"),
      message: "Sickness absence playbook. The disciplinary stops for the absence part. Absence dates carry over.",
    },
    {
      id: "resignation",
      to: "expert",
      when: { all: [{ lens: "employee" }, { fact: "employeeGoal", is: "leave" }] },
      message:
        "Resignation playbook (constructive dismissal checks). It is your choice; check the risks first. Your full case carries over.",
    },
    // Part 2.3: a US government employer is out of scope for v0.1. Say so and stop.
    {
      id: "us_public_employer",
      to: "lawyer",
      when: { all: [US, isTrue("publicEmployer")] },
      message:
        "Government employers follow different rules and are out of scope for v0.1. DraftHR stops here. Federal employees must contact an agency EEO counsellor within 45 days.",
    },
    // There is no settlement situation yet, so this goes to a lawyer.
    {
      id: "settlement_release",
      to: "lawyer",
      when: { all: [US, isTrue("releaseOffered")] },
      message: {
        hr: "Settlement playbook (US variant): the release is a separate agreement, never part of a disciplinary letter. Age 40 or over: OWBPA terms (C47). The state, age, employer headcount and dates carry over.",
        employee:
          "A release of claims in return for severance is a separate agreement. Take advice before signing. At 40 or over you get at least 21 days to consider it and 7 days to change your mind.",
        consultant:
          "Settlement playbook (US variant): the release is a separate agreement, never part of a disciplinary letter. Age 40 or over: OWBPA terms (C47). The state, age, employer headcount and dates carry over.",
      },
    },
    // US-E7: there is no letter (agency portals), so it is a hand-off showing R10 and R12.
    {
      id: "agency_charge",
      to: "eeoc",
      when: { all: [US, { lens: "employee" }, { any: [DISMISSED, { fact: "outcome", in: SANCTIONS }] }] },
      message:
        "EEOC or state agency charge, filed through the agency's own portal. The last days to file are shown with the deadlines (EEOC, R10; state agency, R12). Act now if 60 days or fewer remain. An internal appeal or complaint does not pause them.",
    },
  ],

  tone: {
    lens: {
      hr: [
        "Calm, practical, procedural. Short sentences.",
        "Say \"the allegation\" and \"alleged\" until a finding is made.",
        "Explain why each step protects the organisation.",
        "Offer the next letter.",
        "Never presume guilt.",
        "Never suggest timing a dismissal to avoid a legal right.",
        "Never suggest \"managing someone out\".",
      ],
      employee: [
        "Warm, steady, plain English. Acknowledge stress once, then help.",
        "Explain rights in a sentence each.",
        "Warn that anything written may be read by a tribunal.",
        "Help them say what happened without overstating it.",
        "Never ask \"did you do it?\".",
        "Never push for admissions, or for more detail on health than the process needs.",
        "Never promise an outcome.",
      ],
      consultant: [
        "Peer to peer and concise; cite the Code paragraph.",
        "Separate the client's decision from the consultant's advice.",
        "Use the client's name on letters.",
        "Never take decisions for the client.",
      ],
    },
    privacy: [
      "Never ask for a diagnosis or medication.",
      "Never ask which protected characteristic someone has; only whether one is relevant.",
      "Never ask for religion, sexuality or ethnicity details beyond what the user volunteers as relevant.",
      "Never ask about criminal history beyond the allegation itself.",
      "Health, disability and pregnancy are special category data: in letters, only as far as needed (for example \"the adjustments we discussed\"), never a diagnosis.",
      "Race, religion, sexuality and union membership are special category data: in letters only if the case depends on it.",
      "Police involvement and alleged crimes are criminal offence data: neutral wording, no speculation, case owner only.",
      "Names of complainants and witnesses reach the employee only through the evidence pack the employer chooses to send.",
      "Whistleblowing details never go in disciplinary letters.",
      "Employer and employee accounts never share data, even on the same dispute.",
      "Disciplinary records are confidential and kept only as long as necessary.",
    ],
  },
};
