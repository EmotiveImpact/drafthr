/**
 * Branded export footer — appended to the end of every exported PDF/DOCX/ZIP
 * pack letter. Calendly-mechanism: every recipient who opens the file sees
 * "Drafted with DraftHR — drafthr.io," drives organic acquisition with zero
 * ongoing cost.
 *
 * Layered toggle (first match wins):
 *
 *   1. Env force-off                — admin escape hatch, kills footer globally
 *   2. Paid tenant plan             — Pro / Business / Enterprise hide the footer
 *                                     (becomes a real upgrade reason)
 *   3. Per-user opt-out             — Settings toggle for paid-tier users who
 *                                     want consistency (future, when billing lands)
 *   4. Default                      — ON
 *
 * The decision happens on the CLIENT, then the rendered HTML flows through to
 * the server PDF renderer + the DOCX writer + the ZIP pack. Single source of
 * truth; server doesn't need to know whether the footer should appear — it
 * just renders whatever HTML the client gave it.
 */

export type ExportFooterContext = {
  /** false = env says OFF. true / undefined = env says ON (default). */
  envEnabled?: boolean;
  /** Tenant's plan tier. Anything other than "free" / null suppresses footer. */
  tenantPlan?: "free" | "pro" | "business" | "enterprise" | null;
  /** Per-user opt-out toggle (future Settings). True = user wants no footer. */
  userOptOut?: boolean;
};

export function exportFooterEnabled(ctx: ExportFooterContext = {}): boolean {
  if (ctx.envEnabled === false) return false;
  if (ctx.tenantPlan && ctx.tenantPlan !== "free") return false;
  if (ctx.userOptOut === true) return false;
  return true;
}

/**
 * Resolve the env-side flag from VITE_DRAFTHR_EXPORT_FOOTER. Anything that
 * parses as "false" / "0" / "off" / "no" disables; everything else (including
 * unset) keeps it on.
 *
 * Lives in this file so both pdf.ts and docx.ts can call the same parse rule.
 */
export function resolveClientEnvFlag(): boolean {
  const raw = (import.meta.env?.VITE_DRAFTHR_EXPORT_FOOTER ?? "") as string;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") {
    return false;
  }
  return true;
}

/**
 * The footer HTML itself. Visible but tasteful — 8.5pt grey, centered,
 * separated from the letter body by a hairline. Calendly's mechanism done
 * with restraint.
 *
 * NOT rendered when exportFooterEnabled returns false.
 *
 * Uses inline styles only because some downstream renderers (DOCX writer,
 * Puppeteer with restrictive CSP) don't honor external stylesheets.
 */
export function brandedExportFooterHtml(ctx: ExportFooterContext = {}): string {
  if (!exportFooterEnabled(ctx)) return "";
  return (
    '<div class="drafthr-export-footer" ' +
    'style="margin-top:32pt;padding-top:8pt;border-top:1px solid #e2e8f0;' +
    "text-align:center;font-size:8.5pt;color:#94a3b8;" +
    'font-family:-apple-system,Helvetica,Arial,sans-serif;letter-spacing:0.02em;">' +
    'Drafted with <strong style="color:#475569;">DraftHR</strong> · drafthr.io' +
    "</div>"
  );
}
