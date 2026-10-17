/** Thin line icons for the case interview, drawn to match Look 11. */
const PATHS: Record<string, string> = {
  check: "M3.5 8.5l3 3 6-7",
  arrowRight: "M3 8h10M9 4l4 4-4 4",
  up: "M4 10l4-4 4 4",
  down: "M4 6l4 4 4-4",
  x: "M4 4l8 8M12 4l-8 8",
  lock: "M4.5 7.5h7v5.5h-7zM6 7.5V5.5a2 2 0 014 0v2",
  alert: "M8 2.5l6 10.5H2zM8 6.5v3M8 11.3v.2",
  eye: "M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8zM8 9.7a1.7 1.7 0 100-3.4 1.7 1.7 0 000 3.4z",
  folder: "M2 4.5h4l1.5 1.5H14v6.5H2z",
  skip: "M4 8h8M9 5l3 3-3 3",
  spark: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2",
  back: "M13 8H3M7 4L3 8l4 4",
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
