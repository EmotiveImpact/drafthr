import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ScrollText, ShieldCheck } from "lucide-react";
import { Box, Button, Flex, Separator, Text } from "@radix-ui/themes";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { UserChip } from "@/lib/auth/UserChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useProfileStore } from "@/lib/profile";
import { listIdentities, colorFor } from "@/lib/comments/identity";

/**
 * Compact topbar shown ONLY on the editor route, where the global sidebar is
 * unmounted. Provides a "← Letters" back button, a brand mark, the letter
 * title, and the user chip.
 */
export function EditorTopbar() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const profile = useProfileStore((s) => s.profile);
  const meta = draft ? getLetterMeta(draft.letterType) : null;
  const backTo = draft?.mode === "employer" ? "/hr" : draft?.mode === "employee" ? "/me" : "/";
  const identities = draft ? listIdentities(draft, profile) : [];
  const stack = identities.slice(0, 3);
  const more = Math.max(0, identities.length - stack.length);

  return (
    <Flex
      asChild
      align="center"
      gap="2"
      px={{ initial: "3", sm: "4" }}
      className="h-12 shrink-0 sticky top-0 z-30 border-b border-[var(--gray-5)]"
      style={{ background: "var(--color-background)" }}
    >
      <header>
        <Button
          variant="ghost"
          size="2"
          color="gray"
          onClick={() => nav(backTo)}
          aria-label="Back to letters"
          className="!-ml-1.5"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Letters</span>
        </Button>
        <Box className="hidden sm:block"><Separator orientation="vertical" size="1" /></Box>
        <Link to="/" className="hidden sm:flex items-center gap-2 group min-w-0">
          <Box
            className="size-7 grid place-items-center shrink-0"
            style={{
              background: "var(--accent-9)",
              color: "var(--accent-contrast)",
              borderRadius: "var(--radius-2)",
            }}
          >
            <ScrollText className="size-3.5" />
          </Box>
          <Box className="leading-tight min-w-0 hidden md:block">
            <Text size="1" weight="bold" className="truncate" as="div">
              DRAFTHR
            </Text>
          </Box>
        </Link>
        <Box className="hidden md:block"><Separator orientation="vertical" size="1" /></Box>
        <Box className="flex-1 min-w-0">
          <Text size="2" weight="medium" className="truncate" as="div">
            {meta?.title ?? "Editor"}
            {draft && (
              <Text color="gray" weight="regular" className="hidden md:inline">
                {" "}· {draft.mode === "employer"
                  ? draft.employee.legalName || "(no recipient)"
                  : `to ${draft.employer.legalName || "(employer)"}`}{" "}
                · {draft.context.jurisdiction}
              </Text>
            )}
          </Text>
        </Box>
        <Flex
          align="center"
          gap="1"
          px="2"
          py="1"
          className="hidden lg:inline-flex"
          style={{
            border: "1px solid var(--gray-5)",
            borderRadius: "var(--radius-2)",
            color: "var(--gray-11)",
            fontSize: "11px",
          }}
        >
          <ShieldCheck className="size-3" />
          Counsel review recommended
        </Flex>
        {stack.length > 0 && (
          <Flex align="center" className="hidden sm:flex">
            {stack.map((p, i) => (
              <Box
                key={p.id}
                title={p.name + (p.email ? ` <${p.email}>` : "")}
                className="size-7 rounded-full grid place-items-center shrink-0"
                style={{
                  background: colorFor(p.hue),
                  color: "white",
                  marginLeft: i === 0 ? 0 : -8,
                  border: "2px solid var(--color-background)",
                  zIndex: stack.length - i,
                }}
              >
                <Text size="1" weight="bold">{p.initials}</Text>
              </Box>
            ))}
            {more > 0 && (
              <Box
                className="size-7 rounded-full grid place-items-center shrink-0"
                style={{
                  background: "var(--gray-4)",
                  color: "var(--gray-12)",
                  marginLeft: -8,
                  border: "2px solid var(--color-background)",
                }}
              >
                <Text size="1" weight="bold">+{more}</Text>
              </Box>
            )}
          </Flex>
        )}
        <NotificationsBell />
        <Box className="hidden sm:block"><ThemeToggle /></Box>
        <UserChip />
      </header>
    </Flex>
  );
}
