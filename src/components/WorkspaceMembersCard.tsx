import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ds";
import { SectionCard, StatusPill } from "@/components/reports/parts";

const ROW =
  "relative flex items-center justify-between gap-3 rounded-[var(--ds-r-m)] px-3 py-2.5 hover:bg-[var(--ds-surface-2)] [&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:top-0 [&+&]:before:border-t [&+&]:before:border-[var(--ds-line)] [&+&]:before:content-['']";

/**
 * Settings → Workspace section. Lists members + pending invites with
 * admin-only actions (invite, role change, remove, revoke). The plain-old
 * role picker stays for solo workspaces (rendered separately in Settings.tsx);
 * this card adds the team-scale controls.
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

export function WorkspaceMembersCard() {
  const { user, activeTenant } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");

  const refresh = useCallback(async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        fetch("/api/workspace/members", { credentials: "same-origin" }).then((r) =>
          r.ok ? r.json() : { members: [] },
        ),
        isAdmin
          ? fetch("/api/workspace/invites", { credentials: "same-origin" }).then((r) =>
              r.ok ? r.json() : { invites: [] },
            )
          : Promise.resolve({ invites: [] }),
      ]);
      setMembers((m.members ?? []) as Member[]);
      setInvites((i.invites ?? []) as Invite[]);
    } catch (err) {
      console.warn("[workspace members] failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeTenant, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!activeTenant) return null;

  return (
    <SectionCard
      title={`Workspace: ${activeTenant.name}`}
      description="People with access to this workspace. Admins can invite, change roles and remove members."
      actions={
        isAdmin ? (
          <Button onClick={() => setShowInvite(true)} variant="solid">
            <Plus className="size-4" />
            Invite member
          </Button>
        ) : undefined
      }
    >
      <h3 className="m-0 mb-1 text-[12.5px] font-medium text-[var(--ds-muted)]">
        Members <span className="ds-mono">{members.length}</span>
      </h3>
      <div className="-mx-3 flex flex-col">
        {loading && <Text size="2" color="gray" className="px-3 py-2">Loading…</Text>}
        {!loading && members.length === 0 && (
          <Text size="2" color="gray" className="px-3 py-2">No members yet.</Text>
        )}
        {members.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            isAdmin={isAdmin}
            isSelf={user?.id === m.userId || (m.email ?? "").toLowerCase() === (user?.email ?? "").toLowerCase()}
            onChanged={refresh}
          />
        ))}
      </div>

      {isAdmin && invites.length > 0 && (
        <>
          <h3 className="m-0 mb-1 mt-5 text-[12.5px] font-medium text-[var(--ds-muted)]">
            Pending invites <span className="ds-mono">{invites.length}</span>
          </h3>
          <div className="-mx-3 flex flex-col">
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onChanged={refresh} />
            ))}
          </div>
        </>
      )}

      {showInvite && (
        <InviteDialog onClose={() => setShowInvite(false)} onInvited={refresh} />
      )}
    </SectionCard>
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
        toast.success(`Role updated to ${ROLE_LABELS[role] ?? role}`);
        onChanged();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to update role");
      }
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!confirm(`Remove ${member.email ?? member.legalName ?? "this member"}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/member-remove", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId }),
      });
      if (res.ok) {
        toast.success("Member removed");
        onChanged();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to remove member");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex justify="between" align="center" gap="3" className={ROW}>
      <Flex align="center" gap="3" className="min-w-0">
        <Avatar seed={member.email ?? member.userId} name={member.legalName ?? undefined} email={member.email ?? undefined} size="xl" />
        <Box className="min-w-0">
          <Text size="2" weight="medium" className="truncate block text-[var(--ds-ink)]">
            {member.legalName ?? member.email ?? "Unnamed"}
            {isSelf && <span className="ml-2 text-[12px] font-normal text-[var(--ds-muted)]">you</span>}
          </Text>
          {member.email && member.email !== member.legalName && (
            <Text className="truncate block text-[12.5px] text-[var(--ds-muted)]">{member.email}</Text>
          )}
        </Box>
      </Flex>
      <Flex align="center" gap="2">
        {isAdmin && !isSelf ? (
          <Select.Root value={member.role} onValueChange={onRoleChange} disabled={busy}>
            <Select.Trigger />
            <Select.Content>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <Select.Item key={k} value={k}>{v}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        ) : (
          <StatusPill tone="neutral" dot={false}>{ROLE_LABELS[member.role] ?? member.role}</StatusPill>
        )}
        {isAdmin && !isSelf && (
          <IconButton variant="ghost" color="red" onClick={onRemove} disabled={busy} aria-label="Remove member">
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </Flex>
    </Flex>
  );
}

function InviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const onCopy = async () => {
    const link = `${window.location.origin}/join/${invite.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Copy it manually: " + link);
    }
  };

  const onRevoke = async () => {
    if (!confirm(`Revoke invite for ${invite.email}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/invite-revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: invite.id }),
      });
      if (res.ok) {
        toast.success("Invite revoked");
        onChanged();
      } else {
        toast.error("Failed to revoke");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex justify="between" align="center" gap="3" wrap="wrap" className={ROW}>
      <Flex align="center" gap="3" className="min-w-0">
        <Avatar seed={invite.email} email={invite.email} size="xl" />
        <Box className="min-w-0">
          <Text size="2" weight="medium" className="truncate block text-[var(--ds-ink)]">{invite.email}</Text>
          <Text className="text-[12.5px] text-[var(--ds-muted)]">
            Expires {new Date(invite.expiresAt).toLocaleDateString("en-GB")}
          </Text>
        </Box>
      </Flex>
      <Flex align="center" gap="2">
        <StatusPill tone="warn">{ROLE_LABELS[invite.role] ?? invite.role}</StatusPill>
        <Button variant="soft" color="gray" size="1" onClick={onCopy}>
          <Copy className="size-3.5" />
          Copy link
        </Button>
        <IconButton variant="ghost" color="red" size="1" onClick={onRevoke} disabled={busy} aria-label="Revoke">
          <X className="size-4" />
        </IconButton>
      </Flex>
    </Flex>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("drafter");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email required");
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
        invite: { inviteLink: string };
        emailSent?: boolean;
      };
      setInviteLink(data.invite.inviteLink);
      setEmailSent(data.emailSent ?? false);
      onInvited();
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied");
    } catch {
      /* the link is visible in the dialog so they can copy by hand */
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="500px">
        <Dialog.Title>Invite member</Dialog.Title>
        <Dialog.Description>
          {inviteLink
            ? emailSent
              ? "Email sent. The link is also below if you'd like to share it directly."
              : "Email delivery isn't configured. Share this link with the invitee. It expires in 7 days."
            : "We'll email the invite if Resend is configured, and always return a copy-able link as a fallback."}
        </Dialog.Description>

        {inviteLink ? (
          <Flex direction="column" gap="3" mt="3">
            {emailSent !== null && (
              <Badge color={emailSent ? "green" : "amber"} size="2">
                {emailSent ? "Email sent" : "Couldn't email. Copy the link manually"}
              </Badge>
            )}
            <TextField.Root value={inviteLink} readOnly>
              <TextField.Slot side="right">
                <IconButton variant="ghost" onClick={onCopy} aria-label="Copy">
                  <Copy className="size-4" />
                </IconButton>
              </TextField.Slot>
            </TextField.Root>
            <Flex justify="end">
              <Dialog.Close>
                <Button onClick={onClose}>Done</Button>
              </Dialog.Close>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="3" mt="3">
            <label>
              <Text size="2" weight="medium">Email</Text>
              <TextField.Root
                size="3"
                placeholder="teammate@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              <Text size="2" weight="medium">Role</Text>
              <Select.Root value={role} onValueChange={setRole} disabled={busy}>
                <Select.Trigger />
                <Select.Content>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <Select.Item key={k} value={k}>{v}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
            <Text size="1" color="gray">
              We'll email the invitee if email delivery is configured. Either way you'll get a
              copy-able link as a fallback.
            </Text>
            {error && <Badge color="red">{error}</Badge>}
            <Flex justify="end" gap="2">
              <Dialog.Close>
                <Button variant="soft" color="gray" onClick={onClose}>Cancel</Button>
              </Dialog.Close>
              <Button onClick={onSubmit} disabled={busy}>
                {busy ? "Creating…" : "Create invite"}
              </Button>
            </Flex>
          </Flex>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
