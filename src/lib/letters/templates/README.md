# Letter Templates

Authoritative source for every letter type's:

- Structural scaffold (section order, mandatory blocks)
- Per-section instructions for the section-generator AI
- Hard constraints (MUST / MUST NOT rules injected into the prompt)
- Worked gold-standard examples
- Jurisdiction-specific statutory anchors (UK / US)
- Expected evidence (what items support this letter type — surfaced as a checklist on the Evidence step)

## Directory layout

```
src/lib/letters/templates/
├── README.md                   (this file)
├── types.ts                    LetterTemplate + SectionTemplate + ExpectedEvidence types
├── index.ts                    Registry; loadTemplate() lazy-loads one letter type, getTemplate() reads the cache
├── metadata.ts                 GENERATED eager index (exists? + expected evidence); npx tsx scripts/gen-template-metadata.ts
│
├── employer/                   HR / management-authored letters
│   ├── offer.ts                — OFFER_UK + OFFER_US in one file
│   ├── warning.ts              — WARNING_UK + WARNING_US
│   ├── termination.ts          — TERMINATION_UK + TERMINATION_US
│   └── …
│
└── employee/                   Employee-authored letters (rights, grievance, etc.)
    ├── grievance.ts            — GRIEVANCE_UK + GRIEVANCE_US
    ├── appeal.ts               — APPEAL_UK + APPEAL_US
    ├── whistleblowing.ts       — WHISTLEBLOWING_UK + WHISTLEBLOWING_US
    └── …
```

### Why UK + US live in the same file (per letter type)

Each letter file declares **both** jurisdiction versions as separate exports
(`GRIEVANCE_UK`, `GRIEVANCE_US`). They share the same author-time decisions
about section ordering, evidence requirements, and tone — but the statutory
text, citations, and procedural rules differ entirely.

Keeping them side-by-side makes per-jurisdiction updates simple:

- A UK ACAS Code revision → diff `_UK` export only.
- A US state-law shift (e.g. NY pay transparency) → diff `_US` export only.
- Cross-jurisdiction structural change (add a new section to every grievance) → edit both exports in one file.

Each file is small enough (~150–300 lines per export) that side-by-side
visual comparison catches drift.

### How to add a new jurisdiction (e.g. Ireland)

1. Extend `Jurisdiction` in `src/lib/letters/types.ts`:
   ```ts
   export type Jurisdiction = "UK" | "US" | "IE";
   ```
2. In each relevant letter file, add a third export:
   ```ts
   export const GRIEVANCE_IE: LetterTemplate = {
     letterType: "grievance",
     jurisdiction: "IE",
     // …
   };
   ```
3. Register in `index.ts` under the appropriate mode array.
4. Update the BrowseLetters jurisdiction toggle to show 🇮🇪 IE.

## Quality bar for every template

A template is "exceptional" — what users see when they pick it — when it has:

### `letterSystemAddendum`

Letter-wide context the section model reads before generating any section:

- Anchor statutes named in full (e.g. *s.111 Employment Rights Act 1996*)
- Register notes ("British English throughout", "no contractions")
- Open-vs-without-prejudice classification + consequences
- Hint-conditions for branching ("if claim length > 2 years, add s.207A note")

### Per-section blocks (`SectionTemplate`)

Each section has:

- **`instruction`** — one paragraph telling the section model what to write
- **`scaffold`** — loose HTML with `{{placeholder}}` slots the wizard fills
- **`constraints`** — explicit MUST / MUST NOT rules injected verbatim
- **`example`** — a worked synthetic-data example for register calibration

### `expectedEvidence` (optional)

Declared items the template would like the user to attach as evidence:

```ts
expectedEvidence: [
  {
    key: "chronology",
    label: "Chronology of events",
    required: true,
    description: "Dated entries naming people and acts.",
    expectedKinds: ["note", "document"],
  },
  …
]
```

This drives:

- A checklist on `/editor/:id/evidence` showing what's expected vs added.
- A row on the Review step flagging gaps as warnings or blockers.

## Editing workflow

### Updating an existing template

1. `cd src/lib/letters/templates/employee/grievance.ts` (or wherever)
2. Find the `_UK` or `_US` export.
3. Edit the section block. Keep the structure (`instruction` / `scaffold` /
   `constraints` / `example`) — the section model reads each part for a
   different purpose.
4. Run tests: `npm test`. The template-quality test catches missing
   constraints and contradiction between constraint and scaffold.
5. Open the relevant letter type in the local dev app and click
   "Regenerate" on the affected section — visual check the output before
   merging.

### Common pitfalls

- **Drifting between UK and US** — when changing both, paste both edits
  next to each other so the diff shows the contrast (good place for "MUST
  NOT in CA, ND, OK, MN" notes etc.).
- **Updating the constraint without the example** — the example is what
  the model uses for register calibration. If the constraint says "no
  contractions" but the example uses "you've", the model will follow the
  example.
- **Forgetting `expectedEvidence` on high-evidence letter types** — for
  grievance, dismissal, tribunal cover. Users need the checklist.

## Why these templates are the moat

LLMs alone produce generic letters that miss statutory anchors and use
the wrong register. The templates give the section-generation prompts:

- A **scaffold** so output structure is predictable (sections in the
  right order, separated by the right kind of paragraph break).
- **Constraints** so legal must-includes (statutory citation, reservation
  of rights, ACAS code reference) survive the model's compression
  pressure.
- An **example** so register stays calibrated to professional legal
  prose, not the model's default chatty register.

Treat them like the prompt — every edit is a prompt edit. Test with
real generations before merging.
