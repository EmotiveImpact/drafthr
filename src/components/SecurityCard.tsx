/**
 * Settings, Security section: the Password card.
 *
 * Lets a signed-in user trigger a password-reset email to their own address.
 * /sign-in/forgot-password is signed-out only (signed-in users are redirected
 * away), so without this card a signed-in user has no way to change their
 * password.
 *
 * Why we don't take the current password and a new password inline:
 *   1. WorkOS's user-management API doesn't expose an "authenticated change
 *      password" call; the supported flow is token-based reset.
 *   2. The reset-link flow is the same path a forgotten-password recovery
 *      uses, so there's exactly one place to harden (rate limits, audit).
 *   3. The email step stops an attacker with a hijacked session from quietly
 *      rotating the password without the legitimate user noticing: the inbox
 *      is a second channel.
 *
 * Wires to POST /api/auth/password-reset-request (5/min/IP) using the
 * signed-in user's email. The endpoint always returns 200 (anti-enumeration),
 * so the UI shows a generic "Check your inbox" toast regardless of the
 * downstream outcome.
 */
import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/wizard/kit";
import { SettingsCard } from "@/routes/settings/parts";
import { useAuth } from "@/lib/auth";

export function SecurityCard() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  if (!user?.email) return null;

  const onSendReset = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/password-reset-request", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: user.email }),
      });
      // The endpoint is designed to almost never 4xx; a rate limit is the
      // realistic failure. Anything else, show the literal message so the
      // user knows it didn't go.
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Couldn't send the reset link. Try again in a minute.");
        return;
      }
      setLastSentAt(new Date());
      toast.success(`Password reset link sent to ${user.email}.`, {
        description: "Check your inbox. The link expires in a few minutes.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send reset link.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingsCard icon={<KeyRound />} title="Password">
      <p className="m-0 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
        We'll email a one-time reset link to <strong className="font-medium text-[var(--ds-ink)]">{user.email}</strong>.
        The link expires in a few minutes for safety. You stay signed in until you finish the reset on the linked
        page.
      </p>

      <div className="mt-4">
        <Button type="button" onClick={() => void onSendReset()} disabled={sending}>
          {sending ? <Spinner /> : <Mail className="size-4" aria-hidden />}
          {sending ? "Sending…" : "Send password reset link"}
        </Button>
      </div>

      {lastSentAt && (
        <p className="m-0 mt-3 text-[12.5px] text-[var(--ds-subtle)]">
          Last sent {lastSentAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. If the email
          hasn't arrived in a couple of minutes, check spam, or try again.
        </p>
      )}
    </SettingsCard>
  );
}
