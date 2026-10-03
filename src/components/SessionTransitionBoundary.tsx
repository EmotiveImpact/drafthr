import type { ReactNode } from "react";
import { useSessionTransition } from "@/lib/session/transition";
import { AppLoadingScreen } from "./AppLoadingScreen";

export function SessionTransitionBoundary({ children }: { children: ReactNode }) {
  const label = useSessionTransition(state => state.label);
  // Keep mounted: failed transitions must not throw away component-local edits.
  return <>
    {label && <AppLoadingScreen label={label} />}
    <div inert={Boolean(label)} hidden={Boolean(label)} style={label ? undefined : { display: "contents" }}>{children}</div>
  </>;
}
