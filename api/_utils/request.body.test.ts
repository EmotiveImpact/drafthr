import { describe, expect, it } from "vitest";
import { readJsonRequest } from "./request.js";

function jsonReq(raw: string): Request {
  return new Request("https://app.drafthr.io/api/workspace/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
}

describe("readJsonRequest rejects non-object bodies with 400", () => {
  it.each(["null", "[]", '"text"', "42", "true"])("refuses %s", async (raw) => {
    const parsed = await readJsonRequest<{ x?: string }>(jsonReq(raw));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.response.status).toBe(400);
  });

  it("accepts an object", async () => {
    const parsed = await readJsonRequest<{ x?: string }>(jsonReq('{"x":"y"}'));
    expect(parsed.ok && parsed.body.x).toBe("y");
  });
});
