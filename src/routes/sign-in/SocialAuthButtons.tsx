/**
 * Shared "Continue with Google / Microsoft / LinkedIn" button group for the
 * /sign-in/* page family. Drop-in component: stacks the three buttons,
 * handles the OAuth shim (fetch /api/auth/url?provider=... → assign URL),
 * tracks per-provider busy state, and surfaces errors to a parent-owned
 * callback so each page can render the error in its own ErrorAlert.
 *
 * SignIn.tsx still ships an inline copy of this logic — predates the shared
 * component, and refactoring it would spread the wave's blast radius for no
 * functional gain. The look matches because the same Tailwind classes + DS
 * tokens are used in both.
 *
 * Glyphs are inline SVGs (zero bundle hit) — same approach as the inline
 * versions in SignIn.tsx; kept here so both files can render identical marks
 * without cross-file imports.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Provider = "GoogleOAuth" | "MicrosoftOAuth" | "LinkedInOAuth";
type BusyKey = "google" | "microsoft" | "linkedin" | null;

type SocialAuthButtonsProps = {
  /** Where to land after the OAuth round-trip — defaults to "/". */
  redirectTo?: string;
  /** Called with a user-friendly message if the URL fetch errors. */
  onError?: (message: string) => void;
  /**
   * When provided, disables every button while truthy. Use this when the
   * parent form is mid-submit so a user can't kick off a social flow on
   * top of a password POST.
   */
  externallyBusy?: boolean;
};

export function SocialAuthButtons({
  redirectTo,
  onError,
  externallyBusy,
}: SocialAuthButtonsProps) {
  const [busy, setBusy] = useState<BusyKey>(null);
  const anyBusy = busy !== null || !!externallyBusy;

  const start = async (provider: Provider) => {
    if (anyBusy) return;
    const key: BusyKey =
      provider === "GoogleOAuth"
        ? "google"
        : provider === "MicrosoftOAuth"
        ? "microsoft"
        : "linkedin";
    setBusy(key);
    try {
      const res = await fetch(`/api/auth/url?provider=${provider}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not start sign-in (HTTP ${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      // Same sessionStorage channel SignIn.tsx + JoinInvite use — keeps the
      // redirect surface uniform across every sign-in / sign-up entry point.
      if (redirectTo && redirectTo !== "/") {
        try {
          sessionStorage.setItem("drafthr_post_signin_redirect", redirectTo);
        } catch {
          /* private mode etc — fall through, user just lands at / */
        }
      }
      window.location.assign(url);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not start sign-in.");
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <SocialButton
        provider="google"
        onClick={() => void start("GoogleOAuth")}
        busy={busy === "google"}
        disabled={anyBusy}
      />
      <SocialButton
        provider="microsoft"
        onClick={() => void start("MicrosoftOAuth")}
        busy={busy === "microsoft"}
        disabled={anyBusy}
      />
      <SocialButton
        provider="linkedin"
        onClick={() => void start("LinkedInOAuth")}
        busy={busy === "linkedin"}
        disabled={anyBusy}
      />
    </div>
  );
}

/* ─── single button + glyphs ───────────────────────────────────────────── */

function SocialButton({
  provider,
  onClick,
  busy,
  disabled,
}: {
  provider: "google" | "microsoft" | "linkedin";
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  // Visible short label keeps brand recognisable in the 3-column layout;
  // aria-label keeps the full "Continue with X" intent for screen readers.
  const ariaLabel =
    provider === "google"
      ? "Continue with Google"
      : provider === "microsoft"
      ? "Continue with Microsoft"
      : "Continue with LinkedIn";
  const shortLabel =
    provider === "google" ? "Google" : provider === "microsoft" ? "Microsoft" : "LinkedIn";
  const Glyph =
    provider === "google" ? GoogleGlyph : provider === "microsoft" ? MicrosoftGlyph : LinkedInGlyph;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full gap-1.5 px-2 text-[14px]")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Glyph />}
      <span className="truncate">{shortLabel}</span>
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.455 3.44 1.346l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961l3.007 2.332C4.672 5.166 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden focusable="false">
      <rect x="0" y="0" width="7.5" height="7.5" fill="#F25022" />
      <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}

function LinkedInGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect width="24" height="24" rx="3" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.06 9.5h2.84v9H7.06v-9Zm1.42-4.04a1.65 1.65 0 1 1 0 3.3 1.65 1.65 0 0 1 0-3.3ZM11.6 9.5h2.72v1.23h.04c.38-.72 1.31-1.48 2.7-1.48 2.88 0 3.41 1.9 3.41 4.36V18.5h-2.84v-4.4c0-1.05-.02-2.4-1.46-2.4-1.47 0-1.7 1.15-1.7 2.33V18.5H11.6v-9Z"
      />
    </svg>
  );
}

/* ─── matching "or" divider — keeps the spacing identical between pages ─ */

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="relative my-5 text-center text-[12px] text-[var(--ds-muted)]">
      <span className="bg-[var(--ds-surface)] px-3 relative z-10">{label}</span>
      <span
        aria-hidden
        className="absolute left-0 right-0 top-1/2 h-px bg-[var(--ds-line)] -translate-y-1/2"
      />
    </div>
  );
}
