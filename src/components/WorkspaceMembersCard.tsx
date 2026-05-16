import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Select,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

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
    <Card size="3">
      <Flex justify="between" align="start" mb="3" gap="3">
        <Box>
          <Heading size="3" mb="1">Workspace · {activeTenant.name}</Heading>
          <Text size="2" color="gray" as="p">
            People with access to this workspace. Admins can invite, change roles, and remove
            members.
          </Text>
        </Box>
        {isAdmin && (
          <Button onClick={() => setShowInvite(true)} variant="solid">
            <Plus className="size-4" />
            Invite member
          </Button>
        )}
      </Flex>

      <Separator size="4" my="3" />

      <Heading size="2" mb="2" weight="medium">Members ({members.length})</Heading>
      <Flex direction="column" gap="2">
        {loading && <Text size="2" color="gray">Loading…</Text>}
        {!loading && members.length === 0 && (
          <Text size="2" color="gray">No members yet.</Text>
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
      </Flex>

      {isAdmin && invites.length > 0 && (
        <>
          <Separator size="4" my="3" />
          <Heading size="2" mb="2" weight="medium">Pending invites ({invites.length})</Heading>
          <Flex direction="column" gap="2">
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onChanged={refresh} />
            ))}
          </Flex>
        </>
      )}

      {showInvite && (
        <InviteDialog onClose={() => setShowInvite(false)} onInvited={refresh} />
      )}
    </Card>
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
      const res = await fetch("/api/workspace/member/role", {
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
      const res = await fetch("/api/workspace/member/remove", {
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
    <Flex justify="between" align="center" gap="3" className="rounded-md border border-[var(--gray-4)] px-3 py-2">
      <Box className="min-w-0">
        <Text size="2" weight="medium" className="truncate block">
          {member.legalName ?? member.email ?? "Unnamed"}
          {isSelf && <Badge color="gray" ml="2" size="1">you</Badge>}
        </Text>
        {member.email && member.email !== member.legalName && (
          <Text size="1" color="gray" className="truncate block">{member.email}</Text>
        )}
      </Box>
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
          <Badge color="gray">{ROLE_LABELS[member.role] ?? member.role}</Badge>
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
      toast.error("Couldn't copy — copy manually: " + link);
    }
  };

  const onRevoke = async () => {
    if (!confirm(`Revoke invite for ${invite.email}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/invite/revoke", {
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
    <Flex justify="between" align="center" gap="3" className="rounded-md border border-[var(--gray-4)] px-3 py-2">
      <Box className="min-w-0">
        <Text size="2" weight="medium" className="truncate block">{invite.email}</Text>
        <Text size="1" color="gray">
          Expires {new Date(invite.expiresAt).toLocaleDateString()}
        </Text>
      </Box>
      <Flex align="center" gap="2">
        <Badge color="amber">{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
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
              : "Email delivery isn't configured — share this link with the invitee. It expires in 7 days."
            : "We'll email the invite if Resend is configured, and always return a copy-able link as a fallback."}
        </Dialog.Description>

        {inviteLink ? (
          <Flex direction="column" gap="3" mt="3">
            {emailSent !== null && (
              <Badge color={emailSent ? "green" : "amber"} size="2">
                {emailSent ? "Email sent" : "Couldn't email — copy link manually"}
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
