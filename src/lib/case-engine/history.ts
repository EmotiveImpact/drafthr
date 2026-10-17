import type {
  Actor,
  CaseEvent,
  CaseFile,
  FactEntry,
  FactValue,
  IsoDate,
  Jurisdiction,
  Lens,
  SituationId,
  Source,
} from "./types.js";

function sameValue(a: FactValue, b: FactValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * Rebuilds the case file from the full history. The history is the record;
 * the case file is a view of it and is never stored as the truth.
 *
 * - A fact recorded twice with the same value gains a second source.
 * - A fact the user answers directly replaces what came before; the old
 *   value moves to `earlier`.
 * - Two other sources that disagree (the story and an uploaded letter, say)
 *   leave the first value in place and mark the fact as conflicted until
 *   someone corrects it.
 * - A correction always wins and clears any conflict.
 * - A forgotten fact drops out of the case file. The events stay in the
 *   history, so a real erasure must also redact stored events (Stage 1).
 */
export function rebuildCaseFile(caseId: string, history: readonly CaseEvent[]): CaseFile {
  const first = history[0];
  if (!first || first.type !== "case_opened") {
    throw new Error("A case history must start with a case_opened event");
  }
  const file: CaseFile = {
    caseId,
    situation: first.situation,
    lens: first.lens,
    jurisdiction: first.jurisdiction,
    openedAt: first.at,
    story: [],
    facts: {},
    forgotten: [],
    documents: [],
    letters: [],
    asked: [],
    notes: { people: [], moments: [] },
  };
  const seen = new Set<string>();

  for (const event of history) {
    if (seen.has(event.id)) throw new Error(`Duplicate event id ${event.id}`);
    seen.add(event.id);

    switch (event.type) {
      case "case_opened":
        if (event !== first) throw new Error("A case can only be opened once");
        break;
      case "story_told":
        file.story.push({ eventId: event.id, text: event.text });
        break;
      case "question_asked":
        if (!file.asked.includes(event.factKey)) file.asked.push(event.factKey);
        break;
      case "fact_recorded":
        recordFact(file, event.key, event.value, event.source, event.certainty ?? "stated");
        break;
      case "fact_corrected": {
        const old = file.facts[event.key];
        const source: Source = { kind: "correction", eventId: event.id };
        file.facts[event.key] = {
          key: event.key,
          value: event.value,
          sources: [source],
          certainty: "corrected",
          earlier: old ? [...old.earlier, ...retire(old)] : [],
        };
        file.forgotten = file.forgotten.filter((k) => k !== event.key);
        break;
      }
      case "fact_forgotten":
        delete file.facts[event.key];
        if (!file.forgotten.includes(event.key)) file.forgotten.push(event.key);
        break;
      case "document_added":
        file.documents.push({ documentId: event.documentId, name: event.name, eventId: event.id });
        break;
      case "letter_drafted":
        upsertLetter(file, event.stepId, { letterId: event.letterId, drafted: true });
        break;
      case "letter_sent":
        upsertLetter(file, event.stepId, { sentOn: event.sentOn });
        break;
      case "story_noted":
        file.notes = {
          title: event.title ?? file.notes.title,
          people: mergeBy(file.notes.people, event.people, (p) => p.name.toLowerCase()),
          moments: mergeBy(file.notes.moments, event.moments, (m) => `${m.date ?? m.when}|${m.what.toLowerCase()}`),
        };
        break;
    }
  }
  return file;
}

function mergeBy<T>(old: T[], added: T[], key: (item: T) => string): T[] {
  const out = [...old];
  for (const item of added) {
    const i = out.findIndex((o) => key(o) === key(item));
    if (i >= 0) out[i] = item;
    else out.push(item);
  }
  return out;
}

function retire(entry: FactEntry): FactEntry["earlier"] {
  return entry.sources.map((source) => ({
    value: entry.value,
    source,
    eventId: "eventId" in source ? source.eventId : "",
  }));
}

function recordFact(
  file: CaseFile,
  key: string,
  value: FactValue,
  source: Source,
  certainty: "stated" | "inferred"
): void {
  file.forgotten = file.forgotten.filter((k) => k !== key);
  const entry = file.facts[key];
  if (!entry) {
    file.facts[key] = { key, value, sources: [source], certainty, earlier: [] };
    return;
  }
  if (sameValue(entry.value, value)) {
    entry.sources.push(source);
    if (entry.conflict) {
      entry.conflict.values.push({ value, source });
    }
    return;
  }
  if (source.kind === "answer") {
    file.facts[key] = {
      key,
      value,
      sources: [source],
      certainty,
      earlier: [...entry.earlier, ...retire(entry)],
    };
    return;
  }
  const values = entry.conflict?.values ?? entry.sources.map((s) => ({ value: entry.value, source: s }));
  entry.conflict = { values: [...values, { value, source }] };
}

function upsertLetter(
  file: CaseFile,
  stepId: string,
  patch: { letterId?: string; drafted?: boolean; sentOn?: IsoDate }
): void {
  const existing = file.letters.find((l) => l.stepId === stepId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    file.letters.push({
      stepId,
      letterId: patch.letterId ?? "",
      drafted: patch.drafted ?? Boolean(patch.sentOn),
      sentOn: patch.sentOn,
    });
  }
}

/**
 * Builds a history one event at a time with sequential ids and timestamps.
 * Used by tests and stories; the app will write events from its API.
 */
export function historyBuilder(caseStart: string) {
  const events: CaseEvent[] = [];
  let n = 0;
  const base = Date.parse(caseStart);
  const next = (actor: Actor) => {
    n += 1;
    return { id: `e${n}`, at: new Date(base + n * 1000).toISOString(), actor };
  };

  return {
    events,
    open(situation: SituationId, lens: Lens, jurisdiction: Jurisdiction) {
      events.push({ ...next("user"), type: "case_opened", situation, lens, jurisdiction });
      return this;
    },
    story(text: string) {
      const event = { ...next("user"), type: "story_told" as const, text };
      events.push(event);
      return event.id;
    },
    /** A fact the Reader found in a story, with the words it came from. */
    fromStory(storyEventId: string, key: string, value: FactValue, quote: string) {
      events.push({
        ...next("reader"),
        type: "fact_recorded",
        key,
        value,
        source: { kind: "story", eventId: storyEventId, quote },
      });
      return this;
    },
    /** A fact from a document the user added. */
    fromDocument(documentEventId: string, documentId: string, key: string, value: FactValue, quote?: string) {
      events.push({
        ...next("reader"),
        type: "fact_recorded",
        key,
        value,
        source: { kind: "document", eventId: documentEventId, documentId, quote },
      });
      return this;
    },
    document(documentId: string, name: string) {
      const event = { ...next("user"), type: "document_added" as const, documentId, name };
      events.push(event);
      return event.id;
    },
    /** The user answers the interviewer's question. */
    answer(key: string, value: FactValue, question = key) {
      const asked = { ...next("engine"), type: "question_asked" as const, factKey: key, question };
      events.push(asked);
      events.push({
        ...next("user"),
        type: "fact_recorded",
        key,
        value,
        source: { kind: "answer", eventId: asked.id, questionKey: key },
      });
      return this;
    },
    correct(key: string, value: FactValue, reason?: string) {
      events.push({ ...next("user"), type: "fact_corrected", key, value, reason });
      return this;
    },
    forget(key: string, reason?: string) {
      events.push({ ...next("user"), type: "fact_forgotten", key, reason });
      return this;
    },
    drafted(stepId: string, letterId: string) {
      events.push({ ...next("user"), type: "letter_drafted", stepId, letterId });
      return this;
    },
    sent(stepId: string, sentOn: IsoDate) {
      events.push({ ...next("user"), type: "letter_sent", stepId, sentOn });
      return this;
    },
  };
}
