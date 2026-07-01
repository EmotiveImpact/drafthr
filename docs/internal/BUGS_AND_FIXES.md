# Bugs & Fixes Log

Canonical record of bugs found and fixed in DraftHR, newest first. Each
entry: what broke, where, how it was proven, and the fix. The `/loop`
maintenance task references and updates this file.

**Verification discipline:** the real gate is `npm run build` (`tsc -b` per
project — stricter than `tsc --noEmit`, which the root tsconfig no-ops) +
`npx vitest run`. A green `tsc --noEmit` is NOT sufficient — it missed a
3-hour prod outage (see 2026-05-30 #1). Prove at runtime where possible:
curl deployed endpoints; distinguish a Vercel HTML 404 (route unreachable)
from a handler JSON 401/403 (enforced).

---

## Open / queued

| # | Severity | Area | Summary | Status |
|---|----------|------|---------|--------|
| **X1** | **CRITICAL (feature gap)** | `src/lib/export/pack.ts` | **The "tribunal-grade" evidence pack is NOT signed and carries NO per-file hashes.** The crypto infra is fully built and sound (`src/lib/sign/pades.ts` PAdES-B-T signer, `api/sign/manifest.ts`, canonical-JSON + audit hash-chain — all verified clean) but has ZERO callers in the pack path. `buildManifest` records no SHA-256 for the PDF/DOCX/evidence files, and `exportLetterPack` never calls `/api/sign/manifest` or writes `manifest.sig`. A recipient can swap any file and nothing detects it — the core differentiator is unbacked today. **Also X3**: `manifest.json` uses pretty-printed/insertion-order JSON + a volatile `generatedAt`, so it's non-reproducible — must switch to `canonicalJson` before/when signing is wired. | **Needs the user.** This changes the export artifact's structure and is the product's headline claim — wants a deliberate design pass + the user's awareness, not an autonomous-loop change. Scoped & ready to build on green-light. |

### Architectural backlog (from the 2026-06-06 senior sweep — user-directed, NOT yet built)
Ranked by impact ÷ effort. The "Fix Now" bugs from that sweep are DONE (see below); these are the medium/large bets awaiting prioritisation.
| Item | Theme | Impact·Effort | Summary |
|------|-------|---------------|---------|
| I-OBS-1 | Observability | high·med | No server-side error reporting across ~81 functions. Wrap the api dispatchers in a Sentry envelope (`api/_utils/with-observability.ts`) + release tag. **Do before the sync/moat work.** |
| I-TEST-1 | Test coverage | high·med | The DB-touching tier (store handlers, booking state machine, the new TOCTOU guards) is mock-only. Stand up `@electric-sql/pglite` + a `db-harness.ts` for real integration tests. |
| I-MOAT-1/2/3 | The moat | high·med | (1) Add per-file SHA-256 + `canonicalJson` to the pack manifest (prerequisite for X1, independent of its green-light). (2) Embed the SERVER audit chain (`comments`/`approvals` tables are never written today). (3) One `buildCanonicalLetterModel(draft)` builder for PDF/DOCX/mobile/pack-summary (kills B4 divergence + mobile image loss as a class). |
| I-HARD-1/2 | Hardening | high·med | Durable rate limiter (Upstash/KV — the current Map is per-warm-instance); webhook event-id dedup + `users.email` unique index (exactly-once directory sync). Required before real multi-seat WorkOS load. |
| I-SYNC-2/3 | Sync/reconcile | high·large | Pull/reconcile layer: `GET /api/store/drafts?since=` heads + per-draft conflict signal; mirror the full graph (comments/approvals); eventually a CRDT per draft. The write-only mirror is the dominant architectural liability under multi-device. (I-SYNC-1 cross-tab listener shipped.) |
| B6 | Marketplace | high·small | Consultant identity is localStorage-only → broken on a 2nd device. Make `users.userType='consultant'` server-authoritative + return it from `/api/auth/session`. |
| B8 | Audit | med·med | Audit-chain verify can false-alarm "broken" (build-order vs verify-order; same-ms UUID tiebreak). Add a per-tenant `seq` column, order both by it. False ALARM only — chain data is intact. |
| AI-1 | AI authoring | med·med | AI-rail tool regenerations use a throwaway AbortController (not covered by unmount-abort/Stop); inline diff still flattens bold/italic/headings (extend `hasNonTextContent` short-term; node-aware Tiptap-JSON diff long-term). |
| B15 | Marketplace | low·small | AI credits are client-only (devtools-resettable) — needs a server ledger. |

_X1 (evidence-pack signing) remains user-owned. The items above are the senior sweep's Next/Strategic backlog — your call to sequence._

### Known infra note (not a bug)
- **Drizzle meta-snapshot drift:** `drizzle/migrations/meta/` only has snapshots `0000–0002` then `0009` (0003–0008 missing). `db:migrate` is unaffected (it tracks applied migrations in `__drizzle_migrations`), but `db:generate` diffs against the stale `0002` baseline and emits bogus `CREATE TABLE`s for tables that already exist. **Always read generated SQL before applying.** The `0009_snapshot.json` is a complete cumulative snapshot, so future generates off 0009 will be correct again.

---

## 2026-07-01 — daily bug-fix sweep → user-directed `/loop` continuation (33 fixed — SWEEP COMPLETE)

Multi-agent sweep over `src/` (React components/hooks/routes/store), `server/`,
`api/`, and the export/bulk/reports/wizard/LLM/sync surfaces, committed directly
to `main`. Baseline fully green (`tsc -b` clean · **515 tests** · `vite build`
OK), so this was a latent-bug hunt. Each finding was adversarially verified
against source before landing (rounds 4+ use fan-out finders → a skeptical
default-refute verifier, then a final senior human triage that rejected ~half
the machine-"confirmed" candidates as false-positive / by-design / unsafe-to-fix
— see the "Rejected" notes). Every fix ships with a regression test where the
seam allows, and the buggy path was confirmed to fail the new test first.

**Final gate:** `tsc -b` clean · **550 tests** (+35) · `vite build` OK. **10
rounds, 33 real bugs fixed**, every commit pushed green. Commits: `53a1183` (R1),
`13dbee6` (R2), `6e120de` (R3), `23a1f7a` (R4), `07e59d4` (R5), `43db7d2` (R6),
`9de6b8e` (R7), `f99939d` (R8), `6fb0c92` (R9), `60dc0d3` (R10). **Stopped on
convergence:** per-round landable counts ran 2·3·3·6·3·5·6·2·2·1 — the last three
rounds (an exhaustive class audit, a broad confirming sweep, and a
completeness-critic pass) yielded only latent/defensive fixes with high rejection
rates, so the substantive well is dry. One item (`pay_dispute {{deadlineDays}}`)
was handed to the user as a separate task (a content decision, not a mechanical
fix).

The dominant theme this sweep is a **single class of bug — form/dialog state
re-seeded from an unstable prop or object identity, silently wiping the user's
in-progress edits.** Three independent instances were found and fixed.

### 🟢 LOW (defensive) — PDF export could infinite-loop on a zero-width canvas
`canvasToA4PdfBlob` (`src/lib/export/pdf.ts`) computed `imageHeight =
canvas.height * pageWidth / canvas.width`; a zero-width canvas from html2canvas
(display:none host, sandboxed-iframe quirk) makes it `Infinity`, and the paging
loop `while (pageTop < imageHeight)` never terminates → browser hang mid-export.
The earlier export audit checked zero-*height* (terminates → empty PDF) but
missed zero-*width*. **Fix:** guard `canvas.width > 0`, else fall back to a
single A4 page. *(R10)*

### 🟠 HIGH — required-repeater wizard validation bypass → blank tribunal-grade letters
`RepeaterField` (`src/components/wizard/QuestionField.tsx`) auto-hydrates a
`required` repeater with `defaultItems >= 1` into an array of EMPTY objects
(`[{}, {}]`) via `queueMicrotask(onChange)`. The wizard's required-field gate
(`Wizard.tsx`) treated any non-empty array as satisfied (`Array.isArray(v) &&
v.length > 0`), so the moment a step like termination's **Decision details**
mounted, `answers.factualFindings` became `[{}, {}]` and **"Generate draft"
enabled with completely blank findings** — defeating `required` on every
`defaultItems>=1` repeater (`factualFindings`, `specificConcerns`,
`selectionCriteria`, `grievance.incidents`, `whistleblowing.disclosedFacts`, …).
**Fix:** new pure exported `isQuestionAnswered(q, value)` (`questions.ts`); a
required repeater counts as answered only when `>= max(minItems, 1)` items have
their required sub-fields filled (and carry a value, so a bare `{}` never
counts). `select_multi` and scalar branches unchanged. TDD:
`questions.isQuestionAnswered.test.ts` (+8). *(R3)*

### 🟠 HIGH — `EditDetailsSheet` discarded in-progress edits on any background draft update
The sheet holds all 14 fields in local `useState` seeded from the `draft` prop
and re-synced by `useEffect(…, [open, draft])`. `draft` comes live from the
store, and **every** mutation of that draft yields a new object with a bumped
`updatedAt`. So while the sheet was open, a streaming section regeneration
(`appendToSection` per chunk) — or any collaborator/comment/answers update —
produced a new `draft` reference, re-ran the effect, and **snapped all 14
fields back to their stored values, wiping the user's typing mid-edit**.
**Fix:** key the seed effect on `draft.id`, not the whole object — hydrate on
open / draft-switch, never on unrelated store churn. TDD:
`EditDetailsSheet.test.tsx` (+2), fails against the old deps. *(R3)*

### 🟠 HIGH — `EmployeeForm` reset user edits on every parent re-render
Same class, in the Edit-employee dialog. `EmployeeDetail.tsx` builds
`initialForm` as a fresh object literal each render and passes it as `initial`;
`EmployeeForm`'s reset effect keyed on `[open, initial]`, so **any** parent
re-render (a Zustand store update, a sibling toast, an animation) re-fired the
reset and overwrote the in-progress form. **Fix:** gate the reset on the
closed→open transition via a `wasOpen` ref — read `initial` fresh at open time,
ignore later identity changes. Protects all callers, not just this one. TDD:
`EmployeeForm.test.tsx` (+2). *(R1)*

### 🟠 HIGH — `Wizard` crashed the whole app on an unknown letter-type URL
`/hr/new/:letterType` and `/me/new/:letterType` are free URL segments;
`Wizard.tsx` passed the raw param to `getLetterMeta()`, which **throws**
`Unknown letter type` on a miss → the app crashed to the generic ErrorBoundary
screen. A stale bookmark or a renamed/removed letter id (every other
`getLetterMeta` caller passes a persisted, always-valid `draft.letterType`; only
the wizard feeds raw URL input) triggered it. **Fix:** look the meta up
defensively via `LETTER_CATALOG.find` and render a graceful "Letter type not
found" with a back-to-letters action; all hooks still run unconditionally before
the early return. *(R2)*

### 🟡 MEDIUM — `CommentsPanel` "+ Comment" leaked a stale quote/mark into a fresh section comment
The per-section `+ Comment` header button reset only `composerSection` and
`composerBody`, leaving `composerQuote` / `composerApplyMark` set from an earlier
text-selection flow. Clicking it (instead of cancelling) attached the **wrong
quote** to the new comment and called the wrong section's `composerApplyMark`,
applying a Tiptap comment-highlight mark to unrelated text — cross-section
corruption. **Fix:** clear `composerQuote`/`composerApplyMark` in the button's
onClick, matching `onCancel`. *(R1)*

### 🟡 MEDIUM — `MattersIndex` "Last:" showed the wrong draft and a misleading time
The matter card's footer picked `matterDrafts[length-1]` — the draft created
*last* (`draftsInMatter` sorts by `createdAt` asc) — but labels it "Last:" and
renders `timeAgo(updatedAt)`, presenting it as most-recent *activity*. Editing an
older letter in the matter therefore showed the wrong letter and a stale time.
**Fix:** pick the draft with the greatest `updatedAt` via a local reduce, without
reordering the shared `draftsInMatter` helper (other callers rely on
created-order). *(R2)*

### 🟡 MEDIUM — `Activity` clobbered the user's manually-selected day
`useEffect(() => setSelectedDay(mostRecentDay), [mostRecentDay])` force-reset the
selected day whenever `mostRecentDay` changed. Scrub back to an older day, then a
new event enters the store (async hydration, a regeneration, a new comment) →
`mostRecentDay` changes → the effect **snaps the view back to the newest day**,
yanking the user off the day they were reading. **Fix:** track the previous
most-recent day in a ref and auto-advance only while the user is still sitting on
it; otherwise leave their selection intact. *(R2)*

### 🟢 LOW — reports `unapproved-7d` boundary contradicted its own label
`predicateUnapprovedSevenDays` (`src/lib/reports/check-predicates.ts`) tripped at
`days >= 7`, but the check's label ("Unapproved >7d") and description ("more than
a week") both say **strictly** greater than 7 — so a draft edited exactly 7
calendar days ago was reported as failing a ">7d" rule (and counted in the
failing-checks roll-up). **Fix:** `days <= 7` returns null; only 8+ days trips,
matching both text descriptions. TDD: 7/8-day boundary case added to
`FailingCheckDrillDown.test.tsx` (+1). *(R3)*

### 🟠 HIGH — booking "Open draft" link could dead-end after a concurrent pull
`pushBookingCreate` (`src/lib/marketplaceSync.ts`) looked up the optimistic
placeholder row **after** awaiting `createBooking()`. A `pullMyBookings()` /
`pullInbox()` firing during that await replaces the whole bookings array and
drops the not-yet-server-known placeholder — so the post-await lookup missed,
`dtoToBooking` got `prior=undefined`, and the readable `localDraftId` was lost
(the server only knows the hashed UUID, which the editor can't resolve → "Draft
not found"). **Fix:** snapshot the placeholder BEFORE the await and fall back to
it. Single-file, no signature churn. *(R4)*

### 🟠 HIGH — booking message endpoint returned 200 with a never-persisted message
`api/marketplace/_handlers/message.ts` appended atomically via
`UPDATE … RETURNING`; if the booking was deleted between the SELECT and the
UPDATE (0 rows) it fell back to returning `[...existing, msg]` with **200** — a
success for a message that was never stored. **Fix:** `if (!updated) return
404`, mirroring `respond.ts`'s not-found handling. *(R4)*

### 🟡 MEDIUM — malformed section rows returned 500 instead of 400
`api/store/_handlers/sections.ts` and `drafts.ts` inserted client section rows
with no runtime validation; a section missing `title`/`html`/`status`/`position`
hit a DB NOT NULL constraint → unhandled **500** (TS types are erased at
runtime). **Fix:** shared `isValidSectionInput` guard → clean **400**, matching
the prior sweep's "500 where 400 is right" fixes. TDD: `_section-input.test.ts`
(+6). *(R4)*

### 🟡 MEDIUM — LLM prior-section context corrupted when a section was missing
`regenerateSection`/`regenerateSectionAsPending` (`src/lib/llm/draft.ts`) built
`priorTitles` via `slice(0, findIndex(...))`. If the section wasn't in
`draft.sections` (a concurrent delete between lookup and the async call),
`findIndex` returned `-1` and `slice(0, -1)` yielded **all sections but the
last** instead of an empty list — feeding the model the wrong prior-section
context. **Fix:** guard `idx < 0 → []` at both call sites. *(R4)*

### 🟢 LOW — template-quality requirement matcher glued periods to tokens
`matchesRequirement` (`src/lib/template-quality.ts`) split on `/[^a-zA-Z0-9§.]+/`,
keeping the period inside tokens — so a sentence-final requirement word like
`"days."` never substring-matched the bare `"days"` in the section text, a false
"not covered" on the advisory template-coverage report. Citations like `s.95`
are ≤4 chars and dropped by the length filter anyway. **Fix:** split on periods
too (`/[^a-zA-Z0-9§]+/`). *(R4)*

### 🟠 HIGH — US COBRA compliance check was case-sensitive (false "missing notice")
`us_termination_cobra` (`src/lib/letters/compliance.ts`) set `flags: ""`, which
defeats `ruleMatches`'s `rule.match.flags ?? "i"` default — an empty string is
not nullish, so `new RegExp("COBRA", "")` ran **case-sensitive** while all 17
sibling rules use `"i"`. A US termination letter that referenced "Cobra" /
"cobra" in any non-uppercase form was wrongly flagged as missing the required
COBRA continuation notice (29 USC §1166). **Fix:** `flags: "i"`. TDD:
`compliance.test.ts` (+1, mixed/lower-case). *(R5)*

### 🟠 HIGH — accommodation-request "impairment" field wasn't required when disclosed
`accommodation_request` (`src/lib/letters/questions/employee.ts`) shows the
`impairment` text field only when the user opts in (`showIf discloseDiagnosis
=== "yes"`), but it lacked `required: true`. Because the wizard gate only checks
*visible + required* questions, a user who chose to disclose could proceed with
it blank, leaking an unfilled impairment into the generated letter. **Fix:** add
`required: true` (activates only while visible — the ukRegion/usState +
sibling-repeater pattern). TDD: `questions.isQuestionAnswered.test.ts` (+1). *(R5)*

### 🟡 MEDIUM — auth refresh() could fire a duplicate /session fetch under overlapping forced refreshes
`AuthProvider.refresh()` (`src/lib/auth/AuthProvider.tsx`) cleared
`inflight.current` unconditionally in its `finally`. When two `force:true`
refreshes overlapped, the faster one nulled the shared ref while the other was
still in flight, so a subsequent non-forced caller saw `null` and started a
third `/session` fetch instead of coalescing — defeating the anti-stomp guard.
**Fix:** clear only if we're still the current promise
(`if (inflight.current === p) inflight.current = null`). Provider-agnostic pure
coalescing logic; no dedicated test (1-line invariant). *(R5)*

### 🟡 MEDIUM — `isSafeImageDataUrl` accepted a whitespace-only base64 payload
`isSafeImageDataUrl` (`src/lib/safe-data-url.ts`) — the image-safety gate used
by export (pdf/docx/pack), store hydration, profile validation, and migration —
had `\s` inside its base64 char class, so `data:image/png;base64,   `
(whitespace only) passed as "safe" and would embed a broken image (no security
impact — the MIME is still image-restricted). **Fix:** require at least one real
base64 char while still tolerating (line-wrapped) whitespace — zero regression
on valid data URLs. TDD: `safe-data-url.test.ts` (+5). *(R9)*

### 🟢 LOW (latent) — `consultantApi.call()` could drop default headers
`call()` (`src/lib/consultantApi.ts`) spread `...init` AFTER the merged
`headers`, so a caller passing `init.headers` would clobber the merged object
and silently drop `Content-Type`/`Accept`. No current caller passes `headers`
(latent — first flagged R1, re-surfaced R9), but the shared chokepoint should be
correct: spread `...init` first so method/body override the baseline while the
merged headers always win. *(R9)*

### Rejected in R9 (verified false-positive / by-design — did NOT land)
Stripe `checkoutSessionId` (written at checkout creation, not lost); admin-review
"missing status guard" (documented re-moderation is intentional); `MyBookings`
`useState` prop-sync (keyed by `b.id`, not triggerable); `EditDetailsSheet`
"missing reseed" (already the R3/R6 fix — the effect keys on `[open, draft.id]`);
`bookingsForConsultant` profileId strategy (documented three-way match).

### 🟡 MEDIUM — two more conditional fields lacked their `showIf` gate (exhaustive audit)
An exhaustive audit of the "labelled-conditional field with no `showIf`" class
surfaced two remaining cases: `probation_outcome` "Areas for development" (help
text: "Required only on extend / fail outcomes. For pass, leave empty.") showed
on a pass outcome; `sickness_notification` "Any 'may be fit for work'
adjustments?" (a UK Fit Note concept) showed even with no Fit Note attached.
Both leaked into the LLM data dump in the wrong context. **Fix:** `showIf`
gates (`probationOutcome === "extend"||"fail"`, `fitNoteAttached === true`),
verified controlling ids/values. TDD extended. *(R8)*

### Flagged for the user, then resolved by decision (R8 → R9)
- **`pay_dispute` `{{deadlineDays}}` placeholder (fixed)** — no wizard question
  collected a day-count, and the value can't be reliably computed per-section
  (issueDate is in the system prompt, demandDeadline in the data dump), so it
  risked rendering `[TBD]` in a legal demand letter. **Decision: drop the phrase**
  (Option a) rather than add a `deadlineDays` question (Option b) — a second
  day-count input alongside the existing absolute `demandDeadline` date could
  contradict it ("within 30 calendar days … that is, by 26 May 2026"), which is
  worse than `[TBD]` in a demand letter, and wouldn't cover the case where the
  (optional) `demandDeadline` is left blank. The section constraint already
  requires "payment by a specific date", so the explicit `{{paymentDeadlineUK/US}}`
  date is sufficient. **Fix:** removed "within {{deadlineDays}} calendar days of
  the date of this letter, that is," from both `next_steps` scaffolds *and* both
  worked examples (so the LLM's strongest signal doesn't reintroduce the computed
  day-count pattern), keeping "…be paid … by {{paymentDeadlineUK/US}}". No question
  or data-shape change. Lint + `vitest run` + build green.

### Rejected in R8 (verified false-positive / intentional — did NOT land)
- **`store.ts appendAIMessageBody` "missing updatedAt"** — INTENTIONAL: it's the
  per-token streaming reducer, bracketed by `appendAIMessage` (start) and
  `finalizeAIMessage` (end) which both bump `updatedAt`. Bumping per-token would
  spam the dual-write sync — the omission is the optimization, not a bug.
- **`raisedAt` "(if ...)" sub-fields** — free-text sub-fields inside a repeater,
  intentionally always-rendered so any incident can record the detail.
- **`updateAIAction` actions-preserve** — re-flagged, still not triggerable (no
  actionId to patch on an action-less message).

### 🟡 MEDIUM — four conditional employer fields lacked their `showIf` gate
Four questions whose labels literally announce conditionality rendered
unconditionally (the wizard gates only on `showIf`/jurisdiction), so their
values leaked into the LLM data dump (`relevantData` dumps every non-empty
answer) in the wrong context: `reference` "Headline responsibilities (for
character reference)" showed for factual references; `return_to_work` "Phased
schedule (if applicable)" showed when `phasedReturn` was No; `probation_outcome`
"New end date (if extending)" + "Objectives if extending" showed on pass/fail.
**Fix:** add the `showIf` each label implies (`referenceType === "character"`,
`phasedReturn === true`, `probationOutcome === "extend"`), each keyed on a
verified controlling id/value. TDD: `questions.isQuestionAnswered.test.ts` (+1).
*(R7)*

### 🟡 MEDIUM — appeal-letter grounds placeholders didn't match their question ids
The `appeal` grounds-of-appeal scaffold used `{{proceduralGround}}` /
`{{factualErrorGround}}` / `{{severityGround}}` / `{{newEvidenceGround}}`, but
the questions are `groundProcedural` / `groundFactual` / `groundSeverity` /
`groundNewEvidence` — the exact keys the prompt data-dump (`relevantData`) emits.
The model had to *infer* the mapping, and `sanitiseHtml` turns any unresolved
`{{...}}` into `[TBD]`, so a tribunal-grade appeal risked blank grounds. **Fix:**
rename the scaffold placeholders (UK+US blocks) to the exact question ids so they
resolve deterministically. *(R7)*

### 🟡 MEDIUM — all-day matter events hidden west of UTC
`MatterCalendar`'s upcoming-events filter parsed a bare `YYYY-MM-DD` `whenISO`
(allowed by `MatterEvent`, exercised by store tests) with `new Date()` = UTC
midnight, which is in the past all local day in any timezone west of UTC — so
today's all-day event was filtered out and vanished. `formatEventWhen` already
guarded this via `parseDateOnly`; the filter didn't. **Fix:** local-parse
date-only values + a full-day lookback for them. *(R7)*

### Rejected in R7 (verified false-positive / out-of-scope — did NOT land)
- **Grievance `{{witness1Name}}` scaffold** — witnesses live as free text inside
  the incidents repeater; "fixing" it is a scaffold rewrite / letter-quality
  judgment, not a mechanical bug (the LLM synthesizes the list from the dump).
- **Grievance/resignation "placeholder" mismatches** — scaffolds are LLM
  guidance, not mechanical substitution; a capable model bridges near-identical
  names (rejected the ones with no clean 1:1 rename).
- **`display.ts recipientNameFor` optional-chaining** — `Draft.employer/employee`
  are required, non-optional; no code path yields undefined.
- **`notifications.ts` "nondeterministic sort"** — `Array.prototype.sort` is
  stable (ES2019); equal-weight ordering is deterministic.

### 🟠 HIGH (systemic) — jurisdiction-tagged wizard questions shown to BOTH jurisdictions
The `Question.jurisdiction` field was dead metadata — the wizard's visibility
filter (`Wizard.tsx`) only ever checked `showIf`, never `q.jurisdiction`. So
**13** `(UK)`/`(US)`-labelled employer questions that carried a jurisdiction
marker but no `showIf` rendered for every jurisdiction: a US termination showed
UK "Disciplinary hearing date" + "Appeal officer"; a UK redundancy showed US
"Severance package"/"Recall rights"; UK KIT days, UK/US immigration fields,
FLSA, s.401 tax-free element, etc. Wrong-jurisdiction answers then flowed into
the draft and the LLM prompt. **Fix:** new pure `isQuestionVisible(q, answers)`
that enforces BOTH the jurisdiction marker and `showIf`; `Wizard` uses it. One
fix for all 13 (vs. patching `showIf` onto each). TDD:
`questions.isQuestionAnswered.test.ts` (+5, incl. a US-termination integration
case). *(R6)*

### 🟠 HIGH — wizard tone/employeeTone never persisted back to the profile
`profileUpdatesFromAnswers` (`src/lib/profile.ts`) wrote signatory fields but
neither `defaults.tone` (employer) nor `defaults.employeeTone` (employee), even
though `prefillsFromProfile` reads both back — so the tone a user picked in the
wizard silently failed to prefill on their next letter. **Fix:** persist both.
TDD: `profile.test.ts` (+2, round-trip). *(R6)*

### 🟡 MEDIUM — AI tool-call reported success for a proposal it never applied
If a section was deleted DURING an AI tool-call's multi-second stream,
`proposeSectionChange` (`store.ts`) silently no-ops on the missing section, but
`runSectionRegen` (`AIPanel.tsx`) still returned the stale snapshot and the tool
reported `ok:true` — the UI showed "Applied" for a proposal that was never set.
**Fix:** a post-stream live-state guard in `runSectionRegen` throws when the
section is gone, so the caller's catch reports `ok:false`. *(R6)*

### 🟡 MEDIUM — bulk mail-merge dropped currency columns
`scalarQuestionsFor` (`src/components/bulk/csv.ts`) omitted `"currency"`, so
currency fields (baseSalary, newSalary, exGratiaAmount, …) were dropped from the
sample CSV headers and never mapped in `rowToAnswers` — yet `placeholderKeysFor`
advertised them as valid `{{...}}` placeholders to the template AI. **Fix:**
include `currency` in `scalarQuestionsFor`. TDD: `csv.test.ts` (+1). *(R6)*

### 🟢 LOW — custom-template internal fields polluted seeded drafts
`createDraftFromCustomTemplate` (`store.ts`) spread `tpl.answers` verbatim, so a
template saved FROM a template-source draft carried the internal
`_templateName` / `_templateDescription` fields into every ordinary draft seeded
from it. **Fix:** strip both at seed time. *(R6)*

### Rejected in R6 (verified false-positive / cleanup-not-bug — did NOT land)
- **`matters/risk.ts` line 75** — `if (piiFails>=1 && complianceFail>=1)` is
  DEAD code (line 76's `piiFails>=1 || complianceFail>=2` subsumes it); the
  counters are disjoint dimensions. Zero behavior change to remove → cleanup,
  not a bug. **Left as-is** (bug-fixes-only).
- **`MatterCalendar` datetime-local timezone** — the input always emits a full
  `YYYY-MMDDTHH:MM` (local-parsed), never a bare date, so the claimed
  UTC-midnight offset can't occur.
- **CSV camelCase header claim** — mechanism real but the cited field
  (`probationOutcome`) is a `select`, never emitted as a scalar CSV column.

### Rejected in R5 (skeptical-verified false positives — did NOT land)
- **Prompt-"injection" via `evidence.ts` / `system.ts` party fields** — this is
  a single-user drafting tool; the person supplying wizard answers / evidence is
  the one whose own prompt is built. Self-injection isn't a vulnerability, and
  the proposed newline-collapse would mangle legitimately multi-line evidence.
- **`pack.ts` "Attachment N" label vs file number** — the filtered-index label
  is CORRECT: it matches the letter body's `[Attachment N]`
  (`sourceHtml.ts` numbers attachments by the same filtered ordinal). Changing
  it to the full-array index would desync the pack index from the letter. The
  file *link* already resolves via the full-array `evidenceFileName`.
- **`Finalize.tsx` mark-as-sent desktop/mobile disable mismatch** — real
  inconsistency, but every proposed one-liner just moves the inconsistency
  elsewhere; needs a product decision, not an autonomous-loop change.

### Rejected in R4 (machine-"confirmed" but wrong / unsafe — did NOT land)
- **`remote-ids.ts` `hashToBytes` "uses new h1"** — a bespoke deterministic hash
  whose only contract is stable local-id → server-UUID mapping. It's not a
  correctness defect, and "fixing" it would re-map EVERY existing draft/matter's
  server UUID (orphaning synced rows, missing deletes, 404ing exports). Actively
  dangerous — left untouched.
- **`src/db/audit.ts` same-millisecond chain tiebreak** — real but already the
  logged backlog item **B8** (false-ALARM only; chain data intact) and requires
  a per-tenant `seq`-column migration — out of scope for an autonomous loop.
- **`AIPanel` CopyButton timer** / **`FloatingCommentPanel` 220px initial
  height** — benign React-18 no-op / self-correcting first-paint cosmetic.
- **`store.ts` `updateAIAction` actions-preserve** — not triggerable: you can
  only patch an `actionId` on a message that already has an `actions` array, so
  the `?.` never yields undefined in any real call.
- **`PaginatedLetter` selection bubble doesn't track scroll** — UX polish (the
  comment still works on click), not a correctness bug.

### Evaluated and intentionally NOT changed (verified benign or correct-by-design)
- **`CommentPopover` 700ms auto-close timer is never cleared** — real uncleaned
  timer, but on unmount it calls the *same* unmounted `SectionEditor`'s own
  `setCommentOpen`/`setCommentTarget` (React 18 no-op; no crash, no warning, no
  cross-instance effect). Five sibling copy-confirmation timers share the pattern
  with even lower impact (local `setCopied` only). Cosmetic — not landed.
- **`SectionEditor` `handleClickOn` captures mount-time `onFocusComment`** — the
  captured closure holds only stable `useState` setters and does a live DOM
  query, so the "stale" reference behaves identically to any later render's. Not
  a real bug.
- **`consultantApi.ts` `call()` spread order** (`...init` after `headers`) — would
  clobber the merged headers, but no current caller passes `headers`. Latent
  footgun, not a live bug.
- **Wizard `showIf`-hidden-but-required answers persist into the draft** — stale
  `ukRegion`/`usState` etc. can ride along after a jurisdiction flip. Real, but
  severity depends on whether templates read the now-irrelevant field; deferred
  pending that confirmation rather than changing the createDraft payload shape.

### Verified clean (no reportable bug) — surfaces swept this session
`server/` + both LLM streaming endpoints, `api/` handlers (auth, workspace,
marketplace, stripe, workos, export, password-reset), the store reducers
(section/comment/matter/task mutations, id-lookups, sort comparators),
`date-only.ts` / `sanitize.ts` / `evidence.ts` / `monthsBetween` (re-verified
intact), export/bulk (`pdf.ts`/`docx.ts`/`pack.ts`, CSV, mailmerge), the
reports predicate + aggregation layer (div-by-zero/NaN all guarded), and the
collaborators/marketplace/notifications UI.

---

## 2026-06-28 — automated daily bug-fix sweep (5 rounds, 11 fixed)

Multi-agent sweep over `src/`, `server/`, `api/`, committed directly to `main`
(4 commits). Baseline was fully green (`tsc -b` clean · **500 tests** · `vite
build` OK), so this was a latent-bug hunt, not a gate-failure cleanup. Ran 5
rounds (find → adversarial-verify → fix-with-test); **stopped early** when round
5 returned zero findings. Bug counts per round: 4 → 4 → 2 → 1 → 0. Final gate:
`tsc -b` clean · **515 tests** (+19) · `vite build` OK. Every commit pushed
green. Commits: `e062bc8` (R1), `bd7e4e1` (R2), `0bd3130` (R3), `ad2ff9b` (R4).

### 🟠 HIGH (security) — letterhead/signature image URL → attribute-breakout XSS in PDF/DOCX export
`src/lib/export/pdf.ts` (letterhead/signature) and `src/lib/export/docx.ts`
interpolated the employer letterhead/signature image URL straight into an
`<img src="...">` attribute with **no escaping**. `isSafeImageRef()` only
validates the URL *scheme* (`https`/`data`) via `new URL()`, which happily
parses a value like `https://x/"><img src=x onerror=alert(document.domain)>` —
so a crafted https URL breaks out of the `src` attribute and injects an
`onerror` handler. On the **client-side PDF fallback** this HTML is assigned via
`innerHTML` in a same-origin, non-sandboxed iframe → DOM XSS in the app origin
whenever the victim exports. Every sibling renderer (`sourceHtml.ts`,
`pack.ts`) already escapes this exact value; only these four lines were missed.
**Fix:** escape with the file-local `escapeHtml`/`escapeHtmlD` (both escape
`& < > "`) before interpolation. TDD: `pdf.letterhead-xss.test.ts` (+1) asserts
`letterBodyHtml()` entity-escapes the attribute-breaking chars. *(R4)*

### 🟠 HIGH — Stripe double-charge: no already-paid guard on checkout
`api/marketplace/_handlers/stripe-checkout.ts` never read `bookingPayments.status`
before creating a Checkout session, so a retried redirect / double-click on an
already-paid booking created a **second** Stripe session and charged the card
again — and the `onConflictDoUpdate` then repointed the row at the new session
while leaving `status:"paid"`, silently losing the first payment intent.
**Fix:** read the payment row after the IDOR check; refuse with **409** when
already paid. *(Payments are currently off until keys + migration 0012 ship, so
this is a latent fix on the not-yet-live path.)* Evaluated and intentionally
NOT changed: the webhook's `bookingId`-keyed update — duplicate/late deliveries
of the same `checkout.session.completed` write identical values (idempotent),
and with this guard a booking never has two live sessions; scoping the update
to `session.id` would instead risk orphaning a legitimately-paid session. *(R3)*

### 🟠 HIGH (integrity) — invite acceptance could demote the workspace's sole owner
`api/workspace/_handlers/accept-invite.ts` re-activation path set
`role: invite.role` unconditionally. An **admin** can mint a low-role invite for
an existing owner's email (`invite.ts` only blocks minting *owner* invites via
`canManageOwners`), and this path bypasses the dedicated `member/role` endpoint's
owner + last-owner guards — so an owner who accepts such a re-invite is silently
demoted, potentially stripping the workspace's only owner. **Fix:** never demote
an existing owner here — `reactivatedRole = existing.role === "owner" ? "owner"
: invite.role`. Strictly protective; the email-match gate means the victim must
accept, so this is integrity-hardening, not a direct takeover. *(R2)*

