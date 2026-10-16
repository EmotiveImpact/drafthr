import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Avatar, Pill } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Callout,
  ConfirmDialog,
  FadeIn,
  Field,
  KitDialogContent,
  KitDialogFooter,
  LoadingRows,
  Spinner,
} from "@/components/wizard/kit";
import { KitSelect } from "@/routes/settings/parts";

/**
 * Settings, Team and roles. Lists members and pending invites with the
 * admin-only actions (invite, role change, remove, revoke). Rows follow the
 * 13B style: avatar, name and email, the role on the right. The simulated
 * role for solo dev workspaces is rendered separately in Settings.
 */
type Member = {
  userId: string;
  email: string | null;
  legalName: string | null;
  role: string;
  joinedAt: string;
  isActive: boolean;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  inviteCode: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

const ADMIN_ROLES = new Set(["owner", "admin"]);
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  drafter: "Drafter",
  reviewer: "Reviewer",
  viewer: "Viewer",
};
const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const ROW =
  "relative flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 [&+&]:border-t [&+&]:border-[var(--ds-line-2)]";

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function WorkspaceMembersCard({
  header,
}: {
  /** Renders the pane header; receives the "Invite member" button (admins only). */
  header?: (inviteButton: ReactNode) => ReactNode;
} = {}) {
  const { user, activeTenant } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");

  const refresh = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        fetch("/api/workspace/members", { credentials: "same-origin" }).then((r) => {
          if (!r.ok) throw new Error(`members ${r.status}`);
          return r.json();
        }),
        isAdmin
          ? fetch("/api/workspace/invites", { credentials: "same-origin" }).then((r) =>
              r.ok ? r.json() : { invites: [] },
            )
          : Promise.resolve({ invites: [] }),
      ]);
      setMembers((m.members ?? []) as Member[]);
      setInvites((i.invites ?? []) as Invite[]);
      setLoadError(false);
    } catch (err) {
      console.warn("[workspace members] failed", err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [activeTenant, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!activeTenant) return null;

  const inviteButton = isAdmin ? (
    <Button onClick={() => setShowInvite(true)} className="shrink-0">
      <Plus className="size-4" />
      Invite member
    </Button>
  ) : null;

  return (
    <>
      {header ? (
        header(inviteButton)
      ) : (
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <p className="m-0 min-w-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
            People with access to this workspace. Admins can invite, change roles and remove members.
          </p>
          {inviteButton}
        </div>
      )}
    <section
      aria-label={`Members of ${activeTenant.name}`}
      className="min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-[14px] sm:px-[22px] sm:py-4"
    >
      <h4 className="m-0 mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ds-muted)]">
        Members{" "}
        {loading && !loaded ? (
          <span aria-hidden className="inline-block h-2.5 w-4 animate-pulse rounded-full bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
        ) : (
          <span className="ds-mono text-[var(--ds-subtle)]">{members.length}</span>
        )}
      </h4>
      {loading && !loaded ? (
        <LoadingRows rows={3} className="py-3" label="Loading members" />
      ) : loadError && members.length === 0 ? (
        <Callout tone="error" title="Couldn't load the team." className="mt-2" action={
          <button type="button" className="underline underline-offset-2" onClick={() => void refresh()}>
            Try again
          </button>
        }>
          Check your connection and try again.
        </Callout>
      ) : members.length === 0 ? (
        <p className="m-0 py-3 text-[13.5px] text-[var(--ds-muted)]">No members yet.</p>
      ) : (
        <FadeIn className="flex flex-col">
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              isAdmin={isAdmin}
              isSelf={user?.id === m.userId || (m.email ?? "").toLowerCase() === (user?.email ?? "").toLowerCase()}
              onChanged={refresh}
            />
          ))}
        </FadeIn>
      )}

      {isAdmin && invites.length > 0 && (
        <>
          <h4 className="m-0 mb-1 mt-5 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ds-muted)]">
            Pending invites <span className="ds-mono text-[var(--ds-subtle)]">{invites.length}</span>
          </h4>
          <FadeIn className="flex flex-col">
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onChanged={refresh} />
            ))}
          </FadeIn>
        </>
      )}

      {showInvite && <InviteDialog onClose={() => setShowInvite(false)} onInvited={refresh} />}
    </section>
    </>
  );
}

