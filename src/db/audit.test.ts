/**
 * computeRowHash is the load-bearing primitive for the audit chain. This
 * test reproduces the chain algorithm in-process (no DB) — append events,
 * pass each prev_hash forward, then re-walk the chain and verify each row's
 * row_hash matches its inputs. Mirrors the SQL-side `verifyAuditChain`.
 */
import { describe, expect, it } from "vitest";
import { computeRowHash, GENESIS_PREV_HASH } from "./audit";

describe("audit chain", () => {
  it("produces a valid chain across draft.created → draft.updated → draft.deleted", () => {
    const subjectId = "11111111-1111-1111-1111-111111111111";
    const t0 = 1_700_000_000_000;

    const events = [
      {
        kind: "draft.created",
        payload: { letterType: "termination", title: "Test", sectionCount: 5 },
        createdAtEpochMs: t0,
      },
      {
        kind: "draft.updated",
        payload: { title: "Renamed", reviewStatus: "draft", sectionCount: 5 },
        createdAtEpochMs: t0 + 1000,
      },
      {
        kind: "draft.deleted",
        payload: { letterType: "termination", title: "Renamed" },
        createdAtEpochMs: t0 + 2000,
      },
    ];

    const chain: { rowHash: string; prevHash: string }[] = [];
    let prev = GENESIS_PREV_HASH;
    for (const e of events) {
      const rowHash = computeRowHash({
        prevHash: prev,
        payload: e.payload,
        kind: e.kind,
        subjectId,
        createdAtEpochMs: e.createdAtEpochMs,
      });
      chain.push({ rowHash, prevHash: prev });
      prev = rowHash;
    }

    expect(chain[0].prevHash).toBe(GENESIS_PREV_HASH);
    expect(chain[1].prevHash).toBe(chain[0].rowHash);
    expect(chain[2].prevHash).toBe(chain[1].rowHash);
    expect(new Set(chain.map((c) => c.rowHash)).size).toBe(3);

    // Re-walk: recompute every hash against the stored prevHash + payload.
    let expectedPrev = GENESIS_PREV_HASH;
    for (let i = 0; i < events.length; i++) {
      const recomputed = computeRowHash({
        prevHash: expectedPrev,
        payload: events[i].payload,
        kind: events[i].kind,
        subjectId,
        createdAtEpochMs: events[i].createdAtEpochMs,
      });
      expect(recomputed).toBe(chain[i].rowHash);
      expect(chain[i].prevHash).toBe(expectedPrev);
      expectedPrev = recomputed;
    }
  });

  it("breaks when a payload is tampered with retroactively", () => {
    const subjectId = "22222222-2222-2222-2222-222222222222";
    const events = [
      { kind: "draft.created", payload: { title: "Original" }, createdAtEpochMs: 1000 },
      { kind: "draft.updated", payload: { title: "Edit" }, createdAtEpochMs: 2000 },
    ];
    let prev = GENESIS_PREV_HASH;
    const chain: { rowHash: string; prevHash: string }[] = [];
    for (const e of events) {
      const rowHash = computeRowHash({
        prevHash: prev,
        payload: e.payload,
        kind: e.kind,
        subjectId,
        createdAtEpochMs: e.createdAtEpochMs,
      });
      chain.push({ rowHash, prevHash: prev });
      prev = rowHash;
    }

    // Tamper: an attacker rewrites event 0's payload.
    const tamperedRehash = computeRowHash({
      prevHash: GENESIS_PREV_HASH,
      payload: { title: "Tampered" },
      kind: "draft.created",
      subjectId,
      createdAtEpochMs: 1000,
    });
    expect(tamperedRehash).not.toBe(chain[0].rowHash);
    // Event 1's prevHash still points at the OLD hash — the chain is broken.
    expect(chain[1].prevHash).not.toBe(tamperedRehash);
  });
});
