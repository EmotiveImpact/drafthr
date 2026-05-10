import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Search, ArrowUpRight, Zap } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { hasTemplate } from "@/lib/letters/templates";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore, prefillsFromProfile } from "@/lib/profile";

const RISK: Record<string, "green" | "amber" | "red"> = {
  low: "green",
  medium: "amber",
  high: "red",
};

export function BrowseLetters({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const createDraft = useDraftStore((s) => s.createDraft);
  const profile = useProfileStore((s) => s.profile);

  const startFromTemplate = (letterType: LetterTypeId) => {
    const answers = prefillsFromProfile(profile, mode);
    const id = createDraft(letterType, answers, mode);
    nav(`/editor/${id}`);
  };

  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return catalog;
    return catalog.filter(
      (l) =>
        l.title.toLowerCase().includes(t) ||
        l.shortTitle.toLowerCase().includes(t) ||
        l.description.toLowerCase().includes(t)
    );
  }, [catalog, q]);

  const flagship = filtered.filter((l) => l.flagshipV1);
  const more = filtered.filter((l) => !l.flagshipV1);
  const prefix = mode === "employer" ? "/hr" : "/me";

  return (
    <Box className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[
          { label: mode === "employer" ? "HR / Management" : "Employee", href: prefix },
          { label: "New letter" },
        ]}
        title="Browse letter types"
        lede={
          mode === "employer"
            ? "14 letter types covering hiring, performance, separation, and immigration. UK + US legal language baked in."
            : "21 letter types covering grievances, resignation, accommodation, whistleblowing, and tribunal-bound cover. UK + US rights-preservation language baked in."
        }
        closeTo={prefix}
        actions={
          <TextField.Root
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search letters…"
            size="2"
            className="w-full sm:w-64"
          >
            <TextField.Slot>
              <Search className="size-3.5" />
            </TextField.Slot>
          </TextField.Root>
        }
      />

      {flagship.length > 0 && (
        <Box mb="6">
          <Heading size="3" mb="3">Flagship letters</Heading>
          <Grid columns={{ initial: "1", md: "2", lg: "3" }} gap="3">
            {flagship.map((l) => {
              const tplReady = hasTemplate(l.id, profile.defaults.jurisdiction);
              return (
                <Card key={l.id} size="2" className="group hover:border-[var(--accent-7)] transition-colors">
                  <Flex direction="column" gap="2" className="h-full">
                    <button onClick={() => nav(`${prefix}/new/${l.id}`)} className="text-left w-full cursor-pointer">
                      <Flex justify="between" align="center" mb="2">
                        <Badge color={RISK[l.riskClass]} variant="soft">{l.riskClass} risk</Badge>
                        <ArrowUpRight className="size-4 text-[var(--gray-9)] opacity-0 group-hover:opacity-100 transition" />
                      </Flex>
                      <Heading size="3" weight="medium">{l.title}</Heading>
                      <Text size="2" color="gray" className="leading-relaxed" as="p" mt="1">{l.description}</Text>
                      {l.badge && (
                        <Text size="1" weight="medium" color="red" mt="2" as="div">⚠ {l.badge}</Text>
                      )}
                    </button>
                    <Flex gap="2" mt="auto" pt="2">
                      <Button size="1" variant="soft" color="gray" onClick={() => nav(`${prefix}/new/${l.id}`)}>
                        Use wizard
                      </Button>
                      {tplReady && (
                        <Button size="1" onClick={() => startFromTemplate(l.id)}>
                          <Zap className="size-3" /> Skip — use template
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                </Card>
              );
            })}
          </Grid>
        </Box>
      )}

      {more.length > 0 && (
        <Box>
          <Heading size="3" mb="3">More letter types</Heading>
          <Grid columns={{ initial: "1", md: "2", lg: "3" }} gap="3">
            {more.map((l) => (
              <Card key={l.id} asChild size="1" className="cursor-pointer hover:border-[var(--accent-7)] transition-colors">
                <button onClick={() => nav(`${prefix}/new/${l.id}`)} className="text-left w-full">
                  <Flex justify="between" align="center" mb="1">
                    <Text size="2" weight="medium">{l.shortTitle}</Text>
                    <Badge color={RISK[l.riskClass]} variant="soft">{l.riskClass}</Badge>
                  </Flex>
                  <Text size="1" color="gray" className="leading-relaxed line-clamp-3" as="p">{l.description}</Text>
                </button>
              </Card>
            ))}
          </Grid>
        </Box>
      )}

      {filtered.length === 0 && (
        <Card size="2">
          <Text align="center" size="2" color="gray" as="p" className="py-8">
            No letters matched <Text weight="medium" color="gray" highContrast>"{q}"</Text>. Try a different keyword.
          </Text>
        </Card>
      )}
    </Box>
  );
}
