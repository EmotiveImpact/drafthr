import type { Condition, FactValue, Lens, LensText, Playbook } from "../types";

/**
 * Disciplinary playbook, draft 0.1, translated from
 * case-engine/playbooks/disciplinary.md (13 October 2026, for legal review).
 *
 * Fact keys follow part 3 of the draft. Where a part 3 fact combines several
 * answers ("yes-no + date + text"), it is split into one fact per answer and
 * the parts keep the parent's priority. A few facts are added so that checks,
 * the route and the hand-offs can be expressed; each says so in its `why`
 * or in the comment above it.
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
      { not: { fact: "grievanceHandling", in: ["deal_with_together", "grievance_decided"] } },
    ],
  },
  reason: {
    hr: "Paused: a grievance has been raised (C15). Record whether to deal with it first or together with the disciplinary.",
    consultant:
      "Paused: a grievance has been raised (C15). Record whether your client will deal with it first or together with the disciplinary.",
  },
};

const DECIDER_NAMED: Gate = {
  when: isTrue("decisionMakerLinkToComplaint"),
  reason:
    "The person due to decide is named in the employee's complaint or grievance (C16). Choose someone not named, then update the case.",
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
    "Northern Ireland statutory dismissal procedure: send a written statement of the allegation and hold a meeting before any dismissal (C33).",
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
  version: "0.1",
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
      why: "The right to be accompanied covers workers; unfair dismissal covers employees only.",
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
      why: "The employee should be offered an appeal (Code paras 22 and 26).",
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
      askIf: isTrue("recentComplaint"),
      why: "A complaint that was never investigated may need its own grievance process.",
    },
    // Part 3.5 (US) fact, also asked in the UK when there is a complaint or grievance (C07, C16).
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
        hr: "As far as you know, is the employee pregnant, on family leave, or recently back from it?",
        employee: "Are you pregnant, or on or recently back from maternity or other family leave? (You can skip this.)",
        consultant: "As far as your client knows, is the employee pregnant, on family leave, or recently back from it?",
      },
      specialCategory: true,
      why: "Extra legal protection applies.",
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
    // Added for test story 5.
    {
      key: "lawyerLetterReceived",
      label: "Letter from the employee's lawyer",
      type: "boolean",
      priority: { hr: "nice", consultant: "nice" },
      question: "Has a letter arrived from the employee's lawyer?",
      why: "Keep all records and involve counsel before writing anything further.",
    },

    // -- 3.5 United States (outline) -----------------------------------------
    {
      key: "usState",
      label: "US state",
      type: "text",
      priority: { hr: "must", consultant: "must" },
      question: "Which state does the employee work in?",
      askIf: US,
      why: "State law changes the picture (for example Montana is not at-will) and the EEOC deadline.",
    },
    {
      key: "handbookOrContract",
      label: "Handbook, contract or union agreement",
      type: "list",
      choices: ["promises_process", "for_cause", "union_agreement", "offers_appeal", "none"],
      priority: { hr: "must", consultant: "must" },
      question:
        "Is there a handbook, contract or union agreement that promises a disciplinary process, an appeal, or \"for cause\" dismissal? Please upload it.",
      askIf: US,
      why: "At-will employment has exceptions, including implied contracts.",
    },
  ],

  checks: [
    // -- 4.1 Great Britain (also Northern Ireland, where the LRA Code is similar) --
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
      proposal: true,
    },
    {
      id: "C11",
      level: "act_now",
      when: C11_WHEN,
      message: {
        hr: "A worker has a statutory right to one companion at a disciplinary or appeal hearing. A tribunal can award up to two weeks' pay (subject to the weekly pay cap). Make sure the right was offered and not refused.",
        employee: "You are entitled to bring a colleague or union rep to a disciplinary or appeal hearing.",
      },
      sources: ["ERA 1999 ss10, 11, 13(4)", "Code paras 13, 14, 28"],
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
      sources: ["ERA 1999 s10(3)", "Draft Code paras 10 and 81"],
    },
    {
      id: "C14",
      level: "worth_checking",
      when: { all: [UK, { fact: "attendanceIssue", in: ["off_sick", "other_reason"] }] },
      message: {
        hr: "Rearrange first and consider a medical opinion (with consent). If going ahead without the employee, tell them and accept a written statement. The five-day postponement rule only covers companion unavailability.",
        employee:
          "If you cannot attend, tell your employer in writing and ask for the hearing to be rearranged. They should consider medical advice before going ahead without you, and you can send a written statement. The five-day postponement rule only covers your companion being unavailable.",
      },
      sources: ["Acas step 4", "Code para 25"],
    },
    {
      id: "C15",
      level: "act_now",
      when: { all: [UK, isTrue("grievanceDuringProcess")] },
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
      when: { all: [UK, isTrue("recentComplaint")] },
      message: {
        hr: "Possible victimisation (if the complaint alleged discrimination or harassment) or whistleblowing protection (if it reported wrongdoing; protection for disclosures about sexual harassment was strengthened from 6 April 2026). Keep the processes separate, use a decider not named in the complaint, and record the reasons for each decision.",
        employee:
          "Being disciplined soon after raising a complaint can be victimisation (if you complained about discrimination or harassment) or whistleblowing detriment (if you reported wrongdoing). Note the dates and keep copies of what you raised.",
      },
      sources: ["Equality Act s27", "ERA 1996 s103A", "gov.uk ERA 2025 timeline", "ERA 1996 s47B (to verify)"],
      toVerify: true,
    },
    {
      id: "C17",
      level: "act_now",
      when: { all: [UK, { fact: "pregnancyOrFamilyLeave", is: "yes" }] },
      message: {
        hr: "Check whether anything in the allegation is linked to pregnancy, pregnancy-related illness or leave. Unfavourable treatment for those reasons is discrimination; dismissal for a pregnancy-related reason needs no qualifying service; and a woman dismissed while pregnant or on maternity leave gets written reasons without asking.",
        employee:
          "If anything you are accused of is linked to your pregnancy, pregnancy-related illness or leave, treating you unfavourably for it is discrimination. A dismissal for a pregnancy-related reason needs no minimum service, and you would get written reasons without asking.",
      },
      sources: ["Equality Act s18", "ERA 1996 s108(3)(b)", "ERA 1996 s99 (to verify)", "ERA 1996 s92(4)"],
      toVerify: true,
    },
    {
      id: "C18",
      level: "act_now",
      when: { all: [UK, isTrue("healthCondition")] },
      message: {
        hr: "Possible disability. Ask whether the conduct arises from the condition, and what adjustments the process needs. Consider an occupational health referral.",
        employee:
          "Your condition may count as a disability. If what happened is linked to it, or you need changes to take part, your employer must consider reasonable adjustments. You can ask for them in writing.",
      },
      sources: ["Equality Act ss15 and 20", "Draft Code para 14"],
    },
    {
      id: "C19",
      level: "worth_checking",
      when: { all: [UK, isTrue("protectedCharacteristic")] },
      message: {
        hr: "Check that each decision has a reason unconnected to the characteristic, and record it.",
        employee: "If you think a protected characteristic has played a part, write down what was said or done, and when.",
      },
      sources: ["Equality Act s13 (to verify)"],
      toVerify: true,
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
        hr: "The qualifying period changes for dismissals from 1 January 2027 (two years to six months), and statutory notice can be added to the termination date for this purpose. DraftHR does not suggest timing a dismissal to avoid a right.",
        employee:
          "The qualifying period for unfair dismissal falls from two years to six months for dismissals from 1 January 2027, and statutory notice can be added to the termination date. Your dates are close to that change.",
      },
      sources: ["business.gov.uk", "ERA 1996 s97(2)"],
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
      sources: ["Code paras 22 and 26"],
    },
    {
      id: "C28",
      level: "worth_checking",
      when: { all: [UK, isTrue("appealManagerInvolvedEarlier")] },
      message: "Where possible, the appeal should be heard by a manager not previously involved.",
      sources: ["Code para 27"],
    },
    {
      id: "C29",
      level: "for_information",
      when: { all: [UK, { fact: "outcome", is: "dismissal_without_notice" }] },
      message: {
        hr: "Notice is only lost if the conduct justifies it; otherwise notice pay is owed.",
        employee: "You only lose your notice if the conduct justified it; otherwise notice pay is owed.",
      },
      sources: ["ERA 1996 s86(6)", "Wrongful dismissal at common law (to verify)"],
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
      sources: ["Acas, early conciliation", "R1", "R2"],
    },
    {
      id: "C31",
      level: "act_now",
      when: { all: [UK, { lens: "employee" }, { fact: "outcome", in: SANCTIONS }, notTrue("appealLodged")] },
      message: "Your employer's policy sets an appeal deadline. Appeal in writing, in time, giving your grounds.",
      sources: ["Code para 26"],
    },

    // -- 4.2 Northern Ireland differences --------------------------------------
    {
      id: "C32",
      level: "for_information",
      when: NI,
      message:
        "The LRA Code applies, not the Acas Code. Its suspension, accompaniment and overlapping grievance guidance is similar.",
      sources: ["LRA Code paras 11, 37, 88, 97, 110", "ER(NI)O 1999 Art 12"],
    },
    {
      id: "C33",
      level: "act_now",
      when: { all: [NI, DISMISSAL_POSSIBLE] },
      message: {
        hr: "The statutory dismissal procedure applies: (1) a written statement of what the employee is said to have done, (2) a meeting, (3) an appeal. If it is not completed mainly because of the employer, the dismissal is automatically unfair, and awards can be adjusted by 10 to 50 per cent.",
        employee:
          "Before dismissing you, your employer must follow the statutory procedure: (1) a written statement of what you are said to have done, (2) a meeting, (3) an appeal. If it is not completed mainly because of the employer, the dismissal is automatically unfair.",
      },
      sources: ["ERO 1996 Art 130A", "LRA Code paras 6, 30, 32", "LRA disciplinary procedures page"],
      toVerify: true,
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
      sources: ["ERO 1996 Art 140(1)", "business.gov.uk"],
    },

    // -- 4.3 United States (outline) -------------------------------------------
    {
      id: "C35",
      level: "act_now",
      when: { all: [US, { any: [isTrue("recentComplaint"), isTrue("decisionMakerLinkToComplaint")] }] },
      message: {
        hr: "Firing someone soon after a discrimination complaint can look like retaliation. Document the reason and who decided.",
        employee: "Being fired soon after a discrimination complaint can be retaliation. Note the dates and keep copies of your complaint.",
      },
      sources: ["usa.gov, termination guidance"],
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
      message:
        "At-will employment can be limited by an implied contract or a union agreement. Check the handbook, contract and any union agreement, and follow what was promised.",
      sources: ["NCSL at-will overview"],
    },
    {
      id: "C37",
      level: "act_now",
      when: { any: [{ state: "MT" }, { fact: "usState", in: ["Montana", "MT"] }] },
      message: "Montana is not at-will after a probationary period; good cause is needed.",
      sources: ["NCSL", "usa.gov"],
    },

    // -- From test story 5 (not in part 4) -------------------------------------
    {
      id: "lawyerLetter",
      level: "act_now",
      when: isTrue("lawyerLetterReceived"),
      message: {
        hr: "A lawyer's letter has arrived. Keep all records and involve your own lawyer before writing anything further. DraftHR does not draft a reply to it.",
        consultant:
          "A lawyer's letter has arrived. Your client should keep all records and involve its own lawyer before writing anything further. DraftHR does not draft a reply to it.",
      },
      sources: ["Test story 5"],
      proposal: true,
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
      label: "Last day for a claim about the refused adjustment, before any early conciliation extension",
      rule: "uk.tribunalTimeLimit",
      inputs: { claimType: { value: "discrimination" }, relevantDate: { fact: "adjustmentRefusedDate" } },
      when: { all: [UK, isTrue("healthCondition"), { known: "adjustmentRefusedDate" }] },
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
      inputs: { startDate: { fact: "employmentStartDate" }, terminationDate: { fact: "terminationDate" } },
      when: { all: [UK, { any: [{ known: "terminationDate" }, DISMISSAL_POSSIBLE] }] },
    },
    // R5.
    {
      id: "written_reasons",
      label: "Last day to give written reasons for dismissal",
      rule: "uk.writtenReasons",
      inputs: { requestDate: { fact: "writtenReasonsRequestDate" } },
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
    // R10. Both dates are shown while it is unknown whether a state agency gives 300 days.
    {
      id: "eeoc_charge_180",
      label: "Last day to file an EEOC charge (180 days)",
      rule: "us.eeocCharge",
      inputs: { actDate: { fact: "terminationDate" }, deferralState: { value: false } },
      when: { all: [US, { known: "terminationDate" }] },
    },
    {
      id: "eeoc_charge_300",
      label: "Last day to file an EEOC charge if a state or local agency covers the claim (300 days)",
      rule: "us.eeocCharge",
      inputs: { actDate: { fact: "terminationDate" }, deferralState: { value: true } },
      when: { all: [US, { known: "terminationDate" }] },
    },
  ],

  route: [
    // -- 6.1 HR team and consultant ------------------------------------------
    {
      id: "suspension_confirmation",
      title: "Suspension confirmation",
      letter: "new:suspension_confirmation",
      lens: EMPLOYER,
      when: { all: [isTrue("suspended"), { not: stageIn(AFTER_OUTCOME) }] },
      needs: ["employeeName", "suspensionDate", "suspensionPay"],
      blockedIf: [CONSULTANT_SIGN_OFF],
    },
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
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, HEALTH_PAUSE],
    },
    // Step 3 (decision after investigation) has no letter: caseToAnswer decides between 4 and 5a.
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
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, DECIDER_NAMED, PREGNANCY_PAUSE, HEALTH_PAUSE, NO_INVESTIGATION],
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
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE, DECIDER_NAMED, PREGNANCY_PAUSE],
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
      blockedIf: [...OUTCOME_GATES, NI_PROCEDURE, DISMISSAL_NOT_FLAGGED],
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
        {
          when: notTrue("sanctionPermitted"),
          reason: "Check the contract allows this sanction, or get the employee's agreement first (C26).",
        },
      ],
    },
    {
      id: "appeal_hearing_invite",
      title: "Appeal hearing invite",
      letter: "new:appeal_hearing_invite",
      lens: EMPLOYER,
      when: { all: [isTrue("appealLodged"), APPEAL_AVAILABLE] },
      needs: ["employeeName", "appealGrounds", "appealManager", "appealHearingDate"],
      blockedIf: [CONSULTANT_SIGN_OFF, GRIEVANCE_PAUSE],
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
      when: isTrue("healthCondition"),
      needs: ["employeeName"],
    },
    {
      id: "e_sickness",
      title: "Sickness notice",
      letter: "employee/sickness_notification",
      lens: EMPLOYEE,
      when: { fact: "attendanceIssue", is: "off_sick" },
      needs: ["employeeName"],
    },
    {
      id: "e_pre_hearing",
      title: "Pre-hearing letter",
      letter: "new:disciplinary_response",
      lens: EMPLOYEE,
      when: { all: [{ fact: "invitationLetter", is: "in_writing" }, { not: stageIn(PAST_HEARING) }] },
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
        any: [isTrue("recentComplaint"), isTrue("protectedCharacteristic"), isTrue("grievanceDuringProcess")],
      },
      needs: ["employeeName"],
    },
    {
      id: "e_appeal",
      title: "Appeal",
      letter: "employee/appeal",
      lens: EMPLOYEE,
      when: { all: [{ fact: "outcome", in: SANCTIONS }, notTrue("appealLodged")] },
      needs: ["employeeName", "outcome"],
    },
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
      when: isTrue("wantsOwnRecords"),
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
      when: { known: "acasCertificateDate" },
      needs: ["employeeName"],
    },
    {
      id: "e_settlement_counter",
      title: "Settlement counter-offer",
      letter: "employee/settlement_counter_offer",
      lens: EMPLOYEE,
      when: isTrue("exitBeingDiscussed"),
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
      when: { all: [isTrue("recentComplaint"), { fact: "recentComplaintHandled", is: false }] },
      message:
        "Grievance playbook, employer side. The employee's earlier complaint does not appear to have been investigated. Deal with it separately from this disciplinary.",
    },
    {
      id: "health_adjustments",
      to: "expert",
      when: isTrue("healthCondition"),
      message:
        "Health and adjustments playbook. The disciplinary pauses only until adjustments are agreed or occupational health advice is received. The health condition, adjustments and sickness dates carry over.",
    },
    {
      id: "pregnancy_maternity",
      to: "expert",
      when: { fact: "pregnancyOrFamilyLeave", is: "yes" },
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
