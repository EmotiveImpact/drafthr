import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Banknote, Camera, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import {
  getStripeConnectStatus,
  startStripeConnect,
  type StripeConnectStatus,
} from "@/lib/consultantApi";
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
import { pullProfile, pushProfile } from "@/lib/marketplaceSync";
import { captureMarketplaceScope, isMarketplaceScopeCurrent } from "@/lib/marketplace-scope";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
 * paginating would feel patronising. Load the server profile before mounting
 * editable fields; keep unsaved changes in the form until the API accepts them.
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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void pullProfile().then((ok) => {
      if (!cancelled) { setFailed(!ok); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [attempt]);
  if (loading) return <AppLoadingScreen />;
  if (failed) return <section role="alert" className="mx-auto max-w-3xl px-4 py-8">
    <p>Your profile could not be loaded. Retry before making changes.</p>
    <Button variant="outline" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
  </section>;
  return <ConsultantProfileForm />;
}

function ConsultantProfileForm() {
  const nav = useNavigate();
  const profile = useConsultantStore((s) => s.profile);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
   * The image stays in this unsaved form until the profile API accepts it.
   * The API validates the data URL; no copy is written to localStorage.
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    const scope = captureMarketplaceScope();
    if (!scope) return;
    savingRef.current = true;
    setSaving(true);
    let saved: boolean;
    try {
      saved = await pushProfile({
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
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (!isMarketplaceScopeCurrent(scope)) return;
    if (!saved) {
      toast.error(
        "Your save wasn't confirmed. Your edits are still in this form — check your connection and retry.",
      );
      return; // stay on the form so they can retry — don't show "Saved" or redirect
    }
    setSubmitted(true);
    toast.success("Profile saved. Publication follows its review status.");
    nav("/c");
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
        disabled={saving}
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
        <fieldset disabled={saving} className="contents">
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
          <PayoutConnect enabledFromProfile={!!profile?.payout?.payoutsEnabled} />
        </Fieldset>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--ds-line)] pt-6">
          <p className="text-[12px] text-[var(--ds-muted)]">
            {ready
              ? "Looks good — save your card for review."
              : "Fill in name, title, bio (20+ chars), at least one tag, and a rate."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => nav("/c")}
              className="inline-flex h-10 items-center rounded-[8px] border border-[var(--ds-line)] bg-white px-4 text-[13px] font-semibold text-[var(--ds-ink)] transition hover:border-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!ready || submitted || saving}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-ink)] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {submitted ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden />
                  Saved
                </>
              ) : (
                <>{saving ? "Saving…" : "Save profile"}</>
              )}
            </button>
          </div>
        </div>
        </fieldset>
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

/**
 * Stripe Connect payout onboarding. Real (not a stub): fetches the consultant's
 * payout status and either starts/resumes Connect onboarding or confirms
 * payouts are live. When the operator hasn't configured Stripe yet
 * (status.configured === false) it shows an honest "not available yet" note —
 * no fake "coming soon" button.
 */
function PayoutConnect({ enabledFromProfile }: { enabledFromProfile: boolean }) {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams(window.location.search);
    const returning = params.get("stripe") === "return";
    if (returning) setVerifying(true);

    const clearParam = () => {
      params.delete("stripe");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    };

    const poll = async (attemptsLeft: number) => {
      const r = await getStripeConnectStatus();
      if (cancelled) return;
      if (r.ok) {
        setStatus(r.data);
        // Returning from Connect onboarding, the account.updated webhook that
        // flips payouts_enabled usually lands AFTER this redirect — a single
        // fetch would show the stale "Connect Stripe" state as if onboarding
        // failed. Re-poll briefly until it flips on.
        if (returning && !r.data.payoutsEnabled && attemptsLeft > 0) {
          timer = setTimeout(() => void poll(attemptsLeft - 1), 1500);
          return;
        }
      }
      if (returning) {
        setVerifying(false);
        clearParam(); // don't re-trigger polling on a manual refresh
      }
    };

    void poll(returning ? 6 : 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Reset the spinner if the user returns via the browser back/forward cache:
  // bfcache restores the JS heap with busy=true after the redirect to Stripe,
  // otherwise leaving the button stuck on "Starting…" with no way to retry.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        busyRef.current = false;
        setBusy(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const connect = async () => {
    const scope = captureMarketplaceScope();
    if (!scope || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let departing = false;
    try {
      const r = await startStripeConnect();
      if (!isMarketplaceScopeCurrent(scope)) return;
      if (r.ok) {
        window.location.assign(r.data.url);
        departing = true;
        return;
      }
      toast.error(r.error || "Could not start payout onboarding");
    } finally {
      if (!departing) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const configured = status?.configured ?? true; // assume configured until told otherwise
  const payoutsEnabled = status?.payoutsEnabled ?? enabledFromProfile;

  return (
    <div className="rounded-[10px] border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-4">
      <div className="flex items-start gap-3">
        <Banknote className="size-5 text-[var(--ds-muted)] shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--ds-ink)]">
            Payouts via Stripe Connect
          </p>
          {!configured ? (
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ds-body)]">
              Payouts aren't enabled on this workspace yet — nothing is charged.
              You'll be able to connect a payout account here once the
              marketplace operator turns on payments.
            </p>
          ) : payoutsEnabled ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] leading-relaxed text-[var(--ds-green-fg)]">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Connected — you can receive payouts. Manage details in Stripe.
            </p>
          ) : verifying ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] leading-relaxed text-[var(--ds-body)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Finishing Stripe setup — this can take a few seconds…
            </p>
          ) : (
            <>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ds-body)]">
                Connect a Stripe account to receive payment for completed reviews.
                You're paid the booking amount{" "}
                {/* platform fee, if any, is configured by the operator */}
                directly to your bank; nothing is charged to you.
              </p>
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--ds-ink)] px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                {busy ? "Starting…" : "Connect Stripe"}
                {!busy && <span aria-hidden>→</span>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
