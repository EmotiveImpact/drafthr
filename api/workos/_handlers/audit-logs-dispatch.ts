import { timingSafeEqual } from "node:crypto";
import { jsonError } from "../../_utils/request.js";
import { dispatchWorkOSAuditOutbox } from "../../../src/lib/audit/workos-outbox.js";

/** A user session does not authorize draining a cross-tenant queue. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return jsonError("Audit dispatcher is not configured", 503);
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return jsonError("Unauthorized", 401);
  try {
    const result = await dispatchWorkOSAuditOutbox();
    // New terminal delivery failures should trigger deployment error alerts,
    // while ordinary pending retries are still a successful worker invocation.
    return Response.json(result, { status: result.ready && result.failed === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[audit/outbox] dispatcher_failed");
    return jsonError("Audit dispatcher failed; queued events are retained", 500);
  }
}
