import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIONS,
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
} from "react-joyride";

import { useProfileStore } from "@/lib/profile";
import { hasSeenTour, markTourSeen, resetTour } from "@/lib/onboarding";

/**
 * First-sign-in tour. Anchored to stable `data-tour="..."` selectors in the
 * sidebar + Home hero. Role-aware: HR mode tours portfolio surfaces
 * (Employees / Matters / Reports), Employee mode tours the letter pipeline.
 *
 * Employee mode steps 2–5 describe surfaces that live on routes the user
 * hasn't visited yet (wizard, editor, evidence, export). Rather than wait
 * to re-anchor across navigation — fragile, and tours-on-rails feel
 * patronising — we render those as centred cards. The user gets the mental
 * map; the actual UI teaches itself when they get there.
 *
 * Replay handle: in dev, `window.__drafthr.startTour()` clears the seen
 * flag and full-reloads so the tour re-fires. Not wired in prod.
 */

type TourMode = "employer" | "employee";

const HR_STEPS: Step[] = [
  {
    target: '[data-tour="nav-employees"]',
    title: "Your employee directory",
    content:
      "Imported from existing drafts on day one; grows as you draft new letters. One row per person, every letter they've touched.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-matters"]',
    title: "Matters group related letters",
    content:
      "Cases, investigations, settlement tracks. Risk band auto-derived from health checks. Tasks and events live here.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-reports"]',
    title: "HR-Director's-eye view",
    content:
      "Workspace-wide compliance score, risk heatmap, letter volume by month. Drill into any tile.",
    placement: "right",
  },
  {
    // Un-anchored: the HR dashboard has no [data-tour="new-letter-cta"] element
    // (that anchor lives only on the Employee home), so anchoring here fired
    // TARGET_NOT_FOUND and silently skipped this step for employers. Describe it
    // centered instead — the same pattern EMPLOYEE_STEPS uses for its
    // un-anchored intro steps.
    target: "body",
    title: "Start a new letter",
    content:
      "35 templates across HR and Employee modes. UK + US legal scaffolding baked into every one.",
    placement: "center",
  },
  {
    target: '[data-tour="workspace-switcher"]',
    title: "Workspace switcher",
    content:
      "Switch between workspaces if you belong to more than one. Sign out lives in your avatar menu below.",
    placement: "right",
  },
];

const EMPLOYEE_STEPS: Step[] = [
  {
    target: '[data-tour="new-letter-cta"]',
    title: "Pick your letter type",
    content:
      "Grievance, resignation, tribunal, accommodation, pay dispute. The wizard walks you through every question your letter needs.",
    placement: "bottom",
  },
  // Wizard intro — described, not anchored. User hasn't opened a wizard yet.
  {
    target: "body",
    title: "The wizard does the structural work",
    content:
      "Each letter type has UK + US legal scaffolding. You answer the questions; we draft each section. Skip anything that doesn't apply.",
    placement: "center",
  },
  {
    target: "body",
    title: "Refine with the right-rail AI",
    content:
      "Once your draft is open, the right rail is a chat with the AI focused on the section you're editing. Cursor-style accept/reject for proposed changes.",
    placement: "center",
  },
  {
    target: "body",
    title: "Evidence travels with the letter",
    content:
      "Upload supporting documents from the Evidence step. Reference them inline with [See Fig 1]; the bundle ships with your export.",
    placement: "center",
  },
  {
    target: "body",
    title: "Export as PDF, DOCX, or audit pack",
    content:
      "Audit ZIP packs every version with timestamps and an integrity manifest. Tribunal-defensibility built in.",
    placement: "center",
  },
];

function stepsFor(mode: TourMode): Step[] {
  return mode === "employer" ? HR_STEPS : EMPLOYEE_STEPS;
}

export type OnboardingTourProps = {
  /** Force-skip the seen check (used by the dev replay handle). */
  forceRun?: boolean;
};

export function OnboardingTour({ forceRun = false }: OnboardingTourProps) {
  const profileRole = useProfileStore((s) => s.profile.role);
  // Default to employer when role is null — happens for the brief window
  // between sign-in and the role picker. Tour won't actually fire here
  // because App.tsx gates on activeTenant + route prefix.
  const mode: TourMode = profileRole === "employee" ? "employee" : "employer";

  const [run, setRun] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);

  // Defer start to next tick so Joyride finds anchors after the
  // current paint. Without this, the first selector often misses on a
  // fast cold-mount.
  useEffect(() => {
    if (!forceRun && hasSeenTour()) return;
    const id = window.setTimeout(() => setRun(true), 250);
    return () => window.clearTimeout(id);
  }, [forceRun]);

  const handleEvent = useCallback((data: EventData) => {
    const { status, action, index, type } = data;
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) {
      markTourSeen();
      setRun(false);
      setStepIndex(0);
      return;
    }
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const next = index + (action === ACTIONS.PREV ? -1 : 1);
      setStepIndex(next);
    }
  }, []);

  const steps = useMemo(() => stepsFor(mode), [mode]);

  // Default options applied to every step. Match DraftHR tokens.
  // - skipBeacon=true: jump straight to the tooltip, no click-to-reveal.
  // - buttons include 'skip' so users can bail at any step.
  // - softer overlay than the joyride default for a less-intrusive feel.
  const options = useMemo(
    () => ({
      zIndex: 10_000,
      primaryColor: "var(--ds-ink)",
      backgroundColor: "var(--ds-surface)",
      textColor: "var(--ds-ink)",
      arrowColor: "var(--ds-surface)",
      overlayColor: "rgba(15, 17, 21, 0.35)",
      skipBeacon: true,
      showProgress: true,
      buttons: ["back", "skip", "primary"] as ("back" | "skip" | "primary")[],
      spotlightPadding: 6,
      spotlightRadius: 8,
    }),
    [],
  );

  const styles = useMemo(
    () => ({
      tooltip: {
        borderRadius: 10,
        border: "1px solid var(--ds-line)",
        boxShadow: "0 18px 48px rgba(15,17,21,0.18)",
        padding: 18,
        fontSize: 13.5,
      },
      tooltipTitle: {
        fontSize: 15,
        fontWeight: 600,
        margin: 0,
        marginBottom: 6,
      },
      tooltipContent: {
        padding: 0,
        lineHeight: 1.5,
        color: "var(--ds-body, var(--ds-ink))",
      },
      buttonPrimary: {
        backgroundColor: "var(--ds-ink)",
        color: "#fff",
        borderRadius: 7,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 600,
      },
      buttonBack: {
        color: "var(--ds-muted)",
        fontSize: 12,
      },
      buttonSkip: {
        color: "var(--ds-muted)",
        fontSize: 12,
      },
      buttonClose: {
        display: "none",
      },
    }),
    [],
  );

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      options={options}
      styles={styles}
      locale={{
        back: "Back",
        close: "Close",
        last: "Done",
        next: "Next",
        skip: "Skip tour",
      }}
      onEvent={handleEvent}
    />
  );
}

export default OnboardingTour;

// Dev-only replay handle. Lives on a single global so we don't pollute
// window with one-off properties per surface.
declare global {
  interface Window {
    __drafthr?: {
      startTour?: () => void;
    };
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__drafthr = window.__drafthr ?? {};
  window.__drafthr.startTour = () => {
    resetTour();
    window.location.reload();
  };
}
