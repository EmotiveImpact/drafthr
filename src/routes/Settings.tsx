import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Building2,
  CreditCard,
  FilePenLine,
  KeyRound,
  Plug,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Band } from "@/components/wizard/Band";
import { useWorkspaceName } from "@/components/wizard/kit";
import { BillingCard } from "@/components/billing/BillingCard";
import { useProfileStore } from "@/lib/profile";
import { cn } from "@/lib/utils";
import {
  SETTINGS_SECTIONS,
  resolveSettingsSection,
  sectionById,
  tabParamFor,
  type SettingsGroup,
  type SettingsSectionId,
} from "./settings/sections";
import { PaneHeader, SettingsCard, useSavedFlash } from "./settings/parts";
import { DefaultsPane, ProfilePane, WorkspacePane } from "./settings/ProfilePanes";
import { DataPane, IntegrationsPane, PoliciesPane, SecurityPane, TeamPane } from "./settings/OtherPanes";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  profile: UserRound,
  workspace: Building2,
  team: Users,
  policies: BookOpen,
  defaults: FilePenLine,
  integrations: Plug,
  billing: CreditCard,
  security: KeyRound,
  data: ShieldCheck,
};

const GROUPS: SettingsGroup[] = ["You", "Workspace", "Account"];

/**
 * Settings (design/hifi/screens/settings.mjs): the mist band, a section
 * list on the left (a scrolling row on phones) and one pane on the right.
 * The section lives in `?tab=`, so old links (`?tab=company`, `?tab=data`)
 * and the Stripe portal's return (`?tab=billing`) land on the right pane.
 */
export function Settings() {
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);
  const workspace = useWorkspaceName();
  const [params, setParams] = useSearchParams();
  const section = resolveSettingsSection(params.get("tab"));
  const meta = sectionById(section);
  const [saved, flashSaved] = useSavedFlash();

  const pick = (id: SettingsSectionId) => {
    const next = new URLSearchParams(params);
    const tab = tabParamFor(id);
    if (tab) next.set("tab", tab);
    else next.delete("tab");
    setParams(next, { replace: true });
  };

  const onSave = () => {
    markSetupComplete();
    flashSaved();
  };

  // Keep the picked item in view in the phone row.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !rowRef.current) return;
    const row = rowRef.current;
    if (row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "auto" });
  }, [section]);

  return (
    <div className="w-full min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-12 lg:pt-[34px]">
      <Band
        crumbs={[...(workspace ? [{ label: workspace }] : []), { label: "Settings" }]}
        title="Settings"
        lede={`Manage your profile, your team and how ${workspace ?? "your team"} pays for DraftHR.`}
      />

      <div className="grid min-w-0 grid-cols-1 gap-5 pt-1.5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        {/* Desktop section list */}
        <nav aria-label="Settings sections" className="hidden lg:block">
          {GROUPS.map((g, gi) => (
            <div key={g} role="group" aria-labelledby={`set-group-${g}`}>
              <div
                id={`set-group-${g}`}
                className={cn("px-2.5 pb-1.5 text-[12px] font-medium text-[var(--ds-subtle)]", gi === 0 ? "pt-0" : "pt-3.5")}
              >
                {g}
              </div>
              <ul className="m-0 flex list-none flex-col gap-px p-0">
                {SETTINGS_SECTIONS.filter((s) => s.group === g).map((s) => (
                  <li key={s.id}>
                    <SectionItem id={s.id} label={s.label} active={s.id === section} onPick={pick} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Phone and tablet: a horizontally scrolling row */}
        <nav aria-label="Settings sections" className="-mx-4 min-w-0 sm:-mx-8 lg:hidden">
          <div
            ref={rowRef}
            className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {SETTINGS_SECTIONS.map((s) => (
              <SectionItem key={s.id} id={s.id} label={s.label} active={s.id === section} onPick={pick} compact />
            ))}
          </div>
        </nav>

        <div className="min-w-0 max-w-[1000px]" key={section}>
          <div className="animate-[ds-fade-in_0.18s_ease_both] motion-reduce:animate-none">
            {section === "profile" && <ProfilePane line={meta.line} onSave={onSave} saved={saved} />}
            {section === "workspace" && <WorkspacePane line={meta.line} onSave={onSave} saved={saved} />}
            {section === "defaults" && <DefaultsPane line={meta.line} onSave={onSave} saved={saved} />}
            {section === "team" && <TeamPane line={meta.line} />}
            {section === "policies" && <PoliciesPane line={meta.line} />}
            {section === "integrations" && <IntegrationsPane line={meta.line} />}
            {section === "security" && <SecurityPane line={meta.line} />}
            {section === "data" && <DataPane line={meta.line} />}
            {section === "billing" && (
              <BillingCard
                onManageTeam={() => pick("team")}
                fallback={
                  <>
                    <PaneHeader title="Billing" line={meta.line} />
                    <SettingsCard
                      icon={<CreditCard />}
                      title="Billing"
                      description="Billing isn't set up for this workspace yet. You can still compare plans."
                      actions={
                        <Button asChild>
                          <Link to="/pricing">See plans</Link>
                        </Button>
                      }
                    />
                  </>
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionItem({
  id,
  label,
  active,
  onPick,
  compact,
}: {
  id: SettingsSectionId;
  label: string;
  active: boolean;
  onPick: (id: SettingsSectionId) => void;
  compact?: boolean;
}) {
  const Icon = ICONS[id];
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-current={active ? "page" : undefined}
      data-section={id}
      className={cn(
        "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[8px] text-[14px] transition-colors duration-[120ms]",
        compact ? "h-9 border px-3" : "h-9 w-full px-2.5 text-left",
        active
          ? cn("bg-[var(--ds-surface-2)] font-medium text-[var(--ds-ink)]", compact && "border-[var(--ds-surface-2)]")
          : cn(
              "text-[var(--ds-body)] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)]",
              compact && "border-[var(--ds-line)]"
            )
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-4 shrink-0", active ? "text-[var(--ds-ink)]" : "text-[var(--ds-subtle)]")}
      />
      <span>{label}</span>
    </button>
  );
}
