# Case engine (prototype)

Plain TypeScript that turns a case history into a case file, runs a playbook
over it, and says what is missing, which checks fire, which deadlines apply
and which letter comes next. It has no database, network or AI calls, and
nothing in the app imports it yet. It is level 4 (engine core), level 2
(playbooks and rules) and the shape of level 1 (case history) from the
engine blueprint.

```
history (append-only events)
   │  rebuildCaseFile()
   ▼
case file (facts with sources, conflicts, letters)
   │  runPlaybook(caseFile, playbook, today)
   ▼
missing facts → next question
checks fired (act now / worth checking / for information)
deadlines (from rules code, never from the playbook)
route of letters → next letter
hand-offs
   │  buildBrief()
   ▼
a sourced brief for one AI step (Reader, Interviewer, Drafter)
```

## Files

| Path | What it holds |
| --- | --- |
| `types.ts` | Every shared type: events, case file, conditions, playbooks, rules, run result |
| `history.ts` | Append-only history and `rebuildCaseFile()` |
| `conditions.ts` | Evaluates playbook `when` clauses |
| `runner.ts` | `runPlaybook()` |
| `brief.ts` | `buildBrief()`: what one AI step is allowed to see |
| `validate.ts` | Checks a playbook is internally consistent |
| `rules/` | Deadline and entitlement rules (`RULES`, `runRule`) and their input contract |
| `playbooks/` | Disciplinary, grievance and redundancy, as data |
| `stories/` | The 15 test stories from the playbook drafts, with the Reader's answer key |
| `stories.test.ts` | Runs every story through the engine |

## How the runner reads a playbook

These rules are the contract between playbook authors and the runner.

**Facts.** A fact is *known* when the case file has it with a non-null value
and it has not been forgotten. A known fact with two disagreeing sources is
*conflicted*: it still counts as known, but it is listed as missing (with
`conflicted: true`) so the interviewer asks which is right.

**Lenses.** There is no fallback between lenses. A fact, rule use or route
step that applies to consultants must list `consultant` explicitly.

**Missing facts.** For each fact in playbook order whose priority for the
case's lens is `must` or `should`, whose `askIf` holds (or has none), and
which is not known (or is conflicted): it is missing. Must facts come first,
then should facts, each group in playbook order. `nice` facts are never
listed. Forgotten facts are never listed. `nextQuestion` is the first entry.

**Conditions.**
- Any comparison on an unknown fact is `false`. `not` flips the result, so
  `{ not: { fact: "x", is: true } }` is `true` when `x` is unknown. Guard
  with `known` when that matters.
- `is` on a list fact means "contains"; `in` on a list fact means "contains
  any".
- `withinDays` on a fact: whole days from `from` (default today) to the
  fact's date are between 0 and N inclusive. A date in the past is not
  within.
- `deadline`: the named rule use has a date and its days left are at most N
  (a passed deadline counts as within).
- `drafted`: the named route step's letter is drafted or sent.
- `lens`, `nation`, `country` and `state` test the case itself. `nation` is
  false on a US case and `state` is false on a UK case.

**Rule uses.** A rule use runs when its `when` holds and its `lens` (if
given) includes the case's lens. Inputs come from facts (`{ fact }`) or
literals (`{ value }`). A missing required input gives a deadline with
`date: null` and the input names in `missing`. Rule uses that do not run do
not appear in `deadlines`.

**Route.** Steps whose `lens` does not include the case's lens are left out.
For every other step, in playbook order, the status is the first that
applies:
1. `sent` or `drafted`, from the case file.
2. `not_applicable` when `when` is false.
3. `blocked` when any `blockedIf` holds (the first reason is shown).
4. `waiting` when a step in `after` is not drafted or sent (steps in `after`
   that are `not_applicable`, or left out for this lens, are ignored).
5. `needs_facts` when a key in `needs` is not known.
6. Otherwise ready: the first ready step is `next`, later ready steps are
   `waiting`.

`nextLetter` is the `next` entry, or null.

**Hand-offs.** Every hand-off whose `when` holds is listed.

**Text by lens.** A `LensText` string applies to every lens; a map is read
for the case's lens, and a missing lens uses the first entry.
