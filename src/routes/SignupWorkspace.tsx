import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Building2, Mail } from "lucide-react";
import { BrandMark, PageHeader, Wordmark } from "@/components/ds";
import { useAuth, UserChip, type AuthUser } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * SignupWorkspace — landing page for users who signed in but have no active
 * tenant (or who arrived via /join/:code). Offers two paths: create a new
 * workspace or accept an invite. Both redirect into `/hr` after success.
 *
 * The page is intentionally a single screen — every signed-in user needs a
 * tenant before they can do anything else, so we don't want a long flow here.
 */
export function SignupWorkspace() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, isLoaded, refresh } = useAuth();

  const [mode, setMode] = useState<"create" | "join">(() =>
    params.get("invite") ? "join" : "create",
  );
  const [workspaceName, setWorkspaceName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [inviteCode, setInviteCode] = useState(params.get("invite") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      nav(`/sign-in?redirect=${encodeURIComponent("/signup/workspace")}`, { replace: true });
    }
  }, [isLoaded, user, nav]);

  const onCreate = async () => {
    if (!workspaceName.trim()) {
      setError("Give your workspace a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: workspaceName.trim(),
          industry: industry || undefined,
          teamSize: teamSize || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Re-fetch session so `activeTenant` is populated BEFORE we navigate.
      // Without this, <Protected> sees stale auth state, sees no active tenant,
      // and bounces us right back here. (#workspace-create-loop)
      await refresh();
      // Land on the mode chooser, not /hr — we don't yet know whether
      // this person is HR/Management or Employee. RootRedirect at /
      // would also handle this, but routing explicitly avoids a beat
      // where /hr could render and then re-route.
      nav("/pick-role", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    const code = parseInviteCode(inviteCode);
    if (!code) {
      setError("Paste your invite link or invite code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/accept-invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Clear sessionStorage stash if we came via /join/:code.
      try {
        sessionStorage.removeItem("drafthr_pending_invite");
      } catch {
        /* sessionStorage unavailable — ignore */
      }
      // Re-fetch session so `activeTenant` is populated BEFORE we navigate.
      // Same fix as onCreate above — see #workspace-create-loop.
      await refresh();
      // Land on the mode chooser, not /hr — we don't yet know whether
      // this person is HR/Management or Employee. RootRedirect at /
      // would also handle this, but routing explicitly avoids a beat
      // where /hr could render and then re-route.
      nav("/pick-role", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setBusy(false);
    }
  };

  if (!isLoaded || !user) {
    return (
      <WorkspaceShell>
        <Box className="mx-auto w-full max-w-3xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:pt-20">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-32 w-full" />
        </Box>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell user={user}>
      <Box className="mx-auto w-full max-w-3xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:pt-20">
        <PageHeader
          title={`Set up your workspace${user.firstName ? `, ${user.firstName}` : ""}`}
          lede="A workspace is your team's shared HR letter library. Drafts, evidence, and audit log are scoped to one workspace. You can belong to several — switch between them in the sidebar."
        />

        <Flex direction="column" gap="4">
          <Flex gap="2">
            <Button
              variant={mode === "create" ? "solid" : "soft"}
              color="gray"
              onClick={() => setMode("create")}
            >
              <Building2 className="size-4" />
              Create new workspace
            </Button>
            <Button
              variant={mode === "join" ? "solid" : "soft"}
              color="gray"
              onClick={() => setMode("join")}
            >
              <Mail className="size-4" />
              Join via invite link
            </Button>
          </Flex>

          {mode === "create" ? (
            <Card size="3">
              <Box mb="3">
                <Heading size="3" mb="1">Create new workspace</Heading>
                <Text size="2" color="gray" as="p">
                  You'll be the owner. Invite teammates afterwards in Settings.
                </Text>
              </Box>
              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                <Field label="Workspace name" required>
                  <TextField.Root
                    size="3"
                    placeholder="Acme HR Team"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Industry">
                  <TextField.Root
                    size="3"
                    placeholder="e.g. Technology, Healthcare"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Team size">
                  <Select.Root value={teamSize} onValueChange={setTeamSize} disabled={busy}>
                    <Select.Trigger placeholder="Select…" />
                    <Select.Content>
                      <Select.Item value="solo">Just me</Select.Item>
                      <Select.Item value="2-10">2–10</Select.Item>
                      <Select.Item value="11-50">11–50</Select.Item>
                      <Select.Item value="51-200">51–200</Select.Item>
                      <Select.Item value="200+">200+</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Field>
              </Grid>
              <Separator size="4" my="4" />
              <Flex justify="end" gap="2" align="center">
                {error && <Badge color="red">{error}</Badge>}
                <Button size="3" onClick={onCreate} disabled={busy}>
                  {busy ? "Creating…" : "Create workspace"}
                </Button>
              </Flex>
            </Card>
          ) : (
            <Card size="3">
              <Box mb="3">
                <Heading size="3" mb="1">Join via invite</Heading>
                <Text size="2" color="gray" as="p">
                  Paste the invite link your admin shared, or just the invite code.
                </Text>
              </Box>
              <Field label="Invite link or code">
                <TextField.Root
                  size="3"
                  placeholder="https://app.drafthr.io/join/abc… or abc…"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </Field>
              <Separator size="4" my="4" />
              <Flex justify="end" gap="2" align="center">
                {error && <Badge color="red">{error}</Badge>}
                <Button size="3" onClick={onJoin} disabled={busy}>
                  {busy ? "Joining…" : "Join workspace"}
                </Button>
              </Flex>
            </Card>
          )}
        </Flex>
      </Box>
    </WorkspaceShell>
  );
}

function WorkspaceShell({
  user,
  children,
}: {
  user?: AuthUser;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]">
      <WorkspaceTopbar user={user} />
      <div className="flex-1">{children}</div>
      <WorkspaceFooter />
    </main>
  );
}

function WorkspaceTopbar({ user }: { user?: AuthUser }) {
  const displayName =
    user && ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);

  return (
    <header className="h-16 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)]/90 px-4 backdrop-blur sm:px-6 lg:px-10">
      <div className="mx-auto flex h-full max-w-5xl items-center gap-4">
        <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5">
          <BrandMark size={40} />
          <Wordmark size={26} />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
              Workspace setup
            </p>
            {displayName && (
              <p className="truncate text-[12px] text-[var(--ds-body)]">{displayName}</p>
            )}
          </div>
          {user && <UserChip />}
        </div>
      </div>
    </header>
  );
}

function WorkspaceFooter() {
  return (
    <footer className="shrink-0 px-4 pb-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-1.5 border-t border-[var(--ds-line)] pt-4 text-center text-[11.5px] text-[var(--ds-muted)] sm:flex-row sm:flex-wrap sm:gap-x-3">
        <Link to="/privacy" className="hover:text-[var(--ds-ink)] transition">
          Privacy
        </Link>
        <span className="hidden opacity-60 sm:inline">·</span>
        <span>&copy; {new Date().getFullYear()} DraftHR. All rights reserved.</span>
      </div>
    </footer>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          {label} {required && <Text color="red">*</Text>}
        </Text>
        {children}
      </Flex>
    </label>
  );
}

/** Accept either a raw code or a full /join/{code} URL. */
function parseInviteCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/join\/([A-Za-z0-9_-]+)/);
  if (match && match[1]) return match[1];
  // Basic shape check — base64url with no padding, at least 16 chars.
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return trimmed;
  return null;
}
