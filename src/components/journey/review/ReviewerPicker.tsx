import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Loader2,
  Lock,
  Send,
  ShieldCheck,
  Star,
  Store,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ds/Avatar";
import { Pill } from "@/components/ds/Pill";
import { ExpertAvatar } from "@/components/consultants/ui";
import { VAT_RATE_CHARGED, bookingTotals } from "@/components/consultants/market";
import { useDraftStore } from "@/lib/store";
import { getFlag } from "@/lib/flags";
import { firstName, type ReviewKind } from "@/lib/journey/reviews";
import type { ReviewPickerPreset } from "@/components/journey/ui-store";
import { BackByField } from "./DatePicker";
import { bookExpert, sendToTeammate, sendToTrusted, useMe } from "./actions";
import { useExperts, lowestPrice, type Expert } from "./experts";
import {
  conflictFor,
  useAllReviewRequests,
  usualReplyTime,
  useSavedReviewers,
  useTeammates,
  type Teammate,
} from "./people";
import {
  defaultDueAt,
  askPlaceholder,
  expertSuggestion,
  fmtDayDate,
  money,
  shareableEvidence,
  slaHours,
  turnaroundWords,
} from "./model";
import { linkExpiryDays } from "./trusted-api";
import { clearPickerForm, readPickerForm, savePickerForm, useReturnFocus } from "./review-ui";

/**
 * "Who should review this letter?" (mocks f2-choose, rv-pick, mk-pick,
 * mk-back): three cards (someone in your team, someone you trust, a DraftHR
 * expert), the pane for the chosen one, then what to look at, the back-by
 * date, what to share, and the send button.
 */
