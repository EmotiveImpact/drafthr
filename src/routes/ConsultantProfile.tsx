import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Plus, X } from "lucide-react";
import { useConsultantStore, isProfileComplete } from "@/lib/consultantProfile";

/**
 * /c/profile — consultant profile setup / edit form.
 *
 * Single-page form (no wizard) — the field count is small enough that
 * paginating would feel patronising. On submit, saves to the
 * localStorage-backed consultant store and routes back to /c with the
 * profile-completion banner now green.
 *
 * Future work — when the backend lands, this component should POST to
 * /api/consultant/profile and the store's saveProfile() call gets
 * replaced or supplemented by the network round-trip. The form copy
 * stays the same.
 */

// A curated suggestion list — the consultant can add their own free-text
// specialties on top of these.
const SUGGESTED_SPECIALTIES = [
  "Grievance",
  "Disciplinary",
  "Settlement",
  "Redundancy",
  "TUPE",
  "Discrimination",
  "Whistleblowing",
  "Flexible working",
  "Constructive dismissal",
  "Performance",
  "Holiday",
  "Statutory leave",
  "Working Time",
  "Cross-border",
];

export function ConsultantProfile() {
  const nav = useNavigate();
  const profile = useConsultantStore((s) => s.profile);
  const saveProfile = useConsultantStore((s) => s.saveProfile);

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [role, setRole] = useState(profile?.role ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [specialty, setSpecialty] = useState(profile?.specialty ?? "");
  const [specialties, setSpecialties] = useState<string[]>(profile?.specialties ?? []);
  const [price, setPrice] = useState<string>(String(profile?.price ?? 150));
  const [currency, setCurrency] = useState<"£" | "$" | "€">(profile?.currency ?? "£");
  const [sla, setSla] = useState(profile?.sla ?? "24-48h");
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const addCustomSpecialty = () => {
    const trimmed = customSpecialty.trim();
    if (!trimmed) return;
    if (!specialties.includes(trimmed)) {
      setSpecialties([...specialties, trimmed]);
    }
    setCustomSpecialty("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile({
      fullName: fullName.trim(),
      role: role.trim(),
      bio: bio.trim(),
      specialty: specialty.trim(),
      specialties,
      price: Math.max(0, parseInt(price, 10) || 0),
      currency,
      sla: sla.trim(),
    });
    setSubmitted(true);
    // Brief affordance, then bounce back to /c — feels less abrupt than
    // an immediate redirect and lets the user see their save landed.
    setTimeout(() => nav("/c"), 800);
  };

  const candidate = {
    fullName: fullName.trim(),
    role: role.trim(),
    bio: bio.trim(),
    specialty: specialty.trim(),
    specialties,
    price: parseInt(price, 10) || 0,
  };
  const ready =
    candidate.fullName.length > 0 &&
    candidate.role.length > 0 &&
    candidate.bio.length > 20 &&
    candidate.specialties.length > 0 &&
    candidate.price > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <button
        type="button"
        onClick={() => nav("/c")}
        className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ds-muted)] transition hover:text-[var(--ds-ink)]"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to dashboard
      </button>

      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
          Consultant profile
        </p>
        <h1 className="mt-2 text-[clamp(26px,3.2vw,36px)] font-semibold tracking-[-0.015em] text-[var(--ds-ink)]">
          {isProfileComplete(profile) ? "Edit your marketplace card." : "Set up your marketplace card."}
        </h1>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-relaxed text-[var(--ds-body)]">
          This is what HR teams see when they browse /consultants. Keep the bio
          concrete — what kind of letters you've reviewed, what calls you take,
          how fast you turn around.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        <Fieldset legend="Who you are">
          <Row>
            <Field
              label="Full name"
              required
              value={fullName}
              onChange={setFullName}
              placeholder="Elena Asante"
            />
            <Field
              label="Title (shown under your name)"
              required
              value={role}
              onChange={setRole}
              placeholder="Employment lawyer · 14 yrs · UK + ROI"
              hint="One line. Years of experience and jurisdictions are useful."
            />
          </Row>
          <div>
            <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5">
              Bio
              <span className="ml-2 font-normal text-[var(--ds-muted)]">
                {bio.length < 20 ? `${20 - bio.length} more characters` : `${bio.length} characters`}
              </span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              required
              className="w-full rounded-[8px] border border-[var(--ds-line)] bg-white px-3 py-2.5 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
              placeholder="Former senior associate at Charlemont & Wynne. Specialise in complex settlement and TUPE measures letters. Flat-fee or hourly."
            />
          </div>
        </Fieldset>

        <Fieldset legend="What you do best">
          <div>
            <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5">
              Specialty headline
            </label>
            <input
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Settlement & TUPE letter reviews, usually within 24h"
              className="w-full h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-2">
              Filter tags <span className="font-normal text-[var(--ds-muted)]">(pick a few — these power /consultants search)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_SPECIALTIES.map((s) => {
                const selected = specialties.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggleSpecialty(s)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
                      selected
                        ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-white"
                        : "border-[var(--ds-line)] bg-white text-[var(--ds-body)] hover:border-[var(--ds-subtle)]"
                    }`}
                  >
                    {s}
                    {selected && <X className="size-3" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSpecialty();
                  }
                }}
                placeholder="Add your own..."
                className="flex-1 h-9 rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[13px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
              />
              <button
                type="button"
                onClick={addCustomSpecialty}
                disabled={!customSpecialty.trim()}
                className="inline-flex items-center gap-1 h-9 rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[12.5px] font-semibold text-[var(--ds-ink)] transition hover:bg-[var(--ds-surface-2)] disabled:opacity-50"
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </button>
            </div>
            {specialties.filter((s) => !SUGGESTED_SPECIALTIES.includes(s)).length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)] mb-1.5">
                  Custom tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {specialties
                    .filter((s) => !SUGGESTED_SPECIALTIES.includes(s))
                    .map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-ink)] bg-[var(--ds-ink)] px-3 py-1.5 text-[12px] font-medium text-white"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => toggleSpecialty(s)}
                          className="opacity-80 hover:opacity-100"
                          aria-label={`Remove ${s}`}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Fieldset>

        <Fieldset legend="Rate & SLA">
          <Row>
            <div>
              <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5">
                Hourly rate
              </label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "£" | "$" | "€")}
                  className="h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white px-2.5 text-[14px] font-semibold text-[var(--ds-ink)] focus:border-[var(--ds-ink)] focus:outline-none"
                >
                  <option value="£">£ GBP</option>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  className="flex-1 h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[14px] text-[var(--ds-ink)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
                />
              </div>
            </div>
            <Field
              label="SLA / typical turnaround"
              value={sla}
              onChange={setSla}
              placeholder="24-48h"
              hint="What HR teams should expect from booking to delivery."
            />
          </Row>
        </Fieldset>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--ds-line)] pt-6">
          <p className="text-[12px] text-[var(--ds-muted)]">
            {ready
              ? "Looks good — save to publish your card."
              : "Fill in name, title, bio (20+ chars), at least one tag, and a rate."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => nav("/c")}
              className="inline-flex h-10 items-center rounded-[8px] border border-[var(--ds-line)] bg-white px-4 text-[13px] font-semibold text-[var(--ds-ink)] transition hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!ready || submitted}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {submitted ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden />
                  Saved
                </>
              ) : (
                <>Save and publish</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:p-6">
      <legend className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full h-[40px] rounded-[8px] border border-[var(--ds-line)] bg-white px-3 text-[14px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-ink)]/10"
      />
      {hint && <p className="mt-1 text-[11.5px] text-[var(--ds-muted)]">{hint}</p>}
    </div>
  );
}
