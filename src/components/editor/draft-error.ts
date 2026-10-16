import { serverErrorMessage } from "@/lib/llm/client";

/**
 * What to tell a person when DraftHR could not write or rewrite part of a
 * letter. The drafting client throws developer messages ("/api/draft failed:
 * 400 bad request", "Server error (502)", "Rate limited (429)"); those go to
 * the console, and the person gets a plain sentence they can act on. A
 * refusal the server wrote for people (no plan for this model, a viewer
 * role) is already plain and is shown as it is.
 */
export function draftErrorCopy(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : typeof err === "string" ? err.trim() : "";
  if (!raw) return GENERIC;
  if (/rate limit|429|quota|overloaded|allocation/i.test(raw)) {
    return "DraftHR is busy right now. Wait a minute, then try again.";
  }
  if (/network|failed to fetch|connection dropped|load failed|timed? ?out/i.test(raw)) {
    return "DraftHR could not be reached. Check your connection, then try again.";
  }
  if (/api[_ ]?key|not configured|[A-Z]{3,}_[A-Z_]{3,}|missing env|environment variable/i.test(raw)) {
    // The server is not set up to draft (no model key): nothing to retry yet.
    return "DraftHR cannot write letters on this workspace yet. Ask whoever set up DraftHR to finish connecting it.";
  }
  if (/blocked by authentication|\b401\b/i.test(raw)) {
    return "DraftHR could not confirm you are signed in. Sign in again, then try again.";
  }
  // A JSON error envelope inside a developer message: use its words.
  const body = raw.replace(/^\/api\/\S+ failed: \d{3}\s*/, "");
  const fromServer = serverErrorMessage(body);
  if (fromServer && !looksTechnical(fromServer)) return fromServer;
  if (looksTechnical(raw)) return GENERIC;
  return raw;
}

const GENERIC = "Something went wrong while DraftHR was writing. Try again.";

function looksTechnical(s: string): boolean {
  return /\/api\/|\b[45]\d\d\b|error\s*\(|exception|undefined|null|stack|json|fetch|status|bad request/i.test(s);
}
