import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAllowedEmbeddedImageFile,
  isSafeImageDataUrl,
  SAFE_IMAGE_ACCEPT,
} from "@/lib/safe-data-url";
import { imageUploadScope, uploadImage } from "@/lib/storage/uploadImage";
import { toast } from "sonner";

const MAX_BYTES = 1024 * 1024; // 1 MB

const ASPECT: Record<"banner" | "signature" | "square", { className: string; hint: string }> = {
  banner: { className: "aspect-[4/1] w-full", hint: "Recommended ~800 × 200" },
  signature: { className: "aspect-[3/1] w-64", hint: "Recommended ~600 × 200" },
  square: { className: "aspect-square w-32", hint: "" },
};

/**
 * Uploads a small image (letterhead / signature). Reads the file as a
 * transient data URL, then stores private bytes before persisting a short
 * authenticated URL. Neither leaving this form nor switching workspaces can
 * apply a stale upload to a different record.
 */
export function ImageUploader({
  value,
  onChange,
  aspect = "banner",
  helpText,
}: {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  aspect?: "banner" | "signature" | "square";
  helpText?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; }, []);
  const [busy, setBusy] = useState(false);
  const a = ASPECT[aspect];

  const onPick = (file: File) => {
    if (!isAllowedEmbeddedImageFile(file)) {
      alert("Please use a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use one under 1 MB.`);
      return;
    }
    let scope: ReturnType<typeof imageUploadScope>;
    try { scope = imageUploadScope(); }
    catch { toast.error("Wait for your workspace to finish loading before uploading."); return; }
    const attempt = ++operation.current;
    const active = () => attempt === operation.current;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (!active()) return;
        const url = typeof reader.result === "string" ? reader.result : undefined;
        if (!isSafeImageDataUrl(url)) throw new Error("Unsupported image");
        const stored = await uploadImage({ dataUrl: url, filename: file.name }, scope);
        if (active() && (!scope || scope.isCurrent())) onChange(stored);
      } catch {
        if (active()) toast.error("Image upload failed. Your existing image was not changed.");
      } finally {
        if (active()) setBusy(false);
      }
    };
    reader.onerror = () => {
      if (active()) { setBusy(false); toast.error("Couldn't read that file. Your existing image was not changed."); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={SAFE_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-start gap-3">
          <div
            className={
              "rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] grid place-items-center overflow-hidden " +
              a.className
            }
          >
            <img src={value} alt="Uploaded branding image" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-3.5" /> {busy ? "Uploading…" : "Replace"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              color="gray"
              onClick={() => onChange(undefined)}
              disabled={busy}
            >
              <X className="size-3.5" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={
            "flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--ds-line)] hover:border-[var(--ds-ink)] bg-[var(--ds-surface-2)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] cursor-pointer transition disabled:cursor-wait disabled:opacity-60 " +
            a.className
          }
        >
          <Upload className="size-4" />
          <span className="text-[12px] font-medium">{busy ? "Uploading…" : "Upload image"}</span>
          {a.hint && <span className="text-[10px]">{a.hint}</span>}
        </button>
      )}
      {helpText && (
        <p className="text-[11px] text-[var(--ds-muted)] mt-1.5 leading-relaxed">{helpText}</p>
      )}
    </div>
  );
}
