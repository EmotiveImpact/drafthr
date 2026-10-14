import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Banknote,
  BriefcaseBusiness,
  Building2,
  Check,
  Hash,
  Mail,
  MapPin,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Question, RepeaterValue } from "@/lib/letters/questions";
import { isQuestionAnswered } from "@/lib/letters/questions";
import { Input } from "@/components/ui/input";
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
import { Avatar } from "@/components/ds/Avatar";
import { cn } from "@/lib/utils";
import { DatePicker, formatDateShort } from "./DatePicker";
import { Segmented, TALL_SWITCH, plainLabel } from "./kit";

type Props = {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Nested inside a repeater item (smaller gap under the label row). */
  nested?: boolean;
  /** People a "who attended" question offers in one click, with roles. */
  people?: Person[];
};

/** A select with this many options or fewer shows as a segmented switch. */
const SEGMENT_MAX = 4;

/** Questions narrow enough to sit two to a row. */
export function isShortQuestion(q: Question): boolean {
  if (q.type === "date" || q.type === "number" || q.type === "currency") return true;
  if (q.type === "select") return (q.options?.length ?? 0) > SEGMENT_MAX;
  if (q.type === "text") return q.label.length <= 48 && !/address/i.test(q.id);
  return false;
}

/**
 * Help longer than this is a sentence, not a hint: it sits under the label,
 * left-aligned, instead of beside it on the right (the mock's right-hand
 * hints are one short line, such as "6 days over 4 occasions in the last
 * 8 weeks").
 */
const SHORT_HELP_MAX = 60;

/** Whether a question's help is a short hint that fits beside the label. */
export function isShortHelp(help: string): boolean {
  return help.length <= SHORT_HELP_MAX;
}

/** A free-text question that lists people ("Hearing attendees", "Witnesses"). */
export function isPeopleQuestion(q: Question): boolean {
  return (q.type === "textarea" || q.type === "text") && /attendees|witnesses/i.test(q.id);
}

/** Short human reading of an answer, for step summaries. */
export function displayValue(q: Question, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  switch (q.type) {
    case "select":
      return plainLabel(q.options?.find((o) => o.value === value)?.label ?? String(value));
    case "select_multi":
      return Array.isArray(value) ? `${value.length} chosen` : "";
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatDateShort(value);
    case "repeater": {
      const items = Array.isArray(value) ? (value as RepeaterValue).filter((it) => Object.values(it).some(filled)) : [];
      const noun = (q.repeater?.itemLabel ?? "item").toLowerCase();
      return items.length ? `${items.length} ${noun}${items.length === 1 ? "" : "s"}` : "";
    }
    default:
      return String(value).split("\n")[0];
  }
}

