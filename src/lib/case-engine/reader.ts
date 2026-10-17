import { lensText } from "./conditions.js";
import { isIsoDate } from "./dates.js";
import type { CaseMoment, CasePerson, FactSpec, FactValue, IsoDate, Lens, Playbook, SituationId } from "./types.js";

/**
 * The Reader: the one AI step that turns a story into facts. This file holds
 * the parts that are plain code, so they can be tested without a model:
 * the prompt, and the clean-up that keeps only what the story really says.
 */

/** What the model is asked to return. Everything in it is checked by cleanReading. */
export type RawReading = {
  situation?: string;
  title?: string;
  facts?: { key?: unknown; value?: unknown; quote?: unknown }[];
  people?: { name?: unknown; role?: unknown; quote?: unknown }[];
  moments?: { date?: unknown; when?: unknown; what?: unknown; quote?: unknown }[];
};

export type Reading = {
  /** The situation the story most looks like, when the model gave a valid one. */
  situation: SituationId | null;
  title: string | null;
  facts: { key: string; value: FactValue; quote: string }[];
  people: CasePerson[];
  moments: CaseMoment[];
};

function factLine(f: FactSpec, lens: Lens): string {
  const choices = f.choices ? ` choices: ${f.choices.join(" | ")}` : "";
  return `- ${f.key} (${f.type}${choices}): ${f.label}. Asked as: ${lensText(f.question, lens)}`;
}

/** The facts the Reader may record for this lens: everything the lens is ever asked. */
export function readerFacts(playbook: Playbook, lens: Lens): FactSpec[] {
  return playbook.facts.filter((f) => f.priority[lens]);
}

export function readerSystemPrompt(playbook: Playbook, lens: Lens, today: IsoDate): string {
  return [
    "You are the Reader in DraftHR, a UK and US employment case tool.",
    "You read a story someone typed about a workplace situation and pull out facts. You never give advice and never work out deadlines.",
    "",
    "Rules:",
    "- Record a fact only when the story states it. Never guess. Leave out anything the story does not say.",
    "- Every fact, person and moment needs a quote: the exact words from the story it came from, copied character for character, as short as possible (a few words).",
    `- Today is ${today}. Write dates as YYYY-MM-DD. When the story gives a day and month without a year, use the most recent such date on or before today, unless the story plainly means a future date. If a date is too vague for a day ("last month"), leave the date fact out.`,
    "- For a choice fact use one of its choices exactly. For a list fact use an array of its choices. For a boolean use true or false.",
    "- Keep text facts short and in plain words, in the story's own terms.",
    "- people: everyone named or clearly identified, with their part in the case (for example \"Warehouse operative, the employee\", \"Jordan's manager, a witness\", \"You, HR lead\").",
    "- moments: dated events in the story in a few words each (for example \"Boxes loaded into his car\"). date is YYYY-MM-DD or null; when is the date as written (\"2 October\").",
    "- title: the case in a few words, such as \"Disciplinary: Jordan Hale\".",
    `- situation: which of disciplinary, grievance or redundancy the story is about. This story is being read as ${playbook.id}.`,
    "",
    `Facts you may record for a ${playbook.name.toLowerCase()} case:`,
    ...readerFacts(playbook, lens).map((f) => factLine(f, lens)),
  ].join("\n");
}

function squash(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when the quote appears in the story, ignoring case, spacing and curly quotes. */
export function quoteInStory(quote: string, story: string): boolean {
  const q = squash(quote);
  return q.length > 0 && squash(story).includes(q);
}

function str(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Coerces a model value to the fact's type, or null when it does not fit. */
export function coerceFactValue(spec: FactSpec, value: unknown): FactValue | null {
  switch (spec.type) {
    case "date":
      return typeof value === "string" && isIsoDate(value) ? value : null;
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "yes") return true;
      if (value === "false" || value === "no") return false;
      return null;
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
      return Number.isFinite(n) ? n : null;
    }
    case "choice":
      return typeof value === "string" && spec.choices?.includes(value) ? value : null;
    case "list": {
      const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      const strings = items.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
      const kept = spec.choices ? strings.filter((v) => spec.choices!.includes(v)) : strings.map((v) => v.slice(0, 120));
      return kept.length ? kept : null;
    }
    case "text":
      return str(value, 600);
  }
}

const SITUATIONS: SituationId[] = ["disciplinary", "grievance", "redundancy"];

/**
 * Keeps only what the story supports: known fact keys, values of the right
 * type, and quotes that really appear in the story. Anything else is dropped.
 */
export function cleanReading(raw: RawReading, playbook: Playbook, lens: Lens, story: string): Reading {
  const specs = new Map(readerFacts(playbook, lens).map((f) => [f.key, f]));
  const facts: Reading["facts"] = [];
  const seen = new Set<string>();
  for (const f of raw.facts ?? []) {
    const key = typeof f.key === "string" ? f.key : "";
    const spec = specs.get(key);
    const quote = str(f.quote);
    if (!spec || seen.has(key) || !quote || !quoteInStory(quote, story)) continue;
    const value = coerceFactValue(spec, f.value);
    if (value === null) continue;
    seen.add(key);
    facts.push({ key, value, quote });
  }

  const people: CasePerson[] = [];
  for (const p of raw.people ?? []) {
    const name = str(p.name, 80);
    if (!name || !quoteInStory(name.split(" ")[0], story)) continue;
    if (people.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    people.push({ name, role: str(p.role, 120) ?? "", quote: str(p.quote) ?? undefined });
    if (people.length >= 12) break;
  }

  const moments: CaseMoment[] = [];
  for (const m of raw.moments ?? []) {
    const what = str(m.what, 90);
    const when = str(m.when, 40);
    if (!what || !when) continue;
    const date = typeof m.date === "string" && isIsoDate(m.date) ? m.date : null;
    const quote = str(m.quote);
    if (quote && !quoteInStory(quote, story)) continue;
    moments.push({ date, when, what, quote: quote ?? undefined });
    if (moments.length >= 12) break;
  }

  const situation = SITUATIONS.includes(raw.situation as SituationId) ? (raw.situation as SituationId) : null;
  return { situation, title: str(raw.title, 80), facts, people, moments };
}
