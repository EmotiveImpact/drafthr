/**
 * Settings → Security card.
 *
 * Lets a signed-in user trigger a password-reset email to their own address.
 * /sign-in/forgot-password is signed-OUT-only (signed-in users are redirected
 * away), so without this card a signed-in user has no way to change their
 * password.
 *
 * Why we don't take the current password + new password inline:
 *   1. WorkOS's user-management API doesn't expose an "authenticated change
 *      password" call — the supported flow is token-based reset.
 *   2. The reset-link flow is the same path a forgotten-password recovery
 *      uses, so there's exactly one place to harden (rate-limits, audit).
 *   3. Email-confirmation step prevents an attacker with a hijacked session
 *      from quietly rotating the password without the legitimate user
 *      noticing — the inbox is a second channel.
 *
 * Wires to POST /api/auth/password-reset-request (5/min/IP) using the
 * signed-in user's email. The endpoint always returns 200 (anti-enumeration),
 * so the UI surfaces a generic "Check your inbox" toast regardless of
 * downstream outcome.
 */
import { useState } from "react";
import { Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
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
      // The endpoint is designed to almost never 4xx — rate-limit is the
      // realistic failure case. Anything else, surface the literal message
      // so the user knows it didn't go.
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? `Could not send reset link (HTTP ${res.status})`);
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
    <Card size="3">
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <KeyRound className="size-4 text-[var(--ds-muted)]" aria-hidden />
          <Heading as="h3" size="3" weight="medium">
            Security
          </Heading>
        </Flex>

        <Text size="2" color="gray" as="p" style={{ maxWidth: 560 }}>
          We'll email a one-time reset link to{" "}
          <Text weight="medium" highContrast>
            {user.email}
          </Text>
          . The link expires in a few minutes for safety. Sign-in stays active
          until you finish the reset on the linked page.
        </Text>

        <Box>
          <Button
            type="button"
            onClick={() => void onSendReset()}
            disabled={sending}
            highContrast
          >
            <Mail className="size-4" aria-hidden />
            {sending ? "Sending…" : "Send password reset link"}
          </Button>
        </Box>

        {lastSentAt && (
          <Text size="1" color="gray">
            Last sent {lastSentAt.toLocaleTimeString()}. If the email hasn't
            arrived in a couple of minutes, check spam, or try again.
          </Text>
        )}
      </Flex>
    </Card>
  );
}