function filled(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

const ICON_BY_ID: [RegExp, LucideIcon][] = [
  [/email/i, Mail],
  [/address|location/i, MapPin],
  [/jobtitle|title$/i, BriefcaseBusiness],
  [/department|employerlegalname|company/i, Building2],
  [/name|officer|manager|signatory/i, UserRound],
];

function iconFor(q: Question): LucideIcon | undefined {
  if (q.type === "currency") return Banknote;
  if (q.type === "number") return Hash;
  if (q.type !== "text") return undefined;
  return ICON_BY_ID.find(([re]) => re.test(q.id))?.[1];
}

/**
 * One question: the label row (13.5px medium label, required mark, a short
 * hint on the right in subtle grey, longer help under the label) and the control
 * for its type. The new letter page wraps these in hairline sections.
 */
export function QuestionField({ q, value, onChange, nested = false, people }: Props) {
  const id = `q-${q.id}`;
  const labelId = `${id}-label`;
  const label = plainLabel(q.label);
  const help = q.help ? plainLabel(q.help) : "";
  // A short hint sits beside the label on wider screens; a longer one
  // always sits under it, left-aligned.
  const helpBeside = help !== "" && isShortHelp(help);
  // Grouped controls (segmented, chips, switch, repeater) are labelled by the
  // label text; plain fields use <label for>.
  const grouped =
    q.type === "repeater" ||
    q.type === "select_multi" ||
    q.type === "boolean" ||
    (q.type === "select" && (q.options?.length ?? 0) <= SEGMENT_MAX) ||
    isPeopleQuestion(q);

  const LabelTag = grouped ? "span" : "label";
  return (
    <div className="min-w-0">
      {/* Label row (mock `.flab`): the label on the left and a short hint on
       * the right in subtle grey. Longer help, and any help on phones, sits
       * under the label, left-aligned. */}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          helpBeside && "sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-6",
          nested ? "mb-1.5" : "mb-[9px]"
        )}
      >
        <LabelTag
          id={labelId}
          {...(grouped ? {} : { htmlFor: id })}
          className={cn(
            "min-w-0 text-[13.5px] font-medium leading-snug text-[var(--ds-ink)]",
            // With help beside it the label keeps its width (up to 55%) and
            // the help wraps; on its own a long label shrinks and wraps.
            helpBeside ? "shrink-0 sm:max-w-[55%]" : "shrink [overflow-wrap:anywhere]"
          )}
        >
          {label}
          {q.required && (
            <span aria-hidden className="ml-0.5 text-[var(--ds-red-fg)]">
              *
            </span>
          )}
          {q.required && <span className="sr-only"> (required)</span>}
        </LabelTag>
        {help && (
          <span
            className={cn(
              "min-w-0 text-[12.5px] leading-snug text-[var(--ds-subtle)]",
              helpBeside ? "sm:max-w-[60%] sm:text-right" : "max-w-[72ch]"
            )}
          >
            {help}
          </span>
        )}
      </div>
      {renderControl(q, id, labelId, value, onChange, people)}
    </div>
  );
}

