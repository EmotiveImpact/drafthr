# DRAFTHR ROADMAP

**Q2 2026 → Q4 2026 (MVP) · Q1 2027 → Q4 2028 (v1, v2)**
**Last revised:** 2026-05-15 · synthesised from two specialist boards (Marketplace + Stack)

---

## TL;DR for the impatient

We're shipping an HR letter authoring product with a defensible audit trail and a paid consultant marketplace. Five user paths (quick ship, fix and ship, AI critique, teammate review, hire a consultant). The audit trail is the moat — not the marketplace. **Path to £2.3M ARR in 24 months on ~£650-700k Y1 burn**, achievable with a 4-engineer team if we don't gold-plate compliance and we wire AI Gateway in front of Anthropic this quarter (single biggest cost lever).

**Reality check: this is a solo-founder + AI build, not a 4-FTE team.** The numbers below reflect that. Y1 cash burn is **~£50-90k**, not £700k.

| Question | Answer |
|---|---|
| What are we building? | HR letter authoring with health checks, paid consultant marketplace, tribunal-grade audit trail |
| Who is it for? | UK + US in-house HR (SMB → mid-market → enterprise), solo HR consultants, employees |
| What's the moat? | The audit trail. Hash-chained event log + cryptographic signing + S3 Object Lock = tribunal-defensible. Nobody in HR-tech ships this. |
| Stack? | Vite/React/TS + Neon Postgres + Drizzle + Clerk-now-WorkOS-2027 + Vercel + AI SDK + Anthropic via AI Gateway |
| Build model | **Solo founder + AI pair-programming.** No engineering hires Y1. First hire at £500k ARR. |
| Cash cost Y1? | **~£50-90k** (vendors + legal + compliance setup, no salaries) |
| Cash cost Y2? | ~£250-300k (steady-state vendors + compliance + first hire at £500k ARR trigger) |
| Cash cost Y3? | ~£1.5-2.2M (5-8 person team + scaled vendors) |
| Revenue Y1 / Y2 / Y3? | **Realistic plan: £625k / £3.2M / £14M ARR** (employee letters value-tiered by stakes; Employee Plus subscription at £99/mo for multi-month cases — see Section 2) |
| **Profit by Y2?** | **Yes.** Cash-flow positive from month ~18 even on conservative ramp. |
| Critical first action? | Wire AI Gateway in front of `/api/draft` + `/api/agent` THIS QUARTER. Single biggest cost lever. |
| Skip in MVP? | Real-time editing, ISO 27001, HIPAA, multi-region, on-prem, Aurora migration, build-our-own-auth |

---

## Section 1 · Customer profiles (personas + lifetime value)

### Persona A — Solo HR Consultant
- **Profile:** Self-employed, advises 5–15 SMBs across HR + employment law issues. Often ex-Big Four, ex-CIPD director, ex-ACAS conciliator.
- **Volume:** Drafts ~10–15 letters/month across clients
- **Pain:** Legal accuracy + tone calibration + time per letter. Currently uses Word templates + own knowledge.
- **Plan tier:** **Starter (£29/mo)** or **Pro (£79/mo)**
- **Marketplace usage:** Occasionally for high-stakes letters; also a candidate to *be* a consultant on our marketplace
- **Annual value:** £350–950 plan + £200–500 marketplace = **£500–1,500/yr**
- **Acquisition:** LinkedIn organic, CIPD networks, founder podcasts

### Persona B — In-house HR Manager (SMB · 50–200 employees) ★ primary growth segment
- **Profile:** Salaried HR generalist at a growing company. Often the only HR person.
- **Volume:** ~8–20 letters/month — warnings, offers, exits, restructure
- **Pain:** ACAS Code compliance, tribunal exposure, no time to read case law, anxiety about high-stakes letters
- **Plan tier:** **Pro (£79/mo)** or **Business (£249/mo)**
- **Marketplace usage:** Monthly for tribunal-bound letters (£120–200 per review)
- **Annual value:** £950–2,500 plan + £500–2k marketplace = **£1,500–4,500/yr**
- **Acquisition:** Inbound (SEO around "redundancy letter template", "settlement agreement template"), trade press

### Persona C — Mid-market HR team (200–1000 employees · 3–8 HR people)
- **Profile:** Director + generalists, possibly an in-house ER specialist
- **Volume:** ~30–100 letters/month
- **Pain:** Consistency across team, audit defensibility, vendor security posture
- **Plan tier:** **Business (£249/mo)** or **Enterprise (£30k+/yr)**
- **Marketplace usage:** Weekly for high-stakes (£120–200)
- **Annual value:** £2.5k–30k plan + £4k–15k marketplace = **£6.5k–45k/yr**
- **Acquisition:** Outbound, partnerships, conference (CIPD ACE)

### Persona D — Enterprise HR (1000+ employees) ★ biggest deals
- **Profile:** Distributed HR org with compliance team + in-house counsel
- **Volume:** Variable, often delegated to People Partners
- **Pain:** Governance, integration, security, EU residency
- **Plan tier:** **Enterprise (£30k–150k/yr bespoke)**
- **Required:** SAML/SSO, SCIM provisioning, audit trail reporting, sometimes EU residency
- **Marketplace usage:** High — they pay for a second opinion on every senior exit / settlement
- **Annual value:** £30k–150k plan + £15k–50k marketplace = **£45k–200k/yr**
- **Acquisition:** Account-based marketing, founder-led sales, partnerships with employment law firms

### Persona E — Employee using DraftHR
- **Profile:** Individual employee handling their own grievance / resignation / flexible-working / tribunal claim
- **Pain:** "David vs Goliath" — can't afford solicitor (£400 minimum), but the stakes are HIGH (£10k-£100k+ at tribunal). Currently choosing between expensive solicitor or going alone with no help.
- **Sub-segments + plan tier:**
  - **Routine** (resignation, flex-working): £9.99 PAYG · ~£10-30 lifetime value
  - **Standard** (grievance, sickness appeal): £29 per letter · ~£29-100 lifetime value
  - **High-stakes** (settlement counter-offer, escalated grievance, discrimination grievance): £59 per letter · or **Grievance Pack £69 / Settlement Pack £119** · ~£70-300 lifetime value
  - **Tribunal-bound** (ET1 prep, constructive dismissal, discrimination claim): £99 per letter · or **Tribunal Prep Pack £249** · ~£250-700 lifetime value
  - **Multi-month cases** (any escalating matter): **Employee Plus £99/mo** for 4-9 months · **£396-£891 LTV** · plus typical 1 Tribunal Pack purchase = total LTV £700-1,140 · still 75-80% cheaper than solicitor retainer (£500-2,000/mo)
- **Marketplace usage:** **Higher than I previously assumed.** When an employee faces £40k+ tribunal exposure, paying £85-£200 for a vetted solicitor review is a no-brainer (vs £1,500-5,000 for solicitor-led ET1 prep). Marketplace attach rate on tribunal-tier letters: ~40%.
- **Annual value (per user):** £10-50 (routine) · £29-300 (standard/high-stakes) · **£250-1,000+ (tribunal-bound + marketplace)**
- **Acquisition:** High-intent SEO ("how to file ET1", "constructive dismissal letter UK", "settlement agreement counter-offer"), Reddit (r/legaladviceuk, r/AskHR), employment law forums, Citizens Advice referrals

### Mix at maturity (Year 3 target)

| Persona | % of users | % of revenue | Why |
|---|---|---|---|
| B (SMB HR Manager) | 60% | 35% | Mass middle |
| C (Mid-market) | 20% | 30% | Higher revenue per |
| A (Solo consultant) | 10% | 5% | Low ACV, double-sided value |
| E (Employee) | 8% | 5% | Margin contributor, brand strength |
| D (Enterprise) | 2% | 25% | Concentrated value |

---

## Section 2 · Pricing & packaging

