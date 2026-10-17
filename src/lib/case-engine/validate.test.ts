import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYBOOKS } from "./playbooks/index.js";
import { validatePlaybook } from "./validate.js";

const TEMPLATES = path.resolve(__dirname, "../letters/templates");

describe.each(Object.values(PLAYBOOKS).map((p) => [p.id, p] as const))("%s playbook", (_id, playbook) => {
  it("is internally consistent", () => {
    expect(validatePlaybook(playbook)).toEqual([]);
  });

  it("points only at letter templates that exist, or marks them new", () => {
    const missing = playbook.route
      .filter((s) => !s.letter.startsWith("new:"))
      .filter((s) => !existsSync(path.join(TEMPLATES, `${s.letter}.ts`)))
      .map((s) => s.letter);
    expect(missing).toEqual([]);
  });

  it("gives every lens at least one must fact and one letter", () => {
    for (const lens of ["hr", "employee", "consultant"] as const) {
      expect(playbook.facts.some((f) => f.priority[lens] === "must"), `${lens} must fact`).toBe(true);
      expect(playbook.route.some((s) => s.lens.includes(lens)), `${lens} letter`).toBe(true);
    }
  });
});
