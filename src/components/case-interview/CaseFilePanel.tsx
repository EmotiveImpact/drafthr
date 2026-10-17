import { useLayoutEffect, useRef, useState } from "react";
import type { CaseFile, Playbook, RunResult } from "@/lib/case-engine/types";
import { caseTitle, formatValue, readiness, shortDate, timelineRows, type TimelineRow } from "@/lib/case-engine/interview";
import { Icon } from "./icons";

/**
 * The case file column. A plain list while the interview runs (Look 7's
 * setup): checks, people, timeline, facts and deadlines, each filling in as
 * answers arrive. Anything that appears after the first paint is marked NEW,
 * and new timeline rows draw in from the node before them.
 */

type Props = {
  file: CaseFile;
  run: RunResult;
  playbook: Playbook;
  refLabel: string;
  openedLine: string;
  me: string;
  meRole: string;
  onClose?: () => void;
};

/** Remembers which keys were on screen at first paint, so later ones read as new. */
function useNewKeys(keys: string[]): (key: string) => boolean {
  const first = useRef<Set<string> | null>(null);
  const seenAt = useRef(new Map<string, number>());
  if (first.current === null) first.current = new Set(keys);
  const now = Date.now();
  for (const k of keys) if (!first.current.has(k) && !seenAt.current.has(k)) seenAt.current.set(k, now);
  return (key) => {
    const t = seenAt.current.get(key);
    return t !== undefined && now - t < 20_000;
  };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** A check's message as a first line and the rest underneath, with draft source tags taken out. */
function splitMessage(message: string): { head: string; rest: string } {
  const clean = message.replace(/\s*\[[^\]]*\]/g, "").trim();
  const m = clean.match(/^(.+?[.?!])\s+(.+)$/s);
  return m ? { head: m[1]!, rest: m[2]! } : { head: clean, rest: "" };
}

const PEOPLE_KEYS = new Set(["employeeName", "investigator", "decisionMaker", "appealManager", "personName"]);
const SKIP_FACTS = new Set(["workLocation", "usState"]);

const New = ({ on }: { on: boolean }) => (on ? <em className="ci-new">New</em> : null);

