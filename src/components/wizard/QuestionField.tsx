import { Plus, Trash2 } from "lucide-react";
import type { Question, RepeaterValue } from "@/lib/letters/questions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Props = {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
};

export function QuestionField({ q, value, onChange }: Props) {
  const id = `q-${q.id}`;
  return (
    <div className="space-y-2">
      <Label id={`${id}-label`} htmlFor={id} className="text-[13.5px] font-medium text-[var(--ds-ink)]">
        {q.label}
        {q.required && <span className="ml-0.5 text-[var(--ds-red-fg)]">*</span>}
      </Label>
      {q.help && (
        <p className="-mt-1 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">{q.help}</p>
      )}
      {renderControl(q, id, value, onChange)}
    </div>
  );
}

function renderControl(
  q: Question,
  id: string,
  value: unknown,
  onChange: (v: unknown) => void
) {
  switch (q.type) {
    case "repeater":
      return <RepeaterField q={q} value={value} onChange={onChange} />;

    case "select_multi": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => {
        const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
        onChange(next);
      };
      return (
        <div
          id={id}
          role="group"
          aria-labelledby={`${id}-label`}
          aria-required={q.required}
          className="grid grid-cols-1 gap-1 rounded-[var(--ds-r-m)] border border-[var(--ds-line)] p-2 sm:grid-cols-2"
        >
          {q.options?.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--ds-r-s)] px-2 py-1.5 text-[13.5px] text-[var(--ds-body)] hover:bg-[var(--ds-surface-2)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.value)}
                  className="size-4 shrink-0 accent-[var(--ds-accent)]"
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case "textarea":
      return (
        <Textarea
          id={id}
          aria-required={q.required}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          rows={4}
          className="resize-y"
        />
      );

    case "select":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={id} aria-required={q.required}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {q.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-3">
          <Switch
            id={id}
            aria-required={q.required}
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(v)}
          />
          <span className="text-[13.5px] text-[var(--ds-muted)]">
            {value ? "Yes" : "No"}
          </span>
        </div>
      );

    case "date":
      return (
        <Input
          id={id}
          aria-required={q.required}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          id={id}
          aria-required={q.required}
          type="number"
          value={(value as number | string | undefined) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          placeholder={q.placeholder}
        />
      );

    case "currency":
      return (
        <Input
          id={id}
          aria-required={q.required}
          type="number"
          inputMode="decimal"
          step="0.01"
          value={(value as number | string | undefined) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          placeholder={q.placeholder ?? "0.00"}
        />
      );

    case "text":
    default:
      return (
        <Input
          id={id}
          aria-required={q.required}
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
        />
      );
  }
}

/**
 * Repeater field — renders a numbered list of sub-question blocks the
 * user can add to / remove from. Used for incidents, witnesses, prior
 * raises, anywhere the letter template wants a list of structured items
 * rather than a freeform paragraph. Each item is a record keyed by the
 * sub-field id. The whole array is stored under the parent question id.
 */
function RepeaterField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cfg = q.repeater;
  if (!cfg) return null;
  const min = cfg.minItems ?? 0;
  const max = cfg.maxItems ?? 99;
  const defaultCount = Math.max(cfg.defaultItems ?? 1, min);

  const items: RepeaterValue = Array.isArray(value)
    ? (value as RepeaterValue)
    : Array.from({ length: defaultCount }, () => ({}));

  // Hydrate to defaultCount on first render if value was empty.
  if (!Array.isArray(value) && defaultCount > 0) {
    // Defer so we don't setState during render.
    queueMicrotask(() => onChange(items));
  }

  const updateItem = (index: number, patch: Record<string, unknown>) => {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    onChange(next);
  };

  const addItem = () => {
    if (items.length >= max) return;
    onChange([...items, {}]);
  };

  const removeItem = (index: number) => {
    if (items.length <= min) return;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="space-y-3 rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] p-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--ds-muted)]">
              {cfg.itemLabel} {idx + 1}
            </span>
            {items.length > min && (
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="inline-flex items-center gap-1 text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-red-fg)]"
                aria-label={`Remove ${cfg.itemLabel.toLowerCase()} ${idx + 1}`}
              >
                <Trash2 className="size-3" />
                Remove
              </button>
            )}
          </div>
          {cfg.fields.map((sub) => (
            <QuestionField
              key={sub.id}
              q={sub}
              value={item[sub.id]}
              onChange={(v) => updateItem(idx, { [sub.id]: v })}
            />
          ))}
        </div>
      ))}
      {items.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="w-full"
        >
          <Plus className="size-3.5" />
          Add another {cfg.itemLabel.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
