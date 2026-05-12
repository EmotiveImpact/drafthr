import { Link } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/ds";
import { ArrowRight, ArrowDown } from "lucide-react";

/**
 * Public marketing landing page. Full-bleed dark hero with a courtroom
 * image, large serif headline, three value bullets, paired CTAs, and a
 * stats strip below the fold. No sidebar / no app chrome — Layout.tsx
 * short-circuits for /landing.
 */
export function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0b0d10] text-white antialiased">
      {/* Hero — full viewport-ish, background image with darkening overlay
       *  so the headline stays legible regardless of image content. */}
      <section
        className="relative flex-1 flex flex-col min-h-[760px]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(11,13,16,0.78) 0%, rgba(11,13,16,0.35) 45%, rgba(11,13,16,0.85) 100%), url('/landing-hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Top nav */}
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-12 lg:px-20 pt-7">
          <Link to="/landing" className="flex items-center gap-2.5 group">
            <BrandMark size={32} className="opacity-95 group-hover:opacity-100 transition" />
            <Wordmark size={20} className="text-white" tone="inherit" />
          </Link>

          <nav className="hidden md:flex items-center gap-9 text-[13px] font-medium text-white/80">
            <a href="#how" className="hover:text-white transition">How it works</a>
            <a href="#letters" className="hover:text-white transition">Letter types</a>
            <a href="#trust" className="hover:text-white transition">Trust &amp; compliance</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
          </nav>

          <Link
            to="/pick-role"
            className="inline-flex items-center gap-1.5 bg-white text-[#0b0d10] text-[13px] font-medium pl-5 pr-4 py-2.5 rounded-full hover:bg-white/90 transition shadow-sm"
          >
            Start drafting
            <ArrowRight className="size-3.5" />
          </Link>
        </header>

        {/* Hero copy */}
        <div className="relative z-10 flex-1 flex items-center px-6 sm:px-12 lg:px-20 max-w-[1400px] mx-auto w-full">
          <div className="max-w-[640px] py-16">
            {/* Eyebrow */}
            <div className="flex items-center gap-3 text-[12px] tracking-wide text-white/70 uppercase mb-7">
              <span className="block h-px w-8 bg-white/40" />
              Words that carry weight
            </div>

            {/* Headline — serif, large, tight leading */}
            <h1
              className="text-[44px] sm:text-[56px] lg:text-[64px] leading-[1.06] font-normal tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tribunal-grade HR letters,<br />
              drafted in minutes.
            </h1>

            {/* Bullets */}
            <ul className="mt-10 space-y-3.5 text-[15px] text-white/85">
              <Bullet>Expert legal register, every clause defended.</Bullet>
              <Bullet>UK &amp; US jurisdictions, current to 2026.</Bullet>
              <Bullet>Evidence-bound, counsel-reviewed, export-ready.</Bullet>
            </ul>

            {/* CTAs */}
            <div className="mt-10 flex items-center gap-3">
              <Link
                to="/pick-role"
                className="inline-flex items-center gap-2 bg-white text-[#0b0d10] text-[14px] font-medium pl-6 pr-5 py-3 rounded-full hover:bg-white/90 transition shadow"
              >
                Draft your first letter
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 border border-white/25 text-[14px] font-medium px-6 py-3 rounded-full hover:bg-white/10 transition"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>

        {/* Hero footer hint row */}
        <div className="relative z-10 px-6 sm:px-12 lg:px-20 pb-7 flex items-center justify-between text-[11px] text-white/55 uppercase tracking-wide">
          <div className="flex items-center gap-2">
            <span className="size-1 rounded-full bg-white/55" />
            Trusted by HR teams across the UK &amp; US
          </div>
          <a href="#stats" className="hidden sm:flex items-center gap-2 hover:text-white transition">
            Scroll to explore
            <ArrowDown className="size-3.5" />
          </a>
        </div>
      </section>

      {/* Stats strip — dark, four columns, divider lines between */}
      <section
        id="stats"
        className="bg-[#0b0d10] border-t border-white/10 px-6 sm:px-12 lg:px-20 py-12"
      >
        <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-y-10 md:divide-x md:divide-white/10">
          {/* Trust badge */}
          <div className="md:pr-10">
            <div className="text-[14px] text-white/70 mb-3">Trusted by HR teams</div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="size-9 rounded-full border-2 border-[#0b0d10] bg-gradient-to-br from-slate-500 to-slate-700 grid place-items-center text-[10px] font-semibold text-white/80"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[20px] font-semibold leading-none">1,000+</div>
                <div className="text-[11px] text-white/55 mt-1">HR pros onboard</div>
              </div>
            </div>
          </div>

          <Stat number="15K+" label="Letters drafted" />
          <Stat number="40+" label="Letter templates" />
          <Stat number="98%" label="Counsel-approval rate" />
        </div>
      </section>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-[9px] block size-1.5 rounded-full bg-white/70 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="md:px-10">
      <div
        className="text-[44px] sm:text-[52px] font-normal leading-none"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {number}
      </div>
      <div className="mt-3 text-[12px] text-white/55 uppercase tracking-wide">{label}</div>
    </div>
  );
}
