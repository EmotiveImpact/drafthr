import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/letters/types";
import { canDeleteComment, identityForComment, type CommentIdentity } from "./identity";

const me: CommentIdentity = { id: "me", name: "Alex Me", email: "alex@x.com", initials: "AM", hue: 1 };

function comment(over: Partial<Comment> = {}): Comment {
  return { id: "c1", sectionId: "s", authorId: "me", authorName: "Alex Me", body: "x", createdAt: 1, ...over };
}

describe("comment authorship", () => {
  it("renders a teammate's synced comment under their own name, not as me", () => {
    const theirs = comment({ authorUserId: "u-sam", authorName: "Sam Teammate", authorEmail: "sam@x.com" });
    const ident = identityForComment(theirs, [me], { userId: "u-alex" });
    expect(ident.name).toBe("Sam Teammate");
    expect(ident.email).toBe("sam@x.com");
  });

  it("still matches my own comments to my identity", () => {
    const mine = comment({ authorUserId: "u-alex" });
    expect(identityForComment(mine, [me], { userId: "u-alex" })).toBe(me);
  });

  it("only the author or an owner/admin may delete", () => {
    const theirs = comment({ authorUserId: "u-sam" });
    expect(canDeleteComment(theirs, { userId: "u-alex", role: "drafter" })).toBe(false);
    expect(canDeleteComment(theirs, { userId: "u-alex", role: "admin" })).toBe(true);
    expect(canDeleteComment(theirs, { userId: "u-sam", role: "drafter" })).toBe(true);
    // Auth off (local demo): nothing to compare, so it stays deletable.
    expect(canDeleteComment(theirs, { userId: null })).toBe(true);
  });
});
