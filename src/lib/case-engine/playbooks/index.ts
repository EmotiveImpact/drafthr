import type { Playbook, SituationId } from "../types";
import { disciplinaryPlaybook } from "./disciplinary";
import { grievancePlaybook } from "./grievance";
import { redundancyPlaybook } from "./redundancy";

export const PLAYBOOKS: Record<SituationId, Playbook> = {
  disciplinary: disciplinaryPlaybook,
  grievance: grievancePlaybook,
  redundancy: redundancyPlaybook,
};
