/**
 * Employer-mode letter templates registry.
 *
 * Each (letterType, jurisdiction) pair is keyed via templateKey() and
 * resolved by the prompt builder at generation time. The map below is the
 * single source of truth for which employer templates exist and where they
 * live on disk.
 */
import type { LetterTemplate, LetterTemplateKey } from "../types";
import { templateKey } from "../types";

import { OFFER_UK, OFFER_US } from "./offer";
import { CONTRACT_AMENDMENT_UK, CONTRACT_AMENDMENT_US } from "./contract_amendment";
import { PROMOTION_UK, PROMOTION_US } from "./promotion";
import { SALARY_INCREASE_UK, SALARY_INCREASE_US } from "./salary_increase";
import { PROBATION_OUTCOME_UK, PROBATION_OUTCOME_US } from "./probation_outcome";
import { WARNING_UK, WARNING_US } from "./warning";
import { SUSPENSION_CONFIRMATION_UK, SUSPENSION_CONFIRMATION_US } from "./suspension_confirmation";
import { INVESTIGATION_MEETING_INVITE_UK, INVESTIGATION_MEETING_INVITE_US } from "./investigation_meeting_invite";
import { DISCIPLINARY_HEARING_INVITE_UK, DISCIPLINARY_HEARING_INVITE_US } from "./disciplinary_hearing_invite";
import { TERMINATION_UK, TERMINATION_US } from "./termination";
import { REDUNDANCY_UK, REDUNDANCY_US } from "./redundancy";
import { REFERENCE_UK, REFERENCE_US } from "./reference";
import { LEAVE_APPROVAL_UK, LEAVE_APPROVAL_US } from "./leave_approval";
import { RESIGNATION_ACCEPTANCE_UK, RESIGNATION_ACCEPTANCE_US } from "./resignation_acceptance";
import { RETURN_TO_WORK_UK, RETURN_TO_WORK_US } from "./return_to_work";
import { SETTLEMENT_COVER_UK, SETTLEMENT_COVER_US } from "./settlement_cover";
import { RIGHT_TO_WORK_UK, RIGHT_TO_WORK_US } from "./right_to_work";

const ALL_TEMPLATES: LetterTemplate[] = [
  OFFER_UK,
  OFFER_US,
  CONTRACT_AMENDMENT_UK,
  CONTRACT_AMENDMENT_US,
  PROMOTION_UK,
  PROMOTION_US,
  SALARY_INCREASE_UK,
  SALARY_INCREASE_US,
  PROBATION_OUTCOME_UK,
  PROBATION_OUTCOME_US,
  WARNING_UK,
  WARNING_US,
  SUSPENSION_CONFIRMATION_UK,
  SUSPENSION_CONFIRMATION_US,
  INVESTIGATION_MEETING_INVITE_UK,
  INVESTIGATION_MEETING_INVITE_US,
  DISCIPLINARY_HEARING_INVITE_UK,
  DISCIPLINARY_HEARING_INVITE_US,
  TERMINATION_UK,
  TERMINATION_US,
  REDUNDANCY_UK,
  REDUNDANCY_US,
  REFERENCE_UK,
  REFERENCE_US,
  LEAVE_APPROVAL_UK,
  LEAVE_APPROVAL_US,
  RESIGNATION_ACCEPTANCE_UK,
  RESIGNATION_ACCEPTANCE_US,
  RETURN_TO_WORK_UK,
  RETURN_TO_WORK_US,
  SETTLEMENT_COVER_UK,
  SETTLEMENT_COVER_US,
  RIGHT_TO_WORK_UK,
  RIGHT_TO_WORK_US,
];

/**
 * Array of [templateKey, LetterTemplate] tuples covering every employer-mode
 * (letterType, jurisdiction) pair. Consumed by the central registry which
 * merges this with EMPLOYEE_TEMPLATES into a single Map.
 */
export const EMPLOYER_TEMPLATES: ReadonlyArray<readonly [LetterTemplateKey, LetterTemplate]> =
  ALL_TEMPLATES.map(
    (tpl) =>
      [templateKey(tpl.letterType, tpl.jurisdiction), tpl] as const,
  );

export {
  OFFER_UK,
  OFFER_US,
  CONTRACT_AMENDMENT_UK,
  CONTRACT_AMENDMENT_US,
  PROMOTION_UK,
  PROMOTION_US,
  SALARY_INCREASE_UK,
  SALARY_INCREASE_US,
  PROBATION_OUTCOME_UK,
  PROBATION_OUTCOME_US,
  WARNING_UK,
  WARNING_US,
  SUSPENSION_CONFIRMATION_UK,
  SUSPENSION_CONFIRMATION_US,
  INVESTIGATION_MEETING_INVITE_UK,
  INVESTIGATION_MEETING_INVITE_US,
  DISCIPLINARY_HEARING_INVITE_UK,
  DISCIPLINARY_HEARING_INVITE_US,
  TERMINATION_UK,
  TERMINATION_US,
  REDUNDANCY_UK,
  REDUNDANCY_US,
  REFERENCE_UK,
  REFERENCE_US,
  LEAVE_APPROVAL_UK,
  LEAVE_APPROVAL_US,
  RESIGNATION_ACCEPTANCE_UK,
  RESIGNATION_ACCEPTANCE_US,
  RETURN_TO_WORK_UK,
  RETURN_TO_WORK_US,
  SETTLEMENT_COVER_UK,
  SETTLEMENT_COVER_US,
  RIGHT_TO_WORK_UK,
  RIGHT_TO_WORK_US,
};
