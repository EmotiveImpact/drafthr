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
