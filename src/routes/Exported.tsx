import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { ChevronLeft, FileDown, FileText } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import type { Draft, ExportEvent } from "@/lib/letters/types";

const RISK: Record<string, "green" | "amber" | "red"> = {
  low: "green",
  medium: "amber",
  high: "red",
};

export function Exported() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const list = useMemo(() => {
    return Object.values(drafts)
      .filter((d) => (role ? d.mode === role : true))
      .filter((d) => (d.exports?.length ?? 0) > 0)
      .map((d) => ({
        draft: d,
        latest: latestExport(d),
        meta: safeMeta(d.letterType),
      }))
      .sort((a, b) => (b.latest?.exportedAt ?? 0) - (a.latest?.exportedAt ?? 0));
  }, [drafts, role]);

  return (
    <Box className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Box mb="6">
        <Button variant="ghost" size="1" color="gray" onClick={() => nav(-1)} className="!-ml-2 !mb-1">
          <ChevronLeft className="size-3.5" /> Back
        </Button>
        <Text size="1" color="gray" weight="medium" className="uppercase tracking-[0.18em]" as="div">Exported</Text>
        <Heading size="6" mt="1" mb="1">Sent letters</Heading>
        <Text size="2" color="gray" className="max-w-2xl">
          Letters you've finalised and exported as PDF or DOCX. Re-open any draft to issue a new
          export — each one is logged.
        </Text>
      </Box>

      {list.length === 0 ? (
        <Card size="3">
          <Flex direction="column" align="center" gap="2" py="6">
            <FileDown className="size-5 text-[var(--gray-9)]" />
            <Text size="2" weight="medium" as="p">Nothing exported yet.</Text>
            <Text size="1" color="gray" align="center" as="p" className="max-w-md">
              When you export a letter from the editor, it appears here with a record of the
              format, timestamp, and any counsel-review attestation.
            </Text>
          </Flex>
        </Card>
      ) : (
        <Card size="2">
          <Heading size="3" mb="3">{list.length} exported letter{list.length === 1 ? "" : "s"}</Heading>
          <Flex direction="column">
            {list.map((item) => (
              <button
                key={item.draft.id}
                onClick={() => nav(`/editor/${item.draft.id}`)}
                className="text-left"
              >
                <Flex
                  px="4"
                  py="3"
                  align="center"
                  gap="3"
                  className="hover:bg-[var(--gray-2)] cursor-pointer border-b border-[var(--gray-5)] last:border-b-0"
                >
                  <Box
                    className="size-9 rounded-md grid place-items-center shrink-0"
                    style={{ background: "var(--gray-3)" }}
                  >
                    <FileText className="size-4 text-[var(--gray-9)]" />
                  </Box>
                  <Box className="flex-1 min-w-0">
                    <Flex align="center" gap="2" wrap="wrap">
                      <Text size="2" weight="medium">{item.meta?.shortTitle ?? item.draft.letterType}</Text>
                      {item.meta && <Badge color={RISK[item.meta.riskClass]} variant="soft">{item.meta.riskClass}</Badge>}
                      <Text size="1" color="gray" weight="medium" className="uppercase tracking-wider">
                        {item.draft.mode === "employer" ? "HR" : "employee"}
                      </Text>
                    </Flex>
                    <Text size="1" color="gray" className="truncate">
                      {item.draft.mode === "employer"
                        ? item.draft.employee.legalName || "(no recipient)"
                        : `to ${item.draft.employer.legalName || "(employer)"}`}
                    </Text>
                  </Box>
                  <Box className="text-right shrink-0">
                    {item.latest && (
                      <>
                        <Text size="1" weight="medium" as="div">{item.latest.format.toUpperCase()}</Text>
                        <Text size="1" color="gray" as="div">{formatRel(item.latest.exportedAt)}</Text>
                        {item.latest.reviewedBy && (
                          <Text size="1" color="green" as="div">✓ {item.latest.reviewedBy}</Text>
                        )}
                      </>
                    )}
                  </Box>
                </Flex>
              </button>
            ))}
          </Flex>
        </Card>
      )}
    </Box>
  );
}

function latestExport(d: Draft): ExportEvent | undefined {
  if (!d.exports || d.exports.length === 0) return undefined;
  return [...d.exports].sort((a, b) => b.exportedAt - a.exportedAt)[0];
}

function safeMeta(id: string) {
  try { return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]); } catch { return null; }
}

function formatRel(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
