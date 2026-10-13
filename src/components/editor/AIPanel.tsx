import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { Markdown } from "./Markdown";
import { ArrowUp, Sparkles, Wand2, Loader2, Check, AlertCircle, RotateCw, Plus, Minus, FileText, Copy, PanelRight, Pin, PinOff, FlaskConical, SquarePen, SlidersHorizontal, Paperclip, Bookmark, ChevronDown, Square, TextSelect } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diff-view-mode";
import { hasPendingSuggestions } from "@/lib/tiptap/suggestion-merge";
import { uid } from "@/lib/utils";
import type { AIChatScope, Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { agentErrorMessage, buildAgentSystemPrompt, buildLetterContextMessage } from "@/lib/llm/agent";
import { captureRuntimeContext } from "@/lib/llm/runtime-context";
import { DEFAULT_MODEL } from "@/lib/llm/default-model";
import { regenerateSectionAsPending } from "@/lib/llm/draft";
import { CLAUSE_TEMPLATES, type ClauseType } from "@/lib/llm/tools";
import { getRecentPrompts, pushRecentPrompt } from "@/lib/recent-prompts";

/**
 * Quick-prompt chips. Each maps to one of the four typed tools so the
 * user discovers what the agent can actually DO without having to read
 * docs. The model decides which tool to call — these prompts are worded
 * to make the right choice obvious.
 *
 * Tool mapping:
 *   - "make formal" / "tribunal-ready"  → regenerateSection (per affected section)
 *   - "tighten body to X words"         → tightenSection
 *   - "add IP / confidentiality clause" → addClause
 *   - "summarise for counsel"           → summariseForCounsel
 */
/**
 * Starter prompts shown in the empty-state grid — one per typed tool, so
 * a first-time user discovers what the agent can do at a glance. Pulled
 * from QUICK_PROMPTS but with icons + a one-line hint for discoverability.
 */
const STARTER_PROMPTS: {
  label: string;
  hint: string;
  Icon: typeof Wand2;
  prompt: string;
}[] = [
  {
    label: "Make it tribunal-ready",
    hint: "Strict, factual, statutory anchors explicit.",
    Icon: Sparkles,
    prompt:
      "Rewrite this letter to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit. Walk through each section that needs changing.",
  },
  {
    label: "Tighten to ~180 words",
    hint: "Cut adjectives without dropping facts or clauses.",
    Icon: Minus,
    prompt:
      "Tighten the body section to approximately 180 words. Preserve every fact, citation, and required clause. Cut adjectives and throat-clearing.",
  },
  {
    label: "Add a confidentiality clause",
    hint: "Three-year survival post-termination by default.",
    Icon: Plus,
    prompt:
      "Add a confidentiality clause to the terms section. Three-year survival post-termination unless the contract provides otherwise.",
  },
  {
    label: "Summarise for counsel",
    hint: "One-paragraph brief covering risks + remedies.",
    Icon: FileText,
    prompt:
      "Summarise this letter for counsel: one paragraph covering the legal posture, key risks, remedies sought, and any open factual questions.",
  },
];

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  // regenerateSection
  {
    label: "Tribunal-ready tone",
    prompt:
      "Rewrite this letter to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit. Walk through each section that needs changing.",
  },
  {
    label: "Make formal",
    prompt:
      "Rewrite this letter in a more formal register. Remove contractions, use full clause names, keep every statutory citation intact.",
  },
  // tightenSection
  {
    label: "Tighten body to ~180 words",
    prompt:
      "Tighten the body section to approximately 180 words. Preserve every fact, citation, and required clause. Cut adjectives and throat-clearing.",
  },
  // addClause
  {
    label: "+ Confidentiality clause",
    prompt:
      "Add a confidentiality clause to the terms section. Three-year survival post-termination unless the contract provides otherwise.",
  },
  {
    label: "+ IP-assignment clause",
    prompt:
      "Add an IP-assignment clause to the terms section: all work-product vests in the employer, recipient assigns and waives moral rights so far as the law permits.",
  },
  {
    label: "+ Reservation of rights",
    prompt:
      "Add an explicit reservation-of-rights paragraph to the closing: statutory, contractual, common-law remedies, and the right to bring tribunal / agency proceedings.",
  },
  // summariseForCounsel
  {
    label: "Summarise for counsel",
    prompt:
      "Summarise this letter for an external employment-law adviser. Cover (1) what the letter says, (2) what it relies on, (3) what it asks for, (4) key risk points.",
  },
];

const SCOPE_LABEL: Record<AIChatScope, string> = {
  letter: "whole letter",
  section: "section",
  selection: "selection",
};

type RegenerateInput = { section_id: string; instruction: string };
type AddClauseInput = {
  section_id: string;
  clause_type: ClauseType;
  position?: "append" | "prepend" | "replace_paragraph";
  note?: string;
};
type TightenInput = { section_id: string; target_words: number };
type SummariseInput = { audience?: "counsel" | "hr_partner" | "self"; note?: string };

/**
 * Right-rail AI tab — SDK-native v6 tool-calling.
 *
 *  - Transport: DefaultChatTransport against /api/agent with a
 *    prepareSendMessagesRequest that re-injects the live system prompt
 *    and model on every send, and ships full UIMessages so tool-call
 *    history rides along.
 *  - Tools: server schemas live in server/agent-tools.ts. Mutating tools are
 *    HUMAN-IN-THE-LOOP — no server-side execute. The model streams a `tool-*`
 *    part with proposed args; the user reviews + clicks Apply; we run the
 *    local draft operation and push the outcome back via addToolResult() so
 *    the agent can continue reasoning.
 */
