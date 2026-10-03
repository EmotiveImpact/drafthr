import { expect, it } from "vitest";
import { computeRowHash, GENESIS_PREV_HASH } from "./audit";
import { verifyHistoricalAuditRows, type HistoricalAuditRow } from "./audit-history";

function history(): HistoricalAuditRow[] {
  let prevHash = GENESIS_PREV_HASH;
  return ["z", "b", "a"].map((id, i) => {
    const row = { id, prevHash, kind: "test", subjectId: "draft", payload: { i },
      createdAt: new Date(1000 - i), rowHash: "" };
    row.rowHash = computeRowHash({ ...row, createdAtEpochMs: row.createdAt.getTime() });
    prevHash = row.rowHash;
    return row;
  });
}

it("validates legacy links despite reversed clocks, UUIDs and input ordering without mutations", () => {
  const rows = history().reverse();
  const original = structuredClone(rows);
  expect(verifyHistoricalAuditRows(rows)).toEqual({ ok: true, rowCount: 3 });
  expect(rows).toEqual(original);
});
it("also checks sequence order after migration", () => {
  const rows = history().map((row, i) => ({ ...row, sequence: i + 1 }));
  expect(verifyHistoricalAuditRows(rows).ok).toBe(true);
  rows[1].sequence = 3;
  expect(verifyHistoricalAuditRows(rows)).toMatchObject({ ok: false, reason: "sequence_mismatch" });
});
it("rejects payload tampering", () => {
  const rows = history(); rows[1].payload = { i: 99 };
  expect(verifyHistoricalAuditRows(rows)).toMatchObject({ ok: false, reason: "hash_mismatch" });
});
it("rejects forks, duplicates, missing roots and disconnected links", () => {
  const rows = history();
  expect(verifyHistoricalAuditRows([...rows, { ...rows[1], id: "fork", rowHash: "different" }])).toMatchObject({ ok: false, reason: "fork" });
  expect(verifyHistoricalAuditRows([...rows, rows[1]])).toMatchObject({ ok: false, reason: "duplicate_id" });
  expect(verifyHistoricalAuditRows(rows.slice(1))).toMatchObject({ ok: false, reason: "disconnected" });
  expect(verifyHistoricalAuditRows([rows[0], rows[2]])).toMatchObject({ ok: false, reason: "disconnected" });
});
it("accepts an empty history", () => {
  expect(verifyHistoricalAuditRows([])).toEqual({ ok: true, rowCount: 0 });
});
