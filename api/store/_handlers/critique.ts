/**
 * /api/store/critique — AI specialist critique of the current letter, through a
 * chosen lens (tribunal counsel / employee advocate / DEI lead). Spends ONE AI
 * credit per run (the first real consumer of the credit ledger).
 *
 * POST { lens, letterText, letterType?, jurisdiction? } → { critique, creditsRemaining }
 *
 * Credit safety: spend BEFORE the model call, refund if the model call fails, so
 * a caller is never charged for a critique they didn't receive. The spend itself
 * is atomic (advisory-locked pool) in entitlements.spendCredits, so concurrent
 * runs can't overspend a shared balance.
 */
import { generateText } from "ai";
import { anthropicModel } from "../../_utils/anthropic-provider.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { spendCredits, refundCredits } from "../../_utils/entitlements.js";

export const config = { runtime: "nodejs" };

const CRITIQUE_MODEL = "claude-opus-4-8" as const;
const CREDIT_COST = 1;
const MAX_LETTER_CHARS = 60_000; // cap input so one call can't run up unbounded token spend
const MAX_OUTPUT_TOKENS = 1_400;

type Lens = "tribunal" | "employee_advocate" | "dei";

const LENSES: Record<Lens, { label: string; system: string }> = {
  tribunal: {
    label: "Tribunal counsel",
    system:
      "You are experienced UK employment tribunal counsel reviewing a letter before it is sent. " +
      "Assess it the way opposing counsel and a tribunal would: legal exposure, factual and evidential gaps, " +
      "admissions or emotive language that could be used against the author, missing dates/facts, and tone. " +
      "Be specific and practical — cite the exact phrasing you would change.",
  },
  employee_advocate: {
    label: "Employee advocate",
    system:
      "You are a seasoned employee-side advocate reviewing a letter the employee is about to send. " +
      "Make sure it protects their position: are their asks clear, is the record preserved, are rights and " +
      "deadlines asserted, and does it avoid weakening their case or over-conceding? Flag anything that " +
      "undermines them and suggest stronger, concrete wording.",
  },
  dei: {
    label: "DEI lead",
    system:
      "You are a DEI lead reviewing a workplace letter. Check for inclusive, respectful, non-discriminatory " +
      "language; unconscious bias; assumptions about protected characteristics; and whether the tone treats all " +
      "parties fairly. Suggest concrete rewrites where language could be more inclusive or could expose the " +
      "author to a fairness/discrimination concern.",
  },
};

function isLens(v: unknown): v is Lens {
  return v === "tribunal" || v === "employee_advocate" || v === "dei";
}

type CritiqueRequest = {
  lens?: string;
  letterText?: string;
  letterType?: string;
  jurisdiction?: string;
};

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "ai-critique", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return jsonError("AI critique is not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.activeTenant?.id ?? null;
  const userId = auth.userRow.id;

  const parsed = await readJsonRequest<CritiqueRequest>(req, 200_000);
  if (!parsed.ok) return parsed.response;
  const { lens, letterText, letterType, jurisdiction } = parsed.body;
  if (!isLens(lens)) return jsonError("Unknown critique lens", 400);
  const text = typeof letterText === "string" ? letterText.trim() : "";
  if (!text) return jsonError("Nothing to critique yet — write some of the letter first.", 400);
  if (text.length > MAX_LETTER_CHARS) {
    return jsonError("This letter is too long to critique in one pass.", 413);
  }

  // Debit first (atomic). If the caller is out of credits, stop before any spend.
  const spend = await spendCredits(tenantId, userId, CREDIT_COST, "ai_critique");
  if (!spend.ok) {
    return new Response(
      JSON.stringify({
        error: "You're out of AI credits. Buy a pack or upgrade your plan to run a critique.",
        needCredits: true,
        credits: spend.balance,
      }),
      { status: 402, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }

  const lensDef = LENSES[lens];
  const context = [
    letterType ? `Letter type: ${letterType}.` : "",
    jurisdiction ? `Jurisdiction: ${jurisdiction}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const model = anthropicModel(apiKey, CRITIQUE_MODEL);
    const { text: critique } = await generateText({
      model,
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system:
        `${lensDef.system}\n\n` +
        "Return concise GitHub-flavoured Markdown with exactly these sections, in order:\n" +
        "**Verdict** — one sentence.\n" +
        "**Strengths** — up to 3 bullets.\n" +
        "**Risks & gaps** — up to 5 bullets, most serious first.\n" +
        "**Suggested fixes** — up to 5 bullets, each a concrete change (quote the wording to change). " +
        "Do not invent facts that aren't in the letter.",
      prompt:
        `${context ? context + "\n\n" : ""}Critique the following letter through your lens.\n\n` +
        `---\n${text}\n---`,
    });
    const clean = critique.trim();
    if (!clean) {
      // Empty completion — treat as a failed run and make the caller whole.
      await refundCredits(tenantId, userId, CREDIT_COST, "ai_critique_refund");
      return jsonError("The critique came back empty — please try again.", 502);
    }
    return new Response(
      JSON.stringify({ critique: clean, lens, lensLabel: lensDef.label, creditsRemaining: spend.balance }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Model call failed after the debit — refund so the run is free.
    console.error("[store/critique] model error — refunding credit", err);
    await refundCredits(tenantId, userId, CREDIT_COST, "ai_critique_refund");
    return jsonError("The critique service is busy — your credit was not charged. Please try again.", 502);
  }
}
