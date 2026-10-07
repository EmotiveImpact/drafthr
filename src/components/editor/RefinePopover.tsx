import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartRewriteMenu } from "./SmartRewriteMenu";

/**
 * Per-section regenerate popover. Two paths from a single trigger:
 *  - "Regenerate" — refresh this section with the same prompt (legacy behaviour)
 *  - Submit the textarea — regenerate THIS section with the given user
 *    refinement plumbed through buildSectionPrompt as USER REFINEMENT.
 *
 * Lives on each SectionEditor's header. Prefilled chip presets cover the most
 * common asks; everything else is freeform.
 */
export function RefinePopover({
  disabled,
  onRefineRegenerate,
  onPlainRegenerate,
  trigger,
}: {
  disabled?: boolean;
  onRefineRegenerate: (instruction: string) => void;
  onPlainRegenerate: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onRefineRegenerate(text);
    setOpen(false);
    setBody("");
  };

  const runSmartRewrite = (instruction: string) => {
    onRefineRegenerate(instruction);
    setOpen(false);
    setBody("");
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[320px] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_10px_24px_rgba(15,17,21,0.10),0_1px_3px_rgba(15,17,21,0.04)] p-3 text-[13px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-3.5 text-[var(--ds-muted)]" />
            <h4 className="text-[12px] font-semibold text-[var(--ds-ink)] m-0">Smart rewrite</h4>
          </div>
          <SmartRewriteMenu disabled={disabled} onRun={runSmartRewrite} />
          <div className="my-3 h-px bg-[var(--ds-line-2)]" />
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Custom rewrite instruction"
            rows={3}
            className="w-full text-[12px] px-2.5 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                onPlainRegenerate();
                setOpen(false);
              }}
            >
              <RotateCcw className="size-3 mr-1" /> Plain regenerate
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  setOpen(false);
                  setBody("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px]"
                disabled={!body.trim()}
                onClick={submit}
              >
                Regenerate with refinement
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-[var(--ds-subtle)] mt-2">
            ⌘ + Enter to submit
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