export function AIPanel({
  draft,
  activeSectionId,
  onCollapse,
  onPin,
  onUnpin,
  isPinned,
  variant = "panel",
  replaceThread,
  threadKey,
  onSent,
  onOpenEvidence,
  chips,
}: {
  draft: Draft;
  activeSectionId: string | null;
  /** Optional desktop rail-collapse handler. When supplied, a PanelRight
   * chevron renders at the far right of the header row. Editor passes this
   * so the chevron lives on the same line as "AI agent · model · date". */
  onCollapse?: () => void;
  /** Convert the rail to "pinned" mode. When supplied, renders a pin button
   * next to the collapse chevron. Pin is mutually exclusive with Evidence pin
   * — the parent enforces this via the shared `pinnedDock` state. */
  onPin?: () => void;
  /** Unpin the AI rail (returns to twin pills). When supplied and isPinned is
   * true, clicking the pin button will call this instead of onPin. */
  onUnpin?: () => void;
  isPinned?: boolean;
  /** "panel" (default): the 14B side panel. "rail": legacy rail chrome. */
  variant?: "rail" | "panel";
  /** When set, replaces the chat thread above the composer (the side
   * panel's Edits and Progress tabs) so the composer stays pinned on every
   * tab while the conversation keeps its state. */
  replaceThread?: ReactNode;
  /** Identifies what replaceThread shows (the side panel tab). When it
   * changes the scroller returns to the top, or to the latest message for
   * the chat thread. */
  threadKey?: string;
  /** Called after a message is sent (the side panel switches to Chat). */
  onSent?: () => void;
  /** Opens the letter's evidence (the composer's Files button). */
  onOpenEvidence?: () => void;
  /** Prompt chips above the box, fitting the letter's stage. A click sends. */
  chips?: { label: string; prompt: string }[];
}) {
  const profile = useProfileStore((s) => s.profile);

  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const proposeSectionChange = useDraftStore((s) => s.proposeSectionChange);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);
  const clearAIChat = useDraftStore((s) => s.clearAIChat);
  const recordTimelineEvent = useDraftStore((s) => s.recordTimelineEvent);
  const acceptAllSuggestions = useDraftStore((s) => s.acceptAllSuggestions);
  const rejectAllSuggestions = useDraftStore((s) => s.rejectAllSuggestions);

  // Track-changes affordance — derive once per draft change whether any
  // section still has pending suggestion marks. Cheap because the helper
  // string-probes before any DOM parse. Drives the Accept/Reject strip.
  const anyPending = useMemo(
    () => draft.sections.some((sec) => hasPendingSuggestions(sec.html)),
    [draft.sections]
  );

  const [scope, setScope] = useState<AIChatScope>("letter");
  const [input, setInput] = useState("");
  const [recentPrompts, setRecentPrompts] = useState<string[]>(() => getRecentPrompts());

  const scopeSection: Section | undefined = useMemo(() => {
    if (scope !== "section") return undefined;
    return draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  }, [scope, draft.sections, activeSectionId]);

  // Hydrate initial messages from persisted chat once per draft id.
  /** Today + timezone for the visible "Today · X" pill in the header.
   * Captured once per render but cheap (just `new Date()`). */
  const runtimeCtx = useMemo(
    () => captureRuntimeContext(draft.context.jurisdiction),
    [draft.context.jurisdiction]
  );

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (draft.aiChat ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text", text: m.body }],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id]
  );

  // useChat constructs its internal Chat once per `id` (agent-${draft.id}) and
  // captures the transport at construction — a transport rebuilt mid-draft is
  // NOT adopted. So the transport must have a stable identity and read live
  // values at send time via refs; otherwise every request ships the mount-time
  // letter snapshot (stale section list/recipient) and mount-time model, even
  // after the user edits the draft or changes the model in Settings.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const modelRef = useRef(profile.defaults.qwenModel);
  modelRef.current = profile.defaults.qwenModel;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            // Strip any tool-call parts that don't have a result. v6's
            // OpenAI-compatible adapter throws AI_MissingToolResultsError
            // if it sees a tool_call without a matching tool_result; if
            // the user ignored a proposal, the cleanest thing to do is
            // drop it so the agent moves on.
            // The live letter text rides along as a leading user-role context
            // message (the endpoint rejects system-role messages). Without it
            // the agent only saw section titles and invented the content of
            // "Summarise for counsel".
            messages: [buildLetterContextMessage(draftRef.current), ...stripPendingToolCalls(messages)],
            system: buildAgentSystemPrompt(draftRef.current),
            model: modelRef.current,
            ...(body ?? {}),
          },
        }),
      }),
    []
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    regenerate,
    status,
    error,
    addToolResult,
  } = useChat({
    id: `agent-${draft.id}`,
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[AIPanel] useChat error:", err);
    },
  });

  // Persist text content of messages to the store on each idle tick.
  // Skipped during streaming to avoid hammering localStorage on every
  // token — the unmount cleanup below catches any in-flight state.
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    persistMessagesToStore(draft.id, messages);
  }, [messages, status, draft.id]);

  // Unmount snapshot — fires when the AIPanel is about to disappear
  // (viewport resize across the desktop/mobile breakpoint, draft
  // switch, focus mode toggle). Captures the latest messages
  // regardless of stream status so a mid-stream resize doesn't lose
  // the partial assistant response. We use a ref so the cleanup
  // function always sees the freshest messages — the effect itself
  // only runs once per draft id, so a closure over `messages` would
  // be stale.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    return () => {
      persistMessagesToStore(draft.id, messagesRef.current);
    };
  }, [draft.id]);

  // Apply / addClause / tighten each run their OWN streaming LLM call
  // (regenerateSectionAsPending), separate from the chat stream. Track their
  // AbortControllers so the composer Stop button — and unmount — can cancel an
  // in-flight Apply, not just the chat. applyingCount drives the Stop
  // affordance because by the time a tool-call is being applied the chat status
  // is "ready", so isStreaming alone would hide it.
  const applyAbortsRef = useRef<Set<AbortController>>(new Set());
  const [applyingCount, setApplyingCount] = useState(0);

  const stopAll = useCallback(() => {
    stop();
    for (const c of applyAbortsRef.current) c.abort();
    applyAbortsRef.current.clear();
  }, [stop]);

  // Abort any in-flight section regen if the panel unmounts (draft switch,
  // focus-mode toggle, desktop/mobile breakpoint) so it can't keep mutating a
  // section after the user has navigated away.
  useEffect(() => {
    const aborts = applyAbortsRef.current;
    return () => {
      for (const c of aborts) c.abort();
      aborts.clear();
    };
  }, []);

  const scopeLabel =
    scope === "section" && scopeSection
      ? `section "${scopeSection.title}" (id=${scopeSection.id})`
      : SCOPE_LABEL[scope];

  /** Capture window selection so AI scope=selection has the live quote. */
  const captureSelection = (): { quote: string; sectionId?: string } | null => {
    if (typeof window === "undefined") return null;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const quote = sel.toString().trim();
    if (!quote) return null;
    const range = sel.getRangeAt(0);
    const startEl: Element | null =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const sectionEl = startEl?.closest?.("[data-section-id]") as HTMLElement | null;
    return { quote, sectionId: sectionEl?.getAttribute("data-section-id") ?? undefined };
  };

  const submit = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const text = (override ?? input).trim();
    if (!text || status === "streaming" || status === "submitted") return;
    // Don't fire a new chat turn while a section regen is mutating the draft.
    if (applyAbortsRef.current.size > 0) return;

    let resolvedLabel = scopeLabel;
    let scopePayload = "";
    if (scope === "selection") {
      const captured = captureSelection();
      if (captured) {
        const sec = captured.sectionId
          ? draft.sections.find((s) => s.id === captured.sectionId)
          : undefined;
        resolvedLabel = sec
          ? `selection in section "${sec.title}" (id=${sec.id})`
          : "selection";
        scopePayload = `\n[selection: "${captured.quote}"${
          captured.sectionId ? ` from section_id=${captured.sectionId}` : ""
        }]`;
      } else {
        resolvedLabel = "whole letter (no active selection)";
      }
    }

    const scoped = `${text}\n[scope: ${resolvedLabel}]${scopePayload}`;
    if (override === undefined) setInput("");
    setRecentPrompts(pushRecentPrompt(text));
    onSent?.();
    await sendMessage({ text: scoped });
  };

  const isStreaming = status === "streaming" || status === "submitted";
  // "busy" = chat is streaming OR a section regen (Apply/addClause/tighten) is
  // in flight. Drives the composer Stop affordance and input gating.
  const busy = isStreaming || applyingCount > 0;

  // Auto-scroll the message list to the bottom as new messages arrive.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || replaceThread !== undefined) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);

  /**
   * Execute a proposed regenerateSection tool call. Runs the actual
   * regeneration via the existing draft pipeline, then pushes the
   * outcome back to the model via addToolResult so it can continue
   * reasoning ("OK, I rewrote section X — want me to do Y next?").
   */
  /**
   * Shared helper — regen a section as a PENDING CHANGE (Cursor-style
   * review). The user reviews the diff card on the section and clicks
   * Accept or Reject. section.html is not touched until Accept.
   *
   * Optional source: lets the caller (addClause / tighten / regenerate)
   * label the change for the audit trail.
   */
  const runSectionRegen = async (
    sectionId: string,
    instruction: string,
    source: "regenerate" | "addClause" | "tighten" = "regenerate"
  ): Promise<Section> => {
    const section = draft.sections.find((s) => s.id === sectionId);
    if (!section) throw new Error(`Unknown section_id: ${sectionId}`);
    // Register the controller so Stop / unmount can abort this regen; bump the
    // applying count so the Stop button is shown while it runs.
    const ctl = new AbortController();
    applyAbortsRef.current.add(ctl);
    setApplyingCount((n) => n + 1);
    try {
      await regenerateSectionAsPending(
        draft,
        section,
        { appendToSection, setSectionStatus, pushSectionVersion, updateSection, proposeSectionChange },
        ctl.signal,
        {},
        instruction,
        source
      );
      // The section could have been deleted DURING the (multi-second) stream.
      // proposeSectionChange silently no-ops on a missing section, so without
      // this check the tool call would report ok:true and the UI would show
      // "Applied" for a proposal that was never set. Detect it here and throw
      // so the caller's catch reports ok:false instead.
      const liveDraft = useDraftStore.getState().drafts[draft.id];
      if (!liveDraft?.sections.some((s) => s.id === sectionId)) {
        throw new Error(`Section was removed while the AI was editing it: ${sectionId}`);
      }
      return section;
    } finally {
      applyAbortsRef.current.delete(ctl);
      setApplyingCount((n) => Math.max(0, n - 1));
    }
  };

  const applyRegenerate = async (
    toolCallId: string,
    input: RegenerateInput
  ): Promise<void> => {
    try {
      const section = await runSectionRegen(input.section_id, input.instruction);
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: true, section_id: section.id, section_title: section.title },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Applied AI rewrite to ${section.title}`,
        detail: input.instruction,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "regenerateSection" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: false, error: msg },
      });
    }
  };

  /**
   * addClause — resolve clause_type to a concrete instruction via
   * CLAUSE_TEMPLATES, then delegate to runSectionRegen. position +
   * optional note are folded into the instruction text.
   */
  const applyAddClause = async (toolCallId: string, input: AddClauseInput): Promise<void> => {
    const template = CLAUSE_TEMPLATES[input.clause_type];
    const positionDirective =
      input.position === "prepend"
        ? "Insert the new clause at the START of this section, before any existing content."
        : input.position === "replace_paragraph"
        ? "Replace the existing paragraph that covers this topic. If no such paragraph exists, append."
        : "Append the new clause at the END of this section, after existing content.";
    const noteBit = input.note ? `\nUser note: ${input.note}` : "";
    const instruction = `${template}\n\n${positionDirective}${noteBit}`;

    try {
      const section = await runSectionRegen(input.section_id, instruction, "addClause");
      addToolResult({
        tool: "addClause",
        toolCallId,
        output: { ok: true, section_id: section.id, section_title: section.title, clause_type: input.clause_type },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Added ${input.clause_type.replace(/_/g, " ")} clause`,
        detail: input.note,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "addClause", clauseType: input.clause_type },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({ tool: "addClause", toolCallId, output: { ok: false, error: msg } });
    }
  };

  /**
   * tightenSection — pass target_words as part of the instruction so the
   * section prompt picks it up via USER REFINEMENT.
   */
  const applyTighten = async (toolCallId: string, input: TightenInput): Promise<void> => {
    const instruction = `Rewrite this section to approximately ${input.target_words} words. Preserve every fact, citation, and structural requirement (statutory anchors, required clauses, headings). Cut redundancy, adjectives, throat-clearing, and any non-load-bearing sentence. Do NOT drop required content.`;
    try {
      const section = await runSectionRegen(input.section_id, instruction, "tighten");
      addToolResult({
        tool: "tightenSection",
        toolCallId,
        output: {
          ok: true,
          section_id: section.id,
          section_title: section.title,
          target_words: input.target_words,
        },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Tightened ${section.title}`,
        detail: `Target ${input.target_words} words`,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "tightenSection", targetWords: input.target_words },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({ tool: "tightenSection", toolCallId, output: { ok: false, error: msg } });
    }
  };

  /**
   * summariseForCounsel — non-mutating. We just acknowledge the call
   * back to the model so it knows the marker landed. The actual
   * summary is in the model's text reply.
   */
  const applySummarise = useCallback((toolCallId: string, input: SummariseInput): void => {
    addToolResult({
      tool: "summariseForCounsel",
      toolCallId,
      output: { ok: true, audience: input.audience ?? "counsel" },
    });
  }, [addToolResult]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Grow the composer with its content, up to the cap set in CSS.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const scopeChipLabel =
    scope === "section" && scopeSection
      ? scopeSection.title
      : scope === "selection"
        ? "Selected text"
        : "Whole letter";

  const showThread = replaceThread === undefined;
  const nav = useNavigate();

  // Prompts sent from elsewhere in the workspace (chips, a stage's "Ask
  // DraftHR"): window event "drafthr:ask" with { draftId, prompt }.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ draftId?: string; prompt?: string }>).detail;
      if (!d?.prompt || (d.draftId && d.draftId !== draft.id)) return;
      void submitRef.current(undefined, d.prompt);
    };
    window.addEventListener("drafthr:ask", on);
    return () => window.removeEventListener("drafthr:ask", on);
  }, [draft.id]);

  // "Show new edits" (the sliders menu): in the text or side by side.
  const [diffMode, setDiffModeState] = useState<DiffViewMode>(() => getDiffViewMode());
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DiffViewMode>).detail;
      if (d === "inline" || d === "card") setDiffModeState(d);
    };
    window.addEventListener("drafthr:diff-view-mode", on);
    return () => window.removeEventListener("drafthr:diff-view-mode", on);
  }, []);

  // Switching side panel tabs swaps what the scroller holds: start a
  // replaced view at its top and the chat at its latest message.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = replaceThread === undefined ? el.scrollHeight : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollerRef}
        role={showThread ? "log" : undefined}
        aria-live={showThread ? "polite" : undefined}
        aria-relevant={showThread ? "additions text" : undefined}
        aria-busy={showThread ? isStreaming : undefined}
        className="flex-1 overflow-auto min-h-0"
      >
        {!showThread ? (
          replaceThread
        ) : (
          <div className="flex flex-col gap-5 px-4 pb-6 pt-3">
            {/* Thread header: model and date the agent works with, plus a
             * fresh thread. Pin and hide only render where a caller wires them. */}
            <div className="flex items-center gap-2">
              <span
                className="ds-mono min-w-0 truncate text-[11px] text-[var(--ds-muted)]"
                title={`Model: ${profile.defaults.qwenModel ?? DEFAULT_MODEL}. The agent has today's date (${runtimeCtx.localDate}, ${runtimeCtx.timeZone}) so it never invents dates.`}
              >
                {profile.defaults.qwenModel ?? DEFAULT_MODEL} · {runtimeCtx.localDate}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Clear this chat thread?")) {
                        clearAIChat(draft.id);
                        setMessages([]);
                      }
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2 text-[12px] font-medium text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                    aria-label="Clear chat thread"
                    title="Start a new thread"
                  >
                    <SquarePen className="size-3.5" />
                    New thread
                  </button>
                )}
                {(onPin || onUnpin) && (
                  <button
                    type="button"
                    onClick={isPinned ? (onUnpin ?? onPin) : onPin}
                    className="grid size-7 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                    title={isPinned ? "Unpin" : "Pin"}
                    aria-pressed={isPinned}
                  >
                    {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </button>
                )}
                {onCollapse && (
                  <button
                    type="button"
                    onClick={onCollapse}
                    className="grid size-7 place-items-center rounded-[var(--ds-r-s)] text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                    aria-label="Hide AI rail"
                    title="Hide AI rail"
                  >
                    <PanelRight className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {(import.meta.env.DEV || variant === "rail") && (
              <SuggestionTestStrip
                draft={draft}
                activeSectionId={activeSectionId}
                anyPending={anyPending}
                onAcceptAll={() => acceptAllSuggestions(draft.id)}
                onRejectAll={() => rejectAllSuggestions(draft.id)}
                insertTest={() => insertTestSuggestion(draft, activeSectionId, updateSection)}
              />
            )}

            {messages.length === 0 && (
              // Empty state: what DraftHR can do, one starter per tool, then
              // the user's recent prompts.
              <div className="pt-2">
                <p className="m-0 text-[14px] font-medium text-[var(--ds-ink)]">What should DraftHR change?</p>
                <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
                  Pick a starter or describe your own. DraftHR shows each change for you to accept.
                </p>
                <div className="mt-4 flex flex-col gap-1">
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setInput(p.prompt);
                        textareaRef.current?.focus();
                      }}
                      className="group flex items-start gap-2.5 rounded-[var(--ds-r-m)] px-3 py-2.5 text-left transition hover:bg-[var(--ds-surface-2)]"
                    >
                      <p.Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-muted)] transition group-hover:text-[var(--ds-ink)]" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-[var(--ds-ink)]">{p.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ds-muted)]">{p.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {recentPrompts.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 px-1 text-[12px] text-[var(--ds-muted)]">Recent</div>
                    <div className="flex flex-col gap-0.5">
                      {recentPrompts.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setInput(p)}
                          className="truncate rounded-[var(--ds-r-s)] px-2 py-1.5 text-left text-[12.5px] text-[var(--ds-body)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
                          title={p}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                streaming={isStreaming && m === messages[messages.length - 1] && m.role === "assistant"}
                draft={draft}
                onApplyRegenerate={applyRegenerate}
                onApplyAddClause={applyAddClause}
                onApplyTighten={applyTighten}
                onApplySummarise={applySummarise}
              />
            ))}
            {error && (
              <div className="flex items-center gap-2 rounded-[var(--ds-r-m)] bg-[var(--ds-red-bg)] px-3 py-2 text-[12.5px] text-[var(--ds-red-fg)]">
                <AlertCircle className="size-3.5 shrink-0" />
                <span className="flex-1">{agentErrorMessage(error)}</span>
                <button onClick={() => regenerate()} className="inline-flex items-center gap-1 font-medium hover:underline">
                  <RotateCw className="size-3" /> Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask DraftHR: the stage's prompt chips, then one white box with the
       * context chip, the message and a tool row ending in a dark send. */}
      <form onSubmit={submit} className="shrink-0 px-4 pb-4 pt-2">
        {chips && chips.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5" aria-label="Suggested prompts">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={() => void submit(undefined, c.prompt)}
                className="inline-flex h-7 items-center whitespace-nowrap rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex cursor-text flex-col gap-2 rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pb-2.5 pl-3.5 pr-2.5 pt-3 shadow-[var(--ds-shadow-ask)] transition-colors duration-[120ms] focus-within:border-[var(--ds-line-strong)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) textareaRef.current?.focus();
          }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-[26px] min-w-0 max-w-full items-center gap-1.5 rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-2 pr-1.5 text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label={`Context: ${scopeChipLabel}`}
                  title="What DraftHR should look at"
                >
                  <FileText className="size-3.5 shrink-0 text-[var(--ds-muted)]" />
                  <span className="truncate">{scopeChipLabel}</span>
                  <ChevronDown className="size-3.5 shrink-0 text-[var(--ds-subtle)]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-[240px] duration-[160ms] data-[state=closed]:duration-[100ms]">
                <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">Ask about</DropdownMenuLabel>
                {(["letter", "section", "selection"] as AIChatScope[]).map((sc) => (
                  <DropdownMenuItem key={sc} onClick={() => setScope(sc)}>
                    <span className="flex-1 truncate">
                      {sc === "letter" ? "Whole letter" : sc === "section" ? `Section${scopeSection || activeSectionId ? `: ${(draft.sections.find((x) => x.id === activeSectionId) ?? draft.sections[0])?.title ?? ""}` : ""}` : "Selected text"}
                    </span>
                    {scope === sc && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <textarea
            ref={textareaRef}
            data-ai-composer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask DraftHR anything about this letter"
            aria-label="Message DraftHR"
            rows={1}
            className="block max-h-[120px] min-h-[22px] w-full resize-none border-0 bg-transparent px-0.5 text-[14px] leading-[21px] text-[var(--ds-ink)] placeholder:text-[var(--ds-muted)] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="-ml-1.5 flex min-w-0 items-center gap-0.5 overflow-hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                    aria-label="Add to the message"
                    title="Add"
                  >
                    <Plus className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-[240px] duration-[160ms] data-[state=closed]:duration-[100ms]">
                  <DropdownMenuItem onClick={() => nav(`/editor/${draft.id}/evidence?action=add`)}>
                    <Paperclip className="mr-2 size-4" /> Add evidence
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setScope("selection")}>
                    <TextSelect className="mr-2 size-4" /> Ask about the selected text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {onOpenEvidence && (
                <button
                  type="button"
                  onClick={onOpenEvidence}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-1.5 text-[13px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  title="Evidence and files for this letter"
                >
                  <Paperclip className="size-3.5" />
                  Files
                  {(draft.evidence?.length ?? 0) > 0 && (
                    <span className="ds-mono text-[11.5px] text-[var(--ds-subtle)]">{draft.evidence?.length}</span>
                  )}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-1.5 text-[13px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                    aria-label="Saved prompts"
                    title="Saved prompts"
                  >
                    <Bookmark className="size-3.5" />
                    Prompts
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-[260px] duration-[160ms] data-[state=closed]:duration-[100ms]">
                  <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">Saved prompts</DropdownMenuLabel>
                  {QUICK_PROMPTS.map((q) => (
                    <DropdownMenuItem
                      key={q.label}
                      onClick={() => {
                        setInput(q.prompt);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                    >
                      {q.label.replace(/^\+\s*/, "Add ")}
                    </DropdownMenuItem>
                  ))}
                  {recentPrompts.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">Recent</DropdownMenuLabel>
                      {recentPrompts.slice(0, 5).map((rp) => (
                        <DropdownMenuItem key={rp} onClick={() => setInput(rp)}>
                          <span className="truncate">{rp}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                    aria-label="Options"
                    title="Options"
                  >
                    <SlidersHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-[240px] duration-[160ms] data-[state=closed]:duration-[100ms]">
                  <DropdownMenuLabel className="text-[11.5px] font-normal text-[var(--ds-muted)]">Show DraftHR's edits</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setDiffViewMode("inline")}>
                    <span className="flex-1">In the text</span>
                    {diffMode === "inline" && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDiffViewMode("card")}>
                    <span className="flex-1">Side by side</span>
                    {diffMode === "card" && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                  {messages.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (confirm("Clear this chat thread?")) {
                            clearAIChat(draft.id);
                            setMessages([]);
                          }
                        }}
                      >
                        <SquarePen className="mr-2 size-4" /> New thread
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {busy ? (
                <button
                  type="button"
                  onClick={() => stopAll()}
                  className="ml-1 grid size-[30px] place-items-center rounded-[8px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label="Stop"
                  title="Stop"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="ml-1 grid size-[30px] place-items-center rounded-[8px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] disabled:bg-[var(--ds-accent)] disabled:text-[var(--ds-on-accent)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
                  aria-label="Send"
                  title="Send (Ctrl or Cmd + Enter)"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * Track-changes affordance + DEV debug button. Rendered at the top of the
 * AI scroller so the four downstream surfaces (consultant review, AI critique
 * diff, threaded comments, co-edit cursors) have a working primitive to
 * exercise. The "Test suggestion" button is gated to DEV — it injects a
 * green-underlined <ins> at the start of the active section so we can prove
 * the merge / accept / reject paths end-to-end. The Accept/Reject row only
 * shows when there's at least one pending suggestion in the draft.
 */
function SuggestionTestStrip(props: {
  draft: Draft;
  activeSectionId: string | null;
  anyPending: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  insertTest: () => void;
}): ReactElement | null {
  const isDev = import.meta.env.DEV;
  if (!isDev && !props.anyPending) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--ds-r-m)] border border-dashed border-[var(--ds-line)] px-3 py-2 text-[12px]">
      <span className="text-[var(--ds-muted)] inline-flex items-center gap-1">
        <FlaskConical className="size-3.5" />
        Track-changes
      </span>
      {props.anyPending ? (
        <>
          <span className="text-[var(--ds-ink)]">Pending suggestions</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              onClick={props.onAcceptAll}
              className="h-6 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2 text-[11.5px] font-medium text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)]"
              title="Accept every pending suggestion in this draft"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={props.onRejectAll}
              className="h-6 rounded-[var(--ds-r-s)] px-2 text-[11.5px] font-medium text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
              title="Reject every pending suggestion. The text stays and the marks fade."
            >
              Reject all
            </button>
          </span>
        </>
      ) : (
        <span className="text-[var(--ds-subtle)]">No pending suggestions</span>
      )}
      {isDev && (
        <button
          type="button"
          onClick={props.insertTest}
          className="h-6 px-2 rounded-md border border-dashed border-[var(--ds-line)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] transition text-[11px]"
          title="DEV: inject a fake suggestion into the active section"
        >
          Test suggestion
        </button>
      )}
    </div>
  );
}

/** DEV helper: append a pending <ins> to the active section's HTML so the
 * accept / reject paths have something to chew on. Reads-then-writes via
 * updateSection so it goes through the canonical sanitiser. */
function insertTestSuggestion(
  draft: Draft,
  activeSectionId: string | null,
  updateSection: (draftId: string, sectionId: string, html: string) => void,
): void {
  const section =
    draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  if (!section) return;
  const id = uid("sug");
  const created = Date.now();
  // <p> wrapper keeps the editor's block schema happy — bare inline marks at
  // the doc level get re-wrapped on next parse anyway.
  const inserted =
    `<p><ins data-suggestion-id="${id}" data-suggestion-kind="insertion" ` +
    `data-author="Test reviewer" data-created-at="${created}" ` +
    `data-status="pending" data-body="DEV: synthetic suggestion" ` +
    `class="ds-suggestion ds-suggestion-ins ds-suggestion-pending">[TEST INSERT]</ins></p>`;
  updateSection(draft.id, section.id, `${section.html ?? ""}${inserted}`);
}

/** Concatenate text-type parts from a v6 UIMessage. */
function textFromParts(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

/**
 * Write the current message array to the draft's persisted aiChat field.
 * Used by the idle-tick effect AND the unmount cleanup — extracted so
 * both call sites stay in lockstep. The createdAt map preserves
 * timestamps for messages we've seen before; new messages get `now`.
 */
function persistMessagesToStore(draftId: string, messages: UIMessage[]): void {
  useDraftStore.setState((s) => {
    const d = s.drafts[draftId];
    if (!d) return s;
    const previousCreatedAt = new Map(
      (d.aiChat ?? []).map((m) => [m.id, m.createdAt])
    );
    const now = Date.now();
    return {
      drafts: {
        ...s.drafts,
        [draftId]: {
          ...d,
          aiChat: messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            body: textFromParts(m),
            createdAt: previousCreatedAt.get(m.id) ?? now,
          })),
        },
      },
    };
  });
}

/**
 * Remove tool-call parts that don't have an output yet. We need this on
 * the way out to /api/agent because the OpenAI-compatible Qwen endpoint
 * (via convertToModelMessages) requires every tool_call to have a
 * matching tool_result. If the user ignored a proposal, the cleanest
 * thing is to drop it from history — the agent then starts the next
 * turn fresh rather than blocking on stale proposals.
 */
function stripPendingToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => {
      if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const state = (p as { state?: string }).state;
        // Keep only tool parts that have been resolved (output present)
        // or denied. Drop pending proposals.
        return state === "output-available" || state === "output-error";
      }
      // Drop dynamic-tool entries we don't render either.
      if (p.type === "dynamic-tool") return false;
      return true;
    }),
  }));
}

function Message({
  message,
  streaming,
  draft,
  onApplyRegenerate,
  onApplyAddClause,
  onApplyTighten,
  onApplySummarise,
}: {
  message: UIMessage;
  streaming: boolean;
  draft: Draft;
  onApplyRegenerate: (toolCallId: string, input: RegenerateInput) => Promise<void>;
  onApplyAddClause: (toolCallId: string, input: AddClauseInput) => Promise<void>;
  onApplyTighten: (toolCallId: string, input: TightenInput) => Promise<void>;
  onApplySummarise: (toolCallId: string, input: SummariseInput) => void;
}) {
  const isUser = message.role === "user";
  const textOnly = textFromParts(message);
  const { body, scopeChip } = parseScopeFromUserBody(textOnly, isUser);

  if (isUser) {
    // 3A: the user's turn sits right-aligned in a soft bubble.
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-3 py-2 text-[13.5px] leading-relaxed text-[var(--ds-ink)] [overflow-wrap:anywhere]">
          {body || (streaming && <span className="text-[var(--ds-muted)]">…</span>)}
        </div>
        {scopeChip && (
          <span className="max-w-[88%] truncate text-[11px] text-[var(--ds-muted)]">{scopeChip}</span>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* Assistant: plain text on the panel, no bubble. */}
      {(body || (streaming && !textOnly)) && (
        <div className="ai-msg-body text-[var(--ds-body)]">
          {body ? (
            <Markdown>{body}</Markdown>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ds-muted)]">
              <Loader2 className="size-3 animate-spin" /> Thinking
            </span>
          )}
        </div>
      )}

      {/* Tool-call parts: render the right card per tool. */}
      <div className="mt-2 space-y-1.5 empty:hidden">
        {message.parts.filter(isToolUIPart).map((p) => {
          const tp = p as unknown as ToolPart;
          switch (tp.type) {
            case "tool-regenerateSection":
              return <RegenerateCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyRegenerate} />;
            case "tool-addClause":
              return <AddClauseCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyAddClause} />;
            case "tool-tightenSection":
              return <TightenCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyTighten} />;
            case "tool-summariseForCounsel":
              return <SummariseMarker key={tp.toolCallId} part={tp} onAck={onApplySummarise} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

/**
 * Generic shape used for every tool part. v6's UIMessagePart union
 * doesn't expose a per-tool predicate, so we widen to a permissive
 * shape and narrow `input` per card.
 */
type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: { ok?: boolean; error?: string } & Record<string, unknown>;
};

function sectionTitleFor(draft: Draft, sectionId?: string): string {
  if (!sectionId) return "section";
  return draft.sections.find((s) => s.id === sectionId)?.title ?? sectionId;
}

function StateStatus({
  state,
  output,
  applyButton,
}: {
  state: ToolPart["state"];
  output?: ToolPart["output"];
  applyButton?: React.ReactNode;
}) {
  if (state === "input-streaming") {
    return (
      <span className="text-[11px] text-[var(--ds-muted)] inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Preparing
      </span>
    );
  }
  if (state === "input-available") return <>{applyButton}</>;
  if (state === "output-available") {
    const ok = output?.ok !== false;
    return ok ? (
      <span className="text-[11px] text-[var(--ds-green-fg)] inline-flex items-center gap-1">
        <Check className="size-3" /> Applied
      </span>
    ) : (
      <span
        className="text-[11px] text-[var(--ds-red-fg)] inline-flex items-center gap-1"
        title={typeof output?.error === "string" ? output.error : undefined}
      >
        <AlertCircle className="size-3" /> Failed
      </span>
    );
  }
  return null;
}

/* ============================================================
 * regenerateSection — rewrite a named section with a freeform instruction.
 * ========================================================== */
function RegenerateCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: RegenerateInput) => Promise<void>;
}) {
  const input = part.input as RegenerateInput | undefined;
  return (
    <ToolCard
      icon={<Sparkles className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow="Rewrite"
      body={input?.instruction}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="h-7 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[12px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * addClause — insert a named clause type into a section.
 * ========================================================== */
function AddClauseCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: AddClauseInput) => Promise<void>;
}) {
  const input = part.input as AddClauseInput | undefined;
  const clause = input?.clause_type
    ? input.clause_type.replace(/_/g, " ")
    : "clause";
  const pos = input?.position ?? "append";
  return (
    <ToolCard
      icon={<Plus className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow={`Add clause · ${clause}${pos !== "append" ? ` · ${pos.replace("_", " ")}` : ""}`}
      body={input?.note}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="h-7 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[12px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * tightenSection — rewrite to a specific word-count target.
 * ========================================================== */
function TightenCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: TightenInput) => Promise<void>;
}) {
  const input = part.input as TightenInput | undefined;
  return (
    <ToolCard
      icon={<Minus className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow={`Tighten · target ${input?.target_words ?? "?"} words`}
      body={undefined}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="h-7 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2.5 text-[12px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * summariseForCounsel — non-mutating. We auto-acknowledge so the
 * model's stream completes; the actual summary lives in the prose
 * reply rendered as Markdown. Card adds a Copy-summary affordance.
 * ========================================================== */
function SummariseMarker({
  part,
  onAck,
}: {
  part: ToolPart;
  onAck: (toolCallId: string, input: SummariseInput) => void;
}) {
  const input = part.input as SummariseInput | undefined;
  const acked = useRef(false);
  useEffect(() => {
    if (part.state === "input-available" && !acked.current) {
      acked.current = true;
      onAck(part.toolCallId, input ?? {});
    }
  }, [part.state, part.toolCallId, input, onAck]);

  return (
    <ToolCard
      icon={<FileText className="size-3 text-[var(--ds-muted)]" />}
      title="Summary for counsel"
      eyebrow={input?.audience ? `Audience: ${input.audience.replace("_", " ")}` : "Audience: counsel"}
      body={input?.note}
      status={
        part.state === "input-streaming" ? (
          <span className="text-[11px] text-[var(--ds-muted)] inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Preparing
          </span>
        ) : (
          <CopyButton />
        )
      }
    />
  );
}

function CopyButton() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      // Copy the most-recent assistant text — the summary lives in the
      // message body. We grab it from the rendered DOM rather than props
      // to avoid re-plumbing the message through every card.
      const last = document.querySelectorAll(".ai-msg-body");
      const target = last[last.length - 1] as HTMLElement | undefined;
      const text = target?.innerText ?? "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-[11px] px-2 py-1 rounded-md border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)] inline-flex items-center gap-1"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ToolCard({
  title,
  body,
  status,
  icon,
  eyebrow,
}: {
  title: string;
  body?: string;
  status: React.ReactNode;
  icon?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[12.5px]">
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon ?? <Sparkles className="size-3 text-[var(--ds-muted)]" />}</span>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="truncate text-[11.5px] text-[var(--ds-muted)]">
              {eyebrow}
            </div>
          )}
          <div className="font-medium text-[var(--ds-ink)] truncate">{title}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">{status}</div>
      </div>
      {body && (
        <div className="mt-1.5 text-[12px] leading-relaxed text-[var(--ds-muted)]">
          {body}
        </div>
      )}
    </div>
  );
}

function parseScopeFromUserBody(content: string, isUser: boolean): { body: string; scopeChip?: string } {
  if (!isUser) return { body: content };
  // Tolerate a trailing [selection: "..."] block after [scope: ...]. The
  // composer appends BOTH for selection scope; the old regex anchored [scope:]
  // at end-of-string, so selection-scope messages failed to match and rendered
  // the raw annotations with no scope chip (bug #15).
  const m = content.match(
    /^([\s\S]*?)\n\[scope:\s*([^\]]+)\](?:\n\[selection:[\s\S]*?\])?\s*$/,
  );
  if (!m) return { body: content };
  return { body: m[1].trim(), scopeChip: m[2].trim() };
}