### Plans — paid from day 1, value-tiered employee pricing

**Pricing live from day 1.** Not the "free until 2027" Linear playbook (wrong fit for solo + AI). Low-friction acquisition (first letter free) is enough.

**Critical insight: the employee side has huge value gradient.** A resignation letter is worth £150 vs solicitor; an ET1 prep letter helps someone win a £40k discrimination claim — pricing both at £9.99 leaves money on the table. Tier by stakes.

#### HR/Management mode pricing (Persona A/B/C/D)

| Tier | Price (live from day 1) | What you get | Target |
|---|---|---|---|
| **First letter** | **Free, no card** | 1 full letter, all features, full export, no watermark | Acquisition |
| **Pay-as-you-go** | £9.99/letter (HR-side simple letters) | Single letter, no subscription. For HR consultants doing occasional one-offs. | Persona A |
| **Pro** ★ | £79/mo or £790/yr | Unlimited letters · all 35 templates · 20 AI critique credits/mo · marketplace access · evidence pack signing | Persona B (modal) |
| **Business** | £199/mo or £1,990/yr | Pro + 5 seats · team review · audit trail dashboard · priority support · custom letterhead · **bulk-draft from CSV** · approval queue | Persona C |
| **Enterprise** | bespoke £30k+/yr | Business + SSO/SAML · SCIM · EU residency option · dedicated CS · contractual SLA · audit log API · HRIS integrations | Persona D |

#### Employee mode pricing (Persona E) — value-tiered by stakes

The employee side is anchored against solicitor costs (£150-£5,000) — we win on price AND speed. Tier by what's at stake in the letter.

| Tier | Examples | Price | What they get | Solicitor anchor |
|---|---|---|---|---|
| **Routine** | Resignation, flexible working request, holiday request, simple complaint | **£9.99** | Single letter + full export | vs £150 (94% saving) |
| **Standard** | Grievance letter, sickness/absence appeal, performance improvement reply, request for written reasons | **£29** | Single letter + full export + evidence pack | vs £250 (88% saving) |
| **High-stakes** | Settlement counter-offer, escalated grievance, discrimination grievance, breach of contract notice, redundancy challenge | **£59** | Single letter + evidence pack + **1 AI critique credit included** | vs £400 (85% saving) |
| **Tribunal-bound** | ET1 prep, constructive dismissal escalation, discrimination claim (race/sex/disability), whistleblowing detriment | **£99** | Single letter + evidence pack + **2 AI critique credits + £20 marketplace credit** | vs £1,500 (93% saving) |

