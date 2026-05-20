import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Banknote, Camera, CheckCircle2, Plus, X } from "lucide-react";
import {
  useConsultantStore,
  isProfileComplete,
  type Availability,
} from "@/lib/consultantProfile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AVAILABILITY_LABEL: Record<Availability, string> = {
  this_week: "Available this week",
  one_two_weeks: "Available in 1–2 weeks",
  three_four_weeks: "Available in 3–4 weeks",
  booked: "Booked — not taking new work",
};

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
  const [photoUrl, setPhotoUrl] = useState<string>(profile?.photoUrl ?? "");
  const [availability, setAvailability] = useState<Availability>(profile?.availability ?? "this_week");
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Photo upload — base64-into-localStorage for now. Vercel Blob is the
   * production swap (set BLOB_READ_WRITE_TOKEN, POST to /api/upload/image
   * which exists for letterheads already) but base64 is fine while the
   * marketplace is local-cache-first; the consultant API server-side
   * validates the URL.
   */
  const onPickPhoto = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setPhotoError("Pick an image file (PNG / JPG).");
      return;
    }
    if (f.size > 1.2 * 1024 * 1024) {
      setPhotoError("Photo must be under 1.2 MB. Try a smaller crop.");
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoUrl(reader.result);
    };
    reader.readAsDataURL(f);
  };

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
      photoUrl,
      availability,
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
          {/* Photo — first thing buyers see on the card. Optional but
           * we strongly nudge with the "Add a photo" CTA. */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="size-16 rounded-full object-cover border border-[var(--ds-line)]"
                />
              ) : (
                <div className="grid size-16 place-items-center rounded-full bg-[var(--ds-surface-2)] border border-[var(--ds-line)] text-[18px] font-semibold text-[var(--ds-muted)]">
                  {fullName
                    .trim()
                    .split(/\s+/)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("")
                    .slice(0, 2) || "??"}
                </div>
              )}
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label="Upload photo"
                className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-[var(--ds-ink)] text-white shadow ring-2 ring-[var(--ds-surface)] hover:-translate-y-px transition"
              >
                <Camera className="size-3.5" aria-hidden />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--ds-ink)]">Profile photo</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--ds-muted)]">
                Square crop, under 1.2 MB. Optional — initials are used if blank.
              </p>
              {photoError && (
                <p className="mt-1 text-[11.5px] text-[var(--ds-red-fg)]">{photoError}</p>
              )}
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoUrl("")}
                  className="mt-1 text-[11.5px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)] transition"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
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
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as "£" | "$" | "€")}
                >
                  <SelectTrigger className="h-[40px] w-[112px] rounded-[8px] border-[var(--ds-line)] bg-white text-[14px] font-semibold text-[var(--ds-ink)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="£">£ GBP</SelectItem>
                    <SelectItem value="$">$ USD</SelectItem>
                    <SelectItem value="€">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
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

        <Fieldset legend="Availability & payouts">
          <div>
            <label className="block text-[12px] font-semibold tracking-[0.01em] text-[var(--ds-ink)] mb-1.5">
              Current availability
            </label>
            <Select
              value={availability}
              onValueChange={(v) => setAvailability(v as Availability)}
            >
              <SelectTrigger className="h-[40px] w-full rounded-[8px] border-[var(--ds-line)] bg-white text-[14px] text-[var(--ds-ink)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {AVAILABILITY_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11.5px] text-[var(--ds-muted)]">
              Drives the badge on your marketplace card. HR teams filter on
              this when they need urgent work.
            </p>
          </div>
          <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-4">
            <div className="flex items-start gap-3">
              <Banknote className="size-5 text-[var(--ds-muted)] shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--ds-ink)]">
                  Payouts via Stripe Connect
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--ds-body)]">
                  {profile?.payout?.payoutsEnabled
                    ? "Your bank account is connected — payouts run weekly."
                    : "Connect a Stripe account to receive payouts. We charge a 12% platform fee on each completed booking; the rest hits your bank within 7 days."}
                </p>
                <button
                  type="button"
                  disabled
                  title="Stripe Connect integration arrives in the next release"
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white opacity-60 cursor-not-allowed"
                >
                  Connect Stripe
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
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