export function ReviewerPicker({
  draftId,
  preset,
  onClose,
}: {
  draftId: string;
  preset?: ReviewPickerPreset;
  onClose: () => void;
}) {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const me = useMe();
  const navigate = useNavigate();
  const returnFocus = useReturnFocus(true);
  const trustedOn = getFlag("trustedReviewLinks");
  const employeeLetter = draft?.mode === "employee";
  const suggestion = useMemo(() => (draft ? expertSuggestion(draft) : null), [draft]);

  const initialKind: ReviewKind =
    preset?.kind && !(preset.kind === "team" && employeeLetter) && !(preset.kind === "trusted" && !trustedOn)
      ? preset.kind
      : suggestion?.suggested || employeeLetter
        ? "expert"
        : "team";
  const [kind, setKind] = useState<ReviewKind>(initialKind);

  // What they typed survives the trip to the marketplace.
  const saved = useMemo(() => (preset?.from === "marketplace" ? readPickerForm(draftId) : null), [draftId, preset]);
  const [ask, setAsk] = useState(saved?.ask ?? "");
  const [dueAt, setDueAt] = useState(preset?.dueAt ?? saved?.dueAt ?? defaultDueAt(48));
  const evidence = useMemo(() => shareableEvidence(draft?.evidence), [draft?.evidence]);
  const [shareEvidence, setShareEvidence] = useState(saved?.share.evidence ?? evidence.files.length > 0);
  const [shareNotes, setShareNotes] = useState(saved?.share.hearingNotes ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Team
  const teammates = useTeammates(draft, me.email, true);
  const requests = useAllReviewRequests();
  const [teamKey, setTeamKey] = useState<string | null>(null);
  const [approveSameStep, setApproveSameStep] = useState(true);
  const [otherName, setOtherName] = useState("");
  const [otherEmail, setOtherEmail] = useState("");

  // Trusted
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tTouched, setTTouched] = useState(false);
  const savedPeople = useSavedReviewers((s) => s.people);

  // Expert
  const experts = useExperts(draft, true);
  const [expertId, setExpertId] = useState<string | null>(null);
  const chosen = preset?.expertId ? experts.all.find((e) => e.id === preset.expertId) ?? null : null;
  const chosenMissing = !!preset?.expertId && experts.status !== "loading" && !chosen;
  const expertRows = useMemo(() => {
    const top = experts.matching.filter((e) => e.id !== chosen?.id).slice(0, chosen ? 2 : 3);
    return chosen ? [chosen, ...top] : top;
  }, [experts.matching, chosen]);
  const bestMatchId = experts.matching[0]?.id;
  const selectedExpert = expertRows.find((e) => e.id === expertId) ?? null;
  const cheapest = lowestPrice(experts.all);

  // Default selections once the lists arrive.
  useEffect(() => {
    if (teamKey || teammates.people.length === 0) return;
    const clean = teammates.people.filter((p) => !conflictFor(draft, p.name));
    const pick = clean.find((p) => p.canApprove) ?? clean[0] ?? teammates.people[0];
    setTeamKey(pick.key);
  }, [teammates.people, teamKey, draft]);
  useEffect(() => {
    if (expertId && expertRows.some((e) => e.id === expertId)) return;
    if (expertRows[0]) setExpertId(expertRows[0].id);
  }, [expertRows, expertId]);

  // An expert needs at least their turnaround.
  const minDue = kind === "expert" && selectedExpert ? Date.now() + slaHours(selectedExpert.sla) * 3600000 : Date.now() + 30 * 60000;
  useEffect(() => {
    if (Date.parse(dueAt) < minDue) setDueAt(defaultDueAt(Math.ceil((minDue - Date.now()) / 3600000)));
  }, [minDue, dueAt]);

  const selectedTeammate: Teammate | null =
    teammates.people.find((p) => p.key === teamKey) ??
    (teammates.people.length === 0 && otherName.trim() && validEmail(otherEmail)
      ? { key: "typed", name: otherName.trim(), email: otherEmail.trim(), line: "", canApprove: false }
      : null);

  const tEmailBad = tEmail.trim().length > 0 && !validEmail(tEmail);
  const firstTyped = firstName(tName);

  const ready =
    !busy &&
    !!draft &&
    Date.parse(dueAt) >= minDue - 60000 &&
    (kind === "team"
      ? !!selectedTeammate
      : kind === "trusted"
        ? !!tName.trim() && validEmail(tEmail)
        : !!selectedExpert && experts.status === "ready");

  const goLabel =
    kind === "team"
      ? selectedTeammate
        ? `Send to ${firstName(selectedTeammate.name)}`
        : "Send for review"
      : kind === "trusted"
        ? firstTyped
          ? `Send to ${firstTyped}`
          : "Send for review"
        : selectedExpert
          ? `Book ${firstName(selectedExpert.name)} for ${money(bookingTotals(selectedExpert.price).total, selectedExpert.symbol)}`
          : "Book an expert";

  const share = { evidence: shareEvidence && evidence.files.length > 0, hearingNotes: shareNotes };

  const toMarketplace = () => {
    savePickerForm(draftId, { ask, dueAt, share });
    onClose();
    navigate(`/consultants?for=${encodeURIComponent(draftId)}&due=${encodeURIComponent(dueAt)}`);
  };

  const submit = async () => {
    if (!ready || !draft) return;
    setBusy(true);
    setError(null);
    const opts = { ask, dueAt, share };
    try {
      if (kind === "team" && selectedTeammate) {
        await sendToTeammate(draft, selectedTeammate, { ...opts, approveInSameStep: approveSameStep }, me);
        toast.success(`Sent to ${firstName(selectedTeammate.name)} for review`);
      } else if (kind === "trusted") {
        const res = await sendToTrusted(draft, { name: tName, email: tEmail }, opts, me);
        if (!res.ok) {
          setError(res.message);
          setBusy(false);
          return;
        }
        toast.success(`Secure link sent to ${firstName(tName)}`);
      } else if (kind === "expert" && selectedExpert) {
        const res = await bookExpert(draft, selectedExpert, opts, me);
        if (!res.ok) {
          setBusy(false);
          return;
        }
        toast.success(`Booking sent to ${firstName(selectedExpert.name)}`);
      }
      clearPickerForm(draftId);
      onClose();
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  };

  // The three cards: a radio group (arrow keys move the choice).
  const cards: { kind: ReviewKind; show: boolean }[] = [
    { kind: "team", show: true },
    { kind: "trusted", show: trustedOn },
    { kind: "expert", show: true },
  ];
  const shown = cards.filter((c) => c.show).map((c) => c.kind);
  const enabledKinds = shown.filter((k) => !(k === "team" && employeeLetter));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const onCardsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = enabledKinds.indexOf(kind);
    const next = enabledKinds[(i + dir + enabledKinds.length) % enabledKinds.length];
    setKind(next);
    cardRefs.current[next]?.focus();
  };

  if (!draft) return null;

  const fromMarketplace = preset?.from === "marketplace" || !!preset?.expertId;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        showCloseButton={false}
        data-testid="review-picker"
        onCloseAutoFocus={returnFocus}
        className={cn(
          "flex max-h-[calc(100dvh-32px)] w-[780px] max-w-[calc(100vw-32px)] flex-col gap-0 overflow-hidden rounded-[16px] p-0 sm:max-w-[780px]",
          "data-[state=open]:duration-[160ms] data-[state=closed]:duration-[120ms] motion-reduce:data-[state=open]:slide-in-from-bottom-0",
          "max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[calc(100dvh-16px)] max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none"
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-[26px] pb-1 max-sm:px-4 max-sm:pt-5">
          <DialogTitle className="text-[26px] leading-[1.2] max-sm:text-[23px]">
            Who should review this letter?
          </DialogTitle>
          <DialogDescription className="mt-1.5 mb-[18px] text-[14.5px] leading-[1.5] text-[var(--ds-muted)]">
            They can suggest changes and leave comments. Nothing changes in the letter until you accept it.
          </DialogDescription>

          <div
            role="radiogroup"
            aria-label="Who should review it"
            onKeyDown={onCardsKey}
            className={cn("grid gap-2.5 max-sm:grid-cols-1", shown.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
          >
            {shown.includes("team") && (
              <KindCard
                refCb={(el) => (cardRefs.current.team = el)}
                on={kind === "team"}
                disabled={employeeLetter}
                onSelect={() => setKind("team")}
                tile={{ bg: "var(--ds-av-1)", fg: "var(--ds-av-1-fg)", icon: <Users className="size-[18px]" strokeWidth={1.6} /> }}
                title="Someone in your team"
                desc="A manager or HR colleague. They can approve it in the same step."
                cost={employeeLetter ? "Not for your own letters, which have no HR team" : "Free"}
                testId="review-kind-team"
              />
            )}
            {shown.includes("trusted") && (
              <KindCard
                refCb={(el) => (cardRefs.current.trusted = el)}
                on={kind === "trusted"}
                onSelect={() => setKind("trusted")}
                tile={{ bg: "var(--ds-av-3)", fg: "var(--ds-av-3-fg)", icon: <UserCheck className="size-[18px]" strokeWidth={1.6} /> }}
                title="Someone you trust"
                desc="Your own solicitor or HR consultant. They get a secure link, no account needed."
                cost="Free in DraftHR"
                testId="review-kind-trusted"
              />
            )}
            <KindCard
              refCb={(el) => (cardRefs.current.expert = el)}
              on={kind === "expert"}
              onSelect={() => setKind("expert")}
              tile={{ bg: "var(--ds-lilac-bg)", fg: "var(--ds-lilac-ink)", icon: <BadgeCheck className="size-[18px]" strokeWidth={1.6} /> }}
              title="A DraftHR expert"
              desc="Vetted employment lawyers and HR consultants from the marketplace."
              cost={
                cheapest
                  ? `From ${money(cheapest.price, cheapest.symbol)}, paid when they accept`
                  : "Paid when they accept"
              }
              tag={suggestion?.suggested ? "Suggested" : undefined}
              testId="review-kind-expert"
            />
          </div>

          {/* ---------------- Team ---------------- */}
          {kind === "team" && (
            <div className="mt-[18px]" data-testid="review-pane-team">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--ds-ink)]" id="team-label">
                Choose a reviewer
              </span>
              {teammates.status === "loading" ? (
                <PlaceholderList rows={3} />
              ) : teammates.people.length > 0 ? (
                <div role="radiogroup" aria-labelledby="team-label" className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--ds-line)]">
                  {teammates.people.map((p) => {
                    const conflict = conflictFor(draft, p.name);
                    const usual = conflict ? null : usualReplyTime(requests, p.email);
                    return (
                      <PickRow
                        key={p.key}
                        on={teamKey === p.key}
                        onSelect={() => setTeamKey(p.key)}
                        avatar={<Avatar size="2xl" name={p.name} seed={p.email ?? p.name} />}
                        name={p.name}
                        sub={conflict ? `${p.line.split(" · ")[0]} · ${conflict}` : p.line}
                        right={
                          conflict ? (
                            <Pill tone="amber">Conflict</Pill>
                          ) : usual ? (
                            <Pill tone="grey">Usually replies in {usual}</Pill>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3">
                  <p className="m-0 text-[13.5px] text-[var(--ds-ink)]">
                    {teammates.status === "failed" ? "Your team couldn't be loaded right now." : "No teammates yet."}
                  </p>
                  <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">
                    Type who should review it, or{" "}
                    <Link to="/settings?tab=team" className="text-[var(--ds-ink)] underline underline-offset-[3px]" onClick={onClose}>
                      invite people in Settings
                    </Link>
                    .
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <Field label="Name">
                      {(id) => <TextInput id={id} value={otherName} onChange={setOtherName} autoComplete="off" />}
                    </Field>
                    <Field label="Email" error={otherEmail.trim() && !validEmail(otherEmail) ? "Enter a valid email address" : undefined}>
                      {(id, describedBy) => (
                        <TextInput id={id} type="email" value={otherEmail} onChange={setOtherEmail} autoComplete="off" describedBy={describedBy} />
                      )}
                    </Field>
                  </div>
                </div>
              )}
              {selectedTeammate?.canApprove && (
                <label className="mt-3 flex items-center gap-2.5 text-[13px] text-[var(--ds-body)]">
                  <Switch checked={approveSameStep} onCheckedChange={setApproveSameStep} aria-label="They approve it at the end of the review" />
                  <span>
                    {firstName(selectedTeammate.name)} can approve it at the end of the review, so there's no separate approval step
                  </span>
                </label>
              )}
            </div>
          )}

          {/* ---------------- Trusted ---------------- */}
          {kind === "trusted" && (
            <div className="mt-[18px]" data-testid="review-pane-trusted">
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                <Field label="Name">{(id) => <TextInput id={id} value={tName} onChange={setTName} autoComplete="off" />}</Field>
                <Field label="Email" error={tTouched && tEmailBad ? "Enter a valid email address" : undefined}>
                  {(id, describedBy) => (
                    <TextInput
                      id={id}
                      type="email"
                      value={tEmail}
                      onChange={setTEmail}
                      onBlur={() => setTTouched(true)}
                      autoComplete="off"
                      describedBy={describedBy}
                    />
                  )}
                </Field>
              </div>
              {savedPeople.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--ds-muted)]">
                  Saved reviewers:
                  {savedPeople.slice(0, 4).map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      onClick={() => {
                        setTName(p.name);
                        setTEmail(p.email);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-line)] py-[3px] pr-2.5 pl-1 text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)]"
                    >
                      <Avatar size="sm" name={p.name} seed={p.email} />
                      {p.name} · {p.org || p.email}
                    </button>
                  ))}
                </div>
              )}
              <Hint icon={<Lock className="size-3.5" strokeWidth={1.6} />}>
                {firstTyped || "They"} {firstTyped ? "sees" : "see"} only this letter and the files you share, through a link that expires in{" "}
                {linkExpiryDays(Date.now(), Date.parse(dueAt))} days. They can suggest and comment, but can't approve or send.
              </Hint>
              {error && (
                <p role="alert" className="m-0 mt-2.5 rounded-[10px] bg-[var(--ds-red-soft)] px-3 py-2 text-[13px] text-[var(--ds-red-fg)]">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ---------------- Expert ---------------- */}
          {kind === "expert" && (
            <div className="mt-[18px]" data-testid="review-pane-expert">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-[var(--ds-ink)]" id="expert-label">
                  {chosen ? "Your expert" : "Best matches for this letter"}
                </span>
                {chosen || fromMarketplace ? (
                  <button type="button" onClick={toMarketplace} className="text-[13px] text-[var(--ds-ink)] underline underline-offset-[3px]">
                    Back to the marketplace
                  </button>
                ) : experts.matching.length > 0 ? (
                  <button type="button" onClick={toMarketplace} className="text-[13px] text-[var(--ds-ink)] underline underline-offset-[3px]">
                    See all {experts.matching.length}
                  </button>
                ) : null}
              </div>
              {chosenMissing && (
                <p className="m-0 mb-2 text-[12.5px] text-[var(--ds-muted)]">
                  The expert you chose isn't available right now. Here are the best matches instead.
                </p>
              )}
              {experts.status === "loading" ? (
                <PlaceholderList rows={3} />
              ) : experts.status === "failed" ? (
                <p className="m-0 rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3 text-[13px] text-[var(--ds-muted)]">
                  The marketplace couldn't be loaded right now. Try again in a moment.
                </p>
              ) : expertRows.length === 0 ? (
                <p className="m-0 rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3 text-[13px] text-[var(--ds-muted)]">
                  No experts for this letter type are available right now.
                </p>
              ) : (
                <div role="radiogroup" aria-labelledby="expert-label" className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--ds-line)]">
                  {expertRows.map((e) => (
                    <ExpertRow
                      key={e.id}
                      expert={e}
                      on={expertId === e.id}
                      onSelect={() => setExpertId(e.id)}
                      best={e.id === bestMatchId}
                      fromMarketplace={e.id === chosen?.id}
                    />
                  ))}
                </div>
              )}
              {chosen && selectedExpert ? (
                <>
                  <div role="radiogroup" aria-label="Turnaround" className="mt-2.5 flex gap-2 max-sm:flex-col">
                    <span
                      role="radio"
                      aria-checked="true"
                      className="flex flex-1 items-center gap-2 rounded-[10px] border border-[var(--ds-ink)] px-3 py-2 text-[13px] text-[var(--ds-ink)] shadow-[inset_0_0_0_0.5px_var(--ds-ink)]"
                    >
                      <span aria-hidden className="size-3.5 shrink-0 rounded-full border-[4.5px] border-[var(--ds-ink)]" />
                      Standard, back in {turnaroundWords(selectedExpert.sla)}
                      <b className="ml-auto font-medium">{money(selectedExpert.price, selectedExpert.symbol)}</b>
                    </span>
                  </div>
                  <Hint icon={<ShieldCheck className="size-3.5" strokeWidth={1.6} />}>
                    {priceLine(selectedExpert)} You pay only once {firstName(selectedExpert.name)} accepts, and you're refunded if it
                    isn't back by {fmtDayDate(Date.parse(dueAt))}.
                  </Hint>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toMarketplace}
                    className="mt-2 flex w-full items-center gap-2.5 rounded-[12px] border border-dashed border-[var(--ds-line-hover)] px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] max-sm:flex-wrap"
                  >
                    <Store aria-hidden className="size-[17px] shrink-0 text-[var(--ds-muted)]" strokeWidth={1.6} />
                    <span className="min-w-0 flex-1">
                      Not who you're after?
                      <em className="block text-[12.5px] text-[var(--ds-muted)] not-italic">
                        {/* The same N as "See all N" and the marketplace page it
                         * opens (the experts who fit this letter, MARKET-047). */}
                        {experts.matching.length > 0
                          ? `Browse all ${experts.matching.length} ${experts.matching.length === 1 ? "expert" : "experts"}. Filter by specialty, price and turnaround.`
                          : "Browse the marketplace. Filter by specialty, price and turnaround."}
                      </em>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-1 text-[13px] font-medium whitespace-nowrap">
                      Open the marketplace
                      <ArrowRight className="size-3.5" strokeWidth={1.6} />
                    </span>
                  </button>
                  <Hint icon={<ShieldCheck className="size-3.5" strokeWidth={1.6} />}>
                    {suggestion?.suggested
                      ? `DraftHR suggests an expert because this is ${suggestion.inWords}${suggestion.because ? `: ${suggestion.because}` : ""}. `
                      : ""}
                    You only pay once they accept, and you're refunded if it isn't back on time.
                  </Hint>
                </>
              )}
            </div>
          )}

          {/* ---------------- Common ---------------- */}
          <div className="mt-[18px] grid grid-cols-[1fr_200px] gap-3 max-sm:grid-cols-1">
            <Field label="What should they look at?">
              {(id) => (
                <textarea
                  id={id}
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder={askPlaceholder(draft)}
                  rows={2}
                  className="block min-h-16 w-full resize-y rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[14px] leading-[1.45] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]"
                />
              )}
            </Field>
            <Field label="Back by" error={Date.parse(dueAt) < minDue - 60000 ? "Choose a time in the future" : undefined}>
              {(id) => <BackByField id={id} value={dueAt} onChange={setDueAt} minMs={minDue} />}
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[var(--ds-ink)]">
            <Check3 checked disabled label="Share the letter" note="The reviewer always needs the letter" />
            {evidence.files.length > 0 ? (
              <Check3
                checked={shareEvidence}
                onChange={setShareEvidence}
                label={`Share evidence, ${evidence.files.length} ${evidence.files.length === 1 ? "file" : "files"}`}
              />
            ) : (
              <Check3 checked={false} disabled label="No evidence linked" />
            )}
            {evidence.hearingNotes.length > 0 && (
              <Check3 checked={shareNotes} onChange={setShareNotes} label="Share hearing notes" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-7 pt-5 pb-[22px] max-sm:flex-wrap max-sm:border-t max-sm:border-[var(--ds-line-2)] max-sm:px-4 max-sm:pt-3 max-sm:pb-4">
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] leading-[1.35] text-[var(--ds-subtle)] max-sm:basis-full">
            <Lock aria-hidden className="size-[13px] shrink-0" strokeWidth={1.6} />
            Editing pauses while it's out for review, so you both work on the same version
          </span>
          <Button variant="outline" onClick={onClose} disabled={busy} className="h-10 rounded-[10px] px-3.5 max-sm:flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!ready}
            aria-busy={busy || undefined}
            data-testid="review-picker-send"
            className="h-10 rounded-[10px] px-3.5 max-sm:flex-[2]"
          >
            {busy ? <Loader2 className="size-[15px] animate-spin" /> : <Send className="size-[15px]" strokeWidth={1.8} />}
            {busy ? (kind === "expert" ? "Booking…" : "Sending…") : goLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

/** "£180 plus VAT, £216 in total." The same totals the booking sheet shows
 *  and checkout charges (market.ts bookingTotals); while DraftHR adds no
 *  VAT, the line says so instead of inventing a VAT amount. */
function priceLine(e: Expert): string {
  const t = bookingTotals(e.price);
  return VAT_RATE_CHARGED > 0
    ? `${money(t.fee, e.symbol)} plus VAT, ${money(t.total, e.symbol)} in total.`
    : `${money(t.total, e.symbol)} in total, no VAT added.`;
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function KindCard({
  on,
  disabled,
  onSelect,
  tile,
  title,
  desc,
  cost,
  tag,
  refCb,
  testId,
}: {
  on: boolean;
  disabled?: boolean;
  onSelect: () => void;
  tile: { bg: string; fg: string; icon: ReactNode };
  title: string;
  desc: string;
  cost: string;
  tag?: string;
  refCb: (el: HTMLDivElement | null) => void;
  testId: string;
}) {
  return (
    <div
      ref={refCb}
      role="radio"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      tabIndex={on ? 0 : -1}
      data-testid={testId}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative flex cursor-pointer flex-col gap-1.5 rounded-[14px] border p-3.5 outline-none transition-[background-color,border-color] duration-[120ms] focus-visible:shadow-[var(--ds-focus-ring)]",
        on
          ? "border-[var(--ds-ink)] bg-[var(--ds-surface)] shadow-[inset_0_0_0_1px_var(--ds-ink)] focus-visible:shadow-[inset_0_0_0_1px_var(--ds-ink),var(--ds-focus-ring)]"
          : "border-[var(--ds-line)] hover:bg-[var(--ds-hover)]",
        disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
        "max-sm:grid max-sm:grid-cols-[34px_1fr] max-sm:gap-x-3 max-sm:gap-y-0.5"
      )}
    >
      {tag && (
        <span className="absolute top-3 right-3 rounded-[6px] bg-[var(--ds-green-bg)] px-[7px] py-0.5 text-[11px] font-medium text-[var(--ds-green-fg)]">
          {tag}
        </span>
      )}
      <span
        aria-hidden
        className="grid size-[34px] place-items-center rounded-[9px] max-sm:row-span-3"
        style={{ background: tile.bg, color: tile.fg }}
      >
        {tile.icon}
      </span>
      <b className="text-[14.5px] font-medium text-[var(--ds-ink)]">{title}</b>
      <em className="text-[12.5px] leading-[1.45] text-[var(--ds-muted)] not-italic">{desc}</em>
      <span className="mt-auto text-[12px] text-[var(--ds-subtle)] max-sm:col-start-2">{cost}</span>
    </div>
  );
}

function PickRow({
  on,
  onSelect,
  avatar,
  name,
  nameExtra,
  sub,
  right,
}: {
  on: boolean;
  onSelect: () => void;
  avatar: ReactNode;
  name: string;
  nameExtra?: ReactNode;
  sub: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={on}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-t border-[var(--ds-line-2)] px-3.5 py-[11px] text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] first:border-t-0 focus-visible:shadow-[inset_0_0_0_2px_var(--ds-focus)] hover:bg-[var(--ds-hover)]",
        on && "bg-[var(--ds-hover)]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 shrink-0 rounded-full",
          on ? "border-[5px] border-[var(--ds-ink)]" : "border-[1.5px] border-[var(--ds-line-strong)]"
        )}
      />
      {avatar}
      {/* Phones: the pill or price drops under the name so nothing squeezes. */}
      <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
        <div className="min-w-0 flex-1 max-sm:w-full">
          <b className="block font-medium">
            {name}
            {nameExtra}
          </b>
          <em className="block text-[12.5px] text-[var(--ds-muted)] not-italic">{sub}</em>
        </div>
        {right && <div className="ml-auto shrink-0 max-sm:ml-0 max-sm:[&>*]:text-left">{right}</div>}
      </div>
    </div>
  );
}

