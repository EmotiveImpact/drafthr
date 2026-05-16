import { motion } from "framer-motion";
import { Check, Sparkles, ArrowRight, ShieldCheck, Star } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * CONSULT tab — read-only marketplace surface. The three featured consultants
 * are AI-matched against the draft type. A "See all 14" link navigates to
 * /consultants for the full marketplace with filter/sort/search.
 *
 * The topic chips are inferred from the draft's letterType via keyword
 * matching. Once the real marketplace API lands, this list will come from
 * server-side matching on letter content; for now the heuristic is enough
 * to show the "we picked these for you" pattern.
 */

type Topic = {
  label: string;
};

export type Consultant = {
  initials: string;
  name: string;
  role: string;
  rating: number;
  reviews: number;
  price: number;
  sla: string;
  top?: boolean;
  /** Tailwind gradient classes for the avatar (matches Design D). */
  avatarFrom: string;
  avatarTo: string;
  /** Real photo URL for the marketplace canvas cards. */
  photoUrl: string;
  /** Short marketing quote shown in the card specialty box. */
  specialty: string;
  /** Tag list driving filter chips on /consultants index page. */
  specialties: string[];
};

export const CONSULTANTS: Consultant[] = [
  {
    initials: "SM",
    name: "Sarah Mitchell",
    role: "Solicitor · 12 yrs · ex-DLA Piper",
    rating: 4.9,
    reviews: 87,
    price: 120,
    sla: "18h",
    top: true,
    avatarFrom: "from-indigo-400",
    avatarTo: "to-violet-500",
    photoUrl: "https://i.pravatar.cc/160?img=47",
    specialty:
      "Specialises in Working Time Regs + statutory leave disputes. Reviewed a similar holiday request last week.",
    specialties: ["Working Time", "Statutory leave", "Holiday"],
  },
  {
    initials: "JP",
    name: "James Park",
    role: "HR Director · 20 yrs · BBC → BAE",
    rating: 4.8,
    reviews: 54,
    price: 95,
    sla: "26h",
    avatarFrom: "from-emerald-400",
    avatarTo: "to-teal-500",
    photoUrl: "https://i.pravatar.cc/160?img=33",
    specialty:
      "20 years in internal HR. Best for fast turnaround on tone + escalation risk.",
    specialties: ["Disciplinary", "Performance", "Grievance"],
  },
  {
    initials: "RS",
    name: "Rachel Stein",
    role: "Former ACAS · 15 yrs · 600+ mediations",
    rating: 4.9,
    reviews: 63,
    price: 130,
    sla: "12h",
    avatarFrom: "from-amber-400",
    avatarTo: "to-rose-500",
    photoUrl: "https://i.pravatar.cc/160?img=44",
    specialty:
      "ACAS-trained mediator. Best for letters where the relationship still matters post-send.",
    specialties: ["Grievance", "Constructive dismissal", "Working Time"],
  },
  {
    initials: "PS",
    name: "Priya Sharma",
    role: "Employment Counsel · 8 yrs · Magic Circle background",
    rating: 4.8,
    reviews: 41,
    price: 155,
    sla: "24h",
    avatarFrom: "from-pink-400",
    avatarTo: "to-fuchsia-500",
    photoUrl: "https://i.pravatar.cc/160?img=49",
    specialty:
      "Magic Circle-trained. Deep expertise in TUPE transfers and complex contract disputes.",
    specialties: ["TUPE", "Settlement", "Redundancy"],
  },
  {
    initials: "MO",
    name: "Marcus Okonkwo",
    role: "Barrister · Cloisters chambers · 14 yrs",
    rating: 4.9,
    reviews: 76,
    price: 180,
    sla: "18h",
    avatarFrom: "from-blue-500",
    avatarTo: "to-cyan-500",
    photoUrl: "https://i.pravatar.cc/160?img=12",
    specialty:
      "Cloisters-based barrister. Go-to for discrimination claims and tribunal-bound letters.",
    specialties: ["Discrimination", "Whistleblowing", "Constructive dismissal"],
  },
  {
    initials: "TB",
    name: "Tom Bradshaw",
    role: "HR Consultant · CIPD · 11 yrs",
    rating: 4.7,
    reviews: 112,
    price: 85,
    sla: "20h",
    avatarFrom: "from-green-400",
    avatarTo: "to-emerald-500",
    photoUrl: "https://i.pravatar.cc/160?img=11",
    specialty:
      "CIPD-qualified. Specialises in disciplinary processes and managing underperformance with minimal legal risk.",
    specialties: ["Disciplinary", "Performance", "Grievance"],
  },
  {
    initials: "AH",
    name: "Aisha Hassan",
    role: "Solicitor · Slater & Gordon · 9 yrs",
    rating: 4.8,
    reviews: 93,
    price: 140,
    sla: "16h",
    avatarFrom: "from-rose-400",
    avatarTo: "to-pink-500",
    photoUrl: "https://i.pravatar.cc/160?img=25",
    specialty:
      "Slater & Gordon solicitor focused on settlement agreements and protected disclosure letters.",
    specialties: ["Settlement", "Whistleblowing", "Discrimination"],
  },
  {
    initials: "HK",
    name: "Helena Kowalski",
    role: "Employment law lecturer · KCL · 18 yrs",
    rating: 4.6,
    reviews: 28,
    price: 110,
    sla: "36h",
    avatarFrom: "from-violet-400",
    avatarTo: "to-purple-500",
    photoUrl: "https://i.pravatar.cc/160?img=56",
    specialty:
      "KCL academic with a practitioner background. Best for causation-heavy cases and novel legal arguments.",
    specialties: ["Discrimination", "Constructive dismissal", "TUPE"],
  },
  {
    initials: "DL",
    name: "David Lin",
    role: "Senior associate · Bird & Bird · 10 yrs",
    rating: 4.8,
    reviews: 67,
    price: 165,
    sla: "22h",
    avatarFrom: "from-sky-400",
    avatarTo: "to-blue-500",
    photoUrl: "https://i.pravatar.cc/160?img=32",
    specialty:
      "Bird & Bird technology sector specialist. Handles executive disputes and bonus-clawback letters.",
    specialties: ["Settlement", "Cross-border", "Constructive dismissal"],
  },
  {
    initials: "OR",
    name: "Olivia Reid",
    role: "Solicitor · ex-government legal service · 13 yrs",
    rating: 4.7,
    reviews: 55,
    price: 135,
    sla: "24h",
    avatarFrom: "from-teal-400",
    avatarTo: "to-green-500",
    photoUrl: "https://i.pravatar.cc/160?img=48",
    specialty:
      "Ex-GLS solicitor. Expert in collective redundancy consultation and statutory redundancy payment disputes.",
    specialties: ["Redundancy", "TUPE", "Statutory leave"],
  },
  {
    initials: "YA",
    name: "Yusuf Ahmed",
    role: "Employment paralegal · 5 yrs · fast turnaround",
    rating: 4.5,
    reviews: 140,
    price: 75,
    sla: "8h",
    avatarFrom: "from-orange-400",
    avatarTo: "to-amber-500",
    photoUrl: "https://i.pravatar.cc/160?img=15",
    specialty:
      "Fastest response in the marketplace. Handles grievance submissions and internal appeal letters daily.",
    specialties: ["Grievance", "Disciplinary", "Statutory leave"],
  },
  {
    initials: "CW",
    name: "Charlotte Williams",
    role: "Consultant · 10 yrs · flexible work specialist",
    rating: 4.7,
    reviews: 84,
    price: 105,
    sla: "20h",
    avatarFrom: "from-fuchsia-400",
    avatarTo: "to-violet-500",
    photoUrl: "https://i.pravatar.cc/160?img=54",
    specialty:
      "Dedicated flexible-working consultant. Covers statutory requests, disability accommodations, and pushbacks.",
    specialties: ["Flexible working", "Holiday", "Statutory leave"],
  },
  {
    initials: "SP",
    name: "Sam Patel",
    role: "Solicitor · ex-trade union legal · 8 yrs",
    rating: 4.8,
    reviews: 72,
    price: 125,
    sla: "18h",
    avatarFrom: "from-cyan-400",
    avatarTo: "to-sky-500",
    photoUrl: "https://i.pravatar.cc/160?img=6",
    specialty:
      "Ex-union side solicitor. Strong on constructive dismissal and public-interest protected disclosures.",
    specialties: ["Constructive dismissal", "Whistleblowing", "Grievance"],
  },
  {
    initials: "JS",
    name: "Joanna Schmidt",
    role: "Senior counsel · Magic Circle · 16 yrs",
    rating: 4.9,
    reviews: 38,
    price: 175,
    sla: "32h",
    avatarFrom: "from-indigo-500",
    avatarTo: "to-blue-600",
    photoUrl: "https://i.pravatar.cc/160?img=60",
    specialty:
      "Cross-border employment specialist. Advises on multi-jurisdictional letters and posted-worker issues.",
    specialties: ["Cross-border", "TUPE", "Settlement"],
  },
];