### 🟠 HIGH (feature-dead) — server-side PDF export never worked in production
`api/export/pdf.ts` 404'd every real export. The client sends the **local**
draft id (e.g. `draft_abc_123`), but drafts are mirrored to Postgres under the
`toServerUuid()` bridge (`dual-write.ts`) into a `uuid` column — so the raw id
never matched and `draftBelongsToTenant()` returned false → 404 → silent
fallback to the lower-fidelity client `html2pdf`, losing the Puppeteer render,
the RFC-3161 TSA timestamp, and the `draft.exported` audit. **Fix:** map the id
through `toServerUuid` (same pattern as `matters.ts`), and honor the documented
"`draftId` never blocks the PDF response" contract by gating only the **audit
write** on `draftExists` rather than 404-ing. *(R2)*

### 🟡 MEDIUM (legal-correctness) — `monthsBetween` over-counted service by ignoring day-of-month
`monthsBetween` (`src/lib/store.ts`) counted calendar-month *boundaries crossed*
(`(yA-yB)*12 + (mA-mB)`), not *completed* months — crediting a full month the
instant the month number ticked over. `serviceMonths` feeds the system prompt
and gates UK statutory thresholds (the `uk_redundancy_pay` rule keys on ≥2
years), so an employee crossed the 2-year qualifying line up to ~a month early —
a real eligibility error. Example: start `2022-12-15`, evaluated `2024-12-01` →
returned **24**, correct is **23** (anniversary is two weeks later). **Fix:**
subtract a month when `now.getDate() < start.getDate()`. Exported for testing.
TDD: `store.monthsBetween.test.ts` (+6, fake-timers). *(R1)*

