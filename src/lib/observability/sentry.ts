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
    beforeSend(event) {
      // Hard scrub: never send draft content as it contains employee PII.
      event.extra = redactSentryContext(event.extra);
      event.contexts = redactSentryContext(event.contexts);
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });
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
