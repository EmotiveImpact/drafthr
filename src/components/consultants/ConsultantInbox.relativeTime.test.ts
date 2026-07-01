import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime } from "./ConsultantInbox";

/* ============================================================================
 * relativeTime — elapsed-time buckets must FLOOR, not round. Regression: a
 * 45-second-old timestamp rounded up to "1 min ago" instead of "just now", and
 * 90 minutes showed as "2h ago".
 * ==========================================================================*/

const NOW = 1_700_000_000_000;
const sec = 1000;
const min = 60 * sec;
const hour = 60 * min;
const day = 24 * hour;

afterEach(() => vi.useRealTimers());

function at(elapsedMs: number): string {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  return relativeTime(NOW - elapsedMs);
}

describe("relativeTime (past)", () => {
  it("shows 'just now' for anything under a minute (incl. 45s)", () => {
    expect(at(0)).toBe("just now");
    expect(at(45 * sec)).toBe("just now"); // was "1 min ago" with Math.round
    expect(at(59 * sec)).toBe("just now");
  });

  it("buckets minutes by floor", () => {
    expect(at(1 * min)).toBe("1 min ago");
    expect(at(59 * min)).toBe("59 min ago");
  });

  it("buckets hours by floor (90 min → 1h, not 2h)", () => {
    expect(at(90 * min)).toBe("1h ago"); // was "2h ago" with Math.round
    expect(at(2 * hour)).toBe("2h ago");
    expect(at(23 * hour)).toBe("23h ago");
  });

  it("buckets days by floor (36h → 1d, not 2d)", () => {
    expect(at(36 * hour)).toBe("1d ago"); // was "2d ago" with Math.round
    expect(at(3 * day)).toBe("3d ago");
  });
});