### 🟡 MEDIUM — booking SLA deadline silently reset to "now + 24h" on every transition
`dtoToBooking` (`src/lib/marketplaceSync.ts`) fell back
`expectedDeliveryAt ?? Date.now() + 24h` with no `prior` fallback. The
respond/create/message DTOs don't carry `expectedDeliveryAt` (only the list-join
does), and `pushBookingRespond`/`pushBookingMessage` pass the prior local row —
so every accept/deliver/complete/chat **fabricated a fresh deadline**, making an
overdue booking look on-time. Every sibling display field immediately below it
already fell back to `prior?.…`; this one was missed. **Fix:**
`dto.expectedDeliveryAt ?? prior?.expectedDeliveryAt ?? <default>`. TDD:
`marketplaceSync.test.ts` (+1) — the existing "complete+rate" test masked this
by including `expectedDeliveryAt` in its DTO; the new test omits it. *(R1)*

### 🟡 MEDIUM — `saveProfile` dropped the server-owned consultant `status` on every edit
`useConsultantStore.saveProfile` (`src/lib/consultantProfile.ts`) rebuilt the
profile from a fixed field list plus `...patch` (which never carries `status`),
so every local edit set `status: undefined`. On a failed push the marketplace
card reverted to "not published" (`ConsultantHome` keys on `status ===
"published"`). **Fix:** carry `status: existing?.status` through the merge. TDD:
`consultantProfile.status.test.ts` (+2). *(R2)*

