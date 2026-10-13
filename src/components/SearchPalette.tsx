import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import { briefTitleFor, sentenceCaseTitle } from "@/lib/letters/display";
import { paletteFilter } from "@/components/searchPaletteFilter";
import { resetTour } from "@/lib/onboarding";
import {
  History,
  PlusCircle,
  Settings,
  ShieldCheck,
  CalendarDays,
  FileDown,
  Activity as ActivityIcon,
  Bell,
  House,
  ScrollText,
  FileText,
  Files,
  Folder,
  Users,
  LibraryBig,
  Scale,
  Inbox,
  ChartColumn,
  ClipboardCheck,
  Layers,
  UserCog,
  Compass,
  MessageSquare,
} from "lucide-react";

type PageLink = { href: string; label: string; Icon: typeof House; keywords: string[] };

/** Every page in the app frame for the current role, so each stays reachable. */
function pagesFor(role: "employer" | "employee" | null | undefined, consultant: boolean): PageLink[] {
  const shared: PageLink[] = [
    { href: "/calendar", label: "Calendar", Icon: CalendarDays, keywords: ["deadlines"] },
    { href: "/notifications", label: "Notifications", Icon: Bell, keywords: ["alerts", "deadlines"] },
    { href: "/activity", label: "Activity", Icon: ActivityIcon, keywords: ["audit", "history"] },
    { href: "/exported", label: "Exported", Icon: FileDown, keywords: ["sent", "downloads"] },
    { href: "/settings", label: "Settings and profile", Icon: Settings, keywords: ["profile", "role", "account"] },
    { href: "/privacy", label: "Privacy and data", Icon: ShieldCheck, keywords: ["data"] },
    { href: "/terms", label: "Terms of service", Icon: FileText, keywords: ["legal"] },
    { href: "/pick-role", label: "Role picker", Icon: ScrollText, keywords: ["role", "switch"] },
  ];
  if (consultant) {
    return [
      { href: "/c", label: "Home", Icon: House, keywords: ["dashboard", "requests"] },
      { href: "/c/profile", label: "My profile", Icon: UserCog, keywords: ["card", "marketplace"] },
      { href: "/consultants", label: "Marketplace", Icon: Scale, keywords: ["experts"] },
      ...shared,
    ];
  }
  if (role === "employer") {
    return [
      { href: "/hr", label: "Home", Icon: House, keywords: ["dashboard"] },
      { href: "/hr/new", label: "New letter", Icon: PlusCircle, keywords: ["new", "browse"] },
      { href: "/letters", label: "Letters", Icon: Files, keywords: ["drafts", "all letters"] },
      { href: "/matters", label: "Matters", Icon: Folder, keywords: ["cases"] },
      { href: "/employees", label: "Employees", Icon: Users, keywords: ["people", "directory"] },
      { href: "/hr/new", label: "Templates", Icon: LibraryBig, keywords: ["letter types"] },
      { href: "/consultants", label: "Experts", Icon: Scale, keywords: ["marketplace", "review"] },
      { href: "/bookings", label: "My bookings", Icon: Inbox, keywords: ["experts", "reviews"] },
      { href: "/reports", label: "Reports", Icon: ChartColumn, keywords: ["compliance", "risk"] },
      { href: "/approvals", label: "Needs approval", Icon: ClipboardCheck, keywords: ["approvals", "sign off", "review"] },
      { href: "/bulk", label: "Bulk letters", Icon: Layers, keywords: ["csv", "batch", "bulk operations"] },
      ...shared,
    ].filter((p, i, all) => all.findIndex((q) => q.href === p.href && q.label === p.label) === i);
  }
  if (role === "employee") {
    return [
      { href: "/me", label: "Home", Icon: House, keywords: ["dashboard"] },
      { href: "/me/new", label: "New letter", Icon: PlusCircle, keywords: ["new", "browse"] },
      { href: "/letters", label: "Letters", Icon: Files, keywords: ["drafts"] },
      { href: "/matters", label: "Matters", Icon: Folder, keywords: ["cases"] },
      { href: "/me/new", label: "Templates", Icon: LibraryBig, keywords: ["letter types"] },
      ...shared,
    ];
  }
  return shared;
}

