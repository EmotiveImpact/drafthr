import { expect, it } from "vitest";
import { chooseRecoveryOperations, reviewRecoverySources } from "./workspace-recovery-review";

const operation = { kind: "employees" as const, id: "employee", baseRevision: 3, snapshot: { id: "employee", legalName: "Original", createdAt: 1, updatedAt: 2, status: "active" as const } };
it("deduplicates identical versions without changing their stale-write revision", () => {
  const files = ["a", "b"].map(key => ({ key, raw: JSON.stringify([operation]) }));
  const review = reviewRecoverySources("user:tenant", files, [operation]);
  expect(review.groups).toHaveLength(1); expect(review.groups[0].variants).toHaveLength(1);
  expect(chooseRecoveryOperations(review)).toEqual([operation]);
});
it("requires an explicit choice for each conflicting record and preserves the originals", () => {
  const other = { ...operation, snapshot: { ...operation.snapshot, legalName: "Other" } };
  const files = [{ key: "closed", raw: JSON.stringify([other]) }];
  const review = reviewRecoverySources("user:tenant", files, [operation]);
  expect(() => chooseRecoveryOperations(review)).toThrow("Choose a version");
  expect(() => chooseRecoveryOperations(review, { [review.groups[0].key]: "unknown" })).toThrow("Choose a version");
  expect(chooseRecoveryOperations(review, { [review.groups[0].key]: "closed" })).toEqual([other]);
  expect(review.pending).toEqual([operation]); expect(files[0].raw).toBe(JSON.stringify([other]));
});
it("treats deletion versus content and different base revisions as explicit conflicts", () => {
  const review = reviewRecoverySources("identity", [
    { key: "a", raw: JSON.stringify([{ ...operation, snapshot: null }]) },
    { key: "b", raw: JSON.stringify([{ ...operation, baseRevision: 4 }]) },
  ], [operation]);
  expect(review.groups[0].variants).toHaveLength(3);
  expect(chooseRecoveryOperations(review, { [review.groups[0].key]: "a" })[0].snapshot).toBeNull();
});
