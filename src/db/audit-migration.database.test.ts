// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { computeRowHash, GENESIS_PREV_HASH } from "./audit.js";

const value = process.env.DRAFTHR_LOCAL_DATABASE_URL;
const url = value ? new URL(value) : null;
const enabled = process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR === "1" && url
  && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55432" && url.pathname.endsWith("_test");
const client = enabled ? postgres(value!, { max: 1 }) : null;
const migration = readFileSync(new URL("../../drizzle/migrations/0025_audit_order_outbox.sql", import.meta.url), "utf8");
afterAll(async () => { if (client) await client.end(); });

describe.skipIf(!enabled)("audit sequence migration preserves history", () => {
  async function runInLegacySchema(run: (tx: postgres.TransactionSql, tenantId: string) => Promise<void>) {
    const name = `audit_migration_${randomUUID().replaceAll("-", "")}`;
    await expect(client!.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${name}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${name}"`);
      await tx`CREATE TABLE tenants (id uuid PRIMARY KEY)`;
      await tx`CREATE TABLE audit_events (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, row_hash text NOT NULL,
        prev_hash text NOT NULL, kind text NOT NULL, subject_id uuid NOT NULL, created_at timestamptz NOT NULL, payload_json jsonb NOT NULL)`;
      const tenantId = randomUUID();
      await tx`INSERT INTO tenants VALUES (${tenantId})`;
      await run(tx, tenantId);
      throw new Error("rollback-disposable-migration-schema");
    })).rejects.toThrow("rollback-disposable-migration-schema");
  }

  it("backfills true link order despite reverse UUIDs and tied or backwards timestamps", async () => {
    await runInLegacySchema(async (tx, tenantId) => {
      const subjectId = randomUUID();
      let prevHash = GENESIS_PREV_HASH;
      const original = [];
      for (let index = 0; index < 3; index++) {
        const id = `00000000-0000-4000-8000-00000000000${3 - index}`;
        const createdAt = new Date(index === 2 ? "2026-01-01T11:00:00Z" : "2026-01-01T12:00:00Z");
        const payload = { index };
        const rowHash = computeRowHash({ prevHash, payload, kind: "draft.updated", subjectId, createdAtEpochMs: createdAt.getTime() });
        await tx`INSERT INTO audit_events VALUES (${id}, ${tenantId}, ${rowHash}, ${prevHash}, 'draft.updated', ${subjectId}, ${createdAt}, ${tx.json(payload)})`;
        original.push({ id, row_hash: rowHash, prev_hash: prevHash });
        prevHash = rowHash;
      }
      await tx.unsafe(migration);
      const rows = await tx`SELECT id, row_hash, prev_hash, sequence FROM audit_events ORDER BY sequence`;
      expect(rows.map(({ sequence: _sequence, ...row }) => row)).toEqual(original);
      expect(rows.map(row => Number(row.sequence))).toEqual([1, 2, 3]);
    });
  });

  it.each(["fork", "disconnected", "cycle"])("refuses a %s without changing any legacy rows", async (shape) => {
    await runInLegacySchema(async (tx, tenantId) => {
      const a = "a".repeat(64), b = "b".repeat(64);
      const hashes = shape === "fork" ? [[a, GENESIS_PREV_HASH], [b, GENESIS_PREV_HASH]]
        : shape === "cycle" ? [[a, b], [b, a]] : [[a, b]];
      for (const [rowHash, prevHash] of hashes) {
        await tx`INSERT INTO audit_events VALUES (${randomUUID()}, ${tenantId}, ${rowHash}, ${prevHash}, 'draft.updated', ${randomUUID()}, now(), '{}')`;
      }
      const before = await tx`SELECT * FROM audit_events ORDER BY id`;
      await expect(tx.savepoint(async nested => { await nested.unsafe(migration); })).rejects.toThrow("Migration aborted");
      expect(await tx`SELECT * FROM audit_events ORDER BY id`).toEqual(before);
      expect(await tx`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'audit_events' AND column_name = 'sequence'`).toHaveLength(0);
    });
  });

  it("handles a long legacy chain without timestamp sorting or growing path arrays", async () => {
    await runInLegacySchema(async (tx, tenantId) => {
      // Structural fixture: distinct consecutive hashes, intentionally not
      // cryptographic payloads. Payload-hash verification is tested separately.
      await tx`INSERT INTO audit_events
        SELECT gen_random_uuid(), ${tenantId}::uuid, lpad(to_hex(n), 64, '0'), lpad(to_hex(n - 1), 64, '0'),
          'draft.updated', gen_random_uuid(), now(), '{}'::jsonb FROM generate_series(1, 5000) n`;
      await tx.unsafe(migration);
      const [row] = await tx`SELECT count(*) AS count, max(sequence) AS last FROM audit_events
        WHERE sequence::text = ('x' || right(row_hash, 8))::bit(32)::int::text`;
      expect(Number(row.count)).toBe(5000);
      expect(Number(row.last)).toBe(5000);
      expect(migration).not.toContain("parent.visited");
    });
  }, 15_000);
});