function MemberRow({
  member,
  isAdmin,
  isSelf,
  onChanged,
}: {
  member: Member;
  isAdmin: boolean;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const name = member.legalName ?? member.email ?? "Unnamed";

  const onRoleChange = async (role: string) => {
    if (role === member.role) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/member-role", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role }),
      });
      if (res.ok) {
        toast.success(`Role updated to ${ROLE_LABELS[role] ?? role}`, {
          description: `${name}'s access changes straight away.`,
        });
        onChanged();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to update role");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/member-remove", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      if (res.ok) {
        toast.success("Member removed", {
          description: `${name} no longer has access to this workspace. Their letters stay here.`,
        });
        setConfirming(false);
        onChanged();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to remove member");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={ROW}>
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
        <Avatar
          seed={member.email ?? member.userId}
          name={member.legalName ?? undefined}
          email={member.email ?? undefined}
          size="2xl"
        />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">
            {name}
            {isSelf && <span className="ml-2 text-[12.5px] font-normal text-[var(--ds-subtle)]">you</span>}
          </div>
          {member.email && member.email !== member.legalName && (
            <div className="truncate text-[12.5px] text-[var(--ds-muted)]">{member.email}</div>
          )}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {isAdmin && !isSelf ? (
          <KitSelect
            value={member.role}
            onValueChange={onRoleChange}
            options={ROLE_OPTIONS}
            disabled={busy}
            size="sm"
            ariaLabel={`Role for ${name}`}
            className="w-[124px]"
          />
        ) : (
          <Pill tone="grey" dot={false}>
            {ROLE_LABELS[member.role] ?? member.role}
          </Pill>
        )}
        {isAdmin && !isSelf && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label="Remove member"
            className="text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-soft)]"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !busy && setConfirming(o)}
        title={`Remove ${name}?`}
        description="They lose access to this workspace straight away. Letters they wrote stay in the workspace."
        confirmLabel="Remove member"
        busyLabel="Removing…"
        busy={busy}
        destructive
        onConfirm={() => void onRemove()}
      />
    </div>
  );
}

function InviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const onCopy = async () => {
    const link = `${window.location.origin}/join/${invite.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied", {
        description: `Send it to ${invite.email}. It works until the invite expires.`,
      });
    } catch {
      toast.error("Couldn't copy. Copy it manually: " + link);
    }
  };

  const onRevoke = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/invite-revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: invite.id }),
      });
      if (res.ok) {
        toast.success("Invite revoked", {
          description: `The link for ${invite.email} no longer works.`,
        });
        setConfirming(false);
        onChanged();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to revoke");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const expires = formatExpiry(invite.expiresAt);

  return (
    <div className={ROW}>
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
        <Avatar seed={invite.email} email={invite.email} size="2xl" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{invite.email}</div>
          {expires && <div className="text-[12.5px] text-[var(--ds-muted)]">Expires {expires}</div>}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Waiting on the invitee, not on you: lilac (someone else has it). */}
        <Pill tone="lilac">{ROLE_LABELS[invite.role] ?? invite.role}</Pill>
        <Button variant="outline" size="sm" onClick={() => void onCopy()}>
          <Copy className="size-3.5" />
          Copy link
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Revoke"
          className="text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-soft)]"
        >
          <X className="size-4" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !busy && setConfirming(o)}
        title={`Revoke invite for ${invite.email}?`}
        description="The link stops working straight away. You can send a new invite later."
        confirmLabel="Revoke invite"
        busyLabel="Revoking…"
        busy={busy}
        destructive
        onConfirm={() => void onRevoke()}
      />
    </div>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("drafter");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const onSubmit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError("Valid email required");
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to create invite");
        return;
      }
      const data = (await res.json()) as {
        invite?: { inviteLink?: string; inviteCode?: string };
        inviteUrl?: string;
        inviteCode?: string;
        emailSent?: boolean;
      };
      const code = data.invite?.inviteCode ?? data.inviteCode;
      const link =
        data.invite?.inviteLink ?? data.inviteUrl ?? (code ? `${window.location.origin}/join/${code}` : null);
      if (!link) {
        setError("The invite was created but no link came back. Copy it from Pending invites.");
        onInvited();
        return;
      }
      setInviteLink(link);
      setEmailSent(data.emailSent ?? false);
      onInvited();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied", {
        description: "Paste it into a message to your teammate. It expires in 7 days.",
      });
    } catch {
      /* the link is visible in the dialog so they can copy by hand */
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <KitDialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            {inviteLink
              ? emailSent
                ? "Email sent. The link is also below if you'd like to share it directly."
                : "Email delivery isn't configured. Share this link with the invitee. It expires in 7 days."
              : "We'll email the invite if email is set up, and always give you a link to copy as a fallback."}
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Input value={inviteLink} readOnly aria-label="Invite link" className="ds-mono min-w-0 flex-1 text-[13px]" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={() => void onCopy()} aria-label="Copy">
                <Copy className="size-4" />
              </Button>
            </div>
            <KitDialogFooter>
              <Button onClick={onClose}>Done</Button>
            </KitDialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
          >
            <Field label="Email" htmlFor="invite-email" error={error ?? undefined}>
              <Input
                ref={emailRef}
                id="invite-email"
                type="email"
                placeholder="teammate@company.co.uk"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "invite-email-error" : undefined}
                autoFocus
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <KitSelect id="invite-role" value={role} onValueChange={setRole} options={ROLE_OPTIONS} disabled={busy} />
            </Field>
            <KitDialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />}
                {busy ? "Creating…" : "Create invite"}
              </Button>
            </KitDialogFooter>
          </form>
        )}
      </KitDialogContent>
    </Dialog>
  );
}

/** One @ and a dot in the domain; the server does the real check. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
