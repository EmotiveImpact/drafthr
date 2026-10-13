/**
 * In-app dialogs for the list pages: a confirmation, a one-field prompt
 * (rename), the bulk "Submit for approval" approver choice and the bulk
 * "Change owner" picker.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Initials } from "./parts";
import { useKnownPeople, type KnownPerson } from "./people";

/* ─── Confirm ────────────────────────────────────────────────────────── */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── One field ──────────────────────────────────────────────────────── */

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial,
  saveLabel = "Save",
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initial: string;
  saveLabel?: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const trimmed = value.trim();
  const save = () => {
    if (!trimmed) return;
    onSave(trimmed);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[440px]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.select();
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="grid gap-4"
        >
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-[var(--ds-ink)]">{label}</span>
            <Input ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || trimmed === initial.trim()}>
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── People picker ──────────────────────────────────────────────────── */

function PeopleList({
  people,
  loading,
  value,
  onChange,
  label,
}: {
  people: KnownPerson[];
  loading: boolean;
  value: string | null;
  onChange: (key: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid max-h-64 gap-0.5 overflow-y-auto rounded-[12px] border border-[var(--ds-line)] p-1">
      {people.map((p) => {
        const k = personKey(p);
        const on = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(k)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[9px] px-2.5 text-left outline-none transition-colors duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
              on ? "bg-[var(--ds-surface-2)]" : "hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)]"
            )}
          >
            <Initials name={p.name} seed={p.seed} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-[var(--ds-ink)]">
                {p.name}
                {p.you && <span className="text-[var(--ds-muted)]"> (you)</span>}
              </span>
              {(p.email || p.role) && (
                <span className="block truncate text-[12.5px] text-[var(--ds-muted)]">{[p.email, p.role].filter(Boolean).join(" · ")}</span>
              )}
            </span>
            {on && <Check className="size-4 shrink-0 text-[var(--ds-ink)]" />}
          </button>
        );
      })}
      {loading && (
        <div className="flex min-h-11 items-center gap-3 px-2.5" aria-hidden>
          <span className="size-7 rounded-full bg-[var(--ds-surface-3)]" />
          <span className="h-3 w-40 rounded bg-[var(--ds-surface-3)]" />
        </div>
      )}
    </div>
  );
}

export const personKey = (p: { name: string; email?: string }) => (p.email || p.name).trim().toLowerCase();

/* ─── Submit for approval ────────────────────────────────────────────── */

/**
 * Ask once who should approve, then hand the name back. Teammates come from
 * the workspace; "Someone else" takes a typed name, the same choice the
 * letter workspace offers.
 */
export function SubmitForApprovalDialog({
  open,
  onOpenChange,
  count,
  eligible,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  eligible: number;
  onSubmit: (approverName: string) => void;
}) {
  const { people, loading } = useKnownPeople(open);
  const others = people.filter((p) => !p.you);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [other, setOther] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(null);
      setTyped("");
      setOther(false);
    }
  }, [open]);
  const pickedPerson = others.find((p) => personKey(p) === picked);
  const name = other || others.length === 0 ? typed.trim() : pickedPerson?.name ?? "";
  const skipped = count - eligible;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Submit for approval</DialogTitle>
          <DialogDescription>
            {eligible === 0
              ? "None of the ticked letters can go for approval yet."
              : `Send ${eligible === 1 ? "1 letter" : `${eligible} letters`} to be approved.${skipped > 0 ? ` ${skipped} will be skipped.` : ""} Who should approve ${eligible === 1 ? "it" : "them"}?`}
          </DialogDescription>
        </DialogHeader>
        {eligible > 0 && (
          <div className="grid gap-3">
            {(others.length > 0 || loading) && !other && (
              <PeopleList people={others} loading={loading} value={picked} onChange={setPicked} label="Approver" />
            )}
            {(other || (!loading && others.length === 0)) && (
              <label className="grid gap-1.5">
                <span className="text-[13px] font-medium text-[var(--ds-ink)]">Approver's name</span>
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="For example, Ruth Adeyemi" />
              </label>
            )}
            {others.length > 0 && (
              <button
                type="button"
                onClick={() => setOther((v) => !v)}
                className="justify-self-start rounded-[6px] text-[13.5px] text-[var(--ds-ink)] underline-offset-[3px] outline-none hover:underline focus-visible:shadow-[var(--ds-focus-ring)]"
              >
                {other ? "Pick a teammate instead" : "Someone else"}
              </button>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {eligible > 0 && (
            <Button
              disabled={!name}
              onClick={() => {
                onSubmit(name);
                onOpenChange(false);
              }}
            >
              Send for approval
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Change owner ───────────────────────────────────────────────────── */

export function ChangeOwnerDialog({
  open,
  onOpenChange,
  count,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onPick: (p: KnownPerson) => void;
}) {
  const { people, loading } = useKnownPeople(open);
  const others = people.filter((p) => !p.you);
  const [picked, setPicked] = useState<string | null>(null);
  // "Someone else": a name and email, added to the letter as its owner (the
  // same collaborator invite the letter's Share uses). Without it a solo
  // workspace, or one whose member list cannot load, could only pick itself.
  const [other, setOther] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (open) {
      setPicked(null);
      setOther(false);
      setName("");
      setEmail("");
    }
  }, [open]);
  const nobodyElse = !loading && others.length === 0;
  const showForm = other || nobodyElse;
  const typedEmail = email.trim().toLowerCase();
  const emailOk = EMAIL_RE.test(typedEmail);
  const listed = people.find((p) => personKey(p) === picked);
  const typed: KnownPerson | null = showForm && !listed && emailOk ? { name: name.trim() || typedEmail, email: typedEmail, seed: typedEmail } : null;
  const person = listed ?? typed;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Change owner</DialogTitle>
          <DialogDescription>
            Choose who owns {count === 1 ? "this letter" : `these ${count} letters`}. The previous owner keeps edit access.
          </DialogDescription>
        </DialogHeader>
        <PeopleList
          people={people}
          loading={loading}
          value={picked}
          onChange={(k) => {
            setPicked(k);
            setOther(false);
          }}
          label="Owner"
        />
        {showForm ? (
          <div className="grid gap-2.5 rounded-[12px] bg-[var(--ds-surface-2)] p-3">
            <p className="m-0 text-[13px] text-[var(--ds-muted)]">
              {nobodyElse ? "Nobody else is on your letters yet. Add the new owner by email." : "Add the new owner by email."} They get edit access as the owner.
            </p>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium text-[var(--ds-ink)]">Name</span>
              <Input value={name} onChange={(e) => { setName(e.target.value); setPicked(null); }} placeholder="For example, Ruth Adeyemi" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-medium text-[var(--ds-ink)]">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setPicked(null); }}
                placeholder="name@company.co.uk"
                aria-invalid={email.trim() !== "" && !emailOk}
              />
            </label>
            {email.trim() !== "" && !emailOk && <p className="m-0 text-[12.5px] text-[var(--ds-red-fg)]">Enter a full email address.</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOther(true);
              setPicked(null);
            }}
            className="justify-self-start rounded-[6px] text-[13.5px] text-[var(--ds-ink)] underline-offset-[3px] outline-none hover:underline focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            Someone else
          </button>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!person}
            onClick={() => {
              if (person) onPick(person);
              onOpenChange(false);
            }}
          >
            Change owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
