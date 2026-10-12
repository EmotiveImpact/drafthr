import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, GraduationCap, UserRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useConsultantStore } from "@/lib/consultantProfile";
import { BrandMark, Wordmark } from "@/components/ds";
import { PaperThumb } from "@/components/reports/parts";

export function ModePicker() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const setRole = useProfileStore((s) => s.setRole);
  const enrolConsultant = useConsultantStore((s) => s.enrol);
  const consultantProfile = useConsultantStore((s) => s.profile);
  const draftList = Object.values(drafts)
    .filter((d) => !d.isTemplateSource)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = draftList.slice(0, 3);

  const choose = (role: "employer" | "employee") => {
    setRole(role);
    nav(role === "employer" ? "/hr" : "/me");
  };

  const chooseConsultant = () => {
    enrolConsultant();
    // First-time consultants land on the profile-setup form; returning
    // consultants go straight to their dashboard.
    nav(consultantProfile ? "/c" : "/c/profile");
  };

  return (
    <div className="min-h-screen bg-[var(--ds-canvas)] text-[var(--ds-ink)]">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 sm:px-8 sm:py-12">
        <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5">
          <BrandMark size={30} />
          <Wordmark size={20} />
        </Link>

        {/* 2A title */}
        <header className="mb-9 mt-10 max-w-[640px] sm:mt-14">
          <h1 className="ds-title m-0 text-[clamp(32px,4.4vw,44px)] leading-[1.08]">
            Who are you writing as?
          </h1>
          <p className="m-0 mt-3 text-[15px] leading-relaxed text-[var(--ds-muted)]">
            Pick one. We'll save your role and adapt DraftHR around it. You can change it any time
            in{" "}
            <button
              type="button"
              onClick={() => nav("/settings")}
              className="font-medium text-[var(--ds-ink)] underline underline-offset-2"
            >
              Settings
            </button>
            .
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <RoleCard
            tint="lavender"
            icon={<Briefcase className="size-7" strokeWidth={1.5} />}
            title="I'm in HR or management"
            description="Drafting letters to an employee: offers, terminations, warnings, redundancies and references. DraftHR helps you comply with ACAS, s.98 ERA, WARN, OWBPA, COBRA and state final-pay rules."
            meta="14 letter types, UK and US, counsel review on high-risk letters"
            onClick={() => choose("employer")}
          />
          <RoleCard
            tint="mint"
            icon={<UserRound className="size-7" strokeWidth={1.5} />}
            title="I'm an employee"
            description="Drafting letters to HR or your employer: grievances, resignations, flexible working requests, SARs, appeals, whistleblowing and accommodation requests. DraftHR helps you protect your rights and keep future claims open."
            meta="21 letter types, UK and US, tribunal deadline tracking"
            onClick={() => choose("employee")}
          />
          <RoleCard
            tint="peach"
            icon={<GraduationCap className="size-7" strokeWidth={1.5} />}
            title="I'm a consultant"
            description="Reviewing letters for HR teams: settlement, TUPE, and complex disciplinary or grievance cases. Get matched through the marketplace and receive bookings with the full evidence pack and cite-checked clauses."
            meta="Marketplace listing, inbound bookings, flat fee or hourly"
            onClick={chooseConsultant}
          />
        </div>

        {recent.length > 0 && (
          <section className="mt-10">
            <h2 className="m-0 mb-2 text-[15px] font-semibold text-[var(--ds-ink)]">
              Or jump back into a recent draft
            </h2>
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
              {recent.map((d) => (
                <li key={d.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => nav(`/editor/${d.id}`)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-3 text-left transition hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-s)]"
                  >
                    <PaperThumb seed={d.id} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-[var(--ds-ink)]">
                        {sentenceCase(d.letterType.replace(/_/g, " "))}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ds-muted)]">
                        {d.mode === "employer" ? "HR" : "Employee"}, {d.context.jurisdiction}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

const TINTS = {
  lavender: ["var(--ds-tint-lavender)", "var(--ds-tint-lavender-ink)"],
  mint: ["var(--ds-tint-mint)", "var(--ds-tint-mint-ink)"],
  peach: ["var(--ds-tint-peach)", "var(--ds-tint-peach-ink)"],
} as const;

/** 6B pastel card: tinted top with an icon, then the title and one line of explanation. */
function RoleCard({
  tint,
  icon,
  title,
  description,
  meta,
  onClick,
}: {
  tint: keyof typeof TINTS;
  icon: ReactNode;
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  const [bg, ink] = TINTS[tint];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5 text-left transition hover:-translate-y-px hover:border-[var(--ds-line-strong)] hover:shadow-[var(--ds-shadow-m)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)]"
    >
      <span
        className="grid h-[108px] place-items-center rounded-[calc(var(--ds-r-l)-5px)]"
        style={{ background: bg, color: ink }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col px-3 pb-3 pt-3.5">
        <span className="text-[16px] font-semibold text-[var(--ds-ink)]">{title}</span>
        <span className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
          {description}
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-4 text-[12.5px] text-[var(--ds-muted)]">
          <span>{meta}</span>
          <ArrowRight className="size-4 shrink-0 text-[var(--ds-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ds-ink)]" />
        </span>
      </span>
    </button>
  );
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
