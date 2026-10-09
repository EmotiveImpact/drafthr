import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent } from "./sentry";

const LETTER =
  "Dear Ms Patel, Following the disciplinary hearing held on 3 March, I am writing to confirm " +
  "that your employment will end on 31 March. You were found to have breached the policy on " +
  "several occasions despite previous warnings, and the panel considered your representations.";

describe("scrubBreadcrumb", () => {
  it("drops keystroke breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "ui.input", message: "textarea.editor" })).toBeNull();
  });

  it("removes console arguments and long console messages", () => {
    const out = scrubBreadcrumb({
      category: "console",
      level: "log",
      message: LETTER,
      data: { arguments: [{ html: LETTER }] },
    });
    expect(out?.message).not.toContain("Dear Ms Patel");
    expect(out?.data).toBeUndefined();
  });

  it("keeps the shape of fetch breadcrumbs but drops bodies and query strings", () => {
    const out = scrubBreadcrumb({
      category: "fetch",
      data: {
        method: "POST",
        status_code: 200,
        url: "/api/draft?letter=Dear%20Ms%20Patel",
        request_body: LETTER,
        response_body_size: 1234,
        body: { html: LETTER },
      },
    });
    expect(out?.data).toEqual({ method: "POST", status_code: 200, url: "/api/draft" });
  });

  it("leaves short, ordinary breadcrumbs alone", () => {
    const crumb = { category: "navigation", data: { from: "/drafts", to: "/drafts/1" } };
    expect(scrubBreadcrumb(crumb)).toEqual(crumb);
  });
});

describe("scrubEvent", () => {
  it("scrubs request bodies, long exception text and attached breadcrumbs", () => {
    const event = scrubEvent({
      type: undefined,
      message: LETTER,
      request: { url: "https://app.drafthr.io/x?q=secret", data: LETTER, cookies: { a: "b" } },
      exception: { values: [{ type: "Error", value: `Failed to save: ${LETTER}` }] },
      breadcrumbs: [
        { category: "ui.input", message: "x" },
        { category: "console", message: LETTER },
      ],
      extra: { letterHtml: LETTER, attempt: 2 },
    });
    expect(JSON.stringify(event)).not.toContain("Dear Ms Patel");
    expect(event.request?.url).toBe("https://app.drafthr.io/x");
    expect(event.breadcrumbs).toHaveLength(1);
    expect(event.extra).toMatchObject({ letterHtml: "[redacted]", attempt: 2 });
  });
});
