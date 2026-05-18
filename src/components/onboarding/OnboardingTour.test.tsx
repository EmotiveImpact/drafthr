import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ONBOARDING_TOUR_KEY, hasSeenTour, markTourSeen } from "@/lib/onboarding";

const profileMock = vi.hoisted(() => ({
  role: "employer" as "employer" | "employee",
}));

vi.mock("@/lib/profile", () => ({
  useProfileStore: (
    selector: (state: { profile: { role: "employer" | "employee" } }) => unknown,
  ) => selector({ profile: { role: profileMock.role } }),
}));

// Capture every props payload Joyride is invoked with so we can assert on
// step content + onEvent wiring without exercising the real portal /
// positioning code (heavy + jsdom-flaky).
type JoyrideStubProps = {
  steps: Array<{ title?: string; content?: string }>;
  run: boolean;
  onEvent: (data: unknown) => void;
};
const joyrideRenders: JoyrideStubProps[] = [];
vi.mock("react-joyride", () => {
  const ACTIONS = {
    CLOSE: "close",
    PREV: "prev",
    NEXT: "next",
    SKIP: "skip",
  } as const;
  const EVENTS = {
    STEP_AFTER: "step:after",
    TARGET_NOT_FOUND: "error:target_not_found",
  } as const;
  const STATUS = {
    FINISHED: "finished",
    SKIPPED: "skipped",
    READY: "ready",
    RUNNING: "running",
  } as const;
  const Joyride = (props: JoyrideStubProps) => {
    joyrideRenders.push(props);
    if (!props.run) return null;
    const first = props.steps[0];
    return (
      <div data-testid="joyride-stub">
        <span data-testid="joyride-step-title">{first?.title}</span>
        <span data-testid="joyride-step-content">{first?.content}</span>
      </div>
    );
  };
  return { Joyride, ACTIONS, EVENTS, STATUS };
});

// Import AFTER the mocks so the component picks them up.
import { OnboardingTour } from "./OnboardingTour";

describe("OnboardingTour", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    profileMock.role = "employer";
    joyrideRenders.length = 0;
    vi.useRealTimers();
  });

  // The harness's preview-local-storage hook (--localstorage-file) installs
  // a read-only Storage proxy that throws on `.clear()`. Install a fresh
  // in-memory Storage for each test so we control the seen flag cleanly.
  function installMemoryLocalStorage() {
    const entries = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return entries.size;
      },
      clear() {
        entries.clear();
      },
      getItem(key) {
        return entries.get(key) ?? null;
      },
      key(index) {
        return [...entries.keys()][index] ?? null;
      },
      removeItem(key) {
        entries.delete(key);
      },
      setItem(key, value) {
        entries.set(key, value);
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  }

  it("renders the HR step list when role is employer", () => {
    vi.useFakeTimers();
    render(<OnboardingTour />);
    // Tour defers start by ~250ms to wait for anchors to paint.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("joyride-step-title")).toHaveTextContent(
      /employee directory/i,
    );
  });

  it("renders the employee step list when role is employee", () => {
    vi.useFakeTimers();
    profileMock.role = "employee";
    render(<OnboardingTour />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("joyride-step-title")).toHaveTextContent(
      /pick your letter type/i,
    );
  });

  it("does not auto-start when the tour has already been seen", () => {
    vi.useFakeTimers();
    markTourSeen();
    render(<OnboardingTour />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Joyride is still mounted (it owns its own visibility via `run`) but
    // run=false means no tooltip should render.
    expect(screen.queryByTestId("joyride-stub")).toBeNull();
    const latest = joyrideRenders.at(-1);
    expect(latest?.run).toBe(false);
  });

  it("marks the tour seen and stops running on finish", () => {
    vi.useFakeTimers();
    render(<OnboardingTour />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const latest = joyrideRenders.at(-1);
    expect(latest?.run).toBe(true);

    act(() => {
      latest?.onEvent({
        status: "finished",
        action: "next",
        index: 4,
        type: "tour:end",
      });
    });

    expect(hasSeenTour()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_TOUR_KEY)).toBe("1");
    const post = joyrideRenders.at(-1);
    expect(post?.run).toBe(false);
  });

  it("marks the tour seen when user closes mid-tour", () => {
    vi.useFakeTimers();
    render(<OnboardingTour />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const latest = joyrideRenders.at(-1);
    act(() => {
      latest?.onEvent({
        status: "running",
        action: "close",
        index: 1,
        type: "step:after",
      });
    });
    expect(hasSeenTour()).toBe(true);
  });

  it("marks the tour seen when user clicks skip", () => {
    vi.useFakeTimers();
    render(<OnboardingTour />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const latest = joyrideRenders.at(-1);
    act(() => {
      latest?.onEvent({
        status: "skipped",
        action: "skip",
        index: 2,
        type: "tour:end",
      });
    });
    expect(hasSeenTour()).toBe(true);
  });

  it("force-runs even when the seen flag is set", () => {
    vi.useFakeTimers();
    markTourSeen();
    render(<OnboardingTour forceRun />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("joyride-stub")).toBeInTheDocument();
  });
});