function ExpertRow({
  expert: e,
  on,
  onSelect,
  best,
  fromMarketplace,
}: {
  expert: Expert;
  on: boolean;
  onSelect: () => void;
  best: boolean;
  fromMarketplace: boolean;
}) {
  return (
    <PickRow
      on={on}
      onSelect={onSelect}
      avatar={<ExpertAvatar photoUrl={e.photoUrl} name={e.name} initials={e.initials} seed={e.id} size={36} />}
      name={e.name}
      nameExtra={
        <>
          {best && (
            <Pill tone="green" className="ml-1.5 align-[1px] max-sm:ml-0 max-sm:mt-0.5">
              Best match
            </Pill>
          )}
          {fromMarketplace && (
            <span className="ml-1.5 inline-block rounded-[5px] bg-[var(--ds-lilac-bg)] px-1.5 py-px align-[1px] text-[11.5px] leading-[1.5] font-medium whitespace-nowrap text-[var(--ds-lilac-fg)]">
              From the marketplace
            </span>
          )}
        </>
      }
      sub={
        <>
          <span className="max-sm:block">{e.cred}</span>
          <span className="max-sm:hidden"> · </span>
          <Star aria-hidden className="inline size-[11px] align-[-1px]" strokeWidth={1.8} />{" "}
          <span className="sr-only">Rated</span>
          {e.rating.toFixed(1)} ({e.reviews})
          <span className="hidden max-sm:inline">
            {" "}
            · {money(e.price, e.symbol)}, back in {turnaroundWords(e.sla)}
          </span>
        </>
      }
      right={
        <div className="text-right text-[12.5px] whitespace-nowrap text-[var(--ds-muted)] max-sm:hidden">
          <b className="text-[14px] font-medium text-[var(--ds-ink)]">{money(e.price, e.symbol)}</b>
          <br />
          back in {turnaroundWords(e.sla)}
        </div>
      }
    />
  );
}

