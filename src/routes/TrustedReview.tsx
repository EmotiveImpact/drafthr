import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Clock, Link2Off, Loader2, Lock, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/ds/BrandMark";
import { getFlag } from "@/lib/flags";
import { uid } from "@/lib/utils";
import { ReviewerWorkspace } from "@/components/journey/review/ReviewerWorkspace";
import { actOnLink, openLink, type LinkState, type OpenedLink } from "@/components/journey/review/trusted-api";
import { fmtShortDate } from "@/components/journey/review/model";
import { firstName } from "@/lib/journey/reviews";

/**
 * /r/:token: the review page for "someone you trust" (mock f4). Opens with
 * the secure link alone (no account, no app around it). The person can read
 * the letter and the files shared with them, suggest changes, comment,
 * message and send it back; nothing else. Every rule is enforced by the
 * server (api/review-links); this page only shows what it returns.
 */

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string }
  | { kind: "ok"; link: OpenedLink };

const POLL_MS = 30000;

export function TrustedReview() {
  const { token = "" } = useParams<{ token: string }>();
  const flagOn = getFlag("trustedReviewLinks");
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await openLink(token);
      if (res.ok) setLoaded({ kind: "ok", link: res.data });
      else setLoaded((prev) => (prev.kind === "ok" && res.code === "network" ? prev : { kind: "error", code: res.code ?? "error", message: res.message }));
    } finally {
      busy.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!flagOn) return;
    void load();
    // A new round from the asker, or a recall, shows without a reload.
    const t = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [flagOn, load]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Review a letter · DraftHR";
    return () => {
      document.title = prev;
    };
  }, []);

  const setState = (state: LinkState) =>
    setLoaded((prev) => (prev.kind === "ok" ? { kind: "ok", link: { ...prev.link, state } } : prev));

  const link = loaded.kind === "ok" ? loaded.link : null;
  const messages = useMemo(
    () =>
      (link?.state.messages ?? []).map((m) => ({
        id: m.id,
        mine: m.from === "reviewer",
        name: m.from === "reviewer" ? "You" : firstName(m.name) || "They",
        body: m.body,
        at: m.at,
      })),
    [link?.state.messages]
  );

  if (!flagOn) {
    return (
      <LinkPage icon={<Link2Off className="size-5" strokeWidth={1.6} />} title="Secure review links aren't available">
        Ask the person who sent it to share the letter another way.
      </LinkPage>
    );
  }
  if (loaded.kind === "loading") {
    return (
      <LinkPage icon={<Loader2 className="size-5 animate-spin" strokeWidth={1.6} />} title="Opening the letter…">
        This takes a moment.
      </LinkPage>
    );
  }
  if (loaded.kind === "error") return <LinkError code={loaded.code} message={loaded.message} />;

  const l = loaded.link;
  return (
    <ReviewerWorkspace
      modeKey={`link:${l.linkId}`}
      letter={l.letter}
      state={l.state}
      asker={l.asker}
      me={{ name: l.reviewer.name }}
      ask={l.ask}
      evidence={l.evidence}
      facts={{ letterType: l.letter.letterType, jurisdiction: l.letter.jurisdiction, mode: l.letter.mode }}
      secureLine={`Secure link, expires ${fmtShortDate(l.expiresAt)}`}
      messages={messages}
      onMessage={async (text) => {
        const res = await actOnLink(token, { action: "message", text, id: uid("msg") });
        if (res.ok) setState(res.data.state);
        return res.ok;
      }}
      act={(a) => actOnLink(token, a)}
      onState={setState}
    />
  );
}

function LinkError({ code, message }: { code: string; message: string }) {
  switch (code) {
    case "expired":
      return (
        <LinkPage icon={<Clock className="size-5" strokeWidth={1.6} />} title="This link has expired">
          Links to review a letter work for a limited time. Ask the person who sent it for a new link.
        </LinkPage>
      );
    case "revoked":
      return (
        <LinkPage icon={<Link2Off className="size-5" strokeWidth={1.6} />} title="This link is no longer active">
          The person who sent it has taken the letter back. If they still want your view, they can send you a new link.
        </LinkPage>
      );
    case "finished":
      return (
        <LinkPage icon={<ShieldCheck className="size-5" strokeWidth={1.6} />} title="This review is finished">
          Thank you. The person who asked has finished the review, so there's nothing more to do here.
        </LinkPage>
      );
    case "invalid":
      return (
        <LinkPage icon={<Link2Off className="size-5" strokeWidth={1.6} />} title="This link isn't valid">
          Check you opened the whole link from the email. If it still doesn't work, ask the person who sent it for a new one.
        </LinkPage>
      );
    case "off":
      return (
        <LinkPage icon={<Link2Off className="size-5" strokeWidth={1.6} />} title="Secure review links aren't available">
          Ask the person who sent it to share the letter another way.
        </LinkPage>
      );
    default:
      return (
        <LinkPage icon={<Lock className="size-5" strokeWidth={1.6} />} title="This review isn't available right now">
          {code === "not-ready" || code === "network"
            ? "We couldn't open the letter just now. Try again in a few minutes."
            : message}
        </LinkPage>
      );
  }
}

/** A calm full page with no letter content (errors, loading). */
export function LinkPage({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--ds-canvas)]" data-testid="link-page">
      <header className="flex h-[60px] items-center gap-2.5 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 sm:px-[18px]">
        <BrandMark size={22} />
        <span className="text-[15px] font-medium text-[var(--ds-ink)]">DraftHR</span>
      </header>
      <div data-page-main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-6 py-7 shadow-[var(--ds-shadow-s)]">
          <span aria-hidden className="grid size-10 place-items-center rounded-[10px] bg-[var(--ds-surface-2)] text-[var(--ds-muted)]">
            {icon}
          </span>
          <h1 className="m-0 mt-4 font-serif text-[26px] leading-[1.2] font-normal text-[var(--ds-ink)]">{title}</h1>
          <p className="m-0 mt-2 text-[14px] leading-[1.55] text-[var(--ds-body)]">{children}</p>
          {action && <div className="mt-5">{action}</div>}
        </div>
      </div>
    </div>
  );
}
