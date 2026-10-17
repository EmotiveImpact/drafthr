import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/geist-mono";
import "./case-interview.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { saveWizard } from "@/components/wizard/savedAnswers";
import { answerEvents, newEventId, useCaseStore, type StoredCase } from "@/lib/case-engine/case-store";
import { rebuildCaseFile } from "@/lib/case-engine/history";
import { PLAYBOOKS } from "@/lib/case-engine/playbooks";
import { runPlaybook } from "@/lib/case-engine/runner";
import { letterTypeFor, wizardAnswers } from "@/lib/case-engine/handoff";
import {
  CHAPTERS,
  EXAMPLE_STORY,
  SITUATION_NAMES,
  caseTitle,
  chapterOf,
  formatValue,
  longDate,
  questionQueue,
  todayIso,
  type ChapterId,
} from "@/lib/case-engine/interview";
import type { Reading } from "@/lib/case-engine/reader";
import type { CaseEvent, CaseFile, FactValue, Jurisdiction, MissingFact, Playbook, RunResult, SituationId } from "@/lib/case-engine/types";
import { CaseFilePanel } from "./CaseFilePanel";
import { QuestionInput, emptyValueFor, isAnswered } from "./QuestionInput";
import { Icon } from "./icons";

type Where = "england-wales" | "scotland" | "northern-ireland" | "us";

const WHERE_LABEL: Record<Where, string> = {
  "england-wales": "England and Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
  us: "United States",
};

function jurisdictionFor(where: Where, usState: string): Jurisdiction {
  return where === "us" ? { country: "us", state: usState || "CA" } : { country: "uk", nation: where };
}

function workLocationFor(where: Where): string {
  return where === "england-wales" ? "england" : where === "northern-ireland" ? "northern_ireland" : where;
}

/** /hr/cases/new and /hr/cases/:caseId */
export function CaseInterview() {
  const { caseId } = useParams<{ caseId: string }>();
  const stored = useCaseStore((s) => (caseId ? s.cases[caseId] : undefined));
  const nav = useNavigate();
  useEffect(() => {
    document.title = "Case interview · DraftHR";
  }, []);
  if (caseId && !stored) {
    return (
      <div className="ci" style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p className="ci-eyebrow">Case not found</p>
          <h1 className="ci-h1">This case isn&rsquo;t on this device.</h1>
          <p className="ci-hint">Cases are kept in the browser they were started in for now.</p>
          <button type="button" className="ci-ok" style={{ marginTop: 22 }} onClick={() => nav("/hr/cases/new")}>
            Start a case <Icon name="arrowRight" />
          </button>
        </div>
      </div>
    );
  }
  return stored ? <Interview key={stored.id} stored={stored} /> : <NewCase />;
}

// ---------------------------------------------------------------------------
// Shell: sidebar, main column with the OK bar pinned, case file on the right
// ---------------------------------------------------------------------------

type ShellProps = {
  situationName: string;
  workspace: string;
  chapter: ChapterId;
  chapterSub?: string;
  file?: CaseFile;
  run?: RunResult;
  playbook?: Playbook;
  refLabel?: string;
  openedLine?: string;
  bar: React.ReactNode;
  children: React.ReactNode;
};

