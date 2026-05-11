/**
 * Diagnostic endpoint. Returns which env keys the function sees and which
 * are missing. Does NOT return values. Safe to leave deployed — but feel
 * free to delete once /api/draft is working.
 *
 * Hit with: curl https://<your-deploy>.vercel.app/api/debug/env
 */

export const config = {
  runtime: "nodejs",
};

const KEYS = [
  "LLM_PROVIDER",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_MODEL",
  "LLM_MODEL",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "VERCEL",
  "VERCEL_ENV",
  "NODE_ENV",
];

export function GET(): Response {
  const report: Record<string, string> = {};
  for (const k of KEYS) {
    const v = process.env[k];
    if (v === undefined) {
      report[k] = "MISSING";
    } else if (k.endsWith("_KEY") || k.endsWith("_URL") || k.endsWith("URL")) {
      // Redact values that are or contain secrets.
      report[k] = `set (len=${v.length})`;
    } else {
      report[k] = v;
    }
  }
  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
