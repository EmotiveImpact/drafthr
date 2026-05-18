/**
 * Sink-level tests. The DB-mirror integration (appendAuditEvent →
 * mirrorToWorkOS) lives in src/db/audit.test.ts; this file only validates
 * the sink in isolation: env gating, payload shaping, idempotency key flow,
 * and failure handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapKindToWorkOSAction,
  sendToWorkOSAuditLogs,
  setWorkosAuditLogsClient,
  shapeMetadata,
  type WorkosAuditLogsClient,
} from "./workos-sink";

function makeFakeClient(): {
  client: WorkosAuditLogsClient;
  createEvent: ReturnType<typeof vi.fn>;
} {
  const createEvent = vi.fn(async () => undefined);
  return { client: { createEvent }, createEvent };
}

describe("workos-sink: env gate", () => {
  const ORIGINAL = process.env.WORKOS_AUDIT_LOGS_ENABLED;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    else process.env.WORKOS_AUDIT_LOGS_ENABLED = ORIGINAL;
    setWorkosAuditLogsClient(null);
  });

  it("skips silently when the env flag is missing", async () => {
    delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    const result = await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: "org_123",
      actorId: "user_1",
      actorEmail: "a@b.com",
      actorName: "Alice",
      action: "draft.exported",
      targetType: "draft",
      targetId: "draft_1",
      occurredAt: new Date("2026-05-18T12:00:00Z"),
      idempotencyKey: "audit_1",
    });

    expect(result).toEqual({ ok: false, reason: "feature_flag_off" });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("skips silently when the env flag is 'false'", async () => {
    process.env.WORKOS_AUDIT_LOGS_ENABLED = "false";
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    const result = await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: "org_123",
      actorId: null,
      actorEmail: null,
      actorName: null,
      action: "draft.exported",
      targetType: "draft",
      targetId: "draft_1",
      occurredAt: new Date(),
      idempotencyKey: "audit_1",
    });

    expect(result).toEqual({ ok: false, reason: "feature_flag_off" });
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("workos-sink: org gating", () => {
  beforeEach(() => {
    process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    setWorkosAuditLogsClient(null);
  });

  it("skips silently when workosOrgId is null", async () => {
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    const result = await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: null,
      actorId: "user_1",
      actorEmail: "a@b.com",
      actorName: "Alice",
      action: "draft.exported",
      targetType: "draft",
      targetId: "draft_1",
      occurredAt: new Date(),
      idempotencyKey: "audit_1",
    });

    expect(result).toEqual({ ok: false, reason: "tenant_not_configured" });
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("workos-sink: createEvent invocation", () => {
  beforeEach(() => {
    process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.WORKOS_AUDIT_LOGS_ENABLED;
    setWorkosAuditLogsClient(null);
  });

  it("calls the SDK with the correct shape, idempotency key, and event payload", async () => {
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    const occurredAt = new Date("2026-05-18T12:34:56Z");
    const result = await sendToWorkOSAuditLogs({
      tenantId: "tenant_aaa",
      workosOrgId: "org_zzz",
      actorId: "user_42",
      actorEmail: "alice@acme.test",
      actorName: "Alice Patel",
      action: "draft.exported",
      targetType: "draft",
      targetId: "draft_99",
      occurredAt,
      metadata: { sha256: "abcd", byteLength: 1024 },
      idempotencyKey: "audit_event_uuid_42",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (test)",
    });

    expect(result).toEqual({ ok: true });
    expect(createEvent).toHaveBeenCalledTimes(1);

    const [organization, event, options] = createEvent.mock.calls[0];
    expect(organization).toBe("org_zzz");
    expect(options).toEqual({ idempotencyKey: "audit_event_uuid_42" });

    // Required WorkOS shape.
    expect(event.action).toBe("letters.draft.exported");
    expect(event.occurredAt).toBe(occurredAt);
    expect(event.actor).toEqual({
      type: "user",
      id: "user_42",
      name: "Alice Patel",
      metadata: { email: "alice@acme.test" },
    });
    expect(event.targets).toEqual([{ type: "draft", id: "draft_99" }]);
    expect(event.context).toEqual({
      location: "203.0.113.7",
      userAgent: "Mozilla/5.0 (test)",
    });
    expect(event.metadata).toEqual({ sha256: "abcd", byteLength: 1024 });
  });

  it("falls back to a system actor when actorId is null", async () => {
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    await sendToWorkOSAuditLogs({
      tenantId: "tenant_bbb",
      workosOrgId: "org_yyy",
      actorId: null,
      actorEmail: null,
      actorName: null,
      action: "tenant.created",
      targetType: "tenant",
      targetId: "tenant_bbb",
      occurredAt: new Date(),
      idempotencyKey: "audit_1",
    });

    const event = createEvent.mock.calls[0][1];
    expect(event.actor.type).toBe("system");
    expect(event.actor.id).toBe("system:tenant:tenant_bbb");
    expect(event.action).toBe("workspace.tenant.created");
  });

  it("defaults location to 0.0.0.0 when ip is absent (WorkOS requires location)", async () => {
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: "org_x",
      actorId: "u",
      actorEmail: null,
      actorName: null,
      action: "draft.created",
      targetType: "draft",
      targetId: "d",
      occurredAt: new Date(),
      idempotencyKey: "k",
    });

    const event = createEvent.mock.calls[0][1];
    expect(event.context.location).toBe("0.0.0.0");
    expect(event.context.userAgent).toBeUndefined();
  });

  it("returns { ok: false } without throwing when the SDK rejects", async () => {
    const createEvent = vi.fn(async () => {
      throw new Error("workos 422 unprocessable");
    });
    setWorkosAuditLogsClient({ createEvent });

    const result = await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: "org_x",
      actorId: "u",
      actorEmail: null,
      actorName: null,
      action: "draft.created",
      targetType: "draft",
      targetId: "d",
      occurredAt: new Date(),
      idempotencyKey: "k",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("workos 422");
  });

  it("rejects empty idempotencyKey to avoid duplicate WorkOS events on retries", async () => {
    const { client, createEvent } = makeFakeClient();
    setWorkosAuditLogsClient(client);

    const result = await sendToWorkOSAuditLogs({
      tenantId: "t1",
      workosOrgId: "org_x",
      actorId: "u",
      actorEmail: null,
      actorName: null,
      action: "draft.created",
      targetType: "draft",
      targetId: "d",
      occurredAt: new Date(),
      idempotencyKey: "",
    });

    expect(result).toEqual({ ok: false, reason: "missing_idempotency_key" });
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("mapKindToWorkOSAction", () => {
  it("rewrites known 2-segment kinds to {group}.{object}.{action}", () => {
    expect(mapKindToWorkOSAction("draft.exported")).toBe("letters.draft.exported");
    expect(mapKindToWorkOSAction("tenant.created")).toBe("workspace.tenant.created");
    expect(mapKindToWorkOSAction("member.role_changed")).toBe("workspace.member.role_changed");
  });
  it("passes through kinds that already have 3 segments", () => {
    expect(mapKindToWorkOSAction("custom.group.action")).toBe("custom.group.action");
  });
  it("falls back to app.* prefix for unknown 2-segment kinds", () => {
    expect(mapKindToWorkOSAction("widget.created")).toBe("app.widget.created");
  });
});

describe("shapeMetadata", () => {
  it("clamps keys to 40 chars and values to 500 chars", () => {
    const longKey = "k".repeat(80);
    const longValue = "v".repeat(800);
    const out = shapeMetadata({ [longKey]: longValue });
    const onlyKey = Object.keys(out!)[0];
    expect(onlyKey.length).toBe(40);
    expect((out![onlyKey] as string).length).toBe(500);
  });
  it("caps at 50 keys", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 120; i++) big[`k${i}`] = "v";
    const out = shapeMetadata(big);
    expect(Object.keys(out!).length).toBe(50);
  });
  it("stringifies non-primitives", () => {
    const out = shapeMetadata({ a: { nested: true }, b: [1, 2, 3] });
    expect(typeof out!.a).toBe("string");
    expect(typeof out!.b).toBe("string");
    expect(out!.a).toBe('{"nested":true}');
  });
  it("drops undefined and null values", () => {
    const out = shapeMetadata({ a: 1, b: null, c: undefined, d: "x" });
    expect(out).toEqual({ a: 1, d: "x" });
  });
  it("returns undefined for undefined input", () => {
    expect(shapeMetadata(undefined)).toBeUndefined();
  });
});
