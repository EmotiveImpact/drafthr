import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export type RetryEvent = {
  retryCount: number;
  delayMs: number;
  reason: string;
  startedAt: number;
};

export function RetryBanner({ event }: { event: RetryEvent | null }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!event) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - event.startedAt;
      const remaining = Math.max(0, Math.ceil((event.delayMs - elapsed) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [event]);

  if (!event) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <div className="leading-relaxed">
        <strong>Rate-limited or transient error.</strong> Retrying in {secondsLeft}s
        (attempt {event.retryCount} of 3).{" "}
        <span className="text-amber-800/80">{event.reason}</span>
      </div>
    </div>
  );
}
