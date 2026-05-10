import { Box, Button, Dialog, Flex, Grid, ScrollArea } from "@radix-ui/themes";
import type { Section } from "@/lib/letters/types";
import { useState } from "react";
import { sanitizeLetterHtml } from "@/lib/sanitize";

type Props = {
  open: boolean;
  onClose: () => void;
  section: Section | null;
  onRestore: (html: string) => void;
};

export function VersionHistoryDialog({ open, onClose, section, onRestore }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!section) return null;
  const versions = [...section.versions].reverse();
  const sel = versions.find((v) => v.id === selected) ?? versions[0];

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="800px">
        <Dialog.Title>Version history — {section.title}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Earlier drafts of this section. Click a version to preview, then
          restore.
        </Dialog.Description>

        <Grid columns="200px 1fr" gap="3" style={{ height: 400 }}>
          <Box style={{ border: "1px solid var(--gray-5)", borderRadius: "var(--radius-3)" }}>
            <ScrollArea>
              <Flex direction="column" gap="1" p="2">
                {versions.map((v, i) => (
                  <button
                    key={v.id}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-sm cursor-pointer"
                    style={{
                      background: sel?.id === v.id ? "var(--accent-3)" : undefined,
                    }}
                    onClick={() => setSelected(v.id)}
                  >
                    v{versions.length - i} — {new Date(v.createdAt).toLocaleString()}
                  </button>
                ))}
              </Flex>
            </ScrollArea>
          </Box>
          <Box style={{ border: "1px solid var(--gray-5)", borderRadius: "var(--radius-3)" }}>
            <ScrollArea>
              <Box
                p="4"
                className="prose prose-sm max-w-none [&_p]:my-2 [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(sel?.html ?? "") }}
              />
            </ScrollArea>
          </Box>
        </Grid>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" onClick={onClose}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            disabled={!sel}
            onClick={() => {
              if (sel) onRestore(sel.html);
            }}
          >
            Restore this version
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
