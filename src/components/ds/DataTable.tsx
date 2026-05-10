import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<Row> = {
  key: string;
  header: string;
  /** Render a cell. */
  cell: (row: Row) => ReactNode;
  /** Right-align. */
  num?: boolean;
  /** Hide on small viewports. */
  hideOn?: "sm" | "md" | "lg";
  /** Width hint (Tailwind or CSS value). */
  width?: string;
  /** Last column — actions. Right-aligned, narrow. */
  isActions?: boolean;
};

const HIDE = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

/**
 * Canonical DataTable for DRAFTHR. Sticky header, ghost row hover, status
 * dots/badges live inside cells (no coloured chrome). Last column is
 * conventionally an "actions" column with outline buttons.
 */
export function DataTable<Row>({
  columns,
  rows,
  onRowClick,
  empty,
  rowKey,
  className,
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  empty?: ReactNode;
  rowKey?: (row: Row, i: number) => string;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return <div className={cn("py-12 text-center text-[var(--ds-muted)] text-sm", className)}>{empty}</div>;
  }
  return (
    <div className={cn("overflow-x-auto -mx-4 sm:mx-0", className)}>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "text-left font-medium text-[12px] text-[var(--ds-muted)] py-3 px-4",
                  "border-b border-[var(--ds-line)]",
                  c.num && "text-right",
                  c.isActions && "text-right",
                  c.hideOn && HIDE[c.hideOn]
                )}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey?.(row, i) ?? (row as { id?: string }).id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-[var(--ds-canvas)]"
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "py-3 px-4 align-middle text-[var(--ds-body)]",
                    "border-b border-[var(--ds-line-2)]",
                    "h-[44px]",
                    c.num && "text-right tabular-nums",
                    c.isActions && "text-right",
                    c.hideOn && HIDE[c.hideOn]
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
