import { describe, expect, it } from "vitest";
import {
  UPLOAD_MAX_BYTES,
  docxXmlToParagraphs,
  nameFromFile,
  readTemplateFile,
  textToHtml,
  uploadKind,
  uploadTargetSection,
  validateUpload,
} from "./uploadTemplate";

describe("upload a firm template", () => {
  it("accepts text, Markdown, HTML and Word files only", () => {
    expect(uploadKind("policy.txt")).toBe("text");
    expect(uploadKind("Policy.MD")).toBe("markdown");
    expect(uploadKind("offer.htm")).toBe("html");
    expect(uploadKind("warning.docx")).toBe("docx");
    expect(uploadKind("scan.png")).toBeNull();
    expect(uploadKind("old.doc")).toBeNull();
  });

  it("explains why a file can't be used", () => {
    expect(validateUpload({ name: "scan.png", size: 10 })).toMatch(/can't be read/);
    expect(validateUpload({ name: "big.docx", size: UPLOAD_MAX_BYTES + 1 })).toMatch(
      /This file is 1,025 KB, over the 1 MB limit\. .*then choose it again\./
    );
    expect(validateUpload({ name: "empty.txt", size: 0 })).toMatch(/empty/);
    expect(validateUpload({ name: "fine.txt", size: 200 })).toBeNull();
  });

  it("suggests a template name from the file name", () => {
    expect(nameFromFile("final_written-warning.docx")).toBe("final written warning");
  });

  it("turns plain text into escaped paragraphs", () => {
    expect(textToHtml("Dear <name>,\r\n\r\nLine one\nLine two")).toBe(
      "<p>Dear &lt;name&gt;,</p><p>Line one<br>Line two</p>"
    );
  });

  it("reads the paragraphs of a Word document", () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>Dear Jordan</w:t></w:r></w:p>
      <w:p><w:r><w:t>First</w:t><w:tab/><w:t>second</w:t></w:r></w:p>
    </w:body></w:document>`;
    expect(docxXmlToParagraphs(xml)).toEqual(["Dear Jordan", "First second"]);
  });

  it("reads a Markdown file into sanitised letter HTML", async () => {
    const file = new File(["# Offer\n\nWe are pleased <script>alert(1)</script>to offer"], "offer.md");
    const html = await readTemplateFile(file);
    expect(html).toContain("Offer");
    expect(html).toContain("pleased");
    expect(html).not.toContain("<script");
  });

  it("refuses a file with no text", async () => {
    await expect(readTemplateFile(new File(["<p> </p>"], "blank.html"))).rejects.toThrow(/any text/);
  });

  it("puts uploaded text in the body section when there is one", () => {
    expect(uploadTargetSection({ defaultSections: [{ id: "header" }, { id: "body" }] as never })).toBe("body");
    expect(
      uploadTargetSection({ defaultSections: [{ id: "header" }, { id: "subject" }, { id: "outcome" }] as never })
    ).toBe("outcome");
  });
});
