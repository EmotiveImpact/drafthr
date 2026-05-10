import { Link, useLocation, useParams } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { UserChip } from "@/lib/auth/UserChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";

/**
 * Topbar above the main content. Sidebar collapse / expand controls live
 * inside the sidebar itself (header action button + click-anywhere-when-
 * collapsed + ⌘B). This bar carries breadcrumbs, notifications, theme,
 * and the user chip — nothing else.
 */
export function AppTopbar() {
  const loc = useLocation();
  const params = useParams<{ letterType?: string; draftId?: string }>();
  const drafts = useDraftStore((s) => s.drafts);

  const draft = params.draftId ? drafts[params.draftId] : undefined;
  const meta = (() => {
    try {
      return params.letterType
        ? getLetterMeta(params.letterType as Parameters<typeof getLetterMeta>[0])
        : draft
        ? getLetterMeta(draft.letterType)
        : null;
    } catch {
      return null;
    }
  })();

  const crumbs = buildCrumbs(loc.pathname, meta);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/85 backdrop-blur-sm px-3 sm:px-4 sticky top-0 z-30">
      <Breadcrumb className="flex-1 min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap">
                <BreadcrumbItem>
                  {isLast || !c.href ? (
                    <BreadcrumbPage className="truncate max-w-[16ch] sm:max-w-[28ch]">
                      {c.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <NotificationsBell />
      <ThemeToggle />
      <UserChip />
    </header>
  );
}

type Crumb = { label: string; href?: string };

function buildCrumbs(
  pathname: string,
  meta: ReturnType<typeof getLetterMeta> | null
): Crumb[] {
  const segs = pathname.split("/").filter(Boolean);
  const out: Crumb[] = [{ label: "Home", href: "/" }];

  if (segs[0] === "hr") {
    out.push({ label: "HR / Management", href: "/hr" });
  } else if (segs[0] === "me") {
    out.push({ label: "Employee", href: "/me" });
  } else if (segs[0] === "privacy") {
    out.push({ label: "Privacy & data" });
    return out;
  } else if (segs[0] === "settings") {
    out.push({ label: "Settings" });
    return out;
  } else if (segs[0] === "calendar") {
    out.push({ label: "Calendar" });
    return out;
  } else if (segs[0] === "exported") {
    out.push({ label: "Exported" });
    return out;
  } else if (segs[0] === "activity") {
    out.push({ label: "Activity" });
    return out;
  } else if (segs[0] === "notifications") {
    out.push({ label: "Notifications" });
    return out;
  } else if (segs[0] === "editor" && meta) {
    const mode = meta.mode;
    out.push({ label: mode === "employer" ? "HR / Management" : "Employee", href: mode === "employer" ? "/hr" : "/me" });
    out.push({ label: meta.shortTitle });
    return out;
  }

  if (segs[1] === "new" && segs.length === 2) {
    out.push({ label: "New letter" });
  } else if (segs[1] === "new" && meta) {
    out.push({ label: "New", href: `/${segs[0]}/new` });
    out.push({ label: meta.shortTitle });
  }

  return out;
}