### 🟡 MEDIUM — two crash-on-bad-input handlers (500 where 400 is right)
- **`api/marketplace/_handlers/list-and-create.ts`** — a malformed caller
  `expectedDeliveryAt` produced an Invalid Date passed straight into the Drizzle
  insert; the pg driver's `toISOString()` throws `RangeError` → unhandled 500.
  **Fix:** validate `Number.isNaN(getTime())` → clean **400**. *(R1)*
- **`api/agent.ts`** — `convertToModelMessages(body.messages)` (untrusted, only
  array-checked) throws on malformed UIMessage parts *before* `streamText`, so
  the SDK `onError` doesn't cover it → unhandled 500. **Fix:** wrap in try/catch
  → **400** (mirrors how `/api/draft` already guards). *(R1)*

### 🟢 LOW — doubled file extension on uppercase/mixed-case evidence filenames
`evidenceFileName` (`src/lib/export/pack.ts`) checked
`safeName.endsWith(\`.${ext}\`)` case-sensitively, but `ext` is always lowercased
while `safeName` preserves the original case — so `"Photo.PNG"` became
`"Photo.PNG.png"` in the evidence ZIP (same for the note-only `.txt` branch).
**Fix:** compare case-insensitively (`safeName.toLowerCase().endsWith(…)`).
Exported the helper. TDD: `pack.evidenceFileName.test.ts` (+5). *(R3)*

### Evaluated and intentionally NOT changed (verified correct-by-design)
- **`evidence.figureLabelFor`** — positional figure numbering is intentional and
  locked by an existing test (custom "Fig 7" on figure A keeps figure B at
  "Fig 2", not renumbered to 1).
- **`session-epoch.ts` `!==` staleness check** — correct: a single primary Neon
  pool means no replica lag, so the "cookie newer than DB" branch is unreachable;
  switching to `<` would *weaken* it against a forged high-epoch cookie.
- **`stripe-webhook` `bookingId`-keyed update** — idempotent (see HIGH note above).

### Verified clean (no reportable bug)
React hooks/components (effect deps, cleanup, list keys, controlled inputs all
sound — codebase is saturated with prior-bug guards), `server/` + both LLM
streaming endpoints (single close/end per path, no double-send), `sanitize.ts` /
`safe-data-url.ts` (the URL laxness only mattered at the unescaped output sinks,
fixed above), mailmerge, tiptap editor commands, wizard/onboarding, and the
`reports/`/`finalize/` predicate layer.

---

## 2026-06-10 — security board (6 specialists + adversarial verification)

Full multi-disciplinary security sweep: Security Engineer · System Architect ·
PM-Journeys · Red-Teamer · AuthN/Crypto · Supply-chain/AI, dispatched in
parallel, **every finding put through 2 skeptic verifiers (default-refute)**
before reaching the memo. 23 findings → **19 confirmed, 4 refuted**.
**Verdict: 0 Critical, nothing remotely-exploitable.** All prior batches
re-verified landed with no regressions; `tenant-isolation.guard.test.ts` 16/16.
Gate: `tsc -b` clean · `vite build` OK · **474 tests** (+10). See `SECURITY.md`
for the standing threat model.

### 🟠 HIGH — SA-01/SE-02: persisted tenant PII leaked across users on a shared browser
The zustand store persists the full drafts/matters/employees maps (employee
legal names, matter facts, generated letter HTML — all PII) to `localStorage`
(`scribehr-store-v1`). **Neither sign-out nor workspace-switch cleared it** —
`signOut` only nulled in-memory React state then hard-navigated; the
`WorkspaceSwitcher` just reloaded. So on a shared/kiosk browser the next user
(or anyone reopening the app / devtools) read the previous tenant's PII straight
out of `localStorage`. Cross-tenant *writes* were already 403-blocked and the
mirror is write-only, so this is **confidentiality, not escalation** — but real.
**Fix:** new `clearTenantScopedLocalData()` (`src/lib/session/clearLocalData.ts`)
wipes the four tenant-scoped persist keys (drafts, profile, consultant,
bookings); called in `AuthProvider.signOut` and `WorkspaceSwitcher.onSwitch`
*before* the hard navigation. Theme/branding prefs intentionally preserved.
TDD: `clearLocalData.test.ts` (+4) — wipes PII keys, preserves prefs, idempotent,
and a guard test so a newly-added PII store is a conscious decision.

### 🟡 MEDIUM — SE-01: `api/draft.ts` unbounded output tokens (cost / DoS-spend)
`maxOutputTokens: body.maxTokens ?? 1200` took the client's value with no cap.
`api/agent.ts` hard-caps its own generations, but `draft.ts` let a client POST
`{"maxTokens": 64000}` and, under the 40/min `ai` limit, drive ~40 max-length
generations a minute = unbounded Anthropic spend. **Fix:** `clampMaxTokens`
(≤2000) + `clampTemperature` ([0,1]). TDD: `draft.clamp.test.ts` (+4).

### 🟡 MEDIUM — PM-03: consultant onboarding routed off a client-only flag
The client inferred "is a consultant" purely from a `localStorage` `enrolled`
flag, so a consultant signing in on a **new device** (empty storage) was
misrouted by `RootRedirect` into HR workspace creation. **Fix:** made it
server-authoritative — `api/auth/_handlers/session.ts` now reports
`isConsultant` (a `consultant_profiles` row exists), threaded through the auth
context (`AuthProvider`), and `RootRedirect` ORs it with the local flag.
Journey-correctness, not data exposure. TDD: RootRedirect (+1).

### 🟢 LOW hardening (clean wins)
- **SA-04** — `inlineImagesForExport` buffered the whole response body via
  `arrayBuffer()` *before* the 10 MB cap (memory/cost amplification on the
  allowlisted Vercel-blob namespace; classic SSRF already blocked by B3). Now
  rejects from `Content-Length` before buffering, with the post-read check kept
  as defense-in-depth. TDD: (+1) proves the body is never read on oversize.
- **SE-04** — `admin-review` `profileId` hit a uuid column with no shape guard,
  so a non-uuid raised Postgres `22P02` → 500. Added a UUID regex → clean 404.
- **PM-04** — `/admin/consultants` painted its admin header to any authed user
  before the API 403 bounced them. Now renders a neutral, role-agnostic skeleton
  until the server confirms admin (`authChecked`). Data was always server-gated.
- **PM-05** — `VETTING_AUTO_PUBLISH=1` could ship unvetted consultant cards to
  the public listing. Now **hard-disabled when `VERCEL_ENV==="production"`**, so
  a misconfigured prod env can't honour it.
- **SE-05/SA-03 (spec reconciliation, no code change)** — member-ops
  (`member-role`/`member-remove`/`invite-revoke`) accept owner **OR** admin, not
  the "owner-only" some drafts implied. Owner-targeted changes stay owner-only
  (`canManageOwners` + last-active-owner guard), so there's no escalation. The
  intended "admins manage non-owners" model is now documented in `SECURITY.md`.

### Refuted (false positives the skeptics killed)
- "Employee self-promotes to HR" — HR/employee is a per-user **view toggle**
  over the user's own tenant data; the server has no employer/employee role and
  the HR surfaces fetch the same tenant-scoped store. No escalation.
- "Server can't distinguish a consultant from a customer" — factually true
  (`userType` is never written `consultant`) but **nothing access-controls on
  it**, so not a vuln. (PM-03's fix keys on the `consultant_profiles` row, not
  `userType`.)
- "CSP `script-src 'unsafe-inline'`" — non-exploitable given the sanitiser and
  no untrusted script sinks; removing needs a nonce-based CSP refactor (backlog).
- "Convention-only tenant isolation" — real architectural note, but the guard
  test passes and every reader has its scope clause; no present leak.

