import type { EditorCommand, EditorHandle, ToolbarState } from "./types";
export interface EditorAgent {
    /** Current document HTML (sanitized source). */
    getHtml(): Promise<string>;
    /** Current document as plain text. */
    getText(): Promise<string>;
    /** Current document as Markdown. */
    getMarkdown(): Promise<string>;
    /** Replace/insert document content from a Markdown string. */
    insertMarkdown(markdown: string): void;
    /** Current selection / document toolbar state (counts, block, marks…). */
    getState(): ToolbarState;
    /** Subscribe to state changes; returns an unsubscribe fn. */
    subscribe(listener: (state: ToolbarState) => void): () => void;
    /** Insert raw HTML at the caret. */
    insertHtml(html: string): void;
    /** Replace the whole document (e.g. restore a snapshot/version). */
    setHtml(html: string): void;
    /** List top-level blocks with stable in-session ids (for addressing). */
    getBlocks(): {
        pid: string;
        tag: string;
        text: string;
    }[];
    /** Replace a block's content by its pid. Returns success. */
    replaceBlock(pid: string, html: string): boolean;
    /** Insert plain text at the caret (HTML-escaped). */
    insertText(text: string): void;
    /** Insert an image by URL/data-URL. */
    insertImage(src: string, alt?: string): void;
    /** Toggle an inline mark. */
    setMark(mark: "bold" | "italic" | "underline" | "strikethrough" | "inlineCode"): void;
    /** Set the current block type. */
    setBlock(block: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"): void;
    /** Toggle a list / structural block. */
    toggleBlock(kind: "bullet" | "numbered" | "checklist" | "quote" | "code"): void;
    /** Set paragraph alignment. */
    align(dir: "left" | "center" | "right" | "justify"): void;
    /** Insert a table. */
    insertTable(rows: number, cols: number, header?: boolean): void;
    undo(): void;
    redo(): void;
    selectAll(): void;
    focus(): void;
    /** Re-run pagination (after external HTML changes). */
    reflow(): Promise<void>;
    /** Escape hatch: run any raw editor command. */
    run(command: EditorCommand, value?: string): void;
}
/** Wrap an EditorHandle in the headless agent facade. */
export declare function createEditorAgent(handle: EditorHandle): EditorAgent;
export interface EditorAgentTool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, {
            type: string;
            enum?: string[];
            description?: string;
        }>;
        required?: string[];
    };
}
export declare const EDITOR_AGENT_TOOLS: EditorAgentTool[];
/**
 * Route a tool call (name + JSON args) to the agent. Returns a value for the
 * read tools, otherwise undefined. Throws on an unknown tool. This is the
 * adapter an MCP server or function-calling loop hands tool calls to.
 */
export declare function invokeEditorTool(agent: EditorAgent, name: string, args?: Record<string, unknown>): Promise<unknown>;
//# sourceMappingURL=agent.d.ts.map