import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2, Undo2, Redo2, Link as LinkIcon, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_EMBED_BYTES = 5 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string | null> {
  if (file.size > MAX_EMBED_BYTES) {
    alert(
      `${file.name} is larger than 5 MB. Use the 📎 evidence button instead — that path keeps the original file at full quality.`
    );
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!editor) return null;

  const onPickImage = () => fileInputRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !file.type.startsWith("image/")) return;
    const src = await fileToDataUrl(file);
    if (src) {
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b border-letter-rule bg-white sticky top-0 z-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFileChosen}
      />
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
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading"
      >
        <Heading2 className="size-3.5" />
      </ToolBtn>
      <span className="w-px h-4 bg-letter-rule mx-1" />
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
      <span className="w-px h-4 bg-letter-rule mx-1" />
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
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-7 rounded-sm",
        active && "bg-secondary text-secondary-foreground"
      )}
    >
      {children}
    </Button>
  );
}