### Deferred (needs infra / migration — tracked in SECURITY.md residual risk)
Distributed rate-limiting (Vercel KV/WAF) · Postgres RLS backstop ·
constant-time compares.

### Follow-up — SE-03 server-side session revocation (implemented same day)
Sign-out previously only cleared the cookie; an exfiltrated sealed cookie stayed
valid for its full 7-day TTL. Implemented a per-user **session epoch**: the
sealed cookie carries the epoch it was minted with (`SessionPayload.epoch`, set
at all four mint sites — password / callback / verify-email / reset-confirm),
`requireSessionAndTenant` rejects any cookie behind the user's stored epoch
(`isCookieEpochStale`), and the epoch is **bumped on sign-out and
password-reset-confirm** so every outstanding cookie for that user dies at once.
Deliberately **not** a Drizzle-schema column — it's managed via defensive raw
SQL (`api/_utils/session-epoch.ts`) that returns `null` (→ fail-open, no
enforcement) if the DB is off or the column isn't migrated yet, so the code is
safe to deploy in either order relative to migration `0010_session_epoch`.
Fails open on any read error so a transient blip never logs a valid user out.
TDD: `session-epoch.test.ts` (+11) covers the staleness gate + helper fail-open.
**Activation:** apply migration `0010` (`ALTER TABLE users ADD COLUMN
session_epoch …`); until then it's a no-op.

---

## 2026-06-06 — senior architectural sweep (7 lenses) → "Fix Now" batch

A senior-level review (7 architectural lenses + principal synthesis) over the
whole codebase: 19 candidate bugs + 42 integration/design improvements. The
principal verdict: production-grade at the perimeter, with risk concentrated at
the integration seams. The user approved the **"Fix Now"** batch (bugs + small
high-impact). All implemented + verified: `tsc -b` clean · `vite build` OK ·
**464 tests** (+11). The medium/large architectural bets are queued above.

### 🔴 B1/B2 (CRITICAL/HIGH) — sanitiser stripped ALL data-* attributes
Root cause was deeper than the review diagnosed (which blamed `USE_PROFILES`).
**The real culprit was `ALLOWED_URI_REGEXP`**: DOMPurify applies it to EVERY
attribute value, so non-URI `data-*` values (`data-status="accepted"`, etc.)
failed the URI test and were dropped — empirically proven in the repo's jsdom.
`USE_PROFILES:{html:true}` was a secondary issue (it ignores the allowlists).
Effect: per-suggestion Accept/Reject was a silent no-op, figure-ref
re-numbering never fired, and comment anchors (`data-comment-id`) were lost.
**Fix:** removed both `USE_PROFILES` and `ALLOWED_URI_REGEXP`; URI safety is
now enforced precisely in the existing `uponSanitizeAttribute` hook (img.src →
base64-image only; a.href → safe schemes only — stricter than the old regexp).
Added `mark`+`data-comment-id` to the allowlist (comment anchors were ALWAYS
being stripped). Split data-* into a `DATA_ATTRS` list fed via `ADD_ATTR`; the
export sanitiser keeps `data-fig-id/att-id` (for exhibit re-numbering) but drops
suggestion/comment state. Made `resolveFigureRefsInHtml`'s regex attribute-
order-agnostic (DOMPurify can reorder attrs). TDD: a golden round-trip in
`sanitize.test.ts` (+4) — the single test that locks B1, B2, and comment anchors.
*(src/lib/sanitize.ts, src/lib/evidence.ts)*

### 🟠 B3 (HIGH, security) — server-side SSRF in the PDF export inliner
`inlineImagesForExport` (run inside the Vercel function) fetched arbitrary
`https://` URLs from draft content — a blind SSRF (cloud metadata / internal
hosts). **Fix:** `isAllowedImageHost` guard — https only, host allowlist
(`*.public.blob.vercel-storage.com` + `IMAGE_INLINE_ALLOWED_HOSTS`), reject
IP-literal hosts, `redirect:"manual"`, 10 MB cap. TDD: `inlineImagesForExport.test.ts`
(+6) incl. "never fetches a non-allowlisted URL". *(src/lib/storage/inlineImagesForExport.ts)*

### 🟠 B5 — (covered by existing healthChecks; the {{mustache}} detector is queued)
Note: deferred into the I-MOAT/health-check work rather than patched piecemeal — tracked in the architectural backlog, not silently dropped.

### 🟡 Atomic-guard one-liners (TOCTOU + filters)
- **B12 (booking respond TOCTOU):** the transition UPDATE now includes the
  expected-from status in its WHERE (`expectedFrom = booking.status`); zero rows
  → 409. Stops concurrent requests double-minting share tokens / emails / ratings.
- **B10 (invite-accept TOCTOU):** the invite is consumed by a conditional
  `UPDATE … WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()
  RETURNING id` AT THE START of the txn; zero rows → 410, membership writes
  skipped. TDD: `accept-invite.test.ts` (+1 lost-race case).
- **B13 (deprovisioned leak):** added `status='active'` to `members.ts` and to
  both owner-count queries (`member/role.ts`, `member/remove.ts`) — last-owner
  guard now counts only live owners.
- **B7 (matter delete tombstone):** mirrored the bug-#6 draft fix to matters —
  `deletedMatterIds` set, cancel pending `matterTimers`, re-issue DELETE on a
  raced `pushMatter`. *(src/lib/dual-write.ts)*
- **B9 (booking soft-fail):** `pushBookingRespond` now toasts + re-pulls on a
  failed transition instead of leaving the optimistic row silently ahead.
- **B11 (sidebar perf):** `deriveNotifications` regex scan now `useMemo`'d.
- **B14 (export audit IP):** reuse the rate-limiter's spoof-resistant `clientIp`
  (exported) instead of the leftmost XFF.

### Release hygiene + perf (small, high-leverage)
- **I-REL-2:** deleted dead `server/db/` (a second, stale, authoritative-looking
  schema — a real trap; drizzle uses `src/db/schema.ts`).
- **I-REL-1:** `package.json` — renamed/clarified scripts: `typecheck` (`tsc -b`),
  `lint` → real build-mode check, and a canonical `verify` (`tsc -b && vite build
  && vitest run`).
- **I-SYNC-1:** cross-tab `storage` listener re-hydrates the store when another
  tab writes the persist key — kills single-machine multi-tab clobber.
- **I-PERF-1/2/3:** lazy-loaded heavy routes (Reports/BulkOps/Finalize/Matter+
  EmployeeDetail/Calendar/Activity/Notifications/Exported/Mockups) behind one
  Suspense boundary; lazy `OnboardingTour` (react-joyride out of main); split the
  `marked`/`dompurify` chunk (marked is editor-only, dompurify is first-paint).
  **Main chunk 1.88 MB → 1.65 MB (489 → 421 KB gz).**

### What the reviewers got wrong (verified)
- The "critical sanitiser bug" export-leak scope was OVERSTATED — accepted+merged
  text already exports correctly (the prior `forExport` merge + `stripSuggestionMarks`
  handle it). The genuinely-broken parts were UI Accept/Reject, figure renumbering,
  and comment anchors — and the true root cause was `ALLOWED_URI_REGEXP`, not
  `USE_PROFILES`. Verifying empirically caught both.
- B8 audit-chain issue is a false-ALARM risk (verifier cries "tampered" on clean
  data), NOT a tamper-miss — queued, not treated as a breach.

---

## 2026-06-06 — auth render-gating + full multi-agent bug sweep (22 fixed)

Two user-requested passes. **(A)** Make the app fully auth-protected — no app
chrome or route content paints before authentication. **(B)** An exhaustive
multi-agent bug hunt (8 surfaces × find→adversarial-verify): 22 confirmed bugs
(1 candidate rejected as a false positive), ALL fixed. Final gate: `tsc -b`
clean · `vite build` OK · **453 tests** (+17). Verification used the real gate
(`npm run build` + `npx vitest run`), TDD where the seam allowed.

### (A) Auth render-gating — app no longer shows before sign-in
The route boundary was already sound (all 46 routes correctly classified;
server perimeter 401/400 to anon, re-confirmed at runtime). The leak was
CLIENT-SIDE rendering:
- **AUTH-1 (HIGH) — app shell painted pre-auth.** `Layout.tsx` chose
  sidebar-vs-minimal-shell purely by pathname, with no auth awareness — so an
  unauthenticated visitor to `/hr`, `/matters`, `/editor/x` saw the full
  `AppSidebar` (nav, recent drafts from localStorage, workspace name, user
  card) for the entire `/api/auth/session` round-trip before redirect. Fix:
  gate the shell on auth — render the minimal chromeless shell until a session
  (and a tenant, except on consultant `/c` routes where the tenant is minted
  lazily) is confirmed.
- **AUTH-2 (HIGH) — render-then-bounce in Protected.** `ProtectedGate`
  redirected via `useEffect` (post-render), and two states (signed-in-no-tenant,
  role-not-yet-resolved) had no render guard → the gated child mounted and fired
  effects for a frame before bouncing. Rewrote it to branch SYNCHRONOUSLY with
  `<Navigate>` (mirroring RootRedirect) so a non-authorized state commits no
  children at all. TDD: `src/lib/auth/Protected.test.tsx` (8) — child never
  renders while loading / signed-out / no-tenant / wrong-or-null-role; renders
  only when fully authorized; tenant-less consultant passes on `/c`;
  auth-disabled passes through.

### (B) Bug sweep — 22 fixed (severity order)

**HIGH**
- **#1 — rejected/pending AI suggestions leaked into PDF/DOCX/mobile exports.**
  `mergeAcceptedSuggestionsHtml` left rejected `<ins>` text intact, and
  `sanitizeLetterHtmlForExport` (KEEP_CONTENT + USE_PROFILES re-permitting
  `<ins>/<del>`) didn't strip them — so a clause the reviewer explicitly
  REJECTED reappeared as prose in the final legal document. Fix: a `forExport`
  merge mode (rejected/pending insertion → removed with text; rejected/pending
  deletion → unwrapped to original text) wired into all three export sinks, PLUS
  a defense-in-depth `stripSuggestionMarks` post-scrub in the export sanitiser.
  TDD: `suggestion-merge.test.ts` (+5), `sanitize.test.ts` (+3).
- **#2 — inline AI diff flattened images/tables/links/figure-refs; Accept made
  it permanent.** The default inline diff rebuilds a section from flattened
  text, silently dropping embedded evidence images, table structure, hyperlinks,
  and the `figure-ref`/`attachment-ref` spans the export resolves. Fix:
  `proposeSectionChange` now detects non-text content (`hasNonTextContent`) and
  falls back to CARD mode (Accept replaces verbatim — nothing flattened). TDD:
  `store.propose.test.ts`.
- **#3 — HR "Open draft" link broke after a booking synced.** `draftId` is
  hashed to a one-way UUID for the server; after sync `dtoToBooking` overwrote
  the readable id with the UUID, so the editor (keyed by readable ids) showed
  "Draft not found". Fix: a preserved `localDraftId` on `Booking`, threaded
  through `pushBookingCreate` / `pullMyBookings` / `pullInbox`; MyBookings links
  to `localDraftId ?? draftId`.
- **#4 — `refresh()` returned a stale pre-mutation session.** Inflight-coalescing
  meant a post-auth caller (workspace-create / sign-in / verify) could attach to
  a background focus-refresh reading the OLD cookie → observed null user/tenant →
  bounced backward (workspace-create loop, sign-in bounce-back). Fix:
  `refresh({ force: true })` bypasses the in-flight fetch; all 7 post-mutation
  callers now force.