function renderControl(
  q: Question,
  id: string,
  labelId: string,
  value: unknown,
  onChange: (v: unknown) => void,
  people?: Person[]
): ReactNode {
  if (isPeopleQuestion(q)) {
    return <PeopleField id={id} labelId={labelId} value={value} onChange={onChange} suggestions={people} />;
  }
  switch (q.type) {
    case "repeater":
      return <RepeaterField q={q} labelId={labelId} value={value} onChange={onChange} />;

    case "select_multi": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      return (
        <div id={id} role="group" aria-labelledby={labelId} aria-required={q.required} className="flex flex-wrap gap-2">
          {q.options?.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(opt.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-[11px] text-[13.5px] transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none",
                  on
                    ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
                    : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)]"
                )}
              >
                {on && <Check aria-hidden className="size-3.5" />}
                {plainLabel(opt.label)}
              </button>
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
          rows={3}
          className="resize-y"
        />
      );

    case "select": {
      const options = q.options ?? [];
      const select = (
        <Select value={(value as string) || undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger
            id={id}
            aria-required={q.required}
            aria-labelledby={options.length <= SEGMENT_MAX ? labelId : undefined}
            className="w-full"
          >
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {plainLabel(opt.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      if (options.length <= SEGMENT_MAX) {
        return (
          <SegmentedOrSelect
            label={plainLabel(q.label)}
            segmented={(groupLabel, measure) => (
              <Segmented
                label={groupLabel}
                value={measure ? undefined : (value as string) || undefined}
                onChange={(v) => onChange(v)}
                options={options.map((o) => ({ value: o.value, label: plainLabel(o.label) }))}
              />
            )}
            select={select}
          />
        );
      }
      return select;
    }

    case "boolean":
      // The whole row is the tap target: a 36px tall switch (phone
      // minimum) inside a label that also covers the Yes/No word. The
      // switch keeps its name from the question label.
      return (
        <label htmlFor={id} className="inline-flex min-h-9 cursor-pointer items-center gap-3 pr-2">
          <Switch
            id={id}
            aria-labelledby={labelId}
            aria-required={q.required}
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(v)}
            className={TALL_SWITCH}
          />
          <span aria-hidden className="text-[13.5px] text-[var(--ds-muted)]">
            {value ? "Yes" : "No"}
          </span>
        </label>
      );

    case "date":
      return <DatePicker id={id} labelledBy={labelId} value={value} onChange={onChange} required={q.required} />;

    case "number":
    case "currency":
      return (
        <IconInput icon={iconFor(q)}>
          <Input
            id={id}
            aria-required={q.required}
            type="number"
            inputMode={q.type === "currency" ? "decimal" : "numeric"}
            step={q.type === "currency" ? "0.01" : undefined}
            value={(value as number | string | undefined) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            placeholder={q.placeholder ?? (q.type === "currency" ? "0.00" : undefined)}
          />
        </IconInput>
      );

    case "text":
    default:
      return (
        <IconInput icon={iconFor(q)}>
          <Input
            id={id}
            aria-required={q.required}
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder}
          />
        </IconInput>
      );
  }
}

/** A field with a small leading icon in subtle grey. */
function IconInput({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  if (!Icon) return <>{children}</>;
  return (
    <div className="relative [&_input]:pl-9">
      <Icon
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 z-[1] size-[15px] -translate-y-1/2 text-[var(--ds-subtle)]"
      />
      {children}
    </div>
  );
}

/**
 * A short select shows as the kit segmented switch when all its options fit
 * on one row; when they do not (long labels, a narrow column or a phone) it
 * falls back to the kit select, so no option is ever clipped. An invisible
 * copy of the switch measures its natural width.
 */
function SegmentedOrSelect({
  segmented,
  select,
  label,
}: {
  segmented: (label: string, measure: boolean) => ReactNode;
  select: ReactNode;
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const probe = measureRef.current;
    if (!wrap || !probe) return;
    const measure = () => {
      const natural = probe.firstElementChild?.getBoundingClientRect().width ?? 0;
      const room = wrap.getBoundingClientRect().width;
      setFits(room === 0 || natural <= room + 0.5);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrapRef} className="relative min-w-0">
      {/* Clipped to nothing so the copy can never widen the page. */}
      <div aria-hidden inert className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={measureRef} className="w-max">
          {segmented(`${label} (measure)`, true)}
        </div>
      </div>
      {fits ? segmented(label, false) : select}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People ("Who attended")                                             */

/* ------------------------------------------------------------------ */

type Person = { name: string; role: string };

/** "Jordan Hale, employee" per line → people. Lines that do not split keep
 * the whole line as the name. */
export function parsePeople(text: unknown): Person[] {
  if (typeof text !== "string") return [];
  return text
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const paren = line.match(/^(.*?)\s*\((.+)\)\s*$/);
      if (paren) return { name: paren[1].trim(), role: paren[2].trim() };
      const i = line.indexOf(",");
      return i > 0 ? { name: line.slice(0, i).trim(), role: line.slice(i + 1).trim() } : { name: line, role: "" };
    });
}

export function formatPeople(people: Person[]): string {
  return people.map((p) => (p.role ? `${p.name}, ${p.role}` : p.name)).join("\n");
}

/**
 * People chips with a small avatar, the name and the role in subtle grey,
 * and a dashed Add chip. The answer is still plain text, one person a line,
 * so it can also be edited as text.
 */
/** Quick picks for a person's role in the add form. */
const ROLE_PICKS = ["Chair", "Employee", "Companion", "Note taker", "Witness", "HR"];

function PeopleField({
  id,
  labelId,
  value,
  onChange,
  suggestions = [],
}: {
  id: string;
  labelId: string;
  value: unknown;
  onChange: (v: unknown) => void;
  suggestions?: Person[];
}) {
  const people = parsePeople(value);
  const [adding, setAdding] = useState(false);
  const [asText, setAsText] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const uid = useId();

  if (asText) {
    return (
      <div>
        <Textarea
          id={id}
          aria-labelledby={labelId}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="One person a line, for example: Marcus Lee, union representative"
        />
        <button
          type="button"
          onClick={() => setAsText(false)}
          className="mt-1.5 rounded-[4px] text-[12.5px] text-[var(--ds-muted)] underline-offset-2 hover:text-[var(--ds-ink)] hover:underline"
        >
          Show as people
        </button>
      </div>
    );
  }

  const listed = new Set(people.map((p) => p.name.trim().toLowerCase()));
  const offers = suggestions.filter((p) => p.name.trim() && !listed.has(p.name.trim().toLowerCase()));

  const add = () => {
    const n = name.trim();
    if (!n || !role.trim()) return;
    onChange(formatPeople([...people, { name: n, role: role.trim() }]));
    setName("");
    setRole("");
    setAdding(false);
  };

  return (
    <div role="group" aria-labelledby={labelId} id={id}>
      <div className="flex flex-wrap items-center gap-2">
        {people.map((p, i) => (
          <span
            key={`${p.name}-${i}`}
            className="inline-flex h-8 max-w-full items-center gap-[7px] rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] pl-1.5 pr-1 text-[13.5px] text-[var(--ds-ink)]"
          >
            <Avatar name={p.name} seed={p.name} size="sm" />
            <span className="truncate">{p.name}</span>
            {p.role && <em className="truncate text-[12.5px] not-italic text-[var(--ds-subtle)]">{p.role}</em>}
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => onChange(formatPeople(people.filter((_, j) => j !== i)))}
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-[var(--ds-subtle)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!adding &&
          offers.map((p) => (
            <button
              key={`offer-${p.name}`}
              type="button"
              onClick={() => onChange(formatPeople([...people, p]))}
              aria-label={`Add ${p.name}, ${p.role}`}
              className="inline-flex h-8 max-w-full items-center gap-[7px] rounded-[8px] border border-dashed border-[var(--ds-line-strong)] px-[11px] text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
              <em className="shrink-0 text-[12.5px] not-italic text-[var(--ds-subtle)]">{p.role}</em>
            </button>
          ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-[7px] rounded-[8px] border border-dashed border-[var(--ds-line-strong)] px-[11px] text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
          >
            <UserPlus aria-hidden className="size-3.5" />
            Add
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-[12px] bg-[var(--ds-surface-2)] p-3">
          <div className="min-w-[160px] flex-1">
            <label htmlFor={`${uid}-n`} className="mb-1 block text-[12.5px] text-[var(--ds-muted)]">
              Name
            </label>
            <Input
              id={`${uid}-n`}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label htmlFor={`${uid}-r`} className="mb-1 block text-[12.5px] text-[var(--ds-muted)]">
              Role
            </label>
            <Input
              id={`${uid}-r`}
              value={role}
              placeholder="For example chair or companion"
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            />
          </div>
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Pick a role">
            {ROLE_PICKS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-2.5 text-[12.5px] transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none",
                  role === r
                    ? "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-on-accent)]"
                    : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-body)] hover:border-[var(--ds-line-strong)]"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={add} disabled={!name.trim() || !role.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAsText(true)}
        className="mt-2 rounded-[4px] text-[12.5px] text-[var(--ds-muted)] underline-offset-2 hover:text-[var(--ds-ink)] hover:underline"
      >
        Edit as text
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Repeater                                                            */
/* ------------------------------------------------------------------ */

function itemSummary(fields: Question[], item: Record<string, unknown>): { main: string; note: string } {
  const textField = fields.find((f) => (f.type === "text" || f.type === "textarea") && filled(item[f.id]));
  const dateField = fields.find((f) => f.type === "date" && filled(item[f.id]));
  const main = textField ? String(item[textField.id]).split("\n")[0] : "";
  const note = dateField ? formatDateShort(item[dateField.id]) : "";
  return { main, note };
}

/**
 * Repeater (incidents, concerns, improvements): each item is a chip (its
 * first words, and its date in subtle grey when it has one), with a dashed
 * "Add <item>" chip. Clicking a chip opens its fields in a grey panel under
 * the row. Every sub-field is still asked and saved as before.
 */
function RepeaterField({
  q,
  labelId,
  value,
  onChange,
}: {
  q: Question;
  labelId: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cfg = q.repeater;
  const min = cfg?.minItems ?? 0;
  const max = cfg?.maxItems ?? 99;
  const defaultCount = Math.max(cfg?.defaultItems ?? 1, min);
  const items: RepeaterValue = Array.isArray(value)
    ? (value as RepeaterValue)
    : Array.from({ length: defaultCount }, () => ({}));
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    if (!cfg) return null;
    const firstIncomplete = items.findIndex(
      (it) => !cfg.fields.filter((f) => f.required).every((f) => isQuestionAnswered(f, it[f.id]))
    );
    return firstIncomplete >= 0 ? firstIncomplete : null;
  });

  // Hydrate to defaultCount on first render if the value was empty.
  useEffect(() => {
    if (cfg && !Array.isArray(value) && defaultCount > 0) onChange(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!cfg) return null;
  const noun = cfg.itemLabel;
  const lower = noun.toLowerCase();

  const updateItem = (index: number, patch: Record<string, unknown>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const addItem = () => {
    if (items.length >= max) return;
    onChange([...items, {}]);
    setOpenIndex(items.length);
  };
  const removeItem = (index: number) => {
    if (items.length <= min) return;
    onChange(items.filter((_, i) => i !== index));
    setOpenIndex(null);
  };

  const open = openIndex !== null && openIndex < items.length ? openIndex : null;

  // How many items the question needs (at least one when required). A blank
  // item beyond that is optional, so it is not marked "to fill in": the
  // Continue gate does not wait for it, and blank items are dropped when
  // the draft is made.
  const requiredCount = q.required ? Math.max(min, 1) : min;
  const isBlank = (it: Record<string, unknown>) => !Object.values(it).some(filled);
  const needed = (idx: number) => {
    if (!isBlank(items[idx] ?? {})) return true;
    const started = items.filter((it) => !isBlank(it)).length;
    const blanksBefore = items.slice(0, idx).filter(isBlank).length;
    return started + blanksBefore < requiredCount;
  };

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item, idx) => {
          const { main, note } = itemSummary(cfg.fields, item);
          const on = open === idx;
          return (
            <button
              key={idx}
              type="button"
              aria-expanded={on}
              onClick={() => setOpenIndex(on ? null : idx)}
              title={main || undefined}
              className={cn(
                "inline-flex h-8 max-w-[280px] items-center gap-[7px] rounded-[8px] border px-[11px] text-[13.5px] transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)] focus-visible:outline-none",
                on
                  ? "border-[var(--ds-ink)] bg-[var(--ds-surface)] text-[var(--ds-ink)]"
                  : "border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] hover:border-[var(--ds-line-strong)]"
              )}
            >
              {main ? (
                <span className="truncate">{main}</span>
              ) : (
                <span className="text-[var(--ds-muted)]">
                  {noun} {idx + 1}
                </span>
              )}
              {note ? (
                <em className="shrink-0 text-[12.5px] not-italic text-[var(--ds-subtle)]">{note}</em>
              ) : !main ? (
                needed(idx) ? (
                  <em className="shrink-0 text-[12.5px] not-italic text-[var(--ds-amber-fg)]">to fill in</em>
                ) : (
                  <em className="shrink-0 text-[12.5px] not-italic text-[var(--ds-subtle)]">optional</em>
                )
              ) : null}
            </button>
          );
        })}
        {items.length < max && (
          <button
            type="button"
            onClick={addItem}
            className="inline-flex h-8 items-center gap-[7px] rounded-[8px] border border-dashed border-[var(--ds-line-strong)] px-[11px] text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]"
          >
            <Plus aria-hidden className="size-3.5" />
            Add {lower}
          </button>
        )}
      </div>

      {open !== null && (
        <div className="mt-3 animate-[ds-fade-in_0.18s_ease_both] rounded-[12px] bg-[var(--ds-surface-2)] p-3.5 motion-reduce:animate-none">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-[var(--ds-muted)]">
              {noun} {open + 1}
            </span>
            {items.length > min && (
              <button
                type="button"
                onClick={() => removeItem(open)}
                className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[12.5px] text-[var(--ds-muted)] hover:bg-[var(--ds-surface)] hover:text-[var(--ds-red-fg)]"
                aria-label={`Remove ${lower} ${open + 1}`}
              >
                <Trash2 className="size-3" />
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-3.5">
            {cfg.fields.map((sub) => (
              <QuestionField
                key={`${open}-${sub.id}`}
                q={{ ...sub, id: `${q.id}-${open}-${sub.id}` }}
                nested
                value={items[open]?.[sub.id]}
                onChange={(v) => updateItem(open, { [sub.id]: v })}
              />
            ))}
          </div>
          <div className="mt-3.5 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpenIndex(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