/**
 * Cmd+K command palette. Searches across:
 *   - Drafts: by letter type, recipient, jurisdiction
 *   - Letter catalog: flagship + all types for the active mode
 *   - Quick navigation: Home / New / Calendar / etc.
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);
  const loc = useLocation();
  const consultant = loc.pathname === "/c" || loc.pathname.startsWith("/c/");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const draftRows = useMemo(() => {
    const all = Object.values(drafts).filter((d) => !d.isTemplateSource);
    const filtered = role ? all.filter((d) => d.mode === role) : all;
    return filtered
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => {
        const title = briefTitleFor(d);
        const recipient =
          d.mode === "employer"
            ? d.employee.legalName || ""
            : d.employer.legalName || "";
        return {
          id: d.id,
          title,
          recipient,
          jurisdiction: d.context.jurisdiction,
          /** combined haystack for cmdk's filter */
          keywords: `${title} ${recipient} ${d.context.jurisdiction} ${d.letterType}`,
        };
      });
  }, [drafts, role]);

  // Section content matches — find drafts whose section html (stripped to
  // plaintext) contains the query. Returned with a short snippet around the
  // first match so the user sees context.
  const sectionMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Array<{
      draftId: string;
      sectionId: string;
      draftTitle: string;
      sectionTitle: string;
      snippet: string;
    }> = [];
    for (const d of Object.values(drafts)) {
      if (d.isTemplateSource) continue;
      if (role && d.mode !== role) continue;
      const draftTitle = briefTitleFor(d);
      for (const s of d.sections) {
        if (!s.html) continue;
        const plain = htmlToPlain(s.html);
        const idx = plain.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 28);
        const end = Math.min(plain.length, idx + q.length + 60);
        const snippet =
          (start > 0 ? "…" : "") +
          plain.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < plain.length ? "…" : "");
        out.push({
          draftId: d.id,
          sectionId: s.id,
          draftTitle,
          sectionTitle: s.title,
          snippet,
        });
        if (out.length >= 8) return out;
      }
    }
    return out;
  }, [drafts, query, role]);

  // Comment matches — find comments whose body contains the query.
  const commentMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Array<{
      draftId: string;
      commentId: string;
      draftTitle: string;
      author: string;
      snippet: string;
    }> = [];
    for (const d of Object.values(drafts)) {
      if (d.isTemplateSource) continue;
      if (role && d.mode !== role) continue;
      const draftTitle = briefTitleFor(d);
      for (const c of d.comments ?? []) {
        if (!c.body.toLowerCase().includes(q)) continue;
        out.push({
          draftId: d.id,
          commentId: c.id,
          draftTitle,
          author: c.authorName,
          snippet: c.body.length > 90 ? c.body.slice(0, 90).trim() + "…" : c.body,
        });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [drafts, query, role]);

  const catalogRows = useMemo(() => {
    if (!role) return [];
    return letterCatalogByMode(role).map((l) => ({
      id: l.id,
      // Sentence case, like every other list in the app (RULE-X6).
      title: sentenceCaseTitle(l.title),
      shortTitle: l.shortTitle,
      keywords: `${l.shortTitle} ${l.title} ${l.description} ${l.id} ${l.riskClass}`,
    }));
  }, [role]);

  const prefix = role === "employer" ? "/hr" : role === "employee" ? "/me" : "";

  const pages = useMemo(() => pagesFor(role, consultant), [role, consultant]);

  const go = (href: string) => {
    onOpenChange(false);
    nav(href);
  };

  // A query that starts a page name ("Calendar", "Approvals") puts Pages
  // first, so Enter opens the page and not a letter type (HOME-15).
  const q = query.trim().toLowerCase();
  const pageHit = q.length > 0 && pages.some((pg) => pg.label.toLowerCase().startsWith(q));
  const pagesGroup = (
    <CommandGroup heading="Pages">
      {pages.map((pg) => (
        <CommandItem key={`${pg.href}-${pg.label}`} value={`page-${pg.label}`} onSelect={() => go(pg.href)} keywords={[pg.label, ...pg.keywords]}>
          <pg.Icon /> {pg.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a letter, letter type or page">
      <Command filter={paletteFilter}>
        <CommandInput
          placeholder="Search letters, letter types or pages"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
        <CommandEmpty>Nothing matches "{query}".</CommandEmpty>
        {pageHit && pagesGroup}

        {sectionMatches.length > 0 && (
          <>
            <CommandGroup heading={`Section matches (${sectionMatches.length})`}>
              {sectionMatches.map((s) => (
                <CommandItem
                  key={`sec-${s.draftId}-${s.sectionId}`}
                  value={`section-${s.draftId}-${s.sectionId}`}
                  keywords={[s.snippet, s.draftTitle, s.sectionTitle]}
                  onSelect={() => {
                    onOpenChange(false);
                    nav(`/editor/${s.draftId}`);
                    requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-section-id="${s.sectionId}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                >
                  <FileText />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-[13px]">
                      {s.draftTitle}: {s.sectionTitle}
                    </span>
                    <span className="truncate text-[12px] text-[var(--ds-muted)]">{s.snippet}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {commentMatches.length > 0 && (
          <>
            <CommandGroup heading={`Comments (${commentMatches.length})`}>
              {commentMatches.map((c) => (
                <CommandItem
                  key={`cmt-${c.commentId}`}
                  value={`comment-${c.commentId}`}
                  keywords={[c.snippet, c.draftTitle, c.author]}
                  onSelect={() => {
                    onOpenChange(false);
                    nav(`/editor/${c.draftId}`);
                    requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-comment-id="${c.commentId}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    });
                  }}
                >
                  <MessageSquare />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-[13px]">
                      {c.author} on {c.draftTitle}
                    </span>
                    <span className="truncate text-[12px] text-[var(--ds-muted)]">{c.snippet}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {draftRows.length > 0 && (
          <>
            <CommandGroup heading={`Letters (${draftRows.length})`}>
              {draftRows.slice(0, 8).map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.id}
                  keywords={[d.keywords]}
                  onSelect={() => go(`/editor/${d.id}`)}
                >
                  <History />
                  <span className="truncate">{d.title}</span>
                  {d.recipient && (
                    <span className="truncate text-[12.5px] text-[var(--ds-muted)]">{d.recipient}</span>
                  )}
                  <CommandShortcut>{d.jurisdiction}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {prefix && catalogRows.length > 0 && (
          <>
            <CommandGroup heading="Start a new letter">
              {catalogRows.slice(0, 12).map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.id}
                  keywords={[l.keywords]}
                  onSelect={() => go(`${prefix}/new/${l.id}`)}
                >
                  <PlusCircle />
                  <span className="truncate">{l.shortTitle}</span>
                  <span className="truncate text-[12.5px] text-[var(--ds-muted)]">{l.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!pageHit && pagesGroup}
        {prefix && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Help">
              <CommandItem
                value="help-tour"
                keywords={["Replay the guided tour", "help", "tour", "guide", "onboarding"]}
                onSelect={() => {
                  onOpenChange(false);
                  resetTour();
                  window.location.assign(prefix);
                }}
              >
                <Compass /> Replay the guided tour
              </CommandItem>
            </CommandGroup>
          </>
        )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Strip HTML tags and decode common entities for content search. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>(?:\s*)/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hook that registers the Cmd+K / Ctrl+K shortcut.
 */
export function useSearchPalette() {
  const [open, setOpen] = useState(false);
  // Track open-ness in a ref so the keydown listener sees the latest value
  // without re-subscribing on every toggle.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Don't hijack Cmd/Ctrl+K while the user is typing in a form field or
        // comment composer — it would steal focus mid-sentence and interrupt
        // their input. (The rich-text editor keeps the shortcut as the primary
        // way to open the palette.) BUT once the palette is open its OWN cmdk
        // search input holds focus, so this guard would trap the user — allow
        // Cmd+K to toggle it closed in that case.
        const active = document.activeElement;
        if (
          !openRef.current &&
          (active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement)
        ) {
          return;
        }
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
