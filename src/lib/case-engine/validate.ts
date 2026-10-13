import { conditionRefs } from "./conditions";
import { RULE_INPUTS } from "./rules/contract";
import type { Condition, Lens, Playbook } from "./types";

const LENSES: Lens[] = ["hr", "employee", "consultant"];

/**
 * Checks a playbook is internally consistent: unique ids, every reference
 * resolves, every rule use matches the rules contract. Returns a list of
 * problems; an empty list means the playbook is sound.
 */
export function validatePlaybook(playbook: Playbook): string[] {
  const problems: string[] = [];
  const factKeys = new Set(playbook.facts.map((f) => f.key));
  const ruleIds = new Set(playbook.rules.map((r) => r.id));
  const stepIds = new Set(playbook.route.map((s) => s.id));

  const unique = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Duplicate ${what} id "${id}"`);
      seen.add(id);
    }
  };
  unique("fact", playbook.facts.map((f) => f.key));
  unique("check", playbook.checks.map((c) => c.id));
  unique("rule use", playbook.rules.map((r) => r.id));
  unique("route step", playbook.route.map((s) => s.id));
  unique("hand-off", playbook.handOffs.map((h) => h.id));

  const checkCondition = (where: string, condition: Condition) => {
    const refs = conditionRefs(condition);
    for (const key of refs.facts) {
      if (!factKeys.has(key)) problems.push(`${where}: unknown fact "${key}"`);
    }
    for (const id of refs.deadlines) {
      if (!ruleIds.has(id)) problems.push(`${where}: unknown rule use "${id}"`);
    }
    for (const id of refs.steps) {
      if (!stepIds.has(id)) problems.push(`${where}: unknown route step "${id}"`);
    }
  };

  for (const fact of playbook.facts) {
    if (fact.askIf) checkCondition(`fact ${fact.key} askIf`, fact.askIf);
    if (fact.type === "choice" && !fact.choices?.length) {
      problems.push(`fact ${fact.key}: a choice fact needs choices`);
    }
    for (const lens of Object.keys(fact.priority)) {
      if (!LENSES.includes(lens as Lens)) problems.push(`fact ${fact.key}: unknown lens "${lens}"`);
    }
  }
  for (const check of playbook.checks) checkCondition(`check ${check.id}`, check.when);
  for (const handOff of playbook.handOffs) checkCondition(`hand-off ${handOff.id}`, handOff.when);

  for (const use of playbook.rules) {
    const where = `rule use ${use.id}`;
    const contract = RULE_INPUTS[use.rule];
    if (!contract) {
      problems.push(`${where}: unknown rule "${use.rule}"`);
      continue;
    }
    const given = Object.keys(use.inputs);
    for (const name of contract.required) {
      if (!given.includes(name)) problems.push(`${where}: missing required input "${name}"`);
    }
    for (const name of given) {
      if (!contract.required.includes(name) && !contract.optional.includes(name)) {
        problems.push(`${where}: unknown input "${name}" for ${use.rule}`);
      }
      const spec = use.inputs[name];
      if ("fact" in spec && !factKeys.has(spec.fact)) {
        problems.push(`${where}: input "${name}" uses unknown fact "${spec.fact}"`);
      }
    }
    if (use.when) checkCondition(where, use.when);
  }

  const earlier = new Set<string>();
  for (const step of playbook.route) {
    const where = `route step ${step.id}`;
    if (step.when) checkCondition(`${where} when`, step.when);
    for (const block of step.blockedIf ?? []) checkCondition(`${where} blockedIf`, block.when);
    for (const id of step.after ?? []) {
      if (!earlier.has(id)) problems.push(`${where}: "after" must name an earlier step, not "${id}"`);
    }
    for (const key of step.needs ?? []) {
      if (!factKeys.has(key)) problems.push(`${where}: needs unknown fact "${key}"`);
    }
    if (!/^(employer|employee)\/[a-z0-9_]+$|^new:[a-z0-9_]+$/.test(step.letter)) {
      problems.push(`${where}: letter id "${step.letter}" should be "employer/x", "employee/x" or "new:x"`);
    }
    earlier.add(step.id);
  }

  const text = JSON.stringify(playbook);
  if (/[–—]/.test(text)) problems.push("Playbook text contains an em or en dash");

  return problems;
}
