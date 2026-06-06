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

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { rateLimit, clientIp } from "../_utils/rate-limit.js";
import { enforceSameOrigin } from "../_utils/request.js";
import { requireSessionAndTenant } from "../_utils/session-with-tenant.js";
import { parseTsr, requestTsr } from "../_utils/tsa.js";
import { appendAuditEvent } from "../../src/db/audit.js";
import { getDb } from "../../src/db/index.js";
import { drafts } from "../../src/db/schema.js";
import { inlineImagesForExport } from "../../src/lib/storage/inlineImagesForExport.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type ExportRequest = {
  html: string;
  filename?: string;
  // Audit metadata — all optional. Missing values are tolerated; the audit
  // write is best-effort and never blocks the PDF response.
  draftId?: string;
  reviewedBy?: string;
  reviewedOn?: string;
};

const DEFAULT_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";

const MAX_JSON_CHARS = 5_000_000;
const MAX_HTML_CHARS = 4_000_000;
const MAX_FILENAME_CHARS = 120;
const PDF_RENDER_TIMEOUT_MS = 15_000;
const ALLOWED_RESOURCE_TYPES = new Set(["image", "font", "media"]);
const PDF_CSP =
  "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'";

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

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = rateLimit(req, { name: "pdf", max: 12, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const tenantId = auth.activeTenant.id;
  const actorUserId = auth.userRow.id;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }

  const contentLength = parseContentLength(req);
  if (contentLength !== null && contentLength > MAX_JSON_CHARS) {
    return jsonError("Request body too large", 413);
  }

  let body: ExportRequest;
  try {
    const raw = await req.text();
    if (raw.length > MAX_JSON_CHARS) {
      return jsonError("Request body too large", 413);
    }
    body = JSON.parse(raw) as ExportRequest;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  if (!body.html || typeof body.html !== "string") {
    return jsonError("html required", 400);
  }
  if (body.html.length > MAX_HTML_CHARS) {
    return jsonError("html too large", 413);
  }
  if (body.filename !== undefined && typeof body.filename !== "string") {
    return jsonError("filename must be a string", 400);
  }

  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
  const draftExists = draftId ? await draftBelongsToTenant(draftId, tenantId) : false;
  if (!draftExists) {
    return jsonError("draft not found in active tenant", 404);
  }

  const packUrl = process.env.CHROMIUM_PACK_URL ?? DEFAULT_PACK_URL;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(packUrl),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PDF_RENDER_TIMEOUT_MS);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      try {
        const url = new URL(request.url());
        const isAllowedDataResource =
          url.protocol === "data:" && ALLOWED_RESOURCE_TYPES.has(request.resourceType());
        if (url.protocol === "about:" || isAllowedDataResource) {
          await request.continue();
        } else {
          await request.abort();
        }
      } catch {
        try {
          await request.abort();
        } catch {
          // Request may already be handled by Chromium.
        }
      }
    });

    // Inline https://blob images to data: URLs before render — Puppeteer's
    // request interceptor above blocks all non-data:/about: requests by design.
    const inlinedHtml = await inlineImagesForExport(body.html);
    const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PDF_CSP}"><style>${A4_CSS}</style></head><body>${inlinedHtml}</body></html>`;
    await page.setContent(fullHtml, { waitUntil: "load", timeout: PDF_RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    // Compute hash up front — both the TSA request and the audit row need it,
    // and the client receives it back in `X-Drafthr-PDF-SHA256` for the
    // verify endpoint.
    const pdfBytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
    const sha256 = createHash("sha256").update(pdfBytes).digest("hex");

    // RFC 3161 round-trip. Returns null if FreeTSA times out / errors —
    // export still succeeds with `tsa: unavailable` in the audit payload.
    const tsr = await requestTsr(sha256);
    const tsrParsed = tsr ? parseTsr(tsr) : null;

    // Best-effort audit write. The export must not fail if Postgres is down,
    // so we swallow every error and log for backfill.
    await tryAppendExportAudit(
      req,
      body,
      {
        tenantId,
        draftId,
        actorUserId,
      },
      pdfBytes,
      sha256,
      tsr,
      tsrParsed,
    ).catch(() => {});

    const filename = safePdfFilename(body.filename);
    // Audit-aware clients can read these headers and persist the TSR
    // alongside the PDF. Browsers that just download the file ignore them.
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Drafthr-PDF-SHA256": sha256,
    };
    if (tsr) {
      headers["X-Drafthr-TSR-Base64"] = tsr.toString("base64");
      headers["X-Drafthr-TSA-Provider"] = "freetsa";
      if (tsrParsed?.ok) headers["X-Drafthr-TSA-Signed-At"] = tsrParsed.signedAtUtc.toISOString();
    } else {
      headers["X-Drafthr-TSA-Status"] = "unavailable";
    }
    return new Response(new Uint8Array(pdfBytes), { headers });
  } finally {
    await browser.close();
  }
}

async function tryAppendExportAudit(
  req: Request,
  body: ExportRequest,
  auditSubject: { tenantId: string; draftId: string; actorUserId: string },
  pdfBytes: Uint8Array,
  sha256: string,
  tsr: Buffer | null,
  tsrParsed: ReturnType<typeof parseTsr> | null,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  // Use the spoof-resistant resolver (proxy-set IP), not the attacker-
  // controllable leftmost XFF — the audit record must hold a trustworthy IP.
  // (Senior sweep B14; matches the S1 rate-limiter fix.)
  const resolvedIp = clientIp(req);
  const ip = resolvedIp === "unknown" ? null : resolvedIp;

  // Stamp the third-party trusted timestamp into the chain. Null when FreeTSA
  // was unreachable — recorded explicitly so a missing TSR is auditable
  // rather than silent.
  const tsa = tsr
    ? {
        provider: "freetsa",
        tsr_base64: tsr.toString("base64"),
        signed_at: tsrParsed?.ok ? tsrParsed.signedAtUtc.toISOString() : null,
        tsa_name: tsrParsed?.ok ? tsrParsed.tsaName : null,
      }
    : { provider: "freetsa", status: "unavailable" as const };

  try {
    await appendAuditEvent({
      tenantId: auditSubject.tenantId,
      kind: "draft.exported",
      subjectType: "draft",
      subjectId: auditSubject.draftId,
      actorUserId: auditSubject.actorUserId,
      payload: {
        format: "pdf",
        sha256,
        byteLength: pdfBytes.byteLength,
        ip,
        reviewedBy: body.reviewedBy ?? null,
        reviewedOn: body.reviewedOn ?? null,
        tsa,
      },
    });
  } catch (err) {
    // Defensive degradation: log and move on.
    console.error("[audit] draft.exported append failed", err);
  }
}

async function draftBelongsToTenant(draftId: string, tenantId: string): Promise<boolean> {
  if (!isUuid(draftId)) return false;
  const db = getDb();
  const [draft] = await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)))
    .limit(1);
  return Boolean(draft);
}

function parseContentLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safePdfFilename(input: string | undefined): string {
  const raw = (input?.trim() || "letter.pdf").slice(0, MAX_FILENAME_CHARS);
  const cleaned = raw.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  const filename = cleaned || "letter.pdf";
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
