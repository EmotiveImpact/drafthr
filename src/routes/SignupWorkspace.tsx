import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Mail } from "lucide-react";
import { Wordmark } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Spinner } from "@/components/wizard/kit";
import { tintStyle, type Tint } from "@/components/templates/tints";
import { KitSelect } from "@/routes/settings/parts";
import { useAuth, UserChip, type AuthUser } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TEAM_SIZES = [
  { value: "solo", label: "Just me" },
  { value: "2-10", label: "2 to 10" },
  { value: "11-50", label: "11 to 50" },
  { value: "51-200", label: "51 to 200" },
  { value: "200+", label: "200+" },
];

/**
 * SignupWorkspace: landing page for users who signed in but have no active
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
        throw new Error(data.error ?? "Something went wrong. Try again in a minute.");
      }
      // Re-fetch session so `activeTenant` is populated BEFORE we navigate.
      // Without this, <Protected> sees stale auth state, sees no active tenant,
      // and bounces us right back here. (#workspace-create-loop)
      await refresh({ force: true });
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
        throw new Error(data.error ?? "Something went wrong. Try again in a minute.");
      }
      // Clear sessionStorage stash if we came via /join/:code.
      try {
        sessionStorage.removeItem("drafthr_pending_invite");
      } catch {
        /* sessionStorage unavailable — ignore */
      }
      // Re-fetch session so `activeTenant` is populated BEFORE we navigate.
      // Same fix as onCreate above — see #workspace-create-loop.
      await refresh({ force: true });
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
        <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:pt-20" role="status" aria-label="Loading">
          <Skeleton className="mx-auto mb-4 h-8 w-48 rounded-[10px] bg-[var(--ds-surface-2)]" />
          <Skeleton className="h-32 w-full rounded-[16px] bg-[var(--ds-surface-2)]" />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell user={user}>
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:pt-14">
        {/* Logo centred above the title, the same lockup as the sign-in pages. */}
        <div className="mb-7 flex flex-col items-center text-center">
          <Link to="/" aria-label="DraftHR home" className="inline-flex items-center gap-2.5">
            <Wordmark size={36} />
          </Link>
          <h1 className="ds-title m-0 mt-8 text-[clamp(32px,4.4vw,42px)] leading-[1.08] tracking-[-0.02em]">
            {`Set up your workspace${user.firstName ? `, ${user.firstName}` : ""}`}
          </h1>
          <p className="m-0 mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--ds-muted)]">
            A workspace is your team's shared HR letter library. Drafts, evidence and the audit log are scoped to one
            workspace. You can belong to several and switch between them in the sidebar.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Two 6B pastel cards side by side: pick create or join */}
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How do you want to start?">
            <ChoiceCard
              selected={mode === "create"}
              onSelect={() => {
                setMode("create");
                setError(null);
              }}
              tint="sky"
              icon={<Building2 className="size-6" strokeWidth={1.5} />}
              title="Create a workspace"
              line="Start fresh as the owner and invite your team afterwards."
            />
            <ChoiceCard
              selected={mode === "join"}
              onSelect={() => {
                setMode("join");
                setError(null);
              }}
              tint="mint"
              icon={<Mail className="size-6" strokeWidth={1.5} />}
              title="Join with an invite"
              line="Paste the link or code your admin shared with you."
            />
          </div>

          {mode === "create" ? (
            <form
              className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-5 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault();
                void onCreate();
              }}
            >
              <h2 className="m-0 text-[15.5px] font-medium text-[var(--ds-ink)]">Create new workspace</h2>
              <p className="m-0 mt-1 text-[13.5px] text-[var(--ds-muted)]">
                You'll be the owner. Invite teammates afterwards in Settings.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="ws-name" required error={error ?? undefined}>
                  <Input
                    id="ws-name"
                    placeholder="Acme HR Team"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    disabled={busy}
                    aria-required
                    aria-invalid={error ? true : undefined}
                  />
                </Field>
                <Field label="Industry" htmlFor="ws-industry">
                  <Input
                    id="ws-industry"
                    placeholder="e.g. Technology, Healthcare"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field label="Team size" htmlFor="ws-size">
                  <KitSelect
                    id="ws-size"
                    value={teamSize}
                    onValueChange={setTeamSize}
                    options={TEAM_SIZES}
                    disabled={busy}
                    placeholder="Choose one"
                  />
                </Field>
              </div>
              <div className="mt-5 flex justify-end border-t border-[var(--ds-line-2)] pt-4">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner />}
                  {busy ? "Creating…" : "Create workspace"}
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-5 sm:px-6"
              onSubmit={(e) => {
                e.preventDefault();
                void onJoin();
              }}
            >
              <h2 className="m-0 text-[15.5px] font-medium text-[var(--ds-ink)]">Join via invite</h2>
              <p className="m-0 mt-1 text-[13.5px] text-[var(--ds-muted)]">
                Paste the invite link your admin shared, or just the invite code.
              </p>
              <div className="mt-4">
                <Field label="Invite link or code" htmlFor="ws-invite" error={error ?? undefined}>
                  <Input
                    id="ws-invite"
                    placeholder="https://app.drafthr.io/join/abc… or abc…"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    disabled={busy}
                    aria-invalid={error ? true : undefined}
                    autoFocus
                  />
                </Field>
              </div>
              <div className="mt-5 flex justify-end border-t border-[var(--ds-line-2)] pt-4">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner />}
                  {busy ? "Joining…" : "Join workspace"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}

function WorkspaceShell({
  user,
  children,
}: {
  user?: AuthUser;
  children: ReactNode;
}) {
  return (
    <div data-page-main className="min-h-screen flex flex-col bg-[var(--ds-canvas)] text-[var(--ds-ink)]">
      <WorkspaceTopbar user={user} />
      <div className="flex-1">{children}</div>
      <WorkspaceFooter />
    </div>
  );
}

function WorkspaceTopbar({ user }: { user?: AuthUser }) {
  const displayName =
    user && ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);

  // The logo moved out of the topbar and now sits above the page
  // content (same vertical group as the form card, matching the
  // AuthShell layout). The topbar shrinks to just the user-state
  // affordance on the right.
  return (
    <header className="h-14 shrink-0 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto flex h-full max-w-5xl items-center gap-4">
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="text-[13px] text-[var(--ds-muted)]">
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
        <span>&copy; {new Date().getFullYear()} DraftHR. All rights reserved.</span>
      </div>
    </footer>
  );
}

/** 6B pastel choice card: tinted top with an icon, a title and one line. */
function ChoiceCard({
  selected,
  onSelect,
  tint,
  icon,
  title,
  line,
}: {
  selected: boolean;
  onSelect: () => void;
  tint: Tint;
  icon: ReactNode;
  title: string;
  line: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={tintStyle(tint)}
      className={cn(
        "flex min-w-0 flex-col rounded-[16px] border bg-[var(--ds-surface)] p-1.5 text-left transition-[border-color,box-shadow] duration-[120ms] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
        selected
          ? "border-[var(--ds-ink)] shadow-[inset_0_0_0_1px_var(--ds-ink)]"
          : "border-[var(--ds-line)] hover:border-[var(--ds-line-strong)]"
      )}
    >
      <span className="grid h-[76px] place-items-center rounded-[12px] bg-[var(--tint)] text-[var(--tint-ink)]" aria-hidden>
        {icon}
      </span>
      <span className="px-2.5 pb-2 pt-3">
        <span className="block text-[15px] font-medium text-[var(--ds-ink)]">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[var(--ds-muted)]">{line}</span>
      </span>
    </button>
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