**MEDIUM**
- **#5 — second AI proposal over an unresolved pending change corrupted
  prevHtml.** Diffed against already-marked-up html and overwrote the clean
  snapshot → Reject restored garbled marks. Fix: diff against (and preserve)
  the canonical `pendingChange.prevHtml`. *(store.ts; same change as #2)*
- **#6 — dual-write DELETE raced an in-flight upsert POST → ghost row + spurious
  `draft.created` audit.** Fix: client-side tombstone set (`deletedDraftIds`) +
  cancel pending timer on delete; `syncDraft` skips/re-deletes a tombstoned id.
  Also #13 server clamp hardens the create path. *(src/lib/dual-write.ts)*
- **#7 — bulk CSV duplicate header silently dropped/clobbered row data.** Fix:
  reject the CSV with a clear "Duplicate column" error. TDD: `csv.test.ts`.
- **#8 — Reports "Time to resolve" excluded archived matters** (disagreeing with
  `closedMatters()`). Fix: count both terminal states (`status !== "active"`).
- **#9 — PDF "Attachments" list double-numbered** ("1. 1.") — literal prefix
  inside a decimal `<ol>` with no Tailwind Preflight on PDF surfaces. Fix: drop
  the literal prefix, set explicit `list-style:decimal`.
- **#10 — broken "Open file" links in `evidence/index.html`.** The href
  re-derived from the raw filename while the file was written with a sanitised/
  extension-augmented name + full-array index. Fix: shared `evidenceFileName()`
  used by both the write loop and the index renderer (full-array index).
- **#11 — TXT export left HTML entities undecoded** (`&amp;`, `&lt;`). Fix:
  route through `div.textContent` (strips tags AND decodes), matching PDF/DOCX.
- **#12 — sign-up leaked verified-account existence via `userId:null`** (an
  enumeration oracle contradicting the anti-enumeration contract). Fix: always
  return the existing user's id; the body is now identical across fresh /
  duplicate-unverified / duplicate-verified. *(api/auth/_handlers/sign-up.ts)*
- **#13 — client-controlled `clientRevision` stored verbatim as
  `drafts.updatedAt`** → a far-future value permanently 409-locked the draft.
  Fix: `updatedAt` is server-authoritative (clamped to now + small skew); the
  client revision is used only for the stale comparison.
- **#14 — NotificationsBell popover stayed open after a click** (the bell lives
  in persistent chrome, so navigation doesn't unmount it). Fix: controlled
  Popover, `setOpen(false)` before every navigation.

**LOW**
- **#15 — selection-scope chat rendered raw `[scope:]`/`[selection:]`
  annotations.** Fix: parser regex tolerates a trailing `[selection:…]` block.
- **#16 — standalone matter rename/close/archive never synced** (only deletions
  + draft-triggered pushes did). Fix: debounced `enqueueMatterSync` on every
  matter create/update in the store subscription. *(dual-write.ts, store.ts)*
- **#17 — one-shot image migration could clobber a letterhead uploaded during
  the upload round-trip.** Fix: compare-and-set — only apply the migrated URL if
  the field still equals the original source value. *(App.tsx)*
- **#18 — mail-merge advertised camelCase wizard ids the snake_case substitution
  layer couldn't fill.** Fix: shared `foldKey` (camelCase→snake_case) for
  key derivation, dedup, and substitution. TDD: `mailmerge.test.ts` (+1).
- **#19 — marketplace bookings GET/POST 500'd on a non-UUID id** (unhandled
  Postgres 22P02). Fix: `serverUuidOrNull` guard → empty list (GET) / 404 (POST).
- **#20 — WorkspaceSwitcher swallowed a failed `/switch`** (silent no-op on a
  403 deprovisioned seat). Fix: toast the error + reload the list; also filter
  deprovisioned seats out of `/api/workspace/list`.
- **#21 — AuthCallback hung on "Signing you in…" under React StrictMode (dev).**
  The `cancelled` cleanup killed the only surviving run. Fix: drop the
  `cancelled` gating — the `started` ref is the single-run guard.
- **#22 — consultant sidebar "Home" and "Inbox" both pointed to `/c`** (both
  highlighted active; Inbox was a dead duplicate). Fix: render Inbox as a
  disabled "coming soon" placeholder until a real inbox route ships.

**Rejected (false positive):** "last-active-owner guard counts deprovisioned
owners" — the missing `status='active'` filter in the owner-count query is real,
but the claimed "zero owners" outcome is unreachable (three concurrent gates —
`canManageOwners`, no-self-target, and the session-level active-status check —
prevent it). Logged as a latent hardening note, not a live bug.

---

## 2026-06-06 — automated bug-fix sweep (0.18.1)

Multi-agent sweep over `src/`, `server/`, `api/`. Baseline was fully green
(tsc clean · 412 tests · build OK), so this was a latent-logic-bug hunt, not a
gate-failure cleanup. Six genuine bugs found; all fixed with tests where the
seam allowed. Final: `tsc -b` clean · **428 tests** (+16) · `vite build` OK.

### B1 (MEDIUM) — figure references validated against the wrong count
`checkEvidenceRefs` (`src/lib/finalize/healthChecks.ts`) and
`predicateBrokenEvidenceRefs` (`src/lib/reports/check-predicates.ts`) validated
`[See Fig N]` body tokens against `draft.evidence.length` (TOTAL evidence), but
figures are numbered only among figure-mode items (`figureLabelFor`). With more
attachments than figures, a ref pointing past the last real figure (e.g.
`[See Fig 4]` with 2 figures + 2 attachments) passed as "resolving" — a dangling
reference shipped in the letter. Fix: new shared `validFigureNumbers()` in
`src/lib/evidence.ts` derives the valid numbers straight from `figureLabelFor`
(so it also honours custom `figureLabel` overrides like "Fig 7"); both checks now
use it. TDD: `evidence.test.ts` (5) — figure-vs-evidence count, default
display-mode, custom-label override, no-figures, consistency with `figureLabelFor`.

### B2 (LOW) — consultant initials stranded when the name is cleared
`useConsultantStore.saveProfile` (`src/lib/consultantProfile.ts`) recomputed
initials under `if (patch.fullName)`, so clearing the name to `""` skipped the
recompute and left stale initials on the marketplace card — contradicting the
code's own "always stay in sync" comment. Fix: recompute whenever `fullName` is
part of the patch (`!== undefined`); `computeInitials("")` already yields `"??"`.
TDD: `consultantProfile.test.ts` (3) — set, clear-to-empty, unrelated-patch.

### B3 (LOW) — DOCX image squashed past the size caps (completes X4)
The X4 fix (2026-05-30) derived the missing dimension from the true ratio, but
`imageSizeFromElement`'s FINAL caps still clamped width and height
*independently* — so any image exceeding the 6in width or 2.5in height cap was
re-distorted (e.g. 800×400 ratio-2 letterhead → 576×400, ratio 1.44). Fix:
extracted an exported pure `clampImageSizePx()` that, when the ratio is known,
scales BOTH axes by a single factor to fit both caps (ratio preserved); falls
back to independent clamps only when the ratio is unknown. TDD: `docx.test.ts`
(6) — within-bounds, width-cap, height-cap, the regression case, no-ratio
fallback, min-floor.

### B4 (LOW) — booking chat message lost under concurrent posts
`api/marketplace/_handlers/message.ts` appended via read-modify-write
(`select` → write `[...existing, msg]`), so two participants posting at once
clobbered each other — last writer wins, one message lost. Fix: append
atomically inside the single UPDATE with a jsonb concat
(`coalesce(messages,'[]'::jsonb) || $1::jsonb`) and `RETURNING` the
authoritative post-append array. (No unit test — needs a live Postgres; verified
by typecheck + standard-pattern construction.)

### B5 (MEDIUM) — directory webhook could create a 2nd active tenant
DISTINCT from the 2026-05-30 audit (which correctly cleared the *conflict-update*
path for not touching `isActiveTenant`). This is the **insert** path: `provisionUser`
(`api/workos/_handlers/directory-webhook.ts`) inserted every new membership with
`isActiveTenant:true`. When a user matched **by email** already had an active
membership in another tenant, the new row made TWO memberships active at once —
violating the "exactly one active tenant per user" invariant and silently
switching their workspace. Fix: query for an existing active membership first
and insert active only when none exists (first membership → active; additional
→ inactive). The conflict `set` still leaves `isActiveTenant` untouched, so
re-syncs never flip the active workspace. TDD: `directory-webhook.test.ts` (+2,
with fake-DB mock extended for the active-membership query) — email-matched user
already-active-elsewhere joins inactive; first-membership user joins active.
*Residual: a true concurrent provision into two different tenants could still
both observe "no active" and both insert active — a rarer race; the deterministic
common case is fixed. A DB partial-unique index on `(user_id) WHERE is_active_tenant`
would close it fully.*

### B6 (MEDIUM) — dead TSA certificate pin (security; removed, flagged)
`FREETSA_TSA_KEY_SHA256_PINS[0]` in `api/_utils/tsa.ts` was a **65-char** hex
string (one stray digit). `certificatePinCandidates()` only ever produces
64-char SHA-256 hashes, so the pin could NEVER match — the legacy
(pre-March-2026) FreeTSA key verification path was silently broken. The correct
64-char value was unrecoverable (no cert in-repo to re-derive; the original hash
was lost), and guessing a security pin is unacceptable — so the dead pin was
**removed** (removal changes no behaviour: a dead pin never matched anything) and
a module-load guard now throws on any non-64-char-hex pin to stop a wrong-length
pin being reintroduced. **Action for the team:** if pre-rotation FreeTSA
timestamps must stay verifiable, re-add the authoritative 64-char SHA-256 of the
legacy FreeTSA signing certificate.

### Verified clean (no change)
The React frontend agent did a comprehensive pass (wizard/forms, transforms,
stores, effects/timers, routing/auth) and found no genuine high/medium-confidence
runtime bug — the stores are heavily hardened (versioned migrate/backfill,
StrictMode/unmount guards, undefined-key guards). Backend auth/IDOR/CSRF/rate-limit
surfaces re-confirmed sound (consistent with the 2026-05-30 audits).

---

## 2026-05-30 — 0.18.1 maintenance loop

### E1b (fixed) — streaming re-entry guard now store-derived
Completed the deferred half of E1. `runGenerateAll`'s re-entry guard and the auto-generate effect both checked only the LOCAL `globallyStreaming` flag, which resets to `false` on every mount — so navigating A→B→A while A's first generation was still in flight could re-enter and start a second `generateAllSections` loop, interleaving `appendToSection` writes. Fix: both gates now ALSO check store-derived streaming state (`draft.sections.some(s => s.status === "streaming")`), which survives remounts. Strictly additive — a genuinely fresh draft has no streaming section, so first-generation is never blocked. With E1a (unmount-abort) this closes both the corruption mechanism (orphan writer) and the re-entry trigger. Build (`tsc -b`) + 412 tests green.

