import type { Question } from "@/lib/letters/questions";
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
