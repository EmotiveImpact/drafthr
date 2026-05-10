# HR Letter Platform — Plan

A wizard-driven, AI-assisted HR letter writing platform for the UK and US markets. Users answer structured questions, the LLM drafts each section independently, and a Tiptap-based editor lets them refine, regenerate, or export the final letter.

## 1. Decisions (locked in from research)

| Decision | Choice | Why |
|---|---|---|
| Build tool | **Vite + React + TypeScript** | User requested |
| UI kit | **shadcn/ui + Tailwind v4** | User requested; works perfectly with Tiptap |
| Editor | **Tiptap** | Most-maintained MIT editor, ProseMirror-based, custom Nodes per section, easy AI streaming, shadcn-friendly toolbar |
| LLM driver | **Qwen `qwen3-max`** via OpenAI-compatible endpoint | User has key in meridian; ~$0.04/letter |
| LLM SDK | **`@ai-sdk/openai-compatible` + `ai`** (Vercel AI SDK) | Battle-tested in meridian; clean swap to Claude later |
| Provider abstraction | `LlmProvider` interface — Qwen now, Claude one env var away | User's stated migration path |
| Server | **Vite middleware plugin in dev, serverless function in prod** | Keeps API key out of browser bundle |
| State | **Zustand** | Simple, TypeScript-friendly, no Redux ceremony |
| Routing | **React Router v6** | Wizard → editor → export flow |
| PDF export | **`html2pdf.js`** (client) + server `puppeteer` later for fidelity | Ship client first |
| DOCX export | **`html-to-docx`** | Best client-side option |
| Form schema | **Zod + React Hook Form** | Type-safe wizard validation |

## 2. Architecture

```
HRLETTER/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Home.tsx              # Letter type picker
│   │   ├── Wizard.tsx            # Question flow
│   │   └── Editor.tsx            # Tiptap + side rail + export
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── wizard/               # Step wrappers, jurisdiction picker, etc.
│   │   ├── editor/               # SectionNode extensions, toolbar, side rail
│   │   └── export/               # PDF/DOCX export buttons + dialogs
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── provider.ts       # LlmProvider interface
│   │   │   ├── qwen.ts           # Qwen impl
│   │   │   └── claude.ts         # Stubbed for later
│   │   ├── prompts/
│   │   │   ├── system.ts         # Universal system prompt
│   │   │   ├── sections/         # Per-section prompt builders
│   │   │   └── consistency.ts    # Cross-section audit
│   │   ├── letters/
│   │   │   ├── types.ts          # LetterType, Section, etc.
│   │   │   ├── catalog.ts        # 14 letter types with metadata
│   │   │   ├── questions.ts      # Universal + per-letter questions
│   │   │   └── compliance.ts     # UK/US legal rules
│   │   ├── export/
│   │   │   ├── pdf.ts
│   │   │   └── docx.ts
│   │   └── store.ts              # Zustand store
│   └── styles/
│       └── globals.css
├── server/
│   ├── proxy.ts                  # Shared handler used by dev plugin + prod fn
│   └── api/
│       └── draft.ts              # POST /api/draft → SSE stream
├── dev/
│   └── qwen-proxy-plugin.ts      # Vite middleware
├── HR-LETTER-KNOWLEDGE-BASE.md   # Source-of-truth for prompt scaffolding
├── QWEN-API-REFERENCE.md         # API integration reference
├── COMPETITIVE-RESEARCH.md       # Market scan
├── EDITOR-RESEARCH.md            # Tiptap decision rationale
├── PLAN.md                       # This file
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── components.json               # shadcn config
└── .env.example
```

## 3. UX flow

1. **Home** — Letter type picker, organised UK / US / Shared. Tone and risk-class shown per card.
2. **Wizard** — `Jurisdiction → Letter type → Universal questions → Letter-specific questions → Tone & format → Generate`
   - Progress bar, autosave to localStorage, can resume
   - Validation per step (Zod)
   - "Generate" calls the LLM provider section-by-section, streaming each into a placeholder
3. **Editor** — Three columns:
   - **Left rail**: section list (click to scroll, regenerate icon, drag to reorder)
   - **Centre**: Tiptap editor with sectioned document, real-time formatting
   - **Right rail**: Compliance checklist (live), tone slider, version history, "consult counsel" warnings
4. **Export** — Toolbar buttons for PDF, DOCX, copy HTML. Disclaimer auto-appended (tier 1/2/3 by risk class).

## 4. Letter types in v1 (priority-ordered)

Following the knowledge base's frequency ranking, ship all 14 types but with clear "well-tested" badges on the first 7:

1. Offer letter ✓ flagship
2. Employment verification / reference ✓ flagship
3. Termination / dismissal ✓ flagship (legal-review-required)
4. Performance warning ✓ flagship
5. Promotion ✓ flagship
6. Salary increase ✓ flagship
7. Probation outcome ✓ flagship
8. Contract amendment
9. Redundancy (UK) / Layoff (US)
10. Leave approval
11. Resignation acceptance
12. Return-to-work
13. Settlement cover (legal-review-required)
14. Right-to-work / immigration support

Each letter type has:
- Section list with order
- Required question fields
- Jurisdictional legal fences
- Tone constraints
- Length budgets

## 5. Compliance rail (the differentiator)

Live checklist on the right of the editor. Items appear/disappear as content changes:

- ✓ ACAS appeal clause present (UK warning/dismissal)
- ✓ At-will language present (US offer)
- ⚠ WARN 60-day notice missing — your layoff affects > 50 people in CA
- ⚠ COBRA reference missing — add it?
- ✓ Statutory notice period meets s.86 ERA 1996 minimum
- ⚠ "Permanent" used without qualifier — could create unintended contractual term

Click an item → editor scrolls to relevant section and either highlights, or, if missing, inserts a recommended clause.

## 6. Build phases

### Phase 1 — Foundation (do myself, sequential)
- Scaffold Vite + React + TS
- Tailwind v4 + shadcn init
- Tiptap install + section node extension
- Zustand store + types
- Routing
- Layout shell (white legal aesthetic)

### Phase 2 — Core engine (do myself)
- LLM provider abstraction
- Vite middleware proxy + handler
- Per-section prompt builders
- Streaming hook (`useStreamingSection`)

### Phase 3 — Letter content (parallelisable across agents)
- Letter catalog (14 types) → 1 agent
- Universal + per-letter questions → 1 agent
- Compliance rule data → 1 agent

### Phase 4 — UI (do myself)
- Home + wizard + editor pages
- Compliance side-rail
- Export buttons
- Disclaimer engine

### Phase 5 — Polish
- Empty states
- Loading skeletons
- Error boundaries
- README with run instructions

## 7. Security & legal

- API key server-side only — never in `VITE_*` envs
- `.env.local` gitignored, `.env.example` committed
- All generated letters carry tiered disclaimers
- High-risk letter types (termination, settlement, redundancy/layoff, immigration) show prominent "consult counsel" gate before export
- No PII storage on server (everything stays in browser localStorage by default; explicit opt-in for cloud later)

## 8. What we are NOT building in v1

- Auth / multi-user accounts
- Cloud persistence
- E-signature integration (DocuSign/HelloSign — slated for v2)
- Real-time collaboration
- Audit log
- Custom letterhead upload (v1.1)
- Translation / non-English markets

## 9. Switching to Claude later

Single env var change: `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY=…`. The `LlmProvider` interface keeps the rest of the codebase untouched. System prompts may need light trimming (Claude needs less anti-bullet-list nudging) but that's a 30-minute pass.
