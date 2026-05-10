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
      if (event.contexts?.draft) delete event.contexts.draft;
      if (event.extra?.html) delete event.extra.html;
      if (event.extra?.answers) delete event.extra.answers;
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
