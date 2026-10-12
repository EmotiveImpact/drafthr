import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Link as LinkIcon,
  ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Draft } from "@/lib/letters/types";
import { EvidencePickerPopover } from "./EvidencePickerPopover";
import { EvidenceDrawer } from "./EvidenceDrawer";
import {
  isAllowedEmbeddedImageFile,
  isSafeImageDataUrl,
  SAFE_IMAGE_ACCEPT,
} from "@/lib/safe-data-url";

const MAX_EMBED_BYTES = 5 * 1024 * 1024;

export async function fileToDataUrl(file: File): Promise<string | null> {
  if (!isAllowedEmbeddedImageFile(file)) {
    alert("Please use a PNG, JPEG, WEBP, or GIF image.");
    return null;
  }
  if (file.size > MAX_EMBED_BYTES) {
    alert(
      `${file.name} is larger than 5 MB. Use the Evidence step instead. That path keeps the original file at full quality.`
    );
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      resolve(isSafeImageDataUrl(result) ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function EditorToolbar({
  editor,
  draft,
}: {
  editor: Editor | null;
  draft?: Draft;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [evidencePickerOpen, setEvidencePickerOpen] = useState(false);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  if (!editor) return null;

  const evidenceCount = draft?.evidence?.length ?? 0;
  const hasEvidence = evidenceCount > 0;

  const onPickImage = () => fileInputRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const src = await fileToDataUrl(file);
    if (src) {
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b border-letter-rule bg-white sticky top-0 z-10 flex-wrap">
      <input
        ref={fileInputRef}
        type="file"
        accept={SAFE_IMAGE_ACCEPT}
        className="hidden"
        onChange={onFileChosen}
      />

      {/* Marks: bold/italic */}
      <ToolBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic className="size-3.5" />
      </ToolBtn>

      {/* Block: headings H2 + H3 */}
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
      >
        <Heading2 className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Heading 3"
      >
        <Heading3 className="size-3.5" />
      </ToolBtn>

      <span className="w-px h-4 bg-letter-rule mx-1" />

      {/* Lists */}
      <ToolBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullets"
      >
        <List className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered className="size-3.5" />
      </ToolBtn>

      <span className="w-px h-4 bg-letter-rule mx-1" />

      {/* Text alignment — Word-doc style */}
      <ToolBtn
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        label="Align left"
      >
        <AlignLeft className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        label="Align centre"
      >
        <AlignCenter className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        label="Align right"
      >
        <AlignRight className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        label="Justify"
      >
        <AlignJustify className="size-3.5" />
      </ToolBtn>

      <span className="w-px h-4 bg-letter-rule mx-1" />

      {/* Link + Image */}
      <ToolBtn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = prompt("URL", prev ?? "https://");
          if (url == null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        label="Link"
      >
        <LinkIcon className="size-3.5" />
      </ToolBtn>
      <ToolBtn onClick={onPickImage} label="Insert image (or paste / drag-drop)">
        <ImageIcon className="size-3.5" />
      </ToolBtn>

      {/* Evidence picker. Pattern A discoverability fix: the paperclip is
       * ALWAYS visible when we have a draft handle. When evidence exists,
       * the paperclip opens the inline popover (which itself offers a
       * "See all evidence →" overflow at 5+ items, routing into the
       * Pattern D drawer). When no evidence exists yet, the button is
       * visually muted + disabled with a tooltip explaining how to
       * populate the Evidence step. */}
      {draft && hasEvidence && (
        <EvidencePickerPopover
          draft={draft}
          editor={editor}
          open={evidencePickerOpen}
          onOpenChange={setEvidencePickerOpen}
          onOpenDrawer={() => setEvidenceDrawerOpen(true)}
          trigger={
            <ToolBtn
              onClick={() => setEvidencePickerOpen((v) => !v)}
              active={evidencePickerOpen}
              label={`Insert evidence at cursor (${evidenceCount} ${
                evidenceCount === 1 ? "item" : "items"
              })`}
            >
              <Paperclip className="size-3.5" />
            </ToolBtn>
          }
        />
      )}
      {draft && !hasEvidence && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Wrapper div is needed so Radix Tooltip still fires on a
               * disabled button (browsers swallow pointer events on
               * <button disabled>). */}
              <span className="inline-flex">
                <ToolBtn
                  onClick={() => {
                    /* no-op — disabled; tooltip explains why */
                  }}
                  disabled
                  label="Add evidence on the Evidence step first to insert citations"
                  muted
                >
                  <Paperclip className="size-3.5" />
                </ToolBtn>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px] text-center">
              Add evidence on the Evidence step first to insert{" "}
              <span className="font-semibold">[See Fig N]</span> citations
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {/* Dedicated drawer (Pattern D). Mounted unconditionally when we
       * have a draft + at least one evidence item so the popover's
       * "See all evidence →" handoff has a target. */}
      {draft && hasEvidence && (
        <EvidenceDrawer
          draft={draft}
          editor={editor}
          open={evidenceDrawerOpen}
          onOpenChange={setEvidenceDrawerOpen}
        />
      )}

      <span className="w-px h-4 bg-letter-rule mx-1" />

      {/* History */}
      <ToolBtn
        onClick={() => editor.chain().focus().undo().run()}
        label="Undo"
        disabled={!editor.can().undo()}
      >
        <Undo2 className="size-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().redo().run()}
        label="Redo"
        disabled={!editor.can().redo()}
      >
        <Redo2 className="size-3.5" />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  label,
  disabled,
  muted,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /** Visually faded but still rendered — used for the disabled evidence
   * paperclip so users can discover it before they've added evidence. */
  muted?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={muted ? undefined : label /* let Tooltip own the title when muted */}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-7 rounded-sm",
        active && "bg-secondary text-secondary-foreground",
        muted && "opacity-40"
      )}
    >
      {children}
    </Button>
  );
}
