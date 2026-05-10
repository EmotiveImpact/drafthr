import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";
import {
  History,
  PlusCircle,
  Settings,
  ShieldCheck,
  CalendarDays,
  FileDown,
  Activity as ActivityIcon,
  Bell,
  LayoutDashboard,
  ScrollText,
  FileText,
  MessageSquare,
} from "lucide-react";

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
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const draftRows = useMemo(() => {
    const all = Object.values(drafts);
    const filtered = role ? all.filter((d) => d.mode === role) : all;
    return filtered
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => {
        const meta = (() => {
          try { return getLetterMeta(d.letterType); } catch { return null; }
        })();
        const title = meta?.shortTitle ?? d.letterType.replace(/_/g, " ");
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
      if (role && d.mode !== role) continue;
      const meta = (() => {
        try { return getLetterMeta(d.letterType); } catch { return null; }
      })();
      const draftTitle = meta?.shortTitle ?? d.letterType.replace(/_/g, " ");
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
      if (role && d.mode !== role) continue;
      const meta = (() => {
        try { return getLetterMeta(d.letterType); } catch { return null; }
      })();
      const draftTitle = meta?.shortTitle ?? d.letterType.replace(/_/g, " ");
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
      title: l.title,
      shortTitle: l.shortTitle,
      keywords: `${l.title} ${l.shortTitle} ${l.description} ${l.id} ${l.riskClass}`,
    }));
  }, [role]);

  const prefix = role === "employer" ? "/hr" : role === "employee" ? "/me" : "";

  const go = (href: string) => {
    onOpenChange(false);
    nav(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a draft, letter type, or page">
      <Command>
        <CommandInput
          placeholder="Search drafts, letter types, or pages…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
        <CommandEmpty>No results for "{query}".</CommandEmpty>

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
                  <FileText className="size-4" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-[13px]">
                      {s.draftTitle} · {s.sectionTitle}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{s.snippet}</span>
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
                  <MessageSquare className="size-4" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-[13px]">
                      {c.author} on {c.draftTitle}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{c.snippet}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {draftRows.length > 0 && (
          <>
            <CommandGroup heading={`Drafts (${draftRows.length})`}>
              {draftRows.slice(0, 8).map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.id}
                  keywords={[d.keywords]}
                  onSelect={() => go(`/editor/${d.id}`)}
                >
                  <History className="size-4" />
                  <span className="truncate">{d.title}</span>
                  {d.recipient && (
                    <span className="text-xs text-muted-foreground truncate">· {d.recipient}</span>
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
                  <PlusCircle className="size-4" />
                  <span className="truncate">{l.shortTitle}</span>
                  <span className="text-xs text-muted-foreground truncate">· {l.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Pages">
          {prefix && (
            <>
              <CommandItem onSelect={() => go(prefix)} keywords={["dashboard", "home"]}>
                <LayoutDashboard className="size-4" /> Home
              </CommandItem>
              <CommandItem onSelect={() => go(`${prefix}/new`)} keywords={["new", "browse", "letters"]}>
                <PlusCircle className="size-4" /> New letter
              </CommandItem>
            </>
          )}
          <CommandItem onSelect={() => go("/calendar")} keywords={["deadlines", "calendar"]}>
            <CalendarDays className="size-4" /> Calendar
          </CommandItem>
          <CommandItem onSelect={() => go("/exported")} keywords={["sent", "exported"]}>
            <FileDown className="size-4" /> Exported
          </CommandItem>
          <CommandItem onSelect={() => go("/activity")} keywords={["activity", "audit"]}>
            <ActivityIcon className="size-4" /> Activity
          </CommandItem>
          <CommandItem onSelect={() => go("/notifications")} keywords={["notifications", "alerts", "deadlines"]}>
            <Bell className="size-4" /> Notifications
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")} keywords={["settings", "profile", "role"]}>
            <Settings className="size-4" /> Settings & profile
          </CommandItem>
          <CommandItem onSelect={() => go("/privacy")} keywords={["privacy", "data"]}>
            <ShieldCheck className="size-4" /> Privacy & data
          </CommandItem>
          <CommandItem onSelect={() => go("/pick-role")} keywords={["role", "switch", "picker"]}>
            <ScrollText className="size-4" /> Role picker
          </CommandItem>
        </CommandGroup>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