### Directory-sync webhook second-pass — VERIFIED SOUND (no change)
Audited `api/workos/_handlers/directory-webhook.ts` (provision/deprovision/HMAC/idempotency). **Sound — no fix needed.** HMAC verified via the SDK's `constructEvent`; all verification failures collapse to a uniform 400 (no wrong-secret-vs-bad-timestamp oracle); processing errors return 500 so WorkOS retries (no silent provisioning gaps); upserts are single-statement `onConflictDoUpdate` (race-safe); deprovision soft-deletes (`status='deprovisioned'`, keeps the row for audit-chain integrity); `state==="inactive"` on an update is correctly treated as deprovision; events are org→tenant scoped via `workos_org_id`.
- **Resolved a flagged false-positive (audit finding #3):** the `onConflictDoUpdate.set` on `dsync.user.updated` does NOT include `isActiveTenant` (an existing member's active-workspace choice is preserved — the audit was wrong about that). The unconditional `status:"active"` re-provision is also NOT a leak: this app's model is **directory-level access** — presence as an active directory user = tenant access (it provisions identically on `user.created` / `user.updated` / `group.user_added`; the handler comment at L167 says "group membership simply confirms the user should be active"). A `group.user_removed`→`user.updated` re-provision is therefore the intended behaviour, not an escalation. No group-level access gating exists to violate.

### Membership/invite second-pass — deprovisioned-seat privilege retention (S3) + paired reactivation (S4)
Audited the invite/join/membership/tenant-switch/auth-handler flow. **Verified SOUND** across the board — invites are email-bound to the verified session (not body-supplied), single-use + expiring + revocable, unguessable (190-bit), role taken from the inviter; role-change/member-remove are admin-gated with last-owner protection and server-side tenant-scoped target lookups; tenant-switch requires membership; sign-up can't attach to a tenant; account-enumeration defenses uniform; OAuth state CSRF + webhook HMAC present. **One real vuln found + fixed:**

- **S3 (HIGH→CRITICAL) — deprovisioned member retains API access + old role.** When an IdP removes a user, the directory webhook soft-deletes the seat (`tenant_members.status='deprovisioned'`, `isActiveTenant=false`) but keeps the row (audit integrity). `session.ts` (client view) correctly excludes `status='deprovisioned'`, but the ENFORCEMENT points didn't: `requireSessionAndTenant` (`session-with-tenant.ts:95`) selected the active member with NO status filter, and `switch.ts` checked only that a `(userId,tenantId)` row *exists*. So a still-signed-in offboarded user (cookie valid ≤7d) could `POST /api/workspace/switch {tenantId}` to re-activate their seat and regain their **old admin/owner role** — reading members, minting invites, changing roles — after the IdP explicitly removed them. Fix: add `eq(tenantMembers.status,"active")` to both gates (only `active`/`deprovisioned` are ever written, so this is exact). *(api/_utils/session-with-tenant.ts, api/workspace/_handlers/switch.ts)*
- **S4 (paired correctness) — re-invite must reactivate.** `accept-invite`'s existing-seat branch set only `isActiveTenant:true`, leaving `status='deprovisioned'` — which (post-S3) would lock out a user who accepted a valid admin re-invite. Fix: also set `status:"active", deprovisionedAt:null, role:invite.role` (a re-invite grants the inviter's chosen role, not the stale prior one). Test updated to assert the full reactivation. *(api/workspace/_handlers/accept-invite.ts)*

Build (`tsc -b`) + 412 tests green.

### Auth boundary second-pass — 2 hardening fixes (S1, S2)
Re-audited the auth/session boundary now that all marketplace + store endpoints exist. **Verified SOUND for the critical classes** — no cross-tenant access, privilege escalation, or auth bypass. Cookie hardening (HttpOnly/SameSite=Lax/Secure, 7-day TTL, ≥32-char secret), OAuth state CSRF, IDOR ownership checks on every store mutation, no body-supplied-identity trust, and `enforceSameOrigin` coverage on every state-mutating handler all confirmed. Two hardening gaps fixed:

- **S1 (HIGH) — rate limit defeated by a spoofed `X-Forwarded-For`.** `clientIp` keyed on `x-forwarded-for.split(",")[0]` — the LEFTMOST, client-controlled value. An attacker rotates `X-Forwarded-For: <random>` per request → a fresh bucket every time → brute-force/mailbomb limits (auth-password 10/min, sign-up 3/min, password-reset) fully bypassed. Fix: prefer `x-real-ip`, else take the LAST XFF hop (the real client IP the platform proxy appends). TDD: `rate-limit.test.ts` (3) — spoofed leftmost still limited by constant rightmost; x-real-ip preferred; distinct IPs isolated. *(Note: still per-instance in-memory — a shared store, KV/Upstash, is the full fix and stays a known limitation; the keying fix removes the trivial bypass.)*
- **S2 (MEDIUM) — `enforceSameOrigin` missing-Origin allowance keyed on `NODE_ENV`.** A request with no `Origin` header was allowed whenever `NODE_ENV !== "production"` — but public Vercel *preview* deployments don't set `NODE_ENV=production`, so this silently disabled the CSRF layer on every preview URL. Fix: gate the allowance on the explicit `DRAFTHR_DEV_NO_AUTH=1` dev flag (already set in `.env.local`, never on Vercel) — matching `production-auth.ts`'s identical lesson. Previews/prod now fail closed; local dev unchanged. TDD: `request.test.ts` — allowed only behind the flag; fails closed (403) without it even in `development`.

Build (`tsc -b`) + 412 tests green.

### DOCX image fixes — X4 + X5
Cleared the two self-contained DOCX-image queue items.

- **X4 (MEDIUM) — warped letterhead/signature in .docx.** `imageSizeFromElement` fabricated the missing dimension with a fixed multiplier (`height*4` / `width*0.25`), so a letterhead (`max-height:120px`, no width) or signature (`max-height:54px`) was stretched to a 4:1 box regardless of true shape. Fix: new `intrinsicImageSize(bytes)` decoder (PNG IHDR / GIF screen descriptor / JPEG SOF) — `renderImageRun` already has `parsed.bytes` — and `imageSizeFromElement` now derives the missing dimension from the REAL ratio, falling back to the old heuristic only when the format is unparseable. TDD: `docx.intrinsic.test.ts` (5) — PNG/GIF/JPEG decode + null for unknown/webp.
- **X5 (MEDIUM) — webp letterhead silently vanished from .docx.** `inlineImagesForExport` inlines webp (valid for the PDF path) but the DOCX `parseDataImage` can't embed it, and the letterhead `<img>` has empty `alt` → `renderImageRun` returned `""` and the logo disappeared with no trace. Fix: when a `data:image/*` URL can't be parsed and there's no alt, emit a visible `[Image omitted — image/webp not supported in Word export]` placeholder instead of nothing. (Kept webp in the shared inlining allowlist — it's fine for PDF; the fix is at the DOCX consumer.)

Build (`tsc -b`) + 408 tests green.

### Export-pipeline audit — X2 fixed; X1/X3/X4/X5 queued
First audit of the export pipeline (PDF/DOCX/evidence-pack, ~1,900 LOC). **Headline: the cryptographic foundations are genuinely sound** — the audit hash-chain (`src/db/audit*.ts`, canonical-JSON, advisory-lock-serialised, genesis 64-zeros, retroactive-edit-breaks-chain) and the PAdES-B-T/CMS signer (`src/lib/sign/*` — SHA-256 message-digest, Ed25519 over DER SET-OF signed-attrs, RFC-3161 timestamp required, byte-compatible verifier) both verified clean with their own passing tests. The server PDF endpoint correctly inlines images before render. **The gap is wiring, not crypto**: the signer isn't connected to the export pack (X1/X3, queued above — needs the user). Image-handling edge cases X4/X5 queued. One fixed now:

- **X2 (HIGH) — counsel attestation dropped from exports.** `exportLetterPack(draft)` was called with NO attestation arg even when the counsel gate (`guardCounsel`) had just passed, so the pack's manifest/README/cover-sheet rendered "not attested" / "Required" for a letter the user *did* attest — understating the legal review in the tribunal artifact. The PDF/DOCX/marked-sent `recordExport` calls likewise recorded no `reviewedBy/On` (both fields already existed, optional, on `ExportEvent`). Fix: an `exportAttestation()` helper (`{reviewedBy: draftedBy, reviewedOn: toDateOnly(now)}` when the gate was satisfied by explicit confirmation, else undefined) threaded into the pack export + all four `recordExport` calls. *(src/routes/Finalize.tsx)*

Build (`tsc -b`) + 403 tests green.

### E1 (partial) + E4 (resolved) — editor streaming lifecycle + signatory fallback

- **E1a (MEDIUM) — orphaned AI stream after navigation, FIXED.** `Editor.tsx` had no unmount cleanup for `abortRef`, so leaving a draft mid-generation left the stream calling `appendToSection` against the store after the component was gone — and because the auto-generate gate uses local `globallyStreaming` (resets on remount), a remount could start a SECOND generation loop that interleaved with the orphan and corrupted section HTML. Fix: an unmount-only `useEffect(() => () => abortRef.current?.abort(), [])`. This removes the corruption *mechanism* (no orphan writer). The remaining half (E1b, gate auto-generate on store-derived streaming state) is now belt-and-braces and stays queued.
- **E4 (RESOLVED — false positive).** The `signatoryName ?? recipientName` fallback (`store.ts:~625`) is **intentional**, not a bug. The `employer.signatoryName` field is mode-overloaded: in employer mode it's the letter's signatory; in employee mode `system.ts:63` reads it as **"Person addressed"** — and the employer person addressed IS the recipient, so `recipientName` is the correct source. Verified: all 20 employee templates collect `recipientName` (none collect `signatoryName`), and NO export/render path uses `employer.signatoryName` as the employee-sender's signature (the employee signature block comes from the template scaffold). No code change; left a clarifying note.

### Editor undo/restore — E2 + E3 fixed
Cleared the two self-contained editor queue items from the AI-authoring audit.

- **E3 (MEDIUM) — version restore dropped current content.** `onRestore` (`Editor.tsx`) swapped in an old section version via `updateSection` without versioning the current html first. If the current text was never versioned (hand-edits only go through `updateSection`), restore permanently dropped it. Fix: read the LIVE current section from the store and `pushSectionVersion` it before overwriting (guarded on `current.html && current.html !== html`).
- **E2 (MEDIUM) — accept-all undo garbled inline diffs.** `onAcceptAll` snapshotted `s.html` for undo, but in inline mode that html already carries the staged `<ins>/<del>` marks — undo restored marked-up html and re-diffed it → nested/garbled marks. Fix: snapshot `pendingChange.prevHtml ?? s.html` (the clean pre-diff text), matching the store's own canonical restore (`rejectSectionPending` uses the same `isInline && prevHtml ?? sec.html`).

Build (`tsc -b`) + 403 tests green. E1 (streaming concurrency) + E4 (signatory fallback) remain queued.

### Editor/AI-authoring audit — 2 fixes (#9–#10), 4 queued (E1–E4)
First audit of the Editor + AI-authoring flow (~4,100 LOC + the llm/ streaming orchestration). The AI client (retry/backoff/abort/SSE), Wizard, health checks, and the per-section accept/reject paths all verified sound. Two fixed now; four (E1–E4) queued above (need concurrency/undo design, not one-liners).

- **#9 (HIGH) — section stranded in "streaming" forever on AI failure.** `regenerateSectionAsPending` (`src/lib/llm/draft.ts`) set status→`"streaming"` then `await streamDraft` with NO try/catch; on throw the status reset never ran, and the three AI-rail callers (`AIPanel` applyRegenerate/applyTighten/applyAddClause) only report the error to the model — they don't reset status. So a failed rewrite/tighten/add-clause left the section locked in a spinner with no recovery (that path doesn't set `globallyStreaming`, so the Stop button isn't even shown). Fix: try/catch resets status to the resting value (`edited` if it had content, else `empty`) on failure before rethrowing. TDD: `src/lib/llm/draft.test.ts` (3) — throw→reset, empty→empty, success→propose.
- **#10 (MEDIUM, security) — unsanitised AI HTML at a raw-HTML sink.** `SharedDraftReview` rendered `s.html` via `dangerouslySetInnerHTML` with NO sanitisation (MobileReadView already sanitises via `letterBodyHtml`). Section html is normally sanitised on write, but an aborted/partial AI stream leaves raw model deltas at rest — which a consultant viewing the share could receive unescaped. Fix: wrap the sink in `sanitizeLetterHtml(s.html)` (sanitise-at-render = robust defence-in-depth). *(src/routes/SharedDraftReview.tsx)*