export function CaseFilePanel({ file, run, playbook, refLabel, openedLine, me, meRole, onClose }: Props) {
  const ready = readiness(file, run, playbook);
  const specs = new Map(playbook.facts.map((f) => [f.key, f]));

  const people = [...file.notes.people];
  for (const key of PEOPLE_KEYS) {
    const v = file.facts[key]?.value;
    if (typeof v !== "string" || !v.trim()) continue;
    const first = v.split(" ")[0]!.toLowerCase();
    if (people.some((p) => p.name.toLowerCase().includes(first))) continue;
    people.push({ name: v, role: specs.get(key)?.label ?? "" });
  }

  const rows = timelineRows(file, playbook);
  const facts = Object.values(file.facts).filter((f) => {
    const spec = specs.get(f.key);
    return spec && spec.type !== "date" && !PEOPLE_KEYS.has(f.key) && !SKIP_FACTS.has(f.key) && f.value !== null && !spec.specialCategory;
  });
  const checks = run.checks.filter((c) => c.level !== "for_information");
  const deadlines = run.deadlines.filter((d) => d.date);

  const isNew = useNewKeys([
    ...people.map((p) => `p:${p.name}`),
    ...rows.map((r) => `t:${r.key}`),
    ...facts.map((f) => `f:${f.key}`),
    ...checks.map((c) => `c:${c.id}`),
  ]);
  const total = Math.max(ready.total, ready.known);

  return (
    <aside className="ci-file" aria-label="Case file">
      {onClose ? (
        <button type="button" className="ci-quiet ci-file-close" onClick={onClose}>
          <Icon name="x" /> Close
        </button>
      ) : null}
      <div className="ci-file-head">
        <div className="ci-ref">{refLabel}</div>
        <h2>{caseTitle(file)}</h2>
        <p>{openedLine}</p>
        <div className="ci-ready">
          <span>Ready to draft</span>
          <span>
            <b>{ready.known}</b>
            <small>/ {total}</small>
          </span>
        </div>
        <div className="ci-bar-track">
          <i style={{ width: `${total ? Math.round((ready.known / total) * 100) : 0}%` }} />
        </div>
      </div>

      <div className="ci-doc">
        {checks.length ? (
          <section className="ci-sec">
            <h3>
              Checks<em>{checks.length}</em>
            </h3>
            {checks.map((c) => {
              const { head, rest } = splitMessage(c.message);
              const act = c.level === "act_now";
              return (
                <div key={c.id} className={`ci-it ${isNew(`c:${c.id}`) ? "ci-pop" : ""}`}>
                  <span className="ti">
                    <Icon name={act ? "alert" : "shield"} />
                  </span>
                  <div className="tx">
                    <span className="st">
                      <span className={`ci-stamp-t ${act ? "r" : ""}`}>{act ? "Act now" : "Worth checking"}</span>
                      <New on={isNew(`c:${c.id}`)} />
                    </span>
                    {head}
                    {rest ? <span className="sub">{rest}</span> : null}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        <section className="ci-sec">
          <h3>
            People<em>{people.length + 1}</em>
          </h3>
          <div className="ci-it person">
            <span className="ci-av me">{initials(me)}</span>
            <div className="tx">
              {me}
              <span className="sub">{meRole}</span>
            </div>
          </div>
          {people.map((p) => (
            <div key={p.name} className={`ci-it person ${isNew(`p:${p.name}`) ? "ci-pop" : ""}`}>
              <span className="ci-av">{initials(p.name)}</span>
              <div className="tx">
                {p.name}
                <New on={isNew(`p:${p.name}`)} />
                {p.role ? <span className="sub">{p.role}</span> : null}
              </div>
            </div>
          ))}
        </section>

        <section className="ci-sec">
          <h3>
            Timeline<em>{rows.length}</em>
          </h3>
          {rows.length ? <Timeline rows={rows} isNew={(k) => isNew(`t:${k}`)} /> : <p className="ci-none">Dates appear here as they come up.</p>}
        </section>

        {facts.length ? (
          <section className="ci-sec">
            <h3>
              Facts<em>{facts.length}</em>
            </h3>
            {facts.map((f) => (
              <div key={f.key} className={`ci-it ${isNew(`f:${f.key}`) ? "ci-pop" : ""}`}>
                <span className="ti">
                  <Icon name="note" />
                </span>
                <div className="tx">
                  {formatValue(specs.get(f.key), f.value)}
                  <New on={isNew(`f:${f.key}`)} />
                  <span className="sub">{specs.get(f.key)?.label}</span>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {deadlines.length ? (
          <section className="ci-sec">
            <h3>
              Deadlines<em>{deadlines.length}</em>
            </h3>
            {deadlines.map((d) => (
              <div key={d.ruleUseId} className="ci-it">
                <span className="ti">
                  <Icon name="clock" />
                </span>
                <div className="tx">
                  {d.label}
                  <span className="sub">
                    {formatValue({ type: "date" }, d.date)}
                    {d.daysLeft !== null && d.daysLeft >= 0 ? ` · ${d.daysLeft} days left` : ""}
                  </span>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Each row's line runs from the node above it to its own node. A row added
 * at the end draws its line down from the node above; a row slipped in
 * above an older one makes that older row's line grow up towards it.
 */
function Timeline({ rows, isNew }: { rows: TimelineRow[]; isNew: (key: string) => boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<number[]>([]);
  useLayoutEffect(() => {
    const els = box.current ? Array.from(box.current.querySelectorAll<HTMLElement>(".ci-tl-row")) : [];
    const next = els.map((el, i) => (i === 0 ? 0 : el.offsetTop - els[i - 1]!.offsetTop));
    if (next.join() !== heights.join()) setHeights(next);
  });
  return (
    <div className="ci-tl" ref={box}>
      {rows.map((r, i) => {
        const fresh = isNew(r.key);
        const growUp = !fresh && i > 0 && isNew(rows[i - 1]!.key) && i < rows.length;
        const d = r.date ? shortDate(r.date) : null;
        const h = heights[i] ?? 0;
        return (
          <div key={r.key} className={`ci-tl-row ${fresh ? "is-new" : ""} ${growUp ? "grow-up" : ""}`}>
            <div className="ci-tl-date">
              {d ? (
                <>
                  {d.day}
                  <small>{d.year}</small>
                </>
              ) : (
                r.when
              )}
            </div>
            <div className="ci-tl-text">
              {i > 0 && h > 0 ? <span className="ci-tl-ln" style={{ top: 13 - h, height: h }} /> : null}
              <i />
              <b>{r.what}</b>
              <span className="src">
                <Icon name={r.from === "you" ? "user" : "msg"} />
                {r.from}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
