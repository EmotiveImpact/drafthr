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
          className="z-50 w-[320px] rounded-[12px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-3 text-[13px] shadow-[var(--ds-shadow-l)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 duration-[160ms] data-[state=closed]:duration-[100ms]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-3.5 text-[var(--ds-muted)]" />
            <h4 className="m-0 text-[12.5px] font-medium text-[var(--ds-ink)]">Quick rewrites</h4>
          </div>
          <SmartRewriteMenu disabled={disabled} onRun={runSmartRewrite} />
          <div className="my-3 h-px bg-[var(--ds-line-2)]" />
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Or say what to change in this section"
            aria-label="Refine instruction"
            rows={3}
            className="w-full resize-y rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-2 text-[13px] text-[var(--ds-ink)] focus:border-[var(--ds-line-strong)] focus:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
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
              <RotateCcw className="size-3 mr-1" /> Redraft
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
                Refine
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--ds-subtle)]">
            Ctrl or Cmd + Enter to send. The change arrives as a suggested edit.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
