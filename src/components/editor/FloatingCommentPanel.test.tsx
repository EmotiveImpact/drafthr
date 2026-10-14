import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloatingCommentPanel } from "./FloatingCommentPanel";
import type { Draft } from "@/lib/letters/types";

/**
 * LETTER-X52: Reply on a reviewer's margin card opens the thread with the
 * cursor in the reply box (typing goes straight in), lines the panel up
 * under the card rather than over the letter, and hands focus back to
 * Reply when it is closed.
 */
const draft = {
  id: "d1",
  mode: "employer",
  letterType: "warning",
  context: { jurisdiction: "UK" },
  sections: [{ id: "s1", sectionId: "body", title: "Body", html: "<p>x</p>", required: true, status: "ready", versions: [] }],
  comments: [
    {
      id: "c1",
      sectionId: "s1",
      authorId: "dana@harbour.test",
      authorName: "Dana Whitfield",
      authorEmail: "dana@harbour.test",
      body: "Worth naming the refresher date.",
      createdAt: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} as unknown as Draft;

function setup(focusReply: boolean) {
  const card = document.createElement("div");
  document.body.appendChild(card);
  const reply = document.createElement("button");
  reply.textContent = "Reply";
  card.appendChild(reply);
  reply.focus();
  // A card in the margin, 256px wide, its right edge at 1000px.
  const rect = { top: 300, bottom: 400, left: 744, right: 1000, width: 256, height: 100, x: 744, y: 300, toJSON: () => ({}) } as DOMRect;
  let closed = 0;
  const utils = render(
    <FloatingCommentPanel
      draft={draft}
      anchor={{ getRect: () => rect, containerEl: card, align: "end" }}
      mode={{ kind: "existing", commentId: "c1" }}
      focusReply={focusReply}
      returnFocus={reply}
      onClose={() => (closed += 1)}
    />
  );
  return { ...utils, reply, closed: () => closed };
}

describe("FloatingCommentPanel opened from Reply", () => {
  it("puts the cursor in the reply box", async () => {
    setup(true);
    const box = await screen.findByRole("textbox", { name: "Reply" });
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("sits under the card, lined up with its right edge", async () => {
    setup(true);
    const panel = await screen.findByRole("dialog", { name: "Comment thread" });
    // 1000 (card right) - 320 (panel width)
    expect(panel.style.left).toBe("680px");
  });

  it("leaves focus alone when opened from the letter", async () => {
    const { reply } = setup(false);
    await screen.findByRole("dialog", { name: "Comment thread" });
    expect(document.activeElement).toBe(reply);
  });

  it("gives focus back to Reply on Escape", async () => {
    const { reply, closed } = setup(true);
    const box = await screen.findByRole("textbox", { name: "Reply" });
    await waitFor(() => expect(document.activeElement).toBe(box));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed()).toBe(1);
    expect(document.activeElement).toBe(reply);
  });
});
