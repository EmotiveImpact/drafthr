/**
 * Server-side PDF export using puppeteer-core + @sparticuz/chromium-min.
 *
 * This is the production-quality export path. Local dev and the client-side
 * `html2pdf.js` path remain as a fallback for offline use; in production the
 * client should call POST /api/export/pdf with the rendered letter HTML and
 * receive a PDF blob in response.
 *
 * Required env vars on Vercel:
 *   CHROMIUM_PACK_URL  — public URL to the chromium tarball (e.g.
 *                        https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar)
 *
 * Memory: 1024MB+ recommended (set in vercel.json).
 */

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type ExportRequest = {
  html: string;
  filename?: string;
};

const DEFAULT_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

const A4_CSS = `
  @page { size: A4; margin: 25mm 22mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
    color: #0f172a;
    font-size: 11pt;
    line-height: 1.55;
  }
  p { margin: 0 0 0.85rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 12pt 0; }
  em { color: #475569; font-style: italic; }
  strong { font-weight: 600; }
`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: ExportRequest;
  try {
    body = (await req.json()) as ExportRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!body.html || typeof body.html !== "string") {
    return new Response(JSON.stringify({ error: "html required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const packUrl = process.env.CHROMIUM_PACK_URL ?? DEFAULT_PACK_URL;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(packUrl),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${A4_CSS}</style></head><body>${body.html}</body></html>`;
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    const filename = (body.filename ?? "letter.pdf").replace(/[^a-z0-9._-]+/gi, "-");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