function PlaceholderList({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--ds-line)]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-[var(--ds-line-2)] px-3.5 py-[11px] first:border-t-0">
          <span className="size-4 rounded-full bg-[var(--ds-surface-2)]" />
          <span className="size-9 rounded-full bg-[var(--ds-surface-2)]" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-40 rounded bg-[var(--ds-surface-2)]" />
            <span className="h-2.5 w-56 max-w-full rounded bg-[var(--ds-surface-2)]" />
          </span>
        </div>
      ))}
    </div>
  );
}

function Hint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 mt-2.5 flex items-start gap-2 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">
      <span aria-hidden className="mt-px shrink-0 text-[var(--ds-subtle)]">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[var(--ds-ink)]">
        {label}
      </label>
      {children(id, error ? errId : undefined)}
      {error && (
        <p id={errId} className="m-0 mt-1 text-[12.5px] text-[var(--ds-red-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  onBlur,
  type = "text",
  autoComplete,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  autoComplete?: string;
  describedBy?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      autoComplete={autoComplete}
      aria-invalid={describedBy ? true : undefined}
      aria-describedby={describedBy}
      className="block h-10 w-full rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[14.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] hover:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)] aria-invalid:border-[var(--ds-red-line)]"
    />
  );
}

function Check3({
  checked,
  onChange,
  disabled,
  label,
  note,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  note?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-1.5", disabled && !checked && "text-[var(--ds-muted)]")} title={note}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "grid size-4 place-items-center rounded-[4.5px] peer-focus-visible:shadow-[var(--ds-focus-ring)]",
          checked ? "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]" : "border-[1.5px] border-[var(--ds-line-strong)] bg-[var(--ds-surface)]"
        )}
      >
        {checked && <Check className="size-2.5" strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}
