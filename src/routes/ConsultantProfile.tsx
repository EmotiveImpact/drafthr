import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Banknote, Camera, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import type { Consultant } from "@/components/consultants/types";
import {
  BTN_GHOST,
  BTN_OUTLINE,
  BTN_PRIMARY,
  ExpertAvatar,
  FIELD,
  initialsOf,
} from "@/components/consultants/ui";
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
import { pushProfile } from "@/lib/marketplaceSync";
import { toast } from "sonner";

const AVAILABILITY_LABEL: Record<Availability, string> = {
  this_week: "Available this week",
  one_two_weeks: "Available in 1–2 weeks",
  three_four_weeks: "Available in 3–4 weeks",
  booked: "Booked, not taking new work",
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

  const onSubmit = async (e: React.FormEvent) => {
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
    // Publish to the cross-tenant marketplace and only claim success once the
    // SERVER accepts it. Previously this was fire-and-forget + an immediate
    // "Saved", so a failed push left the consultant believing they were listed
    // when HR could never find them (board CPO-06).
    const published = await pushProfile();
    if (!published) {
      toast.error(
        "Saved on this device, but we couldn't publish your profile to the marketplace yet. Check your connection and press Save to retry.",
      );
      return; // stay on the form so they can retry — don't show "Saved" or redirect
    }
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

  // Live 6B preview of the marketplace card, built from the form as typed.
  const previewCard: Consultant = {
    profileId: profile?.id,
    initials: initialsOf(fullName, "?"),
    name: candidate.fullName || "Your name",
    role: candidate.role || "Your title",
    rating: profile?.rating ?? 0,
    reviews: profile?.reviews ?? 0,
    price: candidate.price,
    currency,
    sla: sla.trim() || "24-48h",
    avatarFrom: "from-amber-200",
    avatarTo: "to-amber-300",
    photoUrl,
    specialty: candidate.specialty,
    specialties,
    pending: profile?.status !== "published",
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-8 sm:pt-11 lg:px-11">
      <PageHeader
        crumbs={[{ label: "Consultant", href: "/c" }, { label: "Profile" }]}
        title={isProfileComplete(profile) ? "Edit your marketplace card" : "Set up your marketplace card"}
        lede="This is what HR teams see when they browse the marketplace. Keep the bio concrete: what kind of letters you've reviewed, what calls you take, how fast you turn around."
        actions={
          <button type="button" onClick={() => nav("/c")} className={`${BTN_GHOST} h-9`}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to dashboard
          </button>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={onSubmit} className="min-w-0 space-y-4">
          <Fieldset legend="Who you are">
            {/* Photo — first thing buyers see on the card. Optional but
             * we strongly nudge with the "Add a photo" CTA. */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <ExpertAvatar
                  photoUrl={photoUrl}
                  name={fullName}
                  initials={initialsOf(fullName, "??")}
                  seed={profile?.id || fullName}
                  size={64}
                  className="shadow-[var(--ds-shadow-s)]"
                />
                <button
                  type="button"
                  onClick={onPickPhoto}
                  aria-label="Upload photo"
                  className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-[var(--ds-accent)] text-[var(--ds-on-accent)] shadow ring-2 ring-[var(--ds-surface-2)] transition hover:bg-[var(--ds-accent-hover)]"
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
                <p className="m-0 text-[13px] font-medium text-[var(--ds-ink)]">Profile photo</p>
                <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                  Square crop, under 1.2 MB. Optional: your initials are used if blank.
                </p>
                {photoError && (
                  <p className="m-0 mt-1 text-[12px] text-[var(--ds-red-fg)]">{photoError}</p>
                )}
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl("")}
                    className="mt-1 text-[12px] font-medium text-[var(--ds-muted)] transition hover:text-[var(--ds-red-fg)]"
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
              <label className={LABEL}>
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
                className={`${FIELD} py-2.5 leading-relaxed`}
                placeholder="Former senior associate at Charlemont & Wynne. Specialise in complex settlement and TUPE measures letters. Flat-fee or hourly."
              />
            </div>
          </Fieldset>

          <Fieldset legend="What you do best">
            <div>
              <label className={LABEL}>Specialty headline</label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Settlement & TUPE letter reviews, usually within 24h"
                className={`${FIELD} h-10`}
              />
            </div>
            <div>
              <label className={`${LABEL} mb-2`}>
                Filter tags{" "}
                <span className="font-normal text-[var(--ds-muted)]">
                  (pick a few, they power marketplace search)
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_SPECIALTIES.map((s) => {
                  const selected = specialties.includes(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggleSpecialty(s)}
                      aria-pressed={selected}
                      className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium transition ${
                        selected
                          ? "bg-[var(--ds-accent)] text-[var(--ds-on-accent)]"
                          : "bg-[var(--ds-surface)] text-[var(--ds-body)] shadow-[0_0_0_1px_var(--ds-line)] hover:text-[var(--ds-ink)] hover:shadow-[0_0_0_1px_var(--ds-line-strong)]"
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
                  className={`${FIELD} h-9 min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={addCustomSpecialty}
                  disabled={!customSpecialty.trim()}
                  className={`${BTN_OUTLINE} h-9`}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add
                </button>
              </div>
              {specialties.filter((s) => !SUGGESTED_SPECIALTIES.includes(s)).length > 0 && (
                <div className="mt-3">
                  <p className="m-0 mb-1.5 text-[12px] text-[var(--ds-muted)]">Custom tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {specialties
                      .filter((s) => !SUGGESTED_SPECIALTIES.includes(s))
                      .map((s) => (
                        <span
                          key={s}
                          className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--ds-accent)] px-3 text-[12.5px] font-medium text-[var(--ds-on-accent)]"
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

          <Fieldset legend="Rate and turnaround">
            <Row>
              <div>
                <label className={LABEL}>Hourly rate</label>
                <div className="flex gap-2">
                  <Select
                    value={currency}
                    onValueChange={(v) => setCurrency(v as "£" | "$" | "€")}
                  >
                    <SelectTrigger className="!h-10 w-[112px] rounded-[var(--ds-r-s)] border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13.5px] font-medium text-[var(--ds-ink)] shadow-none">
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
                    aria-label="Hourly rate"
                    className={`${FIELD} ds-mono h-10 min-w-0 flex-1`}
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

          <Fieldset legend="Availability">
            <div>
              <label className={LABEL}>Current availability</label>
              <Select
                value={availability}
                onValueChange={(v) => setAvailability(v as Availability)}
              >
                <SelectTrigger className="!h-10 w-full rounded-[var(--ds-r-s)] border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13.5px] text-[var(--ds-ink)] shadow-none">
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
              <p className="m-0 mt-1.5 text-[12px] text-[var(--ds-muted)]">
                Drives the badge on your marketplace card. HR teams filter on
                this when they need urgent work.
              </p>
            </div>
          </Fieldset>

          {/* Payouts set-up sits at the foot of the form, in its own card. */}
          <PayoutConnect enabledFromProfile={!!profile?.payout?.payoutsEnabled} />

          <div className="flex flex-col gap-3 border-t border-[var(--ds-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">
              {ready
                ? "Looks good. Save to publish your card."
                : "Fill in name, title, bio (20+ chars), at least one tag, and a rate."}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => nav("/c")} className={`${BTN_OUTLINE} h-9 px-3.5`}>
                Cancel
              </button>
              <button type="submit" disabled={!ready || submitted} className={`${BTN_PRIMARY} h-9 px-3.5`}>
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

        {/* Live preview of the 6B card HR teams will see */}
        <aside aria-label="Card preview" className="lg:sticky lg:top-8">
          <p className="m-0 mb-2.5 text-[12.5px] text-[var(--ds-muted)]">Preview of your card</p>
          <div className="mx-auto max-w-[340px] lg:max-w-none">
            <ConsultantCard consultant={previewCard} onBook={() => {}} preview />
          </div>
        </aside>
      </div>
    </div>
  );
}

const LABEL = "mb-1.5 block text-[12.5px] font-medium text-[var(--ds-ink)]";

/** A soft filled card (Harvey style) holding one group of fields. */
function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 rounded-[var(--ds-r-l)] border-0 bg-[var(--ds-surface-2)] p-5 sm:p-6">
      <legend className="float-left mb-4 w-full p-0 text-[14.5px] font-medium text-[var(--ds-ink)]">
        {legend}
      </legend>
      <div className="clear-both space-y-4">{children}</div>
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
      <label className={LABEL}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`${FIELD} h-10`}
      />
      {hint && <p className="m-0 mt-1.5 text-[12px] text-[var(--ds-muted)]">{hint}</p>}
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
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const connect = async () => {
    setBusy(true);
    const r = await startStripeConnect();
    if (r.ok) {
      window.location.assign(r.data.url);
      return;
    }
    toast.error(r.error || "Could not start payout onboarding");
    setBusy(false);
  };

  const configured = status?.configured ?? true; // assume configured until told otherwise
  const payoutsEnabled = status?.payoutsEnabled ?? enabledFromProfile;

  return (
    <section className="rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[var(--ds-r-m)]"
          style={{ background: "var(--ds-tint-mint)", color: "var(--ds-tint-mint-ink)" }}
          aria-hidden
        >
          <Banknote className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-[14.5px] font-medium text-[var(--ds-ink)]">
            Payouts via Stripe Connect
          </h2>
          {!configured ? (
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
              Payouts aren't enabled on this workspace yet, and nothing is charged.
              You'll be able to connect a payout account here once the
              marketplace operator turns on payments.
            </p>
          ) : payoutsEnabled ? (
            <p className="m-0 mt-1 inline-flex items-center gap-1.5 text-[12.5px] leading-relaxed text-[var(--ds-green-fg)]">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Connected. You can receive payouts. Manage details in Stripe.
            </p>
          ) : verifying ? (
            <p className="m-0 mt-1 inline-flex items-center gap-1.5 text-[12.5px] leading-relaxed text-[var(--ds-body)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Finishing Stripe setup. This can take a few seconds…
            </p>
          ) : (
            <>
              <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                Connect a Stripe account to receive payment for completed reviews.
                You're paid the booking amount{" "}
                {/* platform fee, if any, is configured by the operator */}
                directly to your bank; nothing is charged to you.
              </p>
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className={`${BTN_PRIMARY} mt-3`}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                {busy ? "Starting…" : "Connect Stripe"}
                {!busy && <ArrowRight className="size-3.5" aria-hidden />}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