function Shell(p: ShellProps) {
  const nav = useNavigate();
  const [fileOpen, setFileOpen] = useState(false);
  const active = CHAPTERS.findIndex((c) => c.id === p.chapter);
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className={`ci ${fileOpen ? "file-open" : ""}`}>
      <nav className="ci-side" aria-label="Interview">
        <a className="ci-logo" href="/hr" onClick={(e) => (e.preventDefault(), nav("/hr"))}>
          <span className="ci-logo-mark">D</span>
          DRAFTHR
        </a>
        <div className="ci-side-case">
          <span className="ci-preview" title="Not yet checked by an employment lawyer">Preview</span>
          <b>{p.situationName}</b>
          <span>{p.workspace ? `${p.workspace} · HR team` : "HR team"}</span>
        </div>
        <div className="ci-segs" aria-hidden="true">
          {CHAPTERS.map((c, i) => (
            <i key={c.id} className={i <= active ? "on" : ""} />
          ))}
        </div>
        <ol className="ci-chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c.id} className={`ci-ch ${i < active ? "done" : i === active ? "now" : ""}`} aria-current={i === active ? "step" : undefined}>
              <span className="ci-ch-dot">{i < active ? <Icon name="check" /> : null}</span>
              <span className="ci-ch-label">{c.label}</span>
              {i === active && p.chapterSub ? <span className="ci-ch-sub">{p.chapterSub}</span> : null}
            </li>
          ))}
        </ol>
        <div className="ci-side-foot">
          <span>
            <Icon name="lock" /> {p.workspace ? `Only ${p.workspace} HR` : "Only your HR team"}
          </span>
          <span className="ok">
            <Icon name="check" /> Saved just now
          </span>
        </div>
      </nav>
      <main className="ci-main">
        <div className="ci-top-actions">
          {p.file ? (
            <button type="button" className="ci-quiet ci-file-btn" onClick={() => setFileOpen(true)}>
              <Icon name="folder" /> Case file
            </button>
          ) : null}
          <button type="button" className="ci-quiet" onClick={() => nav("/hr")} aria-label="Close the interview">
            <Icon name="x" /> Close
          </button>
        </div>
        <div className="ci-scroll" ref={scroller}>
          <div className="ci-inner">{p.children}</div>
        </div>
        <div className="ci-bar">{p.bar}</div>
      </main>
      {p.file && p.run && p.playbook ? (
        <CaseFilePanel
          file={p.file}
          run={p.run}
          playbook={p.playbook}
          refLabel={p.refLabel ?? ""}
          openedLine={p.openedLine ?? ""}
          onClose={fileOpen ? () => setFileOpen(false) : undefined}
        />
      ) : (
        <aside className="ci-file" aria-label="Case file">
          <div className="ci-file-head">
            <div className="ci-ref">New case</div>
            <h2>Your case file</h2>
            <p>It fills in as you tell me what happened.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

function useNames() {
  const { user, activeTenant } = useAuth();
  const me = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "You";
  return { me, workspace: activeTenant?.name || "" };
}

// ---------------------------------------------------------------------------
// Start: what kind of case, where, and the story in the user's own words
// ---------------------------------------------------------------------------

function NewCase() {
  const nav = useNavigate();
  const { me, workspace } = useNames();
  const openCase = useCaseStore((s) => s.openCase);
  const append = useCaseStore((s) => s.append);
  const setStage = useCaseStore((s) => s.setStage);
  const [situation, setSituation] = useState<SituationId>("disciplinary");
  const [where, setWhere] = useState<Where>("england-wales");
  const [story, setStory] = useState("");
  const words = story.trim() ? story.trim().split(/\s+/).length : 0;

  const start = () => {
    if (words < 6) return;
    const id = openCase({ situation, lens: "hr", jurisdiction: jurisdictionFor(where, ""), createdBy: me });
    const at = new Date().toISOString();
    const told: CaseEvent = { id: newEventId(), at, actor: "user", type: "story_told", text: story.trim() };
    const asked: CaseEvent = { id: newEventId(), at, actor: "engine", type: "question_asked", factKey: "workLocation", question: "Where does this happen?" };
    const loc: CaseEvent = {
      id: newEventId(),
      at,
      actor: "user",
      type: "fact_recorded",
      key: "workLocation",
      value: workLocationFor(where),
      source: { kind: "answer", eventId: asked.id, questionKey: "workLocation" },
    };
    append(id, PLAYBOOKS[situation].facts.some((f) => f.key === "workLocation") ? [told, asked, loc] : [told]);
    setStage(id, "reading");
    nav(`/hr/cases/${id}`, { replace: true });
  };

  return (
    <Shell
      situationName="New case"
      workspace={workspace}
      chapter="story"
      chapterSub="Tell it your way"
      bar={
        <>
          <button type="button" className="ci-ok" disabled={words < 6} onClick={start}>
            OK <Icon name="check" />
          </button>
          <span className="ci-bar-sp" />
          <button type="button" className="ci-link" onClick={() => setStory(EXAMPLE_STORY)}>
            <Icon name="spark" /> Use the example story
          </button>
        </>
      }
    >
      <p className="ci-eyebrow">The story</p>
      <h1 className="ci-h1">What&rsquo;s going on?</h1>
      <p className="ci-hint">Tell it like you would to a colleague. Rough is fine. I&rsquo;ll add what I find to the case file.</p>

      <p className="ci-field-label">What kind of case</p>
      <div className="ci-chips">
        {(Object.keys(SITUATION_NAMES) as SituationId[]).map((s) => (
          <button key={s} type="button" className="ci-chip" aria-pressed={situation === s} onClick={() => setSituation(s)}>
            {SITUATION_NAMES[s]}
          </button>
        ))}
      </div>
      <p className="ci-field-label">Where it happens</p>
      <div className="ci-chips">
        {(Object.keys(WHERE_LABEL) as Where[]).map((w) => (
          <button key={w} type="button" className="ci-chip" aria-pressed={where === w} onClick={() => setWhere(w)}>
            {WHERE_LABEL[w]}
          </button>
        ))}
      </div>

      <div className="ci-statement">
        <div className="ci-statement-head">
          <span>Statement · in your words</span>
          <span>
            {me} · {longDate(todayIso())}
          </span>
        </div>
        <textarea
          className="ci-textarea"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="What happened, who was involved, and roughly when."
          aria-label="Your story"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
          }}
        />
        <div className="ci-statement-foot">
          <span>Only your HR team can see this.</span>
          <span>{words} words</span>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// The interview for an open case
// ---------------------------------------------------------------------------

async function readStory(situation: SituationId, story: string): Promise<Reading> {
  const res = await fetch("/api/case/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ situation, lens: "hr", story, today: todayIso() }),
  });
  const body = (await res.json().catch(() => ({}))) as Reading & { error?: string };
  if (!res.ok) throw new Error(body.error || "I couldn't read that just now. Try again in a moment.");
  return body;
}

function readingEvents(storyEventId: string, reading: Reading): CaseEvent[] {
  const at = new Date().toISOString();
  const events: CaseEvent[] = reading.facts.map((f) => ({
    id: newEventId(),
    at,
    actor: "reader",
    type: "fact_recorded",
    key: f.key,
    value: f.value,
    source: { kind: "story", eventId: storyEventId, quote: f.quote },
  }));
  events.push({
    id: newEventId(),
    at,
    actor: "reader",
    type: "story_noted",
    storyEventId,
    title: reading.title ?? undefined,
    people: reading.people,
    moments: reading.moments,
  });
  return events;
}

function Interview({ stored }: { stored: StoredCase }) {
  const nav = useNavigate();
  const { workspace } = useNames();
  const append = useCaseStore((s) => s.append);
  const setStage = useCaseStore((s) => s.setStage);
  const skip = useCaseStore((s) => s.skip);
  const unskipAll = useCallback(
    () => useCaseStore.setState((s) => ({ cases: { ...s.cases, [stored.id]: { ...s.cases[stored.id]!, skipped: [] } } })),
    [stored.id],
  );

  const file = useMemo(() => rebuildCaseFile(stored.id, stored.events), [stored.id, stored.events]);
  const playbook = PLAYBOOKS[file.situation];
  const today = todayIso();
  const run = useMemo(() => runPlaybook(file, playbook, today), [file, playbook, today]);
  const queue = useMemo(() => questionQueue(run, playbook, stored.skipped), [run, playbook, stored.skipped]);

  const refLabel = stored.ref;
  const openedLine = `Opened ${longDate(new Date(stored.createdAt).toISOString().slice(0, 10))} · ${stored.createdBy}`;
  const answered = file.asked.length;

  // The Reader runs once per story; a reload mid-read simply runs it again.
  const [readError, setReadError] = useState<string | null>(null);
  const reading = useRef(false);
  const runReader = useCallback(async () => {
    const last = file.story[file.story.length - 1];
    if (!last || reading.current) return;
    reading.current = true;
    setReadError(null);
    try {
      const result = await readStory(file.situation, last.text);
      append(stored.id, readingEvents(last.eventId, result));
      setStage(stored.id, "heard");
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      reading.current = false;
    }
  }, [append, file.situation, file.story, setStage, stored.id]);
  useEffect(() => {
    if (stored.stage === "reading") void runReader();
  }, [stored.stage, runReader]);

  // Back goes to the question answered before, to change it.
  const [revisit, setRevisit] = useState<string | null>(null);
  const answeredKeys = useMemo(() => {
    const keys: string[] = [];
    for (const e of stored.events) if (e.type === "question_asked" && e.factKey !== "workLocation" && !keys.includes(e.factKey)) keys.push(e.factKey);
    return keys;
  }, [stored.events]);

  const stage = stored.stage;
  useEffect(() => {
    if (stage === "questions" && queue.length === 0 && !revisit) setStage(stored.id, "plan");
  }, [stage, queue.length, revisit, setStage, stored.id]);

  const current: MissingFact | null = useMemo(() => {
    if (revisit) {
      const spec = playbook.facts.find((f) => f.key === revisit);
      if (spec) {
        const q = typeof spec.question === "string" ? spec.question : spec.question[file.lens] ?? Object.values(spec.question)[0] ?? spec.label;
        return { key: spec.key, label: spec.label, priority: spec.priority[file.lens] ?? "should", question: q, why: spec.why };
      }
    }
    return queue[0] ?? null;
  }, [revisit, queue, playbook, file.lens]);

  const chapter: ChapterId =
    stage === "plan" ? "plan" : stage === "questions" && current ? chapterOf(playbook.facts.find((f) => f.key === current.key) ?? { key: current.key, type: "text" }) : "story";
  const total = answered + queue.length;
  const sub =
    stage === "questions" ? `Question ${Math.min(answered + 1, total)} of about ${Math.max(total, 1)}` : stage === "plan" ? "Nearly done" : stage === "heard" ? "What I picked up" : "Reading your story";

  const shellBase = {
    situationName: SITUATION_NAMES[file.situation],
    workspace,
    chapter,
    chapterSub: sub,
    file,
    run,
    playbook,
    refLabel,
    openedLine,
  };

  if (stage === "story" || stage === "reading") {
    return (
      <Shell
        {...shellBase}
        bar={
          <>
            <button type="button" className="ci-ok" disabled={!readError} onClick={() => void runReader()}>
              {readError ? "Try again" : "Reading"} <Icon name={readError ? "arrowRight" : "check"} />
            </button>
            <span className="ci-bar-sp" />
            {readError ? (
              <button type="button" className="ci-link" onClick={() => setStage(stored.id, "questions")}>
                <Icon name="skip" /> Carry on without it
              </button>
            ) : null}
          </>
        }
      >
        <p className="ci-eyebrow">The story</p>
        <h1 className="ci-h1">Reading what you wrote.</h1>
        <p className="ci-hint">Picking out the people, the dates and what happened, and putting them in the case file.</p>
        {readError ? (
          <p className="ci-error" role="alert">
            {readError}
          </p>
        ) : (
          <div className="ci-reading" aria-hidden="true">
            <i style={{ width: "92%" }} />
            <i style={{ width: "78%" }} />
            <i style={{ width: "86%" }} />
            <i style={{ width: "54%" }} />
          </div>
        )}
        <p className="ci-story" style={{ color: "#8a8a85" }}>
          {file.story[file.story.length - 1]?.text}
        </p>
      </Shell>
    );
  }

  if (stage === "heard") {
    const fromStory = Object.values(file.facts).filter((f) => f.sources.some((s) => s.kind === "story"));
    const quotes = fromStory.flatMap((f) => f.sources.flatMap((s) => (s.kind === "story" ? [s.quote] : [])));
    return (
      <Shell
        {...shellBase}
        bar={
          <>
            <button type="button" className="ci-ok" onClick={() => setStage(stored.id, "questions")}>
              OK <Icon name="check" />
            </button>
            <span className="ci-bar-sp" />
            <span className="ci-src">Anything wrong? You can change it as we go.</span>
          </>
        }
      >
        <p className="ci-eyebrow">The story · what I picked up</p>
        <h1 className="ci-h1">{fromStory.length ? "Here’s what I found." : "I couldn’t pick much out."}</h1>
        <p className="ci-hint">
          {fromStory.length
            ? `${fromStory.length} things went into the case file. Next, a few questions to fill the gaps.`
            : "No problem. I’ll ask the questions one at a time instead."}
        </p>
        <p className="ci-story">
          <Underlined text={file.story[file.story.length - 1]?.text ?? ""} quotes={quotes} />
        </p>
        {fromStory.length ? (
          <ul className="ci-found">
            {fromStory.map((f) => {
              const spec = playbook.facts.find((s) => s.key === f.key);
              return (
                <li key={f.key}>
                  <span>{spec?.label ?? f.key}</span>
                  <b>{formatValue(spec, f.value)}</b>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Shell>
    );
  }

  if (stage === "questions" && current) {
    return (
      <QuestionStep
        key={current.key + (revisit ? ":r" : "")}
        shell={shellBase}
        file={file}
        playbook={playbook}
        current={current}
        canBack={answeredKeys.length > 0 && answeredKeys[0] !== current.key}
        onBack={() => {
          const i = revisit ? answeredKeys.indexOf(revisit) : answeredKeys.length;
          const prev = answeredKeys[Math.max(0, i - 1)];
          if (prev) setRevisit(prev);
        }}
        onForward={revisit ? () => setRevisit(null) : undefined}
        onAnswer={(events) => {
          append(stored.id, events);
          setRevisit(null);
        }}
        onSkip={() => {
          if (revisit) setRevisit(null);
          else skip(stored.id, current.key);
        }}
      />
    );
  }

  return (
    <PlanStep
      shell={shellBase}
      stored={stored}
      file={file}
      run={run}
      onMore={() => {
        unskipAll();
        setStage(stored.id, "questions");
      }}
      onBack={() => {
        const prev = answeredKeys[answeredKeys.length - 1];
        if (prev) {
          setRevisit(prev);
          setStage(stored.id, "questions");
        }
      }}
      onOpenLetter={(letterType) => {
        saveWizard("employer", letterType, { answers: wizardAnswers(file), stepIndex: 0 });
        nav(`/hr/new/${letterType}`);
      }}
    />
  );
}

/** The story with every quoted phrase softly underlined. */
function Underlined({ text, quotes }: { text: string; quotes: string[] }) {
  const lower = text.toLowerCase();
  const marks: [number, number][] = [];
  for (const q of quotes) {
    const i = lower.indexOf(q.toLowerCase());
    if (i >= 0) marks.push([i, i + q.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (s < at) continue;
    parts.push(text.slice(at, s));
    parts.push(<mark key={s}>{text.slice(s, e)}</mark>);
    at = e;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// One question at a time
// ---------------------------------------------------------------------------

function QuestionStep({
  shell,
  file,
  playbook,
  current,
  canBack,
  onBack,
  onForward,
  onAnswer,
  onSkip,
}: {
  shell: Omit<ShellProps, "bar" | "children">;
  file: CaseFile;
  playbook: Playbook;
  current: MissingFact;
  canBack: boolean;
  onBack: () => void;
  onForward?: () => void;
  onAnswer: (events: CaseEvent[]) => void;
  onSkip: () => void;
}) {
  const spec = playbook.facts.find((f) => f.key === current.key)!;
  const entry = file.facts[current.key];
  const conflict = current.conflicted && entry?.conflict ? entry.conflict.values : null;
  const [value, setValue] = useState<FactValue>(() => (entry && !conflict ? entry.value : emptyValueFor(spec)));
  const ready = conflict ? value !== null : isAnswered(spec, value);

  const submit = () => {
    if (!ready) return;
    if (conflict) {
      onAnswer([{ id: newEventId(), at: new Date().toISOString(), actor: "user", type: "fact_corrected", key: spec.key, value, reason: "Chosen in the interview" }]);
    } else {
      onAnswer(answerEvents(spec.key, current.question, value));
    }
  };

  return (
    <Shell
      {...shell}
      bar={
        <>
          <button type="button" className="ci-ok" disabled={!ready} onClick={submit}>
            OK <Icon name="check" />
          </button>
          <span className="ci-links" style={{ display: "contents" }}>
            <button type="button" className="ci-link" onClick={onSkip}>
              <Icon name="skip" /> I don&rsquo;t know yet
            </button>
          </span>
          <span className="ci-bar-sp" />
          <div className="ci-arrows">
            <button type="button" className="ci-arrow" disabled={!canBack} onClick={onBack} aria-label="Previous question">
              <Icon name="up" />
            </button>
            <button type="button" className="ci-arrow" disabled={!onForward} onClick={onForward} aria-label="Next question">
              <Icon name="down" />
            </button>
          </div>
        </>
      }
    >
      <p className="ci-eyebrow">{conflict ? "Doesn’t add up" : CHAPTERS.find((c) => c.id === shell.chapter)?.label}</p>
      <h1 className="ci-h1">{conflict ? `Which is right for “${spec.label.toLowerCase()}”?` : current.question}</h1>
      {conflict ? (
        <p className="ci-hint">Two parts of the case disagree. Pick the one that&rsquo;s right and I&rsquo;ll use it everywhere.</p>
      ) : current.why ? (
        <p className="ci-why">{current.why}</p>
      ) : null}
      <div className="ci-q">
        {conflict ? (
          <div className="ci-opts" role="radiogroup">
            {conflict
              .filter((c, i, all) => all.findIndex((x) => JSON.stringify(x.value) === JSON.stringify(c.value)) === i)
              .map((c) => (
                <button
                  key={JSON.stringify(c.value)}
                  type="button"
                  role="radio"
                  className="ci-opt"
                  aria-checked={JSON.stringify(value) === JSON.stringify(c.value)}
                  onClick={() => setValue(c.value)}
                >
                  <span>
                    {formatValue(spec, c.value)}
                    <small>{c.source.kind === "story" ? `In your story: “${c.source.quote}”` : c.source.kind === "answer" ? "Your answer" : "From a document"}</small>
                  </span>
                  <span className="ci-tick">
                    <Icon name="check" />
                  </span>
                </button>
              ))}
          </div>
        ) : (
          <QuestionInput spec={spec} value={value} onChange={setValue} onSubmit={submit} />
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// The plan: the folder opens on the first letter
// ---------------------------------------------------------------------------

function PlanStep({
  shell,
  stored,
  file,
  run,
  onMore,
  onBack,
  onOpenLetter,
}: {
  shell: Omit<ShellProps, "bar" | "children">;
  stored: StoredCase;
  file: CaseFile;
  run: RunResult;
  onMore: () => void;
  onBack: () => void;
  onOpenLetter: (letterType: string) => void;
}) {
  const next = run.nextLetter;
  const letterType = next ? letterTypeFor(next) : null;
  const waitingOn = run.route.find((r) => r.status === "needs_facts");
  const name = file.facts.employeeName?.value;
  const first = typeof name === "string" ? name.split(" ")[0] : null;
  const headline = typeof name === "string" ? `${name}’s case is on file.` : "The case is on file.";
  const ready = run.missing.filter((m) => m.priority === "must").length;
  const leftForLater = stored.skipped.length;

  return (
    <Shell
      {...shell}
      bar={
        <>
          {next && letterType ? (
            <button type="button" className="ci-ok" onClick={() => onOpenLetter(letterType)}>
              Open the first letter <Icon name="arrowRight" />
            </button>
          ) : (
            <button type="button" className="ci-ok" onClick={onMore}>
              Answer what&rsquo;s missing <Icon name="arrowRight" />
            </button>
          )}
          {leftForLater && next ? (
            <button type="button" className="ci-link" onClick={onMore}>
              <Icon name="back" /> Answer the {leftForLater} left for later
            </button>
          ) : null}
          <span className="ci-bar-sp" />
          <div className="ci-arrows">
            <button type="button" className="ci-arrow" onClick={onBack} aria-label="Previous question">
              <Icon name="up" />
            </button>
            <button type="button" className="ci-arrow" disabled aria-label="Next">
              <Icon name="down" />
            </button>
          </div>
        </>
      }
    >
      <p className="ci-eyebrow">Case file ready</p>
      <h1 className="ci-h1">{headline}</h1>
      <p className="ci-why">
        Preview: the questions, checks and deadlines here have not been checked by an employment lawyer yet. Read the letter
        carefully before you send it.
      </p>
      {next ? (
        <div className="ci-folder">
          <div className="ci-back" aria-hidden="true" />
          <div className="ci-sheet">
            <div className="ci-sheet-top">
              <span>Private and confidential</span>
              <span>{longDate(todayIso())}</span>
            </div>
            <h4>{next.title}</h4>
            <p>Dear {first ?? "colleague"},</p>
            <i style={{ width: "92%" }} />
            <i style={{ width: "84%" }} />
            <i style={{ width: "88%" }} />
            <i style={{ width: "62%" }} />
            <div className="ci-sheet-foot">{letterType ? "First letter · ready to draft" : "First letter · coming soon to DraftHR"}</div>
          </div>
          <div className="ci-front">
            <span className="ci-stamp">Confidential</span>
            <div className="ci-ref">{stored.ref}</div>
            <h3>{caseTitle(file)}</h3>
            <p>{shell.openedLine}</p>
            <div className="ci-front-foot">
              <b>{ready === 0 ? "Everything needed is in" : `${ready} still to find out`}</b>
              {leftForLater ? <span>{leftForLater} left for later</span> : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="ci-hint">
            {waitingOn
              ? `Before the first letter (${waitingOn.title.toLowerCase()}) I need a little more.`
              : "Nothing on the route can be drafted yet."}
          </p>
          {waitingOn?.missing?.length ? (
            <div className="ci-needs">
              <ul>
                {waitingOn.missing.map((k) => (
                  <li key={k}>{PLAYBOOKS[file.situation].facts.find((f) => f.key === k)?.label ?? k}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Shell>
  );
}