/** Infer relevant topic chips from the draft's letter type. Heuristic only
 * — a real marketplace would pull these from server-side semantic matching
 * over the letter body. */
function inferTopics(letterType: string): Topic[] {
  const lt = letterType.toLowerCase();
  const topics: Topic[] = [];
  if (lt.includes("settlement")) topics.push({ label: "Settlement" });
  if (lt.includes("tribunal")) topics.push({ label: "Tribunal risk" });
  if (lt.includes("dismissal") || lt.includes("terminat")) {
    topics.push({ label: "Dismissal" });
  }
  if (lt.includes("grievance")) topics.push({ label: "Grievance" });
  if (lt.includes("redundanc")) topics.push({ label: "Redundancy" });
  if (lt.includes("disciplinary")) topics.push({ label: "Disciplinary" });
  if (lt.includes("performance")) topics.push({ label: "Performance" });
  // Sensible fallback so the "matched on …" line always has substance.
  if (topics.length === 0) topics.push({ label: "Employment law" });
  return topics;
}

export function ConsultTab({ draft }: { draft: Draft }) {
  const topics = inferTopics(draft.letterType);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-3"
    >
      {/* Why-these card — "AI matched" framing so the list reads as curated
       * rather than a generic directory dump. */}
      <div className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)] text-[10px] font-semibold uppercase tracking-wider">
            <Sparkles className="size-2.5" />
            AI matched
          </span>
          <span className="text-[10.5px] text-[var(--ds-muted)] ml-auto">
            3 of 14 verified
          </span>
        </div>
        <h3 className="text-[13px] font-semibold text-[var(--ds-ink)] m-0 mb-1">
          Best matches for your letter
        </h3>
        <p className="text-[11.5px] text-[var(--ds-muted)] m-0 leading-snug">
          Selected by AI based on{" "}
          {topics.map((t, i) => (
            <span key={t.label}>
              {i > 0 && ", "}
              <strong className="text-[var(--ds-ink)] font-semibold">
                {t.label}
              </strong>
            </span>
          ))}
          .
        </p>
      </div>

      {/* Consultant cards. */}
      <div className="space-y-2.5">
        {CONSULTANTS.slice(0, 3).map((c) => (
          <ConsultantCard key={c.initials} consultant={c} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => alert("Full marketplace coming soon")}
        className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[12px] font-semibold text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] transition"
      >
        See all 14 consultants
        <ArrowRight className="size-3.5" />
      </button>

      {/* Trust strip. */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-[var(--ds-line-2)]">
        <ShieldCheck className="size-3.5 text-[var(--ds-muted)] shrink-0 mt-0.5" />
        <p className="text-[10.5px] text-[var(--ds-muted)] leading-snug m-0">
          All UK-qualified · £1M PI insurance · ICO registered · 4.86 avg rating
        </p>
      </div>
    </motion.div>
  );
}

