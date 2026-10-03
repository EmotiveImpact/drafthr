import { create } from "zustand";

export const useSessionTransition = create<{ label: string | null; epoch: number }>(() => ({ label: null, epoch: 0 }));
const events = ["click", "pointerdown", "keydown", "beforeinput", "paste", "drop", "submit"] as const;
function blockInteraction(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); }

/** Acquire synchronously, before any await. Also covers controls portalled
 * outside the app root. This is a UX lock, not an authorization boundary. */
export function beginSessionTransition(label: string) {
  if (useSessionTransition.getState().label) return null;
  const epoch = useSessionTransition.getState().epoch + 1;
  useSessionTransition.setState({ label, epoch });
  for (const event of events) document.addEventListener(event, blockInteraction, true);
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  focused?.blur();
  return {
    release() {
      if (useSessionTransition.getState().epoch !== epoch) return;
      for (const event of events) document.removeEventListener(event, blockInteraction, true);
      useSessionTransition.setState({ label: null });
      if (focused?.isConnected) focused.focus();
    },
  };
}
