import type { FactSpec, FactValue } from "@/lib/case-engine/types";
import { choiceLabel } from "@/lib/case-engine/interview";
import { Icon } from "./icons";

/**
 * The answer field for one fact, by its type. Choices are outlined rows with
 * a black tick (never a filled row); dates, numbers and text are plain fields.
 */
export function emptyValueFor(_spec: FactSpec): FactValue {
  return null;
}

export function isAnswered(spec: FactSpec, value: FactValue): boolean {
  if (value === null) return false;
  if (spec.type === "list") return Array.isArray(value);
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function Option({
  label,
  hint,
  on,
  multi,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role={multi ? "checkbox" : "radio"} className="ci-opt" aria-checked={on} onClick={onClick}>
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="ci-tick">
        <Icon name="check" />
      </span>
    </button>
  );
}

export function QuestionInput({
  spec,
  value,
  onChange,
  onSubmit,
}: {
  spec: FactSpec;
  value: FactValue;
  onChange: (v: FactValue) => void;
  onSubmit: () => void;
}) {
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && (spec.type !== "text" || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  switch (spec.type) {
    case "boolean":
      return (
        <div className="ci-opts" role="radiogroup" aria-label={spec.label}>
          <Option label="Yes" on={value === true} onClick={() => onChange(true)} />
          <Option label="No" on={value === false} onClick={() => onChange(false)} />
        </div>
      );
    case "choice":
      return (
        <div className="ci-opts" role="radiogroup" aria-label={spec.label}>
          {(spec.choices ?? []).map((c) => (
            <Option key={c} label={choiceLabel(c)} on={value === c} onClick={() => onChange(c)} />
          ))}
        </div>
      );
    case "list": {
      const picked = Array.isArray(value) ? value : [];
      if (!spec.choices) {
        return (
          <textarea
            className="ci-input"
            value={picked.join("\n")}
            onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            placeholder="One per line"
            aria-label={spec.label}
            autoFocus
          />
        );
      }
      return (
        <div className="ci-opts" role="group" aria-label={spec.label}>
          <p className="ci-src" style={{ margin: "0 0 2px" }}>
            Choose all that apply
          </p>
          {spec.choices.map((c) => (
            <Option
              key={c}
              multi
              label={choiceLabel(c)}
              on={picked.includes(c)}
              onClick={() => onChange(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])}
            />
          ))}
          <Option multi label="None of these" on={Array.isArray(value) && value.length === 0} onClick={() => onChange([])} />
        </div>
      );
    }
    case "date":
      return (
        <input
          type="date"
          className="ci-input date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          onKeyDown={enter}
          aria-label={spec.label}
          autoFocus
        />
      );
    case "number":
      return (
        <input
          type="number"
          inputMode="decimal"
          className="ci-input"
          style={{ maxWidth: 220 }}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          onKeyDown={enter}
          aria-label={spec.label}
          autoFocus
        />
      );
    case "text":
      return (
        <textarea
          className="ci-input"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enter}
          placeholder="In your own words"
          aria-label={spec.label}
          autoFocus
        />
      );
  }
}
