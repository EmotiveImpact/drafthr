import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  IMAGE_NOT_EMBEDDED_NOTE,
  fetchImageAsDataUrl,
  markUnembeddedImagesHtml,
} from "./embedRemoteImages";
import { RemoteImageEmbed } from "@/lib/tiptap/remote-image-embed";
import { renderLetterDocxBlob } from "@/lib/export/docx";
import { letterBodyHtml } from "@/lib/export/pdf";
import type { Draft } from "@/lib/letters/types";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const PNG_BYTES = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));

function response(body: Uint8Array, type: string, init: { status?: number; length?: number } = {}) {
  const headers = new Headers({ "content-type": type });
  if (init.length !== undefined) headers.set("content-length", String(init.length));
  return new Response(body as BlobPart, { status: init.status ?? 200, headers });
}

describe("fetchImageAsDataUrl", () => {
  it("embeds a remote PNG as a data URL, fetched without credentials", async () => {
    const fetcher = vi.fn(async () => response(PNG_BYTES, "image/png"));
    const out = await fetchImageAsDataUrl("https://example.com/a.png", { fetcher: fetcher as unknown as typeof fetch });
    expect(out).toBe(`data:image/png;base64,${PNG_B64}`);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com/a.png",
      expect.objectContaining({ credentials: "omit", mode: "cors" }),
    );
  });

  it("refuses non-images, failures and anything over the size cap", async () => {
    const html = vi.fn(async () => response(PNG_BYTES, "text/html"));
    const missing = vi.fn(async () => response(PNG_BYTES, "image/png", { status: 404 }));
    const huge = vi.fn(async () => response(PNG_BYTES, "image/png", { length: 50_000_000 }));
    const cors = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const noImage = vi.fn(async () => null);
    for (const f of [html, missing, huge, cors]) {
      expect(
        await fetchImageAsDataUrl("https://example.com/a.png", { fetcher: f as unknown as typeof fetch, loadImage: noImage }),
      ).toBeNull();
    }
    const small = vi.fn(async () => response(PNG_BYTES, "image/png"));
    expect(
      await fetchImageAsDataUrl("https://example.com/a.png", { fetcher: small as unknown as typeof fetch, maxBytes: 10 }),
    ).toBeNull();
  });

  it("falls back to loading through an <img> when fetch is refused (the CSP allows images, not fetch)", async () => {
    const data = `data:image/png;base64,${PNG_B64}`;
    const refused = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const loadImage = vi.fn(async () => data);
    expect(
      await fetchImageAsDataUrl("https://cdn.example/a.png", { fetcher: refused as unknown as typeof fetch, loadImage }),
    ).toBe(data);
    expect(loadImage).toHaveBeenCalledWith("https://cdn.example/a.png", expect.any(Number), expect.any(Number));

    // A definite answer from the host (404, not an image) is not retried.
    loadImage.mockClear();
    const missing = vi.fn(async () => response(PNG_BYTES, "image/png", { status: 404 }));
    await fetchImageAsDataUrl("https://cdn.example/a.png", { fetcher: missing as unknown as typeof fetch, loadImage });
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("stops reading a body with no Content-Length once it passes the cap", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const fetcher = vi.fn(
      async () => new Response(endless, { headers: { "content-type": "image/png" } }),
    );
    expect(
      await fetchImageAsDataUrl("https://example.com/big.png", {
        fetcher: fetcher as unknown as typeof fetch,
        maxBytes: 10 * 1024,
      }),
    ).toBeNull();
    expect(pulled).toBeLessThan(20);
  });
});

describe("RemoteImageEmbed editor extension", () => {
  function makeEditor(fetchImage: (url: string) => Promise<string | null>) {
    return new Editor({
      extensions: [StarterKit, Image.configure({ allowBase64: true }), RemoteImageEmbed.configure({ fetchImage })],
      content: "<p>Before</p>",
    });
  }

  it("swaps a pasted remote image for an embedded data URL", async () => {
    const data = `data:image/png;base64,${PNG_B64}`;
    const editor = makeEditor(async () => data);
    editor.commands.insertContent(`<img src="https://example.com/chart.png" alt="Chart">`);
    await vi.waitFor(() => expect(editor.getHTML()).toContain(data));
    expect(editor.getHTML()).not.toContain("https://example.com/chart.png");
    editor.destroy();
  });

  it("leaves a locked (read-only) letter untouched, and embeds once it becomes editable", async () => {
    const data = `data:image/png;base64,${PNG_B64}`;
    const fetchImage = vi.fn(async () => data);
    const onUpdate = vi.fn();
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ allowBase64: true }), RemoteImageEmbed.configure({ fetchImage })],
      content: `<p>Approved</p><img src="https://example.com/old.png">`,
      editable: false,
      onUpdate,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImage).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(editor.getHTML()).toContain("https://example.com/old.png");

    editor.setEditable(true, false);
    await vi.waitFor(() => expect(editor.getHTML()).toContain(data));
    editor.destroy();
  });

  it("leaves a visible note when the image cannot be fetched", async () => {
    const editor = makeEditor(async () => null);
    editor.commands.insertContent(`<img src="https://blocked.example/x.png">`);
    await vi.waitFor(() => expect(editor.getHTML()).toContain(IMAGE_NOT_EMBEDDED_NOTE));
    expect(editor.getHTML()).not.toContain("<img");
    editor.destroy();
  });
});

describe("export of images that were never embedded", () => {
  it("markUnembeddedImagesHtml keeps data images and flags remote ones", () => {
    const out = markUnembeddedImagesHtml(
      `<p>a</p><img src="data:image/png;base64,${PNG_B64}"><img alt="x" src="https://example.com/x.png">`,
    );
    expect(out).toContain(`data:image/png;base64,${PNG_B64}`);
    expect(out).toContain(`<em>${IMAGE_NOT_EMBEDDED_NOTE}</em>`);
    expect(out).not.toContain("example.com");
  });

  it("PDF body and DOCX show the note instead of silently dropping the image", async () => {
    const draft = makeDraft(`<p>See chart</p><img src="https://example.com/chart.png">`);
    expect(letterBodyHtml(draft)).toContain(IMAGE_NOT_EMBEDDED_NOTE);
    const zip = await JSZip.loadAsync(await renderLetterDocxBlob(draft));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain(IMAGE_NOT_EMBEDDED_NOTE);
  });
});

function makeDraft(html: string): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-02",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "Acme Ltd", address: "", hasLetterhead: false, signatoryName: "A", signatoryTitle: "B" },
    employee: { legalName: "Jamie", jobTitle: "Analyst", address: "", startDate: "2025-01-01", serviceMonths: 12 },
    answers: {},
    sections: [{ id: "s1", sectionId: "body", title: "Body", required: true, status: "ready", versions: [], html }],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}
