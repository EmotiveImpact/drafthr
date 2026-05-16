/**
 * Template is pure — assert that the meaningful slots land in the rendered
 * HTML and that the markup is structurally balanced (a crude proxy for
 * "won't render as garbage in Gmail").
 */
import { describe, expect, it } from "vitest";
import { workspaceInviteEmail } from "./invite.js";

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
    expect(subject).toBe("Sarah Patel invited you to Acme HR Team on DraftHR");
    expect(html).toContain("Sarah Patel");
    expect(html).toContain("sarah@acme.com");
    expect(html).toContain("Acme HR Team");
    expect(html).toContain("drafter");
    expect(html).toContain("https://app.drafthr.io/join/abc123");
    expect(html).toContain("Accept invite");
  });

  it("renders the expiry date in a long-form, locale-stable way", () => {
    const { html } = workspaceInviteEmail(baseOpts);
    // toLocaleDateString('en-US', { month: 'long', day, year }) => "May 23, 2026"
    expect(html).toMatch(/May 2[23], 2026/); // tolerant of TZ shifts on CI
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
