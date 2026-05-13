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
      <Label htmlFor={id} className="text-sm font-medium">
        {q.label}
        {q.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {q.help && (
        <p className="text-xs text-muted-foreground leading-relaxed -mt-1">{q.help}</p>
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
        <div id={id} role="group" className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-md border border-letter-rule p-3">
          {q.options?.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/40 rounded-sm px-2 py-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.value)}
                  className="size-4"
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
          <SelectTrigger id={id}>
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
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(v)}
          />
          <span className="text-sm text-muted-foreground">
            {value ? "Yes" : "No"}
          </span>
        </div>
      );

    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          id={id}
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
          className="rounded-md border border-letter-rule bg-letter-surface/40 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {cfg.itemLabel} {idx + 1}
            </span>
            {items.length > min && (
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
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
