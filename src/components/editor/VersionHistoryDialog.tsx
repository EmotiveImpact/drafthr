import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Section } from "@/lib/letters/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Version history — {section.title}</DialogTitle>
          <DialogDescription>
            Earlier drafts of this section. Click a version to preview, then
            restore.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[200px_1fr] gap-4 h-[400px]">
          <ScrollArea className="border rounded-md">
            <div className="p-2 space-y-0.5">
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-sm ${
                    sel?.id === v.id ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                  onClick={() => setSelected(v.id)}
                >
                  v{versions.length - i} — {new Date(v.createdAt).toLocaleString()}
                </button>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="border rounded-md">
            <div
              className="p-4 prose prose-sm max-w-none [&_p]:my-2 [&_p]:leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(sel?.html ?? "") }}
            />
          </ScrollArea>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!sel}
            onClick={() => {
              if (sel) onRestore(sel.html);
            }}
          >
            Restore this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