**First-letter-free works differently per tier:**
- **Routine + Standard:** first letter free, full export (these are SEO-driven volume; "resignation letter UK" gets us 8,000 monthly searches alone)
- **High-stakes + Tribunal-bound:** first letter free to **draft + preview**, paywalled at export. The user has invested 5 minutes drafting; conversion to export-and-pay is high. (How Lawpath's lawyer calls work.)

#### Multi-letter SKUs for employee cases

Most employee cases aren't one letter — they're a sequence over weeks or months. Two SKUs capture this:

| SKU | Price | What | Why |
|---|---|---|---|
| **Grievance Pack** | £69 | Initial letter + follow-up + escalation + final position (4 letters) | Typical grievance arc 6-12 weeks |
| **Settlement Pack** | £119 | Counter-offer + employer reply + revised offer + final settle (4-6 letters) | Settlement negotiation usually 3-6 letters |
| **Tribunal Prep Pack** | £249 | ET1 + schedule of loss + witness statement outline + supporting letters (6-8 documents) | Full ET1 lodgement support |
| **Employee Plus subscription** ★ | **£99/mo** | Unlimited letters within ONE matter · **10 AI critique credits/mo** · **£30 marketplace credit/mo** (pools toward consultant review) · priority support · case timeline dashboard · tribunal deadline calendar with email/SMS reminders · cancel any time | The right SKU for multi-month cases (grievance arc, settlement negotiation, tribunal prep). Typical 4-9 month lifetime = **£396-£891 LTV**. Solicitor monthly retainer alternative is £500-2,000/mo — we're 80%+ cheaper. |

#### Marketplace pricing (both modes)

| Item | Price | DraftHR take |
|---|---|---|
| Standard consultant review | £85-£200 (consultant-set within bands) | 20% (£17-40) |
| Express review (sub-12h) | +30% premium | 20% of base |

**Why the employee tiering matters:** old PAYG model = £49,950 Y1 (5,000 letters × £9.99). New tiered model = ~£120k Y1 from same volume (60% routine / 25% standard / 10% high-stakes / 5% tribunal mix). **+141% on the same traffic.** Plus uplift from Case Packs, Employee Plus, higher AI credit attach, higher marketplace booking attach for high-stakes letters.

**No grandfathering required (nobody's on a free tier). No deadlines. Just clear, fair pricing from day 1.**

**Why this works for a solo + AI founder:**
- Revenue from week 1 (PAYG converts fast — employees with one issue pay £9.99 immediately)
- Pro subscriptions start the recurring engine immediately
- Marketplace earns from first booking
- No cliff at graduation, no awkward "you used to be free" conversation later
- The product proves itself via the free first letter — that's enough acquisition signal

**Conversion math:**
- 100 first-letter signups → ~25 pay £9.99 (25% one-shot conversion) = £250 + ~8 subscribe to Pro (8% subscription conversion) = £640/mo recurring
- At 1,000 signups/mo (achievable from SEO + LinkedIn organic by month 6): ~£2.5k/mo PAYG + ~£6k/mo recurring = **£8.5k/mo by end of Y1**

★ = expected modal plan (most users land here)

**Why this packaging works:**
- **First letter free** = "we will prove it to you in 60 seconds" — demonstrates the product, removes the trial-stinginess feeling
- **£9.99/letter** = matches the mental model of an employee or solo person dealing with one issue — they don't want a subscription, they want THIS letter handled
- **£79/mo Pro** = the obvious upgrade path the moment someone needs more than 1 letter — frictionless conversion (one paid letter then "unlock unlimited for £79" lands every time)
- **Two paths to revenue** = wider top-of-funnel than a pure subscription model

**Conversion math:**
- 1,000 first-letter signups → ~250 pay £9.99 (25% one-shot conversion) = £2,498 + ~80 subscribe to Pro (8% subscription conversion) = £6,320/mo recurring
- Industry-standard SaaS conversion is 2-5%; "first letter free" should out-perform because the user has experienced the value before the price ask

### Marketplace (separate, not bundled)

- £85–200 per consultant review depending on tier (HR Director / Solicitor / Barrister)
- DraftHR take rate: **20%** (£17–40 per booking)
- Founders pay 0% take rate for first 6 months, then 15% for next 12 months, then standard 20% — this is the supply-side recruitment lever
- Refund framework: 24h dispute window post-submission; 50/50 split between consultant + DraftHR

### AI critique credits (in-app micro-purchase)

| Pack | Price | Credits | £/credit | Margin |
|---|---|---|---|---|
| Single | £1.99 | 1 | £1.99 | ~95% |
| Small | £4.99 | 5 | £1.00 | ~95% |
| Medium | £8.99 | 10 | £0.90 | ~95% |
| Best value | £19.99 | 25 | £0.80 | ~95% |

Cost-per-credit to DraftHR: ~£0.05 (Sonnet at our prompt sizes with caching). **97% gross margin** — this is the highest-margin line in the entire business. Convert AI from "biggest cost" to "biggest profit center."

---

## Section 3 · Vendor costs (3-year)

| Component | Y1 (100u) | Y2 (5k) | Y3 (50k) | Notes |
|---|---|---|---|---|
| **Vercel** | $20–60 | $400–1,200 | $4,000–12,000 | Cliff at ~10k DAU |
| **Clerk** | $0 | $25 + ~$0/MAU | $25 + ~$800 | Pricing penalises growth past 10k MAU |
| **Anthropic API** | $80–200 | $6,000–15,000 | $40,000–120,000 | **Dominant variable cost** |
| **Neon** | $0–19 | $69–200 | $700–1,500 | Cliff at storage + compute |
| **Stripe Connect** | $0 | ~$2,000 (1k bookings/mo) | ~$25,000 (10k bookings/mo) | Variable; passes through marketplace fees |
| **Resend** (email) | $20 | $90 | $400 | Cheap |
| **Sentry** | $26 | $80 | $400 | Step pricing |
| **S3 storage** | $5 | $50 | $300 | Letterhead, signatures, evidence |
| **AI Gateway** | $0 | $50–100 | $200–500 | Pays back via caching |
| **Total monthly** | **~$150–330** | **~$8,800–19,000** | **~$72,000–160,000** | |
| **Annualised** | **~$2–4k** | **~$105–228k** | **~$860k–1.9M** | |

### The cliff

Anthropic spend crosses **$100k/yr between 5k–10k users** without intervention. **AI Gateway + Haiku tiering + prompt caching can reduce by 40–60%** = the difference between Y3 cash-positive and Y3 still burning.

---

## Section 4 · Compliance costs

| Item | Y1 | Y2 (steady state) |
|---|---|---|
| SOC 2 Type II (Drata + audit firm) | $30–60k setup | $20–40k surveillance + audit |
| ISO 27001 (Y2 only) | — | $20–40k Y2 + $10–20k surveillance |
| Outside legal counsel (DPA, marketplace, employment law UK + US) | £15–25k | £8–15k |
| Cyber insurance | $5–10k | $8–15k |
| Fractional DPO | £18–36k | £24–48k |
| **Total annualised** | **~£60–100k (Y1) / $80–135k** | **£70–130k (Y2 steady)** |

**This is the largest fixed cost line after team.** Defer SOC 2 *audit* (not readiness) until customer signs LOI gated on it. Drata in monitoring mode now ($5–10k/yr) compresses time-to-attestation when needed.

---

## Section 5 · Unit economics

### Per consultant booking (£85 average)

| Line | £ | Notes |
|---|---|---|
| Gross booking | 85.00 | |
| Stripe payment processing (1.4% + 20p UK) | -1.39 | |
| Stripe Connect fee (0.25% + amortised account fee) | -0.20 | |
| Consultant payout (80%) | -68.00 | 68 = 85 × 0.80 |
| DraftHR gross take | **17.00** | |
| Variable AI/email/DB cost | -0.05 | |
| **Net contribution per booking** | **£14.30** | **16.8% of gross / 84% of take** |

**Implications:**
- 1,000 bookings/mo = £14,300/mo gross margin
- 10,000 bookings/mo = £143k/mo gross margin
- Below ~300 bookings/mo, marketplace doesn't cover its own product cost — set a 6-month go/no-go review

### Per Pro plan customer (£79/mo)

| Line | £/mo | Notes |
|---|---|---|
| Subscription revenue | 79.00 | |
| Anthropic AI cost (avg 6 letters drafted, 4 refines, 2 agent sessions) | -2.50 | With AI Gateway + caching |
| Stripe subscription processing (1.4% + 20p) | -1.31 | |
| Vercel + Neon + storage + email amortised | -0.40 | |
| **Gross margin per Pro customer** | **£74.79** | **94.7% gross margin** |

### Per AI critique credit pack (£4.99 / 5 credits)

| Line | £ | Notes |
|---|---|---|
| Revenue | 4.99 | |
| Anthropic cost (5 critiques, ~2k tokens out each, with cached system prompt) | -0.25 | |
| Stripe processing (low — micro-transaction) | -0.27 | |
| **Gross margin** | **£4.47** | **89.6% gross margin** |

---

## Section 6 · Revenue projection — solo-founder + AI build (24 months)

**Build assumption: solo founder + AI pair-programming. Zero salary line until £500k ARR.** Hiring triggers in Section 9.

### Y1 — MVP launch · three scenarios

**The Y1 outcome depends on distribution, not pricing.** The product already works (35 letter types shipping today). The variable is how many people find it. Three honest scenarios:

#### Conservative — slow word-of-mouth, no PR moment, founder-only marketing
| Line | Users / volume | £/yr | Notes |
|---|---|---|---|
| Pay-as-you-go | 1,500 letters × £9.99 | £14,985 | Long tail one-shot buyers |
| Pro | 100 × £948/yr | £94,800 | Modal plan |
| Business | 8 × £2,490/yr | £19,920 | |
| Enterprise | 1 × £30,000 | £30,000 | Lighthouse close |
| Marketplace | 100 bookings/mo × £17 × 8mo | £13,600 | Ramp from month 5 |
| AI credits | 200 packs/mo × £4.47 × 8mo | £7,152 | |
| **Y1 ARR (run-rate at month 12)** | | **~£180k** | |

#### Realistic — ProductHunt launch, 1 podcast, founder LinkedIn 5×/wk, SEO compounds from month 6 ★ default plan
| Line | Users / volume | £/yr | Notes |
|---|---|---|---|
| Employee letters (tiered PAYG) | 5,000 letters/yr · 60% routine £9.99 / 25% standard £29 / 10% high-stakes £59 / 5% tribunal £99 | £120,470 | **Tiered pricing — 2.4x vs flat £9.99** |
| Case Packs + Employee Plus | 250 packs × £150 avg + 100 sub-months × £99 | £47,400 | Multi-letter cases monetized · Plus subscription at proper price |
| Pro | 250 × £948/yr | £237,000 | Trial-to-paid 8% on 3,000 first-letter signups |
| Business | 20 × £2,490/yr | £49,800 | Small mid-market wins |
| Enterprise | 2 × £40,000 | £80,000 | Founder-led close, average deal up |
| Marketplace | 350 bookings/mo × £17 × 8mo | £47,600 | Higher attach rate from tribunal-tier letters |
| AI credits (separate from bundled) | 1,200 packs/mo × £4.47 × 8mo | £42,912 | Upsell to Pro users |
| **Y1 ARR (run-rate at month 12)** | | **~£625,182** | **+29% vs prior projection** |

#### Aggressive — PR moment (TechCrunch, FT, HR Magazine), CIPD partnership, strong inbound
| Line | Users / volume | £/yr | Notes |
|---|---|---|---|
| Pay-as-you-go | 12,000 letters × £9.99 | £119,880 | Viral spikes |
| Pro | 500 × £948/yr | £474,000 | Trial-to-paid holds at 8% on 6,000 signups |
| Business | 40 × £2,490/yr | £99,600 | |
| Enterprise | 3 × £50,000 | £150,000 | Word-of-mouth from a flagship customer |
| Marketplace | 500 bookings/mo × £17 × 8mo | £68,000 | 50 consultants live by month 9 |
| AI credits | 2,500 packs/mo × £4.47 × 8mo | £89,400 | |
| **Y1 ARR (run-rate at month 12)** | | **~£1.0M** | |

**Plan against Realistic. Capacity-plan against Aggressive.** Conservative is the floor, not the goal.

**Y1 cash collected (Realistic case):** about half the run-rate since revenue ramps over the year = **~£260k cash collected.**

**Y1 cash costs:**

| Line | £ |
|---|---|
| Vendor (avg over 12 months — Vercel, Neon, Anthropic, Clerk free tier, etc) | £6,000 |
| Legal one-off (DPA, NDA, marketplace ToS, employment law UK, DPIA) | £20,000 |
| Drata SOC 2 readiness (monitoring mode) | £8,000 |
| Fractional DPO (deferred to month 6, 6 months × £2.5k) | £15,000 |
| Cyber + D&O insurance | £6,000 |
| Domain, design tools, AI subscriptions (Claude Pro, Cursor, etc), misc | £3,000 |
| Founder LinkedIn outreach for consultant supply (Sales Navigator + travel) | £3,000 |
| **Y1 total cash cost** | **~£61,000** |

**Y1 net: collected ~£90k − £61k cost = ~£29k positive.** Funded entirely from revenue if you have ~£40-50k personal runway for months 1-4 before revenue catches up. **No seed needed.**

### Y2 — 1,500 paying customers + 12 enterprise + marketplace at scale (Realistic plan)

| Line | Users / volume | £/yr | Notes |
|---|---|---|---|
| Pay-as-you-go | 15,000 letters/yr × £9.99 | £149,850 | SEO compounds, employee searches dominate |
| Pro | 1,000 × £948/yr | £948,000 | Modal plan + Pro+ at £149/mo introduced |
| Business | 80 × £2,490 | £199,200 | |
| Enterprise | 12 × £75,000 | £900,000 | Mid-market wins compound |
| Marketplace | 3,000/mo × £17 | £612,000 | 50 consultants × ~60 reviews/mo each |
| AI credits | 8,000/mo × £4.47 | £429,000 | |
| **Y2 ARR** | | **~£3.24M** | |

**Conservative Y2:** ~£1.8M · **Aggressive Y2:** ~£5M

**Y2 cash costs:**

| Line | £ |
|---|---|
| Vendor (avg ~£10k/mo — Anthropic dominates) | £120,000 |
| Compliance (SOC 2 audit + ongoing Drata + legal updates + DPO at full rate) | £80,000 |
| Insurance | £12,000 |
| **First hire** at month 18 — Founding Engineer or Ops/CS lead at £80k loaded for 6 months | £40,000 |
| Marketing (founder-led but some paid: SEO tools, content, light paid acquisition) | £30,000 |
| Founder salary (now affordable — £80k from month 12) | £80,000 |
| **Y2 total cash cost** | **~£362,000** |

**Y2 cash flow: £2.07M revenue − £362k cost = ~£1.7M cash positive.** Profitable.

### Y3 — 5,000 paying customers + 35 enterprise (Realistic plan)

| Line | Users / volume | £/yr | Notes |
|---|---|---|---|
| Pay-as-you-go | 50,000 letters/yr | £499,500 | Mature SEO + employee market |
| Pro + Pro+ | 4,000 × £1,100 (blended) | £4,400,000 | Pro+ tier at £149 captures 30% of base |
| Business | 250 × £2,490 | £622,500 | |
| Enterprise | 35 × £100,000 | £3,500,000 | |
| Marketplace | 12,000/mo × £17 | £2,448,000 | 200 active consultants |
| AI credits | 40,000/mo × £4.47 | £2,145,600 | |
| **Y3 ARR** | | **~£13.6M** | |

**Conservative Y3:** ~£9.5M · **Aggressive Y3:** ~£20M

**Y3 cash costs:**

| Line | £ |
|---|---|
| Vendor (~£70k/mo with AI Gateway tiering; ~£140k/mo without) | £840,000 |
| Compliance (SOC 2 maintained + ISO 27001 build + GC retainer + DPO FTE) | £180,000 |
| Insurance | £20,000 |
| Team — 6 people at £130k loaded avg (3 eng, 1 marketplace ops, 1 marketing/CS, 1 founder) | £780,000 |
| Marketing (paid acquisition, conferences, partnerships) | £150,000 |
| Office / equipment / misc | £40,000 |
| **Y3 total cash cost** | **~£2,010,000** |

**Y3 cash flow: £9.45M − £2.01M = ~£7.4M cash positive.** Properly profitable.

**The AI Gateway lever is real:** without it, vendor cost in Y3 doubles to ~£1.7M, and cash flow drops to ~£5.7M. Still positive but you give up £1.7M of profit just for not wiring it now.

---

## Section 7 · Stack decisions (locked)

| Layer | Pick now | Pick long-term | Migration trigger |
|---|---|---|---|
| **DB** | Neon Pro (EU-Frankfurt) | Aurora Postgres multi-region | First enterprise SAML deal OR 50k MAU |
| **ORM** | Drizzle | Drizzle | — |
| **Auth — users** | Clerk | **WorkOS** | Q1 2027 (after SOC 2 attestation) |
| **Auth — consultants** | Clerk Organizations | WorkOS separate Organization | Same trigger |
| **Hosting** | Vercel | Vercel + AWS escape (Puppeteer only) | Month 18 |
| **State (server)** | Neon + TanStack Query | Same | Stop `localStorage` for drafts NOW |
| **State (UI)** | Zustand | Zustand | — |
| **Storage** | S3 (KMS, eu-west-2 + us-east-1) | Same | Move letterhead/signature off base64 in 60 days |
| **Email** | Resend | Resend → SES at volume | When > 500k transactional/mo |
| **Jobs** | Inngest | Inngest | — |
| **Vector** | pgvector on Neon | pgvector → Turbopuffer | At 10M vectors / 100 QPS |
| **Realtime** | None (async submission) | Liveblocks (Yjs underneath) | Year 2 (consultant live presence) |
| **AI provider** | Anthropic via AI SDK | Anthropic + OpenAI failover via **AI Gateway** | **Wire Gateway THIS QUARTER** |
| **Payments** | Stripe Connect Express | Stripe Connect Express | After 2-week Adyen evaluation |
| **Compliance** | Drata monitoring mode | SOC 2 Type II Y1, ISO 27001 Y2 | Customer signal |

---

## Section 8 · Engineering waves (solo founder + AI pair-programming)

**Time, not money.** Calendar weeks assume the founder is full-time on this with Claude Code as the pair-programmer. Each wave below is what *one* focused person can ship in a week with AI help — proven cadence in this codebase already (the existing wizard, editor, AI agent, evidence pack, design D mockup were all built this way).

### Wave A — Foundation (this week) · ~5 focused days

- Drizzle schema for `tenants`, `users`, `drafts`, `sections`, `comments`, `evidence`, `letter_versions`
- Neon Pro project provisioned in EU-Frankfurt
- Dual-write Zustand → Postgres on every mutation behind a flag
- `audit_events` table with hash-chain integrity column
- Move letterhead/signature uploads from base64 → S3 (KMS-backed)
- AI Gateway wrapper around `api/draft.ts` + `api/agent.ts`

**Cash cost:** Neon Pro $19/mo + S3 $5/mo + AI Gateway $0. **~£20.**

### Wave B — Booking flow (next week) · ~5 focused days

- Suggestion-mark Tiptap extension (mirrors existing `CommentMark` in `src/lib/tiptap/comment-mark.ts`)
- Sanitizer allowlist update for `<ins>`/`<del>`
- 2-step booking sheet (Stripe Element)
- Consultant profile drawer (Surface 2)
- State machine: Requested → Acknowledged → In Progress → Submitted → Accepted/Disputed → Closed
- Stripe Connect Express test mode

**Cash cost:** Stripe Connect test = £0.

### Wave C — Review flow (week 3) · ~5 focused days

- Tracked-changes view (Surface 5)
- Review-in-progress state (Surface 4) with message thread
- Read-only editor lock during consultant session
- In-app toast library (Sonner — 12 messages)
- Consultant dashboard scaffold at `/consultant/dashboard` (code-split)

**Cash cost:** £0.

### Wave D — Compliance (parallel through wks 1–3) · ~3 days founder time + counsel

- Brief outside counsel: send the marketplace ToS, DPA, NDA, DPIA brief
- TSA round-trip in export pipeline (FreeTSA)
- `events/timeline.jsonl` in Evidence Pack with hash chain
- Consultant Onboarding Agreement + Code of Conduct (counsel-drafted, you review)
- PI insurance verification SOP (Notion doc, manual at first)
- DPIA complete (counsel-led, you input)

**Cash cost:** FreeTSA £0, Drata £5-10k/yr (sign up, monitoring mode), **legal one-off £15-25k** (the only meaningful spend in Q3).

### Wave E — Beta (week 4) · ~5 focused days + outreach

- Private beta with 14 confirmed founding consultants (recruited via parallel founder outreach during wks 1-3)
- Manual ops dispute resolution (= you, in Notion)
- Email notifications via Resend (12 transactional templates)
- Manual matching by ops for first 50 bookings (= you, in Linear)

**Cash cost:** Resend $20/mo + Sales Navigator $80/mo for outreach.

### Wave F — Public application (week 5) · ~5 focused days

- Public consultant application form (Typeform-grade, stores to Postgres)
- SRA + CIPD register lookup automation (free public APIs)
- Refund self-service (auto-approve if rating ≤ 2 or SLA breach)
- KMS-backed Ed25519 signing of `manifest.sig`
- Marketing push: 1 podcast booked, 2 trade press pitches sent

**Cash cost:** AWS KMS ~$1/mo per key.

### IA correction (interleaved with B–C) · ~3 focused days

- Port Design D from Finalize → ReviewStep + ReviewRail (Tier 1)
- Strip Finalize → focused ship gate (Tier 2)
- Consultant marketplace anchors in Finalize (Tier 2)

**Cash cost:** £0.

### Total Q3 2026 cash cost — solo founder reality

| Item | £ |
|---|---|
| Vendor (Q3 incremental, ~£100/mo × 3 mo + Drata setup) | ~£300 |
| Legal (counsel for DPA, NDA, marketplace ToS, DPIA) | £15,000–25,000 |
| Drata SOC 2 readiness Y1 fee | £5,000–10,000 |
| Sales Navigator + outreach tools (3 months) | £300 |
| Misc (domain extras, design assets) | £500 |
| **Total Q3 cash cost to ship MVP** | **~£21,000–36,000** |

**That's it. ~6 weeks of your time + £21-36k of one-off cash.** Compare to the original "£198k" number that assumed a 4-FTE team — this is 6-9× cheaper because YOU are the team, and the AI is the pair-programmer.

---

## Section 8b · Hiring triggers (when to spend on people)

Solo through Y1. First hire pulled by revenue, not vibes.

| ARR | Trigger | Hire | Why |
|---|---|---|---|
| £0–500k | — | None. You + AI. | This is the lean phase. Move fast. |
| £500k | First | **Founding Engineer or Marketplace Ops Lead** (£70-90k loaded) | At £500k ARR you're losing >40h/week to support + ops. The wrong choice is to grind harder. |
| £1M | Second | The other one of {Engineer, Ops} | Both seats now justified |
| £1.5M | Third | **Marketing / CS hybrid** (£60-80k) | Inbound is now the bottleneck not the product |
| £2M | Fourth | **Senior Engineer** (£100-120k) | Reliability + on-call coverage |
| £3M+ | — | Build out per Y3 plan (6-8 person team) | Series-A-ready org |

**Key principle: don't hire your first engineer because you're tired. Hire because the revenue justifies it AND you have a specific role/scope ready to onboard.** Most founders hire 6 months too early and burn 12 months of runway training someone for a role that wasn't ready.

**Founder salary timing:**
- Months 1-12: zero from company (live on personal runway / pre-existing)
- Months 12-18: £40-50k from company once ARR > £200k
- Months 18+: £80k from company once ARR > £750k

---

## Section 9 · Required vs deferred (to keep this affordable)

### MUST DO (cannot make money without)

1. ✅ Move off localStorage to Postgres + Drizzle on Neon (Wave A)
2. ✅ AI Gateway in front of all AI calls (Wave A) — single biggest cost lever
3. ✅ Audit log table with hash chain (Wave A) — compliance moat + tribunal-defensible
4. ✅ DPA + RoPA + sub-processor list + DPIA published (30 days)
5. ✅ Stripe Connect Express live (Wave B)
6. ✅ Suggestion-mark Tiptap extension (Wave B) — primitive that serves 4 surfaces
7. ✅ Drata in monitoring mode for SOC 2 readiness ($5–10k/yr)
8. ✅ Fractional DPO (£1.5–3k/mo)
9. ✅ MFA mandatory for admin + consultant accounts (today, free)
10. ✅ S3 (KMS-backed) for storage — replace base64-in-localStorage
11. ✅ 14 founding consultants recruited in 6 weeks (founders personally)
12. ✅ IA correction: Review = Tier 1 (extend existing rail), Finalize = Tier 2 + ship

### SHOULD DO (Year 1, after MVP signal)

- WorkOS Organizations PoC for consultant identity tier (3 days)
- 2-week Adyen MarketPay evaluation BEFORE Stripe Connect lock-in
- AWS escape hatch design for Puppeteer route (defer build to month 18)
- SOC 2 Type II observation window opens Q3 2026
- Public consultant browse-all directory (Wave F+)
- Consultant earnings dashboard (Stripe-hosted is fine)

### CAN WAIT (Year 2)

- WorkOS migration (Q1 2027 trigger: first SAML deal)
- Aurora Postgres migration (trigger: enterprise tenancy clause)
- ISO 27001 (Year 2 build, certify late Y2)
- EU multi-region (trigger: first EU customer with residency clause)
- Liveblocks live editing (Year 2)
- 3 SLA tiers (4h / 24h / 48h) for marketplace
- AI auto-matching algorithm (after 200 bookings of training data)
- Complexity multipliers per letter type
- Public consultant profiles + browse-all
- Consultant-side appeals UI

### NEVER (or defer to v3+)

- ❌ Real-time collaborative editing (Yjs/Liveblocks) in MVP
- ❌ Subscription bundles for HR teams (£299/mo for 5 reviews)
- ❌ Insurance product (£8 surcharge per booking)
- ❌ Multi-consultant review (second opinion flow)
- ❌ HIPAA controls (deal-driven only)
- ❌ FedRAMP-Moderate (no government deals planned)
- ❌ Build-our-own auth (math doesn't work below 100k MAU)
- ❌ Consolidate to Supabase BaaS (vendor lock + downgrade from Clerk)
- ❌ On-prem appliance (most "on-prem" requests satisfied by single-tenant cloud)
- ❌ PAdES B-T signing in MVP (RFC 3161 + Ed25519 is enough; PAdES is v0.7 upgrade)

---

## Section 10 · KPIs & decision triggers

| Metric | Y1 target | Y2 target | Y3 target | Trigger if missed |
|---|---|---|---|---|
| Paying users | 150 | 1,000 | 5,000 | Re-evaluate ICP / pricing |
| ARR | £188k | £1.96M | £8.93M | — |
| Marketplace bookings/mo | 200 | 2,000 | 10,000 | 6-month go/no-go for marketplace |
| Marketplace consultant count | 14 | 50 | 300 | Pause new acquisition, focus quality |
| AI cost as % of variable | <40% | <30% | <25% | Force Haiku tiering harder |
| SOC 2 Type II attested | end Y1 | maintained | maintained | Defer until customer LOI |
| Enterprise deals (>£30k ARR) | 1 | 10 | 30 | — |
| Avg consultant rating | 4.7+ | 4.8+ | 4.85+ | Re-vet bottom decile |
| SLA breach rate | <5% | <2% | <1% | Suspend repeat offenders |

### Vendor migration triggers

- **Clerk → WorkOS:** First prospect that pushes back on $200/mo SSO surcharge OR first SAML/SCIM RFP
- **Neon → Aurora:** First enterprise customer with tenancy clause OR 50k MAU OR Neon connection-pool exhaustion
- **Vercel → AWS escape hatch (Puppeteer only):** PDF export route exceeds 30s p95 cold start at >100 exports/day
- **pgvector → Turbopuffer:** 10M vectors stored OR 100 QPS sustained
- **Single-region → multi-region:** First customer (EU or APAC) with data residency clause in DPA

---

## Section 11 · Open decisions for the board

1. **Founders pay 0% take rate to consultants for first 6 months?** Yes (Marketplace memo). Costs ~£0 in Y1 (low volume), buys quality + word-of-mouth.
2. **Read-only editor during consultant session** (vs editable with merge)? Read-only for MVP (Engineering / Product memos). Revisit at v1.
3. **2-step vs 3-step booking flow?** 2-step (Product memo) — collapse scope into entry CTA.
4. **Suggestion-mark Tiptap extension** vs side-by-side diff for MVP? Suggestion mark — one primitive serves 4 surfaces.
5. **Adyen MarketPay 2-week evaluation BEFORE Stripe Connect lock-in?** Yes — single most painful lock-in in the stack.
6. **Drata monitoring mode now** (vs full SOC 2 audit deferred)? Yes — cheap insurance, compresses audit timeline when needed.
7. **Defer SOC 2 audit until customer LOI**? Yes — most common form of zombie spend in early SaaS.
8. **WorkOS migration timing**: Q1 2027 (after SOC 2 attestation, before SAML deal forces our hand).
9. **Consultant identity tier**: separate WorkOS Organization (Security memo) — clean, compliance-defensible.

---

---

## Section 11b · Portal at scale — HR/Management mode only (NEW per B2B Product board)

### Two modes, two product surfaces

The product has always supported two modes (`src/routes/ModePicker.tsx`, README: "35 letter types — 14 HR-side, 21 employee-side"). They are **fundamentally different products** under one brand. The portal-at-scale work below is for **HR/Management mode only** — Employee mode stays close to today's single-letter UX.

| Dimension | **Employee mode** | **HR/Management mode** |
|---|---|---|
| Who uses | Persona E (individual employee) | Persona B/C/D (HR Manager / Team / Enterprise) |
| Mental model | "I'm dealing with ONE issue: my grievance / resignation / flexible-working request" | "I operate a portfolio of employees and matters" |
| Data shape | 1 Employee (themselves) + 1-3 Matters lifetime | Many Employees + Many Matters concurrent |
| Primary surface | **Single-letter wizard** (today's UX, mostly unchanged) | **Portfolio dashboard** (NEW per this section) |
| Plans | First letter free → £9.99 PAYG → £79 Pro if recurring | £79 Pro → £199 Business → £30k+ Enterprise |
| Marketplace | Used occasionally for high-stakes letters (e.g. tribunal-bound grievance) | Used regularly across the portfolio |
| Bulk operations | N/A | Killer Business feature (CSV → 50 letters at once) |
| HRIS sync | N/A | Required at Business+ |
| Reporting | N/A | Required at Business+ |
| Team workflows | N/A | Approval queues, role-based access, assignment |

**Mode picker happens at signup** (existing `ModePicker.tsx` route). The user can switch later via Settings. **No employee will ever see the multi-employee dashboard; no HR Manager loses access to the single-letter wizard when they need it.**

---

### HR/Management mode — the mental model shift

DraftHR's HR mode today is **a single-letter authoring app with a thin Matter wrapper.** To win Persona B and earn Persona C/D, the HR mode has to flip: the user no longer "drafts a letter" — they **operate a portfolio of employees and matters**. Letter is the artifact dropped onto a case at a moment in time. The HR portal becomes a workbench, not a wizard.

### The data model shift

```
Workspace
  └── Employee (real entity, doesn't exist today — denormalized onto each Draft today)
        └── Matter (case) — 0..N per employee
              ├── Drafts (letters)
              ├── Evidence
              ├── Tasks (next action + due date + assignee)
              ├── Events (meetings, deadlines)
              └── Timeline (audit log of everything above)
```

A Matter can link **multiple** employees (a grievance has a grievant, an accused, witnesses). A draft belongs to exactly one Matter. The user's primary verb shifts from "create draft" to "**work the case**." Letter generation becomes a sub-flow inside a case, prefilled from employee + matter context.

### The 6 main surfaces (replace today's Drafts-as-spine)

1. **Dashboard (at-scale)** — Today + Risk Register + Compliance Health triptych. "Good morning Sarah · You own 28 active matters · 4 need you today." Replaces today's `Home`.
2. **Employee directory + profile** — `/employees`, sortable table. Click → profile shows active matters, letter history, key dates, AI suggestions ("3 sickness episodes in 6 months — open absence-management?")
3. **Matter view** — case management: type chip + status pill + risk chip + owner avatar + next-action banner + sub-tasks + participants strip + timeline + letters
4. **Drafts in matter context** — editor stays mostly the same but gains persistent breadcrumb (`Patel grievance / Investigation invitation`) + employee context chip
5. **Reporting + analytics** (`/reports`) — Compliance, Risk (tribunal exposure heatmap), Operations (volume, time-to-resolve, team utilization, cost-of-matter rollup)
6. **Bulk operations** (`/bulk`) — CSV import 50 employees → generate 50 probation-end letters at once. **The killer Business-tier feature.**

### Migration path (no forced upgrade)

- **Untagged Drafts inbox** for existing drafts
- **AI-suggested assignment** (extracts employee name from draft, suggests creating Employee record)
- Existing Matters preserved, type defaults to "investigation" with re-classify suggestion
- **Persona A (lone consultant) ignores all of this** — new surfaces dormant until they create a 2nd employee

### Build order (per B2B Product board)

- Wave A+: Employee entity + expanded Matter (type, status, participants, riskBand, tasks, ownerUserId)
- Replace `Home` with Today/Risk/Compliance dashboard
- Editor + Wizard prefill from Employee
- Bulk-draft v0 (CSV → preview → N drafts)
- (Wave B) Approval queue, roles/RBAC
- (Wave C) Reporting, HRIS sync, mobile read-only

---

## Section 11c · Growth strategy — paid-from-day-1, low-friction acquisition (revised)

### The launch model

**Pricing live from day 1** (per founder reality — solo + AI + ~£40-50k personal runway, needs revenue from week 1, not week 40). The Growth specialist's "Free until 31 March 2027" recommendation was the Linear playbook — right for venture-backed startups, wrong for self-funded indies.

**Mechanic:**
- **First letter free** — pure acquisition demo, no card required. Proves the product in 90 seconds. This is what "no paywall at the beginning" actually means.
- **PAYG £9.99/letter** — revenue from the first paying user, no subscription friction
- **Pro £79/mo** — full price, day 1
- **Business £199/mo** — full price, day 1
- **Enterprise £30k+/yr** — full price, day 1
- **Marketplace** charges from day 1 (real consultant cost)
- **Branded export footer** appears on free + PAYG exports ("Drafted with DraftHR — try free at drafthr.com"). Removable on Pro+.
- No grandfathering. No deadlines. Clean clear pricing.

**Why this works for solo + AI:**
- Revenue from week 1 (first £9.99 PAYG within first 100 signups)
- Pro subscriptions start the recurring engine immediately
- No cliff-edge graduation event to manage
- Free first letter is enough acquisition signal — every confident SaaS does this

### Activation = first letter EXPORTED, not drafted

The single most important metric in the whole business. Targets:
- **Time-to-first-letter:** < 90 seconds from signup
- **Time-to-first-export:** < 5 minutes (P50)
- **D1 activation:** > 60% export ≥1 letter on day 1
- **D14 activation:** > 25% draft ≥3 letters by day 14
- **The 2nd-letter rule:** if no 2nd letter in 14 days, they're churning. Win-back at day 21 with founder personally offering to help.

The "Help me pick" picker (4-question triage) is the single highest-leverage activation improvement available right now.

### The growth engine — only 2 channels compound at zero cost

| Channel | Cost | Y1 yield (signups / paid post-graduation) | Why |
|---|---|---|---|
| **35 SEO landing pages** (one per letter type) | £0 founder time | 8,000 / 80-150 paid | Compounds for 5 years. **The non-negotiable build of Q3.** |
| **Founder LinkedIn 5×/wk** | £0 | 1,500 / 30-60 | Authority + dealflow. Letter teardowns ("Here's what's wrong with this dismissal letter") |
| **Branded export footer** | £0 (engineering) | 1.15× — every paid user generates 0.15 free signups | Calendly's mechanism |
| ProductHunt launch (week 4 of MVP) | £0 | 3,000 visits / 20-40 conversions | One-shot brand |
| Trade press (HR Magazine, People Management) | £0 founder pitch | 1,000 / 10-20 | Earned media |
| HR podcasts | £0 founder time | 800 / 15-25 | Persona C/D |
| CIPD partnership | £0-£5k revshare | unknown — could be huge | Pursue aggressively |
| **Paid ads** | £20-100 CPA | — | **Defer until Y2** |
| **Conferences (booth)** | £15k+ | — | **Defer to Y2** |

### Self-serve vs founder-led split

| Persona | Plan | Motion | Founder hours/mo |
|---|---|---|---|
| A (Solo HR / freelance) | PAYG £9.99 | Pure self-serve | 0 |
| B (SMB HR Manager) | Pro £79/mo | Pure self-serve, email-only support | < 5 |
| C (Mid-market HR) | Business £199/mo | Hybrid — self-serve discovery, founder demo for close | 20 |
| D (Enterprise) | £30k+/yr | Pure founder-led, first 10 deals personally | 40 |

**Hard rule: founder does ZERO demos for Pro.** £79/mo deals get a Loom video. Founder hours are for £30k+/yr deals.

---

## Section 11d · CS + activation playbook (per CS board)

### First 5 minutes UX (the wow at second 75-90)

1. Magic-link auth (5-10s)
2. Letter type picker with **"Help me pick"** 4-question triage (15-25s)
3. Wizard 5-7 questions max (30-40s)
4. Section-streaming generation (15-25s) — **show the work, not a spinner**
5. **T+75s: complete letter renders** — single primary CTA "Export PDF". The wow.

### Tooling stack for solo CS (~£70-100/mo)

| Tool | Job | Cost |
|---|---|---|
| Plain.com | Support inbox + in-app chat | Free → £35/mo |
| Loom | Personalised onboarding videos | £12/mo |
| PostHog | Activation funnel + session replay | Free tier |
| Resend | Lifecycle emails | £15/mo |
| Notion | Internal CS knowledge base | £8/mo |
| Slack Connect | Enterprise customer channels | Free |
| Cal.com | "30-min onboarding" booking link | Free |

**Not:** Intercom (overkill until 500+), Zendesk (wrong shape), Customer.io (Resend covers it).

### Customer health score (0-100)

```
recency_score    = max(0, 40 - days_since_last_export)        # 40 pts
frequency_score  = min(25, letters_per_month * 5)             # 25 pts
depth_score      = (used_marketplace ? 8 : 0)
                 + (used_evidence ? 6 : 0)
                 + (used_comments ? 6 : 0)                    # 20 pts
plan_score       = {free: 3, payg: 8, pro: 12, biz: 15}[plan] # 15 pts
```

**Founder reads top 20 amber accounts every Monday morning.** Single most important ritual.

### When to hire the first CS person

**Trigger:** 200 paying customers OR founder >50% on tickets — whichever first. Role: CS Generalist, £45-60k loaded, ideally ex-HR practitioner. Non-negotiable: written playbook + 40-article Notion knowledge base + 10 Loom videos BEFORE the hire.

---

## Section 11e · Brand + positioning (per Brand board)

### Positioning statement

> **"DraftHR is the AI-first authoring platform for HR letters that hold up in tribunal."**

Lead with **defensibility, not speed**. Speed is table stakes; *tribunal* is the load-bearing word.

### Brand archetype: Linear-meets-Stripe for HR letters

- **Sage** (primary) — wisdom, evidence, considered judgment. The Sage shows you the receipts.
- **Caregiver** (secondary) — present at fraught moments. Not solemn, but *serious*.
- **Anti-archetype: Hero or Magician.** Reject every "revolutionise your HR" instinct.

References: Linear (craft as marketing) × Stripe (authority through documentation) × Pitch (post-design-revolution restraint). Not Notion (too friendly), not Hibob (too HR-fun), not Lawpath (too old-school).

### Voice rules

- Say: *letter, evidence, tribunal, we, you*
- Never say: *seamless, intuitive, cutting-edge, robust, leverage, unlock, empower, journey, solution*
- No emojis in marketing. Ever. No "Dear valued customer." Ever.
- Sign every email with a real first name.

### Trust assets — week-1 priority

1. **Trust & Security page** (top-nav, not footer) — data residency, encryption, retention, deletion, who-sees-what
2. **Sub-processor list** — public, named, GDPR-required
3. **Founder bio + face + credentials** — humans wrote this
4. **Public changelog** — weekly, every release
5. **Status page** — Better Stack or Instatus, free tier
6. **ICO registration + GDPR statement**
7. (Month 3+) Customer logos
8. (Month 3+) 3 named, titled testimonials
9. (Month 6+) Case studies with redacted artifacts
10. **(Highest leverage of all) Endorsement from a sitting employment KC or top employment-law academic** — paid engagement is fine; credibility is worth orders of magnitude more than the fee

### Homepage hierarchy

- **H1:** "Every letter, evidenced and tribunal-ready."
- **Sub:** AI-drafted in 60 seconds. Reviewed by a vetted employment specialist for £85. Backed by an evidence chain you can hand to a tribunal.
- **CTA primary:** *Draft a letter* (self-serve, no email gate)
- **CTA secondary:** *See an example evidence pack* (the moat, made tangible)

### Founder presence timeline

- **Months 0-6 (0-100 customers):** founder IS the brand. LinkedIn 3-5×/wk, weekly long-form essay, every support ticket signed by founder.
- **Months 6-18:** transition begins. Hire #2 named publicly. Case studies feature customers.
- **Months 18+:** "the team behind DraftHR." Founder still posts personally; brand has its own voice.
- **Hire designer/brand person:** end of Y2, not earlier.

---

## Section 11f · Competitive landscape (per Competitive board)

### The 5 direct competitors and where we win

| Competitor | Their pitch | Our message |
|---|---|---|
| **Lawpath** (£35-129/mo, AU/UK) | Templates + lawyer calls | "Your templates are 2014. Ours are AI-drafted from your facts. Skip the £35-129/mo subscription — pay £9.99 only when you need a letter." |
| **BHRS / Bright HR** (£3-10/seat, bundled) | HRIS + advice line + docs | "Stop sharing the advice line. Get a vetted consultant reviewing your specific letter for £85, not a 30-min queue." |
| **Citation HR / Croner / Peninsula** (£200-2,000/mo retainer) | Outsourced HR consultancy | "You're paying £2,000/mo for advice you can't show a tribunal. We give you the letter, the audit trail, and an expert review for one-tenth the cost." |
| **ACAS Helpline (UK, free)** | Free phone advice | "ACAS told you what to do. We write it for you, with the audit trail you'll need if it escalates." (Acquisition strategy: SEO around ACAS-adjacent queries) |
| **Genie AI** ($30-150/mo) | AI legal docs (lawyer-focused) | "Genie does general legal docs. We are HR-specific — 35 letter types built for employment scenarios with statutory anchors UK + US." |

### White space we own

- **Per-letter pricing (£9.99)** — nobody offers this. New segment unlocked (employees + occasional users).
- **AI + human marketplace combo** — no comparable product has both
- **Tribunal-grade audit trail** — engineering moat with regulatory tailwind
- **UK + US dual jurisdiction from launch** — most competitors are single-jurisdiction
- **Employee-side product** — nobody serves both employer + employee in one product

### Threats to monitor (likelihood × timeline)

| Threat | Likelihood | Timeline | Defensive move |
|---|---|---|---|
| Lawpath bolts AI on top of templates | High | 12-24 months | Lock in marketplace supply, out-execute on HR depth |
| BHRS adds AI letters to bundle | High | 12-18 months | HRIS partnerships outside Peninsula |
| **Genie AI pivots into HR vertical** | **Medium-High** | **6-18 months — #1 to monitor** | Hire HR brand fast; lock in audit-trail messaging |
| HRIS bakes in AI letter authoring (HiBob, Bamboo, Personio) | High | 18-24 months | **Become the integration, not the competitor** |

### M&A landscape

- **HiBob** = highest acquisition probability (24-36 months). Both biggest threat AND biggest acquirer.
- **BambooHR** = likely (24-36 months) if they defend rather than build.
- **Personio** = likely (18-30 months), European angle.
- **Workday / Salesforce** = strategic-only at our scale; need £100M+ ARR to be on radar.

**Strategic posture: build to be either acquired by HiBob/Personio OR to defend independently for 5+ years.** Same playbook either way.

---

## Section 12 · 90-day plan (Q3 2026)

### Month 1 — Foundation + brand fundamentals
**Engineering (Wave A + B):**
- Postgres + AI Gateway + audit chain + S3 storage (Wave A)
- Suggestion-mark Tiptap extension + 2-step booking sheet (Wave B start)
- **Employee + expanded Matter entities** (per B2B Product board) — replaces Drafts-as-spine
- **"Help me pick" 4-question wizard triage** (per CS board — single highest-leverage activation improvement)
- WorkOS Organizations PoC (3 days)

**Brand (per Brand board — by Friday week 1):**
- Trust & Security page (top-nav)
- Sub-processor list at `/subprocessors`
- Status page (Better Stack free tier)
- Founder bio + face on About page
- Public changelog page

**GTM (per Growth board):**
- Pricing page with **31 March 2027 deadline + grandfathering promise** publicly visible
- First 5 SEO landing pages (dismissal UK, settlement UK, redundancy notice UK, grievance response UK, PIP UK)
- Branded export footer wired (mandatory in beta)
- Founder LinkedIn first post — "I'm building DraftHR. Free for 10 months. Here's what's broken about HR letter drafting in 2026."
- PostHog activation funnel instrumented (signup → wizard → letter_generated → letter_exported)
- Plain.com support inbox + Resend lifecycle emails set up

**Compliance:**
- DPA + RoPA + sub-processor list published
- Drata monitoring mode
- Fractional DPO appointed
- Counsel briefed on marketplace docs

**Supply (per Marketplace board):**
- Founder outreach for first 14 consultants — 240 LinkedIn messages, 30 video interviews

### Month 2 — Marketplace beta + portal-at-scale
**Engineering (Waves C + D + IA correction):**
- Tracked-changes view (Surface 5)
- Review-in-progress state (Surface 4)
- Read-only editor lock during consultant session
- IA correction shipped: Design D ports to ReviewStep (Tier 1) + Finalize stripped to ship gate (Tier 2)
- Bulk-draft v0 (CSV → preview → N drafts) — the killer Business-tier feature

**Brand:**
- Approach 1 employment KC for endorsement conversation
- Pitch HR Magazine + People Management for founder feature
- 5 more SEO landing pages live

**Beta launch:**
- 14 founding consultants live in private beta
- First 30 paid marketplace bookings
- Counsel returns finalised DPA + marketplace ToS

**Competitive:**
- Lawpath churn campaign — £500 PPC test on "Lawpath alternative"
- HiBob / Personio / Bamboo partnership intros sent (pitch as "the letter module they should have built")

### Month 3 — Public launch + activation discipline
**Engineering (Wave E + F):**
- Public consultant application form + SRA register cron
- Refund self-service
- KMS-backed Ed25519 signing of `manifest.sig`
- Approval queue for Business plan (drafts → Director sign-off)

**GTM:**
- ProductHunt launch (week 4 of MVP)
- Schedule first podcast (David Green / Digital HR Leaders)
- 35 SEO landing pages live (all letter types covered)
- Founder LinkedIn at consistent 5×/wk cadence
- D1/D7/D14 activation dashboard reviewed every Monday

**Targets:**
- 30-50 paying customers (mostly PAYG converting to Pro intent during beta — won't show as Pro revenue until graduation)
- 1 enterprise prospect engaged
- 50-100 marketplace bookings/mo run-rate
- AI Gateway showing 30%+ cost reduction (verify)
- 3,000+ free signups by end of month 3
- D14 activation > 25%

**Cash check:** revenue should be ~£3-6k/mo by end of month 3 (PAYG + marketplace + Stripe processing). Covers vendor costs + small slice of founder runway. Pro revenue remains £0 until graduation.

---

## Appendix A · Source memos

This roadmap synthesises 10 specialist memos across 2 board sessions on 2026-05-15:

**Marketplace board (5 memos):**
- CTO — Consultant flow engineering (data model, real-time vs async, suggestion mark, audit log, signing)
- CPO — Pricing, packaging, state machine, MVP cuts
- General Counsel — Tribunal admissibility, NDA, GDPR, dispute framework
- Head of Marketplace — Vetting, dashboard, payouts, ratings, scaling 14 → 1,400
- Head of Design — 7 new surfaces, state coverage, visual language

**Stack board (5 memos):**
- Platform CTO — Long-term DB + ORM + auth-glue + hosting
- Head of Security & IAM — Auth provider deep-dive (Clerk vs WorkOS vs Auth0 etc), MFA strategy
- Head of Compliance & Privacy — SOC 2 / ISO 27001 / GDPR roadmap, sub-processor management
- Head of Data Platform — Neon vs Supabase vs Aurora deep-dive, audit log architecture, multi-region
- CFO — 3-year TCO projection, vendor concentration, marketplace economics

Full memos retained in board session transcript (`/Users/augustusedem/.claude/projects/-Users-augustusedem-HRLETTER/`).

---

## Appendix B · IA — current vs corrected

### Current (pre-2026-05-15)
```
Wizard → Editor → Evidence → Review (thin checks rail)
                                  ↓
                              Finalize (rings + fix-this-first + lanes + consultants + export + ship)
                                       ─────────────────────────────────────────────────────────
                                       doing too much — assess AND ship
```

### Corrected (Wave A onwards)
```
Wizard → Editor → Evidence → REVIEW (Tier 1)              →  FINALIZE (Tier 2)
                              ───────────────────────────      ─────────────────────────────
                              "I'll fix this myself"           "Get me help + ship it"
                              free · automated · self-serve    paid/social · expert · final
                              · existing checks (extend)       · AI critique · Teammate · Consultant
                              · score ring (new)               · tracked-changes accept/reject
                              · 3 issues with Fix → (new)      · counsel-review attestation gate
                                                               · format tiles + Mark as sent
                                                               · cryptographic Evidence Pack signing
```

The IA correction is in Wave A–C. Wave A foundation work (Postgres, audit chain, suggestion mark) supports both Tier 1 and Tier 2.

---

## Appendix C · The "boring" version of this entire roadmap

If you only remember 5 things:

1. **The audit trail is the moat.** Build the hash-chained event log right the first time, S3 Object Lock from day one. Tribunal-defensible.
2. **AI Gateway THIS QUARTER.** Single biggest cost lever in the entire business. Difference between Y3 cash-positive and Y3 burning.
3. **Stay on standard Postgres everywhere.** Neon now, Aurora later. Drizzle ORM. Exit cost = `pg_dump`.
4. **Clerk now, WorkOS Q1 2027.** Don't migrate before SOC 2 Type II is signed.
5. **Founders close the first 14 consultants personally.** No SDR. 0% take rate for 6 months. Founding Consultant badge in perpetuity.

Everything else compounds from these.

---

**Owner:** Augustus Edem (Founder/CTO)
**Status:** Live document — update on every wave completion
**Next review:** End of Wave A (Friday Week 1)
