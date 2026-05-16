/**
 * sendEmail must be soft-fail. Mocked Resend covers the happy path; the
 * not-configured + network-error paths are tested without ever loading the
 * real SDK so CI doesn't try to hit api.resend.com.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  // Class shape — vi.fn() with mockImplementation isn't constructable in
  // vitest's strict mode. Plain class lets `new Resend(key)` work.
  Resend: class {
    emails = { send: sendMock };
    constructor(_apiKey: string) {}
  },
}));

async function importFresh() {
  vi.resetModules();
  return await import("./email.js");
}

describe("sendEmail", () => {
  beforeEach(() => {
    sendMock.mockReset();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("returns ok:true with the message id on Resend success", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });
    const { sendEmail } = await importFresh();

    const res = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hello</p>",
    });

    expect(res).toEqual({ ok: true, id: "email_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("user@example.com");
    expect(call.subject).toBe("Hi");
    expect(call.from).toBe("DraftHR <no-reply@drafthr.io>");
    expect(call.text).toContain("Hello"); // auto-derived plaintext
  });

  it("forwards optional from + replyTo + tags to Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValueOnce({ data: { id: "email_456" }, error: null });
    const { sendEmail } = await importFresh();

    await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Hello",
      html: "<p>Body</p>",
      from: "Custom <c@drafthr.io>",
      replyTo: "reply@drafthr.io",
      tags: [{ name: "kind", value: "test" }],
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.from).toBe("Custom <c@drafthr.io>");
    expect(call.replyTo).toBe("reply@drafthr.io");
    expect(call.tags).toEqual([{ name: "kind", value: "test" }]);
    expect(call.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns ok:false with 'not-configured' when RESEND_API_KEY is missing", async () => {
    const { sendEmail } = await importFresh();

    const res = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>x</p>",
    });

    expect(res).toEqual({ ok: false, error: "not-configured" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns ok:false with the SDK error message on Resend API errors", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Invalid 'to' address", statusCode: 422 },
    });
    const { sendEmail } = await importFresh();

    const res = await sendEmail({
      to: "bad",
      subject: "Hi",
      html: "<p>x</p>",
    });

    expect(res).toEqual({ ok: false, error: "Invalid 'to' address" });
  });

  it("returns ok:false on network errors without throwing", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:443"));
    const { sendEmail } = await importFresh();

    const res = await sendEmail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>x</p>",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("ECONNREFUSED");
    }
  });

  it("uses caller-supplied text fallback verbatim when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    sendMock.mockResolvedValueOnce({ data: { id: "id" }, error: null });
    const { sendEmail } = await importFresh();

    await sendEmail({
      to: "x@y.com",
      subject: "Hi",
      html: "<p>HTML body</p>",
      text: "Plain body explicitly set",
    });

    expect(sendMock.mock.calls[0][0].text).toBe("Plain body explicitly set");
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and decodes basic entities", async () => {
    const { htmlToPlainText } = await importFresh();
    const out = htmlToPlainText(
      "<p>Hello <strong>world</strong> &amp; co.</p><p>Line two</p>",
    );
    expect(out).toContain("Hello world & co.");
    expect(out).toContain("Line two");
    expect(out).not.toMatch(/<\/?\w+/);
  });

  it("drops <style> and <script> blocks entirely", async () => {
    const { htmlToPlainText } = await importFresh();
    const out = htmlToPlainText(
      "<style>.x{color:red}</style><script>alert(1)</script><p>Visible</p>",
    );
    expect(out).toBe("Visible");
  });
});
