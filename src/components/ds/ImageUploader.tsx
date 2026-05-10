import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 1024 * 1024; // 1 MB

const ASPECT: Record<"banner" | "signature" | "square", { className: string; hint: string }> = {
  banner: { className: "aspect-[4/1] w-full", hint: "Recommended ~800 × 200" },
  signature: { className: "aspect-[3/1] w-64", hint: "Recommended ~600 × 200" },
  square: { className: "aspect-square w-32", hint: "" },
};

/**
 * Uploads a small image and stores it as a base64 data URL on whatever
 * value sink the parent provides. Used for letterhead + signature on the
 * profile (and per-draft via Edit-details).
 *
 * The data-URL approach keeps everything client-side — no upload API
 * required — and round-trips cleanly through localStorage and the export
 * pipeline (html2pdf and html-to-docx both inline data URLs).
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
  const a = ASPECT[aspect];

  const onPick = (file: File) => {
    if (file.size > MAX_BYTES) {
      alert(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use one under 1 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : undefined;
      if (url) onChange(url);
    };
    reader.onerror = () => alert("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
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
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={value} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="size-3.5" /> Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              color="gray"
              onClick={() => onChange(undefined)}
            >
              <X className="size-3.5" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={
            "flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--ds-line)] hover:border-[var(--ds-ink)] bg-[var(--ds-surface-2)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] cursor-pointer transition " +
            a.className
          }
        >
          <Upload className="size-4" />
          <span className="text-[12px] font-medium">Upload image</span>
          {a.hint && <span className="text-[10px]">{a.hint}</span>}
        </button>
      )}
      {helpText && (
        <p className="text-[11px] text-[var(--ds-muted)] mt-1.5 leading-relaxed">{helpText}</p>
      )}
    </div>
  );
}
