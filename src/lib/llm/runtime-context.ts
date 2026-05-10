/**
 * Build a "Runtime context" block to inject into every LLM system prompt.
 *
 * Why this exists: LLMs don't know the current date. Without an explicit
 * "today is YYYY-MM-DD" line they hallucinate dates from their training
 * cutoff or pick a plausible-looking guess (e.g. "15 January 2024"). The
 * user is the source of truth for their LOCAL time, so we capture it
 * client-side and ship it with the request.
 *
 * Output format is a stable plain-text block the model can quote from.
 * Locale matches the draft's jurisdiction so "today" renders in the
 * format the letter itself uses (UK: 11 May 2026 / US: May 11, 2026).
 */

export type RuntimeContext = {
  /** ISO date — the canonical machine value. */
  isoDate: string;
  /** Localised, jurisdiction-appropriate date string. */
  localDate: string;
  /** Day of week for that date. */
  dayOfWeek: string;
  /** IANA timezone. */
  timeZone: string;
  /** Locale used for the localised date. */
  locale: string;
};

/**
 * Capture runtime context at the client. Pass a jurisdiction so the
 * `localDate` formatting matches what the letter expects.
 */
export function captureRuntimeContext(jurisdiction: "UK" | "US"): RuntimeContext {
  const now = new Date();
  const timeZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const locale = jurisdiction === "UK" ? "en-GB" : "en-US";

  const localDate = now.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dayOfWeek = now.toLocaleDateString(locale, { weekday: "long" });
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return { isoDate, localDate, dayOfWeek, timeZone, locale };
}

/**
 * Render the context as a system-prompt block. Wrapped with a clear
 * heading + a usage hint so the model treats it as an authoritative
 * fact rather than ambient noise.
 */
export function renderRuntimeContextBlock(ctx: RuntimeContext): string {
  return `RUNTIME CONTEXT — use these values whenever the user refers to "today", "now", "this week", "currently", or any similar present-tense reference. DO NOT make up dates.
- Today's date: ${ctx.localDate} (${ctx.dayOfWeek}, ISO ${ctx.isoDate})
- User timezone: ${ctx.timeZone}
- Locale: ${ctx.locale}`;
}
