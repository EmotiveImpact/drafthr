import type { Playbook, SituationId } from "../types.js";
import { disciplinaryPlaybook } from "./disciplinary.js";
import { grievancePlaybook } from "./grievance.js";
import { redundancyPlaybook } from "./redundancy.js";

export const PLAYBOOKS: Record<SituationId, Playbook> = {
  disciplinary: disciplinaryPlaybook,
  grievance: grievancePlaybook,
  redundancy: redundancyPlaybook,
};
