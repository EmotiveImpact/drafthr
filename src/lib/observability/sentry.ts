/**
 * Sentry initialisation. Activated by setting VITE_SENTRY_DSN in the
 * environment. When unset, this is a no-op so local dev stays quiet.
 */
import * as Sentry from "@sentry/react";

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
const ENV =
  (import.meta.env.VITE_SENTRY_ENV as string | undefined) ??
  (import.meta.env.MODE === "production" ? "production" : "development");
const RELEASE = (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) ?? undefined;
const SENSITIVE_CONTEXT_KEY =
  /(answer|body|comment|content|draft|employee|employer|evidence|html|letter|message|prompt|profile|quote|section|signature)/i;
const REDACTED = "[redacted]";
// Breadcrumb and exception text longer than this is treated as possible letter
// content and replaced. Real log lines and error messages are short.
const MAX_FREE_TEXT_CHARS = 200;
// Breadcrumb data keys that can hold request/response bodies or typed input.
const BODY_DATA_KEY =
  /(body|data|payload|input|value|text|html|request|response|args|arguments)/i;

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type BeforeBreadcrumb = NonNullable<SentryOptions["beforeBreadcrumb"]>;
type SentryBreadcrumb = Parameters<BeforeBreadcrumb>[0];
type BeforeSend = NonNullable<SentryOptions["beforeSend"]>;
type SentryErrorEvent = Parameters<BeforeSend>[0];

let initialised = false;

export function initSentry(): void {
  if (initialised || !DSN) return;
  initialised = true;
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    // Performance — light defaults; tune in prod
    tracesSampleRate: ENV === "production" ? 0.1 : 1.0,
    // Error sampling
    sampleRate: 1.0,
    // PII — we collect names, addresses, salaries. Default OFF.
    sendDefaultPii: false,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubEvent(event),
  });
}

/**
 * Breadcrumbs are the main way letter text leaks: console breadcrumbs carry
 * whatever was logged (drafts, prompts, AI output), fetch/xhr breadcrumbs can
 * carry bodies, and ui.input breadcrumbs describe what was typed. Keep only
 * the shape: category, level, method, status, URL path, short messages.
 */
export function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb | null {
  // Keystroke breadcrumbs describe the editor; drop them entirely.
  if (breadcrumb.category === "ui.input") return null;

  const clean: SentryBreadcrumb = { ...breadcrumb };
  if (typeof clean.message === "string") {
    clean.message = scrubFreeText(clean.message);
  }
  if (clean.category === "console") {
    // Console arguments are arbitrary objects (often a whole draft).
    delete clean.data;
    return clean;
  }
  if (clean.data && typeof clean.data === "object") {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(clean.data)) {
      if (key === "url" && typeof value === "string") {
        data.url = stripQuery(value);
      } else if (BODY_DATA_KEY.test(key) || SENSITIVE_CONTEXT_KEY.test(key)) {
        continue;
      } else if (typeof value === "string") {
        data[key] = scrubFreeText(value);
      } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
        data[key] = value;
      }
    }
    clean.data = data;
  }
  return clean;
}

/** Event-level scrub: contexts, request bodies, breadcrumbs, long messages. */
export function scrubEvent(event: SentryErrorEvent): SentryErrorEvent {
  // Hard scrub: never send draft content as it contains employee PII.
  event.extra = redactSentryContext(event.extra);
  event.contexts = redactSentryContext(event.contexts);
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (typeof event.request.url === "string") event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
  }
  if (typeof event.message === "string") event.message = scrubFreeText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string") ex.value = scrubFreeText(ex.value);
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b): b is SentryBreadcrumb => b !== null);
  }
  return event;
}

function scrubFreeText(value: string): string {
  return value.length > MAX_FREE_TEXT_CHARS ? `${REDACTED} (${value.length} chars)` : value;
}

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    // eslint-disable-next-line no-console
    console.error("[error]", err, context);
    return;
  }
  Sentry.captureException(err, { extra: context });
}

function redactSentryContext<T>(value: T): T {
  return redactValue(value, 0) as T;
}

function redactValue(value: unknown, depth: number): unknown {
  if (!value || typeof value !== "object") return value;
  if (depth > 3) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    clean[key] = SENSITIVE_CONTEXT_KEY.test(key)
      ? REDACTED
      : redactValue(nested, depth + 1);
  }
  return clean;
}
