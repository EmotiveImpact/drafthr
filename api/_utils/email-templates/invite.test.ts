/**
 * Template is pure — assert that the meaningful slots land in the rendered
 * HTML and that the markup is structurally balanced (a crude proxy for
 * "won't render as garbage in Gmail").
 */
import { describe, expect, it } from "vitest";
import { INVITE_SUBJECT, workspaceInviteEmail } from "./invite.js";
import { sanitizeFreeText } from "./_layout.js";
import { commentNotificationEmail } from "./comment-notification.js";
import { reviewRequestedEmail } from "./review-requested.js";

const baseOpts = {
  inviterName: "Sarah Patel",
  inviterEmail: "sarah@acme.com",
  workspaceName: "Acme HR Team",
  role: "drafter",
  inviteUrl: "https://app.drafthr.io/join/abc123",
  expiresAt: new Date("2026-05-23T12:00:00Z"),
};

describe("workspaceInviteEmail", () => {
  it("includes inviter, workspace, role, and CTA url in the rendered output", () => {
    const { subject, html } = workspaceInviteEmail(baseOpts);
    expect(subject).toBe(INVITE_SUBJECT);
    expect(html).toContain("Sarah Patel");
    expect(html).toContain("sarah@acme.com");
    expect(html).toContain("Acme HR Team");
    expect(html).toContain("drafter");
    expect(html).toContain("https://app.drafthr.io/join/abc123");
    expect(html).toContain("Accept invite");
  });

  it("renders the expiry date in a long-form, locale-stable way", () => {
    const { html } = workspaceInviteEmail(baseOpts);
    // British date, month written out: "23 May 2026"
    expect(html).toMatch(/2[23] May 2026/); // tolerant of TZ shifts on CI
    expect(html).not.toMatch(/May 2[23], 2026/);
  });

  it("escapes HTML in dynamic fields to prevent injection", () => {
    const { html } = workspaceInviteEmail({
      ...baseOpts,
      inviterName: "<script>x</script>",
      workspaceName: "Acme & <Co>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Acme &amp; &lt;Co&gt;");
  });

  it("produces a structurally balanced document (open/close tag counts match)", () => {
    const { html } = workspaceInviteEmail(baseOpts);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");

    // Crude balance check: every opening tag we use should close. We exclude
    // void HTML elements (br, meta, link, img, hr, input) which never close.
    const tagCount = (tag: string) => {
      const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
      const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
      return {
        open: (html.match(re) ?? []).length,
        close: (html.match(closeRe) ?? []).length,
      };
    };
    for (const tag of ["html", "head", "body", "table", "tr", "td", "p", "a", "h1", "div"]) {
      const { open, close } = tagCount(tag);
      expect(open, `tag ${tag} open=${open} close=${close}`).toBe(close);
    }
  });
});

describe("anti-phishing: user text in outbound mail", () => {
  const hostile = {
    ...baseOpts,
    inviterName: "Payroll Team, reset at https://evil.example/reset",
    workspaceName: "Your account is locked. Visit www.evil.example or mail help@evil.example",
  };

  it("never puts workspace or inviter names in the subject or preheader", () => {
    const { subject, html } = workspaceInviteEmail(hostile);
    expect(subject).toBe("You have been invited to a workspace on DraftHR");
    const preheader = /<span style="display:none[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? "";
    expect(preheader).not.toMatch(/Payroll|locked|evil/);
  });

  it("strips URLs, bare domains and email addresses from free text in the body", () => {
    const { html } = workspaceInviteEmail(hostile);
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("help@");
    expect(html).toContain("Payroll Team, reset at");
  });

  it("caps the length of names shown in the body", () => {
    const { html } = workspaceInviteEmail({ ...baseOpts, workspaceName: "W".repeat(500) });
    expect(html).not.toContain("W".repeat(61));
  });

  it("falls back to neutral copy when a name is nothing but a link", () => {
    const { html } = workspaceInviteEmail({ ...baseOpts, workspaceName: "https://evil.example" });
    expect(html).toContain("a DraftHR workspace");
  });

  it("never echoes an unknown role", () => {
    const { html } = workspaceInviteEmail({ ...baseOpts, role: "<b>superuser</b>" });
    expect(html).not.toContain("superuser");
  });

  it("keeps user text out of comment and review subjects too", () => {
    const comment = commentNotificationEmail({
      recipientName: "Jo",
      authorName: "Click https://evil.example",
      draftTitle: "Win a prize at evil.example",
      commentBody: "see evil.example/x",
      draftUrl: "https://app.drafthr.io/d/1",
    });
    expect(comment.subject).toBe("[DraftHR] New comment on a letter");
    expect(comment.html).not.toContain("evil.example");

    const review = reviewRequestedEmail({
      recipientName: "Jo",
      authorName: "Admin",
      draftTitle: "Urgent: http://evil.example",
      message: "log in at evil.example",
      draftUrl: "https://app.drafthr.io/d/1",
    });
    expect(review.subject).toBe("[DraftHR] A letter is waiting for your review");
    expect(review.html).not.toContain("evil.example");
  });
});

describe("sanitizeFreeText", () => {
  it("removes links in every common shape", () => {
    expect(sanitizeFreeText("go to https://a.example/x now", 100)).toBe("go to now");
    expect(sanitizeFreeText("go to www.a.example now", 100)).toBe("go to now");
    expect(sanitizeFreeText("go to a.example/login now", 100)).toBe("go to now");
    expect(sanitizeFreeText("mail me@a.example", 100)).toBe("mail");
    expect(sanitizeFreeText("javascript://x", 100)).toBe("");
  });

  it("removes control and bidi override characters", () => {
    expect(sanitizeFreeText("Acme\u202Egnp.exe\r\nBcc: x", 100)).toBe("Acme Bcc: x");
  });

  it("keeps ordinary names intact", () => {
    expect(sanitizeFreeText("O'Brien & Co HR", 100)).toBe("O'Brien & Co HR");
  });
});