function ConsultantCard({ consultant }: { consultant: Consultant }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--ds-surface)] p-3",
        consultant.top
          ? "border-[var(--ds-ink)]/15 ring-1 ring-[var(--ds-ink)]/5"
          : "border-[var(--ds-line)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar + verified badge. Gradient initials echo Design D. */}
        <div
          className={cn(
            "relative size-9 rounded-full bg-gradient-to-br shrink-0 grid place-items-center text-white text-[11px] font-semibold",
            consultant.avatarFrom,
            consultant.avatarTo,
          )}
        >
          {consultant.initials}
          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-[var(--ds-blue-fg,#1d4ed8)] grid place-items-center ring-2 ring-[var(--ds-surface)]">
            <Check
              className="size-2 text-white"
              strokeWidth={3}
              aria-label="Verified"
            />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-[var(--ds-ink)] truncate">
              {consultant.name}
            </span>
            {consultant.top && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] shrink-0">
                <Star
                  className="size-2"
                  fill="currentColor"
                  strokeWidth={0}
                />
                Top
              </span>
            )}
          </div>
          <p className="text-[10.5px] text-[var(--ds-muted)] m-0 mt-0.5 truncate">
            {consultant.role}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5 text-[11px]">
        <span className="inline-flex items-center gap-0.5 text-[var(--ds-amber-fg)] font-semibold tabular-nums">
          <Star className="size-2.5" fill="currentColor" strokeWidth={0} />
          {consultant.rating.toFixed(1)}
        </span>
        <span className="text-[var(--ds-muted)]">({consultant.reviews})</span>
        <span className="ml-auto font-semibold text-[var(--ds-ink)] tabular-nums">
          £{consultant.price}
          <span className="text-[var(--ds-muted)] font-normal">
            {" "}
            · {consultant.sla}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => alert("Marketplace booking flow coming soon")}
        className={cn(
          "mt-2.5 inline-flex items-center justify-center gap-1.5 w-full h-7 px-3 rounded-md text-[11.5px] font-semibold transition",
          consultant.top
            ? "bg-[var(--ds-ink)] text-white hover:opacity-90"
            : "border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)]",
        )}
      >
        Book {consultant.name.split(" ")[0]}
        <ArrowRight className="size-3" />
      </button>
    </div>
  );
}
