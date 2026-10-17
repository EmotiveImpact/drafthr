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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const PEOPLE_KEYS = new Set(["employeeName", "investigator", "decisionMaker", "appealManager", "personName"]);
const SKIP_FACTS = new Set(["workLocation", "usState"]);

export function CaseFilePanel({ file, run, playbook, refLabel, openedLine, onClose }: Props) {
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
            <small>/{Math.max(ready.total, ready.known)}</small>
          </span>
        </div>
        <div className="ci-bar-track">
          <i style={{ width: `${ready.total ? Math.round((ready.known / ready.total) * 100) : 0}%` }} />
        </div>
      </div>

      {checks.length ? (
        <section className="ci-sec">
          <h3>
            Checks<span>{checks.length}</span>
          </h3>
          {checks.map((c) => (
            <div key={c.id} className={`ci-check ${c.level === "act_now" ? "act" : "worth"} ${isNew(`c:${c.id}`) ? "ci-pop" : ""}`}>
              <Icon name={c.level === "act_now" ? "alert" : "eye"} />
              <div>
                <em>{c.level === "act_now" ? "Act now" : "Worth checking"}</em>
                <p>{c.message.replace(/\s*\[[^\]]*\]/g, "")}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="ci-sec">
        <h3>
          People<span>{people.length}</span>
        </h3>
        {people.length ? (
          people.map((p) => (
            <div key={p.name} className={`ci-person ${isNew(`p:${p.name}`) ? "ci-pop" : ""}`}>
              <span className="ci-av">{initials(p.name)}</span>
              <div>
                <b>
                  {p.name}
                  {isNew(`p:${p.name}`) ? <em className="ci-new">New</em> : null}
                </b>
                {p.role ? <span>{p.role}</span> : null}
              </div>
            </div>
          ))
        ) : (
          <p className="ci-none">Names appear here as you mention them.</p>
        )}
      </section>

      <section className="ci-sec">
        <h3>
          Timeline<span>{rows.length}</span>
        </h3>
        {rows.length ? <Timeline rows={rows} isNew={(k) => isNew(`t:${k}`)} /> : <p className="ci-none">Dates appear here as they come up.</p>}
      </section>

      {facts.length ? (
        <section className="ci-sec">
          <h3>
            Facts<span>{facts.length}</span>
          </h3>
          {facts.map((f) => (
            <div key={f.key} className={`ci-fact ${isNew(`f:${f.key}`) ? "ci-pop" : ""}`}>
              <span>
                {specs.get(f.key)?.label}
                {isNew(`f:${f.key}`) ? <em className="ci-new">New</em> : null}
              </span>
              <b>{formatValue(specs.get(f.key), f.value)}</b>
            </div>
          ))}
        </section>
      ) : null}

      {deadlines.length ? (
        <section className="ci-sec">
          <h3>
            Deadlines<span>{deadlines.length}</span>
          </h3>
          {deadlines.map((d) => (
            <div key={d.ruleUseId} className="ci-dl">
              <b>{d.label}</b>
              <span>
                {formatValue({ type: "date" }, d.date)}
                {d.daysLeft !== null && d.daysLeft >= 0 ? ` · ${d.daysLeft} days` : ""}
              </span>
            </div>
          ))}
        </section>
      ) : null}
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
            <div className="ci-tl-node">
              {i > 0 && h > 0 ? <span className="ci-tl-ln" style={{ top: 8 - h, height: h }} /> : null}
              <i />
            </div>
            <div className="ci-tl-text">
              <b>{r.what}</b>
              <span>{r.from}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