Build (`tsc -b`) + 403 tests green.

### HR portfolio audit — 4 fixes (#5–#8)
First audit of the HR portfolio surface (matters/employees/reports/bulk). Mostly clean (Reports stat math, BulkOps CSV pipeline, matters/employees selectors all verified sound); four real bugs fixed:

- **#5 (HIGH) — stale-notes cross-employee corruption.** `EmployeeDetail`'s `notes` was `useState(employee?.notes ?? "")`, initialised once. Navigating between two profiles via history reused the component instance, so the textarea kept employee A's notes while the Save guard compared against B → Save wrote A's notes into B's record. Fix: split into a `key={employeeId}` inner component so React remounts (resets ALL local state) per employee. *(src/routes/EmployeeDetail.tsx)*
- **#6 (HIGH) — Letter History dead link.** Rows linked to `/draft/:id/edit`, a route that doesn't exist (the editor is `/editor/:draftId`). Every letter in an employee's history tab 404'd. Fix: `to={`/editor/${d.id}`}`. *(src/routes/EmployeeDetail.tsx)*
- **#7 (MEDIUM) — deleteMatter orphans tasks/events.** `deleteMatter` unfiled drafts but left `tasks`/`events` with the dangling `matterId` — leaked forever, would re-surface if an id were reused. Fix: also filter `tasks`/`events` by `matterId !== id`. TDD: `store.matters.test.ts`. *(src/lib/store.ts)*
- **#8 (LOW) — UTC date drift.** Two spots used `new Date(epoch).toISOString().slice(0,10)` (UTC) to format a local timestamp → off-by-one day in some timezones. Fix: `toDateOnly(new Date(epoch))` (local calendar). *(EmployeeDetail.tsx "Started", MatterTasks.tsx "completed")*

Build (`tsc -b`) + 400 tests green.

### O2 (fixed) — matters now mirror to Postgres (draft→matter membership) — MEDIUM (feature)
- **Where:** new `api/store/_handlers/matters.ts` + `api/store/[action].ts` dispatcher case; `src/lib/dual-write.ts`; `src/lib/store.ts` subscription.
- **What:** drafts carried a `matterId`, but there was no endpoint to mirror the matter row — so the draft dual-write wrote `matterId: null` (the local `matter_…` id isn't a UUID and `drafts.ts` rejects a matterId whose row doesn't exist in the tenant). A draft filed under a matter appeared unfiled in the Postgres mirror.
- **Fix:** `POST/DELETE /api/store/matters` (same guard chain as drafts: same-origin + dual-write flag + rate-limit + session/tenant + IDOR ownership + audit), mapping the local id → deterministic UUID via the existing `toServerUuid` bridge. The draft sync now mirrors a draft's matter FIRST (`pushMatter` in `syncDraft`/`syncAllPending`), then links the returned UUID — **race-free**: on ANY matter-sync failure it falls back to `matterId:null` (today's safe behaviour, never a 409 regression). Matter deletes mirror too.
- **Cap-safe:** handler lives under `_handlers/` and is dispatched by the existing `api/store/[action].ts`, so the Vercel Hobby 12-function cap is untouched (still 11). `matters` table + all written columns already exist in prod (migration 0000) — no DB change.
- **Proven:** `dual-write.test.ts` (now 9) — matter pushed before draft + draft links the UUID; matter-sync failure → `matterId:null` fallback; existing "no local ids to uuid refs" guard still green. Build (`tsc -b`) + 399 tests green.

### O3 (fixed) — localStorage quota → silent total persist failure — LOW/MED (data-loss)
- **Where:** `src/lib/store.ts` persist config (was bare `{ name }`); new `src/lib/storage/quota-safe-storage.ts`; `src/lib/finalize/healthChecks.ts`.
- **What:** letterhead/signature images were stored TWICE per draft — raw base64 in `answers` (wizard echo) AND validated on `employer` (the render source of truth; every export/preview reads `draft.employer.*DataUrl`, never `answers.*`). The `answers` copy is dead weight and a couple of large images push the store past the 5–10 MB quota. zustand's persist swallows the resulting `setItem` throw, so the store **silently stops persisting** — drafts lost on the next refresh, no warning.
- **Fix:** a `StateStorage` wrapper (`createQuotaSafeStorage`) that (a) strips `answers.{letterhead,signature}DataUrl` data: URLs from the persisted JSON before writing — in-memory state and the employer render copy untouched — and (b) surfaces ONE toast on a genuine `QuotaExceededError` instead of failing silently. Health-check presence readers (`checkSignature`/`checkLetterhead`) now prefer `employer.*DataUrl` so post-reload checks stay correct.
- **Proven:** `quota-safe-storage.test.ts` (7 tests) — strips `answers` images / keeps employer copy / keeps non-data URLs / fail-safe on bad JSON / quota toast fires once / rethrows non-quota errors. Build + 397 tests green. Content-safe: no other code reads the persist key directly; only render source (`employer.*`) drives exports.

### #4 (fixed) — dual-write server-ahead 409 diverged silently — MEDIUM
- **Where:** `src/lib/dual-write.ts` `syncDraft` / `syncAllPending` (409 branch).
- **What:** a 409 means the server copy is NEWER than this client's revision (the server guards on `clientRevision < server.updatedAt`, `drafts.ts:91/138`) — i.e. another tab/device wrote a higher revision. Dual-write is write-only (no pull/merge path), so the client's edits keep failing the revision guard and never land. The only signal was a `console.warn`; the user believed they were saved because localStorage persisted. (Contrast the delete-failure path, which already toasts.)
- **Fix:** added a consecutive-409 counter (`recordStaleConflict`) that surfaces ONE toast after >3 conflicts — mirrors `recordDeleteFailure`. Honest about the limitation ("reload to pull the latest"); does not pretend to merge. Counter resets on any successful sync.
- **Proven:** `dual-write.test.ts` — new test drives 4 server-ahead 409s (each a strictly-newer revision) and asserts exactly one toast. Also fixed pre-existing test pollution (shared `toast.error` mock not cleared between tests → added `vi.clearAllMocks()` in `beforeEach`). 390 passed.
- **Note:** full multi-device reconcile (a GET/pull/merge path) remains unbuilt — the toast is the interim honest signal, not the cure.

### O1 (fixed) — consultant_bookings user FKs: NOT NULL + SET NULL → CASCADE — MEDIUM
- **Where:** `src/db/schema.ts` `consultant_bookings` (`requesterUserId`, `consultantUserId`); migration `drizzle/migrations/0009_crazy_thanos.sql`.
- **What:** both columns are `.notNull()` but migration 0005 created them (inline `REFERENCES`) with `ON DELETE SET NULL` — contradictory. Deleting a referenced user raises a NOT NULL violation and aborts the delete (future user-deletion / GDPR-erase path 500s). Confirmed on live prod: `confdeltype='n'`, constraints auto-named `..._fkey`.
- **Fix:** schema → `onDelete:"cascade"` (matches every other `.notNull()` user FK). **Drizzle's auto-generated migration was unsafe** (snapshot drift → bogus `CREATE TABLE`s; would have added duplicate `..._fk` constraints alongside the broken `..._fkey` ones). Hand-authored a name-agnostic `DO $$` block that drops whichever FK constrains each column, then re-adds it as CASCADE. Idempotent.
- **Proven:** `npm run db:migrate` applied; re-queried prod → both FKs `confdeltype='c'` (CASCADE) with canonical drizzle names, old `_fkey` gone. Build + 389 tests green.

### #3 (fixed) — `dtoToProfile` could render `undefined` currency symbol — LOW
- **Where:** `src/lib/marketplaceSync.ts` `dtoToProfile` — `symbolByCode[dto.currency]` had no fallback (the sibling `dtoToConsultant` guards with `?? "£"`).
- **Impact:** any server currency drift (new enum value / legacy row) → `currency: undefined` → `ConsultantHome` renders `undefined150/hr`. Latent today (enum-constrained) but unguarded.
- **Fix:** `currency: symbolByCode[dto.currency] ?? "£"`.

### #2 (fixed) — completing/responding to a booking wiped consultant display fields — HIGH
- **Where:** `src/lib/marketplaceSync.ts` `pushBookingRespond` → `dtoToBooking`, against `api/marketplace/_handlers/respond.ts` `toClient`.
- **What:** `respond.ts`'s `toClient` returns the bare booking row — it does NOT include the join-only consultant fields (`consultantName/Role/PhotoUrl/Currency/Price`), which are produced only by the HR-side list join (`list-and-create.ts`). `pushBookingRespond` replaced the local row with `dtoToBooking(dto)`, setting those to `undefined`. After an HR user rated+completed (or accepted/delivered) a booking, the row lost the consultant's name/photo/price and fell back to `Specialist · INITIALS` with no avatar. Same class hit the consultant inbox (requester identity) until the next pull.
- **Fix:** `dtoToBooking` takes an optional `prior?: Booking`; absent display fields fall back to `prior?.<field>`. `pushBookingRespond` passes the existing local row as `prior`. Fresh DTO values still win when present.
- **Proven:** `src/lib/marketplaceSync.test.ts` (3 tests) — TDD: failed before the merge fix, passes after. Asserts fields survive a `complete`+rate, fresh values override prior, and soft-fail leaves the row untouched.

### #1 (fixed) — production build broken ~3h (validated photoUrl discarded) — CRITICAL (outage)
- **Where:** `api/marketplace/_handlers/profile.ts`.
- **What:** `writeProfile` computed a validated `photoUrl` (P3 sanitisation) then discarded it — `values.photoUrl` persisted the raw `body.photoUrl` instead. The unused local tripped `noUnusedLocals`, so `tsc -b` failed and **every production build since 0.18.0 errored** (prod stuck ~3h on pre-0.18 code; the marketplace vetting + photoUrl validation never shipped). `tsc --noEmit` locally was a false green because the root `tsconfig.json` is a references-only no-op shell.
- **Fix:** store the validated value (`photoUrl`, not raw body). Verified with `npm run build` + `tsc -p` per project.
- **Lesson:** verify with the build's own command, not `tsc --noEmit`. Codified at the top of this file.

### B3/P2 (shipped) — real server-gated consultant vetting
- Not a bug — feature. `requireAdmin` (`api/_utils/admin.ts`) fails closed on the server-only `DRAFTHR_ADMIN_EMAILS` allowlist; `admin-queue` (GET) + `admin-review` (POST) behind it; `/admin/consultants` UI bounces non-admins on 403. `admin.test.ts` proves fail-closed. Prod config: `DRAFTHR_ADMIN_EMAILS` set, `VETTING_AUTO_PUBLISH=0`.

---

## Earlier (0.18.0 security-hardening wave) — see CHANGELOG.md

- Fail-open auth on `/api/draft`, `/api/agent`, `/api/upload/image` (bypassed whenever `NODE_ENV !== production`, i.e. every Vercel preview) → fail-closed via explicit `DRAFTHR_DEV_NO_AUTH=1`.
- Workspace admin routes (`member-role`, `member-remove`, `invite-revoke`) 404'd in prod under Vercel's single-segment catch-all matcher → flattened to single-segment actions.
- Per-route role guards (`<Protected roles={[…]}>`) — wrong-role surfaces no longer render on direct URL nav.
- Tenant isolation made a build-enforced invariant (`tenant-isolation.guard.test.ts`).
- Booking duplicates (local placeholder + server UUID) → `pushBookingCreate` swaps placeholder for server row.
- Marketing CTAs hardcoded `localhost:5273` → relative URLs.
