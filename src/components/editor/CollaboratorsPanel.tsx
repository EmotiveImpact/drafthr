import { useState } from "react";
import { Badge, Box, Button, Flex, IconButton, Select, Text, TextField } from "@radix-ui/themes";
import { Copy, Mail, UserPlus, X, Check } from "lucide-react";
import type { Collaborator, CollaboratorRole, Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";

const ROLE_LABEL: Record<CollaboratorRole, string> = {
  owner: "Owner",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

const ROLE_HINT: Record<CollaboratorRole, string> = {
  owner: "Full access — only the draft creator",
  editor: "Can edit sections and regenerate",
  reviewer: "Can comment and attest counsel review",
  viewer: "Read-only — can preview and export",
};

/**
 * Right-rail panel for managing collaborators on a draft. Local-only for now —
 * invitees are stored on the draft and a copyable share link is generated.
 * When auth lands, the invite call will hit /api/invites and notify by email.
 */
export function CollaboratorsPanel({ draft }: { draft: Draft }) {
  const invite = useDraftStore((s) => s.inviteCollaborator);
  const remove = useDraftStore((s) => s.removeCollaborator);
  const updateRole = useDraftStore((s) => s.updateCollaboratorRole);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("reviewer");
  const [copied, setCopied] = useState(false);

  const collaborators = draft.collaborators ?? [];
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const onInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    invite(draft.id, email, role, name || undefined);
    setEmail("");
    setName("");
  };

  const shareLink = `${window.location.origin}/editor/${draft.id}?invite=1`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <Box className="h-full overflow-auto" p="4">
      <Flex align="center" gap="2" mb="2">
        <UserPlus className="size-4 text-[var(--gray-11)]" />
        <Text size="2" weight="medium">Collaborators</Text>
      </Flex>
      <Text size="1" color="gray" as="p" className="leading-relaxed" mb="4">
        Invite colleagues, counsel, or HR partners to edit, review, or just view this draft.
      </Text>

      {/* Invite form */}
      <form onSubmit={onInvite}>
        <Flex direction="column" gap="2" mb="3">
          <TextField.Root
            size="2"
            placeholder="email@company.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          >
            <TextField.Slot>
              <Mail className="size-3.5" />
            </TextField.Slot>
          </TextField.Root>
          <TextField.Root
            size="2"
            placeholder="Display name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Flex gap="2">
            <Box className="flex-1">
              <Select.Root value={role} onValueChange={(v) => setRole(v as CollaboratorRole)}>
                <Select.Trigger className="w-full" />
                <Select.Content>
                  <Select.Item value="editor">{ROLE_LABEL.editor}</Select.Item>
                  <Select.Item value="reviewer">{ROLE_LABEL.reviewer}</Select.Item>
                  <Select.Item value="viewer">{ROLE_LABEL.viewer}</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            <Button type="submit" disabled={!valid} size="2">
              <UserPlus className="size-3.5" /> Invite
            </Button>
          </Flex>
          <Text size="1" color="gray" className="leading-relaxed">{ROLE_HINT[role]}</Text>
        </Flex>
      </form>

      {/* Share link */}
      <Box
        p="2"
        mb="3"
        style={{
          background: "var(--gray-2)",
          border: "1px solid var(--gray-5)",
          borderRadius: "var(--radius-2)",
        }}
      >
        <Text size="1" color="gray" weight="medium" as="div" mb="1">Share link</Text>
        <Flex gap="2" align="center">
          <Text size="1" color="gray" className="truncate flex-1 font-mono">{shareLink}</Text>
          <IconButton size="1" variant="soft" color="gray" onClick={onCopy} aria-label="Copy share link">
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </IconButton>
        </Flex>
      </Box>

      {/* Owner row */}
      <Box
        p="2"
        mb="2"
        style={{
          background: "var(--accent-2)",
          border: "1px solid var(--accent-6)",
          borderRadius: "var(--radius-2)",
        }}
      >
        <Flex align="center" gap="2">
          <Box
            className="size-7 rounded-full grid place-items-center shrink-0"
            style={{ background: "var(--accent-9)", color: "var(--accent-contrast)" }}
          >
            <Text size="1" weight="bold">YOU</Text>
          </Box>
          <Box className="flex-1 min-w-0">
            <Text size="1" weight="medium" as="div">You</Text>
            <Text size="1" color="gray" as="div">Created this draft</Text>
          </Box>
          <Badge color="amber" variant="soft">Owner</Badge>
        </Flex>
      </Box>

      {/* List */}
      {collaborators.length === 0 ? (
        <Text size="1" color="gray" as="p" className="text-center py-4">
          No collaborators yet.
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {collaborators.map((c) => (
            <CollaboratorRow
              key={c.id}
              collaborator={c}
              onRemove={() => remove(draft.id, c.id)}
              onRoleChange={(r) => updateRole(draft.id, c.id, r)}
            />
          ))}
        </Flex>
      )}
    </Box>
  );
}

function CollaboratorRow({
  collaborator,
  onRemove,
  onRoleChange,
}: {
  collaborator: Collaborator;
  onRemove: () => void;
  onRoleChange: (role: CollaboratorRole) => void;
}) {
  const initials =
    collaborator.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? collaborator.email.slice(0, 2).toUpperCase();

  return (
    <Box
      p="2"
      style={{
        border: "1px solid var(--gray-5)",
        borderRadius: "var(--radius-2)",
      }}
    >
      <Flex align="center" gap="2" mb="1">
        <Box
          className="size-7 rounded-full grid place-items-center shrink-0"
          style={{ background: "var(--gray-4)", color: "var(--gray-12)" }}
        >
          <Text size="1" weight="bold">{initials}</Text>
        </Box>
        <Box className="flex-1 min-w-0">
          <Text size="1" weight="medium" as="div" className="truncate">
            {collaborator.name ?? collaborator.email}
          </Text>
          {collaborator.name && (
            <Text size="1" color="gray" as="div" className="truncate">
              {collaborator.email}
            </Text>
          )}
        </Box>
        <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} aria-label="Remove">
          <X className="size-3" />
        </IconButton>
      </Flex>
      <Flex justify="between" align="center" gap="2">
        <Select.Root
          value={collaborator.role}
          onValueChange={(v) => onRoleChange(v as CollaboratorRole)}
          size="1"
        >
          <Select.Trigger variant="ghost" />
          <Select.Content>
            <Select.Item value="editor">{ROLE_LABEL.editor}</Select.Item>
            <Select.Item value="reviewer">{ROLE_LABEL.reviewer}</Select.Item>
            <Select.Item value="viewer">{ROLE_LABEL.viewer}</Select.Item>
          </Select.Content>
        </Select.Root>
        <Badge color={collaborator.status === "active" ? "green" : "gray"} variant="soft">
          {collaborator.status}
        </Badge>
      </Flex>
    </Box>
  );
}
