# HR Letter

A wizard-driven, AI-assisted HR letter writing platform for the UK and US markets. Built with Vite + React + TypeScript + Tailwind v4 + shadcn/ui + Tiptap. Drafts are written by Qwen (`qwen3-max`) by default and can be swapped to Claude with one env var.

## Run

```bash
# 1) Install
npm install

# 2) Set the LLM key — copy .env.example, fill in QWEN_API_KEY
cp .env.example .env.local

# 3) Add shadcn primitives
npx shadcn@latest add button card input label textarea select dialog separator scroll-area progress radio-group dropdown-menu tooltip switch tabs popover

# 4) Dev
npm run dev
```

Open <http://localhost:5273>.

## Architecture

See [PLAN.md](PLAN.md) for the full architecture, [HR-LETTER-KNOWLEDGE-BASE.md](HR-LETTER-KNOWLEDGE-BASE.md) for the legal/content spine, and [QWEN-API-REFERENCE.md](QWEN-API-REFERENCE.md) for LLM integration details.

## Switching to Claude

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

Then `npm install @ai-sdk/anthropic` and the Claude provider in `server/proxy.ts` becomes live.

## Disclaimer

This tool drafts HR letters using a template-assisted approach. Generated content is not legal advice and should be reviewed by qualified HR or employment-law counsel before issuance — especially for high-risk letters (termination, redundancy, settlement, immigration).
