import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Separator,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  Briefcase,
  Download,
  Save,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  useProfileStore,
  QWEN_MODEL_OPTIONS,
  type QwenModelId,
  type WorkspaceRole,
} from "@/lib/profile";
import { DEFAULT_MODEL } from "@/lib/llm/default-model";
import { PageHeader, ImageUploader } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { todayDateOnly } from "@/lib/date-only";
import { WorkspaceMembersCard } from "@/components/WorkspaceMembersCard";
import { AuditLogsCard } from "@/components/AuditLogsCard";
import { SecurityCard } from "@/components/SecurityCard";
import { BillingCard } from "@/components/billing/BillingCard";

const MAX_PROFILE_IMPORT_BYTES = 256 * 1024;

export function Settings() {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const setWorkspaceRole = useProfileStore((s) => s.setWorkspaceRole);
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);
  const resetProfile = useProfileStore((s) => s.reset);

  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSave = () => {
    markSetupComplete();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drafthr-profile-${todayDateOnly()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onImport = (file: File) => {
    if (file.size > MAX_PROFILE_IMPORT_BYTES) {
      alert("Import failed: profile JSON must be 256 KB or smaller.");
      return;
    }
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Partial<typeof profile>;
        if (!parsed || typeof parsed !== "object") throw new Error("Not a profile JSON.");
        if (
          !confirm(
            "Importing will replace your current profile. Drafts are unaffected. Continue?"
          )
        ) {
          return;
        }
        if (parsed.role === "employer" || parsed.role === "employee") setRole(parsed.role);
        if (parsed.personal) patchPersonal(parsed.personal);
        if (parsed.employer) patchEmployer(parsed.employer);
        if (parsed.defaults) patchDefaults(parsed.defaults);
        if (typeof parsed.autoFill === "boolean") setAutoFill(parsed.autoFill);
        markSetupComplete();
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (err) {
        alert(
          "Import failed: " + (err instanceof Error ? err.message : "Invalid file")
        );
      }
    });
  };

  const onClearAllData = () => {
    if (
      confirm(
        "This will erase your profile and all drafts from this device. Cloud-stored data is unaffected. Continue?"
      )
    ) {
      // Local wipe only: deleteDraft would also delete each letter from the
      // workspace, which this "this device only" action promises not to do.
      useDraftStore.setState({ drafts: {} });
      resetProfile();
      nav("/");
    }
  };

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Settings" }]}
        title="Your profile"
        lede="Your role and saved details. Used to auto-fill new letters so you don't re-type the same fields every time."
      />

      <Flex direction="column" gap="4">
        {/* Role */}
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">Your role</Heading>
            <Text size="2" color="gray" as="p">
              Drives the sidebar, the letter catalogue, and the legal angle of the prompts.
              Change it any time — your existing drafts keep the role they were created with.
            </Text>
          </Box>
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            <RoleCard
              active={profile.role === "employer"}
              icon={<Briefcase className="size-5" />}
              label="HR / Management"
              hint="I write letters TO employees"
              onClick={() => setRole("employer")}
            />
            <RoleCard
              active={profile.role === "employee"}
              icon={<UserRound className="size-5" />}
              label="Employee"
              hint="I write letters TO HR / employer"
              onClick={() => setRole("employee")}
            />
          </Grid>
        </Card>

        {/* Personal */}
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">
              {profile.role === "employer" ? "Your details (HR signatory)" : "Your details"}
            </Heading>
            <Text size="2" color="gray" as="p">
              {profile.role === "employer"
                ? "These appear as the signatory on letters you draft."
                : "These appear as the sender on letters you draft. Saved to this device only."}
            </Text>
          </Box>
          <Grid columns={{ initial: "1", sm: "2" }} gap="4">
            <Field label="Legal name">
              <TextField.Root
                value={profile.personal.legalName ?? ""}
                onChange={(e) => patchPersonal({ legalName: e.target.value })}
                placeholder="Jane Patel"
              />
            </Field>
            <Field label="Preferred name (used in salutations)">
              <TextField.Root
                value={profile.personal.preferredName ?? ""}
                onChange={(e) => patchPersonal({ preferredName: e.target.value })}
                placeholder="Jane"
              />
            </Field>
            <Field label={profile.role === "employer" ? "Job title (signatory)" : "Job title"}>
              <TextField.Root
                value={profile.personal.jobTitle ?? ""}
                onChange={(e) => patchPersonal({ jobTitle: e.target.value })}
                placeholder={profile.role === "employer" ? "HR Director" : "Senior Engineer"}
              />
            </Field>
            <Field label="Department">
              <TextField.Root
                value={profile.personal.department ?? ""}
                onChange={(e) => patchPersonal({ department: e.target.value })}
                placeholder="People Operations"
              />
            </Field>
            <Field label="Address" full>
              <TextArea
                value={profile.personal.address ?? ""}
                onChange={(e) => patchPersonal({ address: e.target.value })}
                rows={3}
              />
            </Field>
            <Field label="Email">
              <TextField.Root
                type="email"
                value={profile.personal.email ?? ""}
                onChange={(e) => patchPersonal({ email: e.target.value })}
              />
            </Field>
            {profile.role === "employee" && (
              <Field label="Continuous service start">
                <TextField.Root
                  type="date"
                  value={profile.personal.startDate ?? ""}
                  onChange={(e) => patchPersonal({ startDate: e.target.value })}
                />
              </Field>
            )}
          </Grid>
        </Card>

        {/* Employer */}
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">
              {profile.role === "employer" ? "Your company" : "Current employer"}
            </Heading>
            <Text size="2" color="gray" as="p">
              {profile.role === "employer"
                ? "The legal entity issuing letters."
                : "The employer letters are addressed to. We'll use this for the recipient block."}
            </Text>
          </Box>
          <Grid columns={{ initial: "1", sm: "2" }} gap="4">
            <Field label="Legal name" full>
              <TextField.Root
                value={profile.employer.legalName ?? ""}
                onChange={(e) => patchEmployer({ legalName: e.target.value })}
                placeholder="Acme Holdings Limited"
              />
            </Field>
            <Field label="Address" full>
              <TextArea
                value={profile.employer.address ?? ""}
                onChange={(e) => patchEmployer({ address: e.target.value })}
                rows={3}
              />
            </Field>
            <Field label="Companies House / EIN (optional)">
              <TextField.Root
                value={profile.employer.registrationNumber ?? ""}
                onChange={(e) => patchEmployer({ registrationNumber: e.target.value })}
              />
            </Field>
            {profile.role === "employee" && (
              <>
                <Field label="HR contact name">
                  <TextField.Root
                    value={profile.employer.recipientName ?? ""}
                    onChange={(e) => patchEmployer({ recipientName: e.target.value })}
                    placeholder="HR Director"
                  />
                </Field>
                <Field label="HR contact title">
                  <TextField.Root
                    value={profile.employer.recipientTitle ?? ""}
                    onChange={(e) => patchEmployer({ recipientTitle: e.target.value })}
                  />
                </Field>
              </>
            )}
            {profile.role === "employer" && (
              <>
                <Field label="Letterhead image (optional)" full>
                  <ImageUploader
                    value={profile.employer.letterheadDataUrl}
                    onChange={(dataUrl) => patchEmployer({ letterheadDataUrl: dataUrl })}
                    aspect="banner"
                    helpText="Renders at the top of every exported letter. PNG / JPG / SVG, max 1 MB."
                  />
                </Field>
                <Field label="Signature image (optional)" full>
                  <ImageUploader
                    value={profile.employer.signatureDataUrl}
                    onChange={(dataUrl) => patchEmployer({ signatureDataUrl: dataUrl })}
                    aspect="signature"
                    helpText="Sits above the typed signatory name. Transparent PNG works best."
                  />
                </Field>
              </>
            )}
          </Grid>
        </Card>

        {/* Defaults */}
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">Defaults</Heading>
            <Text size="2" color="gray" as="p">Pre-selected on every new letter.</Text>
          </Box>
          <Grid columns={{ initial: "1", sm: "2" }} gap="4">
            <Field label="Jurisdiction">
              <Select.Root
                value={profile.defaults.jurisdiction}
                onValueChange={(v) => patchDefaults({ jurisdiction: v as "UK" | "US" })}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="UK">United Kingdom</Select.Item>
                  <Select.Item value="US">United States</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
            {profile.defaults.jurisdiction === "UK" ? (
              <Field label="UK region">
                <Select.Root
                  value={profile.defaults.ukRegion ?? "England & Wales"}
                  onValueChange={(v) => patchDefaults({ ukRegion: v as "England & Wales" })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="England & Wales">England & Wales</Select.Item>
                    <Select.Item value="Scotland">Scotland</Select.Item>
                    <Select.Item value="Northern Ireland">Northern Ireland</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Field>
            ) : (
              <Field label="US state (free text — pick from list in wizard)">
                <TextField.Root
                  value={profile.defaults.usState ?? ""}
                  onChange={(e) => patchDefaults({ usState: e.target.value as "CA" })}
                  placeholder="CA"
                />
              </Field>
            )}
            <Field label="Worker classification">
              <Select.Root
                value={profile.defaults.workerClass}
                onValueChange={(v) => patchDefaults({ workerClass: v as "employee" })}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="employee">Employee</Select.Item>
                  <Select.Item value="worker">Worker (UK)</Select.Item>
                  <Select.Item value="contractor">Contractor / 1099</Select.Item>
                  <Select.Item value="casual">Casual / zero-hours</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
            <Field label="Generation model">
              <Select.Root
                value={profile.defaults.qwenModel ?? DEFAULT_MODEL}
                onValueChange={(v) => patchDefaults({ qwenModel: v as QwenModelId })}
              >
                {/* Show only the model name in the trigger; the long hint
                 * stays in the list, where it overflowed the card before. */}
                <Select.Trigger style={{ width: "100%", maxWidth: "100%" }}>
                  {QWEN_MODEL_OPTIONS.find((m) => m.id === (profile.defaults.qwenModel ?? DEFAULT_MODEL))?.label}
                </Select.Trigger>
                <Select.Content>
                  {QWEN_MODEL_OPTIONS.map((m) => (
                    <Select.Item key={m.id} value={m.id}>
                      {m.label} — <Text color="gray">{m.hint}</Text>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field>
            <Field label={profile.role === "employer" ? "Default tone" : "Default tone band"}>
              {profile.role === "employer" ? (
                <Select.Root
                  value={profile.defaults.tone ?? "formal"}
                  onValueChange={(v) => patchDefaults({ tone: v as "formal" })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="warm">Warm</Select.Item>
                    <Select.Item value="neutral">Neutral</Select.Item>
                    <Select.Item value="formal">Formal</Select.Item>
                    <Select.Item value="firm">Firm</Select.Item>
                  </Select.Content>
                </Select.Root>
              ) : (
                <Select.Root
                  value={profile.defaults.employeeTone ?? "assertive"}
                  onValueChange={(v) => patchDefaults({ employeeTone: v as "assertive" })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="conciliatory">Conciliatory</Select.Item>
                    <Select.Item value="assertive">Assertive</Select.Item>
                    <Select.Item value="forensic">Forensic</Select.Item>
                    <Select.Item value="tribunal_ready">Tribunal-ready</Select.Item>
                  </Select.Content>
                </Select.Root>
              )}
            </Field>
          </Grid>
        </Card>

        {/* Security — in-app password reset (signed-in users only). The
         * /sign-in/forgot-password page is signed-out only, so without this
         * surface signed-in users have no path to rotate their password. */}
        <SecurityCard />

        {/* Billing — current plan and the Stripe Billing Portal. */}
        <BillingCard />

        {/* Workspace — real members + invites when signed in to a tenant. */}
        <WorkspaceMembersCard />

        {/* WorkOS Audit Logs mirror status (admin-only) — null for non-admins. */}
        <AuditLogsCard />

        {/* Solo / sim role picker — local dev + screencasts only. In a real build
         * it let any member make themselves owner in the browser, unlocking
         * approve buttons and approved drafts for client-side export. */}
        {import.meta.env.DEV && (
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">Role (local simulation)</Heading>
            <Text size="2" color="gray" as="p">
              Your seat for approval-queue simulation. The real per-workspace role is set above.
              Use this in local dev / demos to switch between drafter and reviewer behaviour
              without a second account.
            </Text>
          </Box>
          <Grid columns={{ initial: "1", sm: "2" }} gap="4">
            <Field label="Simulated role">
              <Select.Root
                value={profile.workspaceRole ?? "owner"}
                onValueChange={(v) => setWorkspaceRole(v as WorkspaceRole)}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="owner">Owner — full access, billing, members</Select.Item>
                  <Select.Item value="admin">Admin — full access except billing</Select.Item>
                  <Select.Item value="drafter">Drafter — write + submit for review</Select.Item>
                  <Select.Item value="reviewer">Reviewer — drafter + approve/request changes</Select.Item>
                  <Select.Item value="viewer">Viewer — read-only</Select.Item>
                </Select.Content>
              </Select.Root>
            </Field>
          </Grid>
        </Card>
        )}

        {/* Auto-fill */}
        <Card size="3">
          <Box mb="3">
            <Heading size="3" mb="1">Auto-fill new letters from this profile</Heading>
            <Text size="2" color="gray" as="p">
              When on, the wizard pre-populates with your saved details. You can still edit any field.
            </Text>
          </Box>
          <Flex align="center" gap="3" asChild>
            <label htmlFor="autoFill">
              <Switch checked={profile.autoFill} onCheckedChange={setAutoFill} id="autoFill" />
              <Text size="2">{profile.autoFill ? "On" : "Off"}</Text>
            </label>
          </Flex>
        </Card>

        <Separator size="4" />

        {/* Save / import-export / clear */}
        <Flex direction={{ initial: "column", sm: "row" }} justify="between" gap="3">
          <Button variant="ghost" color="red" onClick={onClearAllData}>
            <Trash2 className="size-4" />
            Clear all my data on this device
          </Button>
          <Flex align="center" gap="2" wrap="wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
            <Button variant="soft" color="gray" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              Import
            </Button>
            <Button variant="soft" color="gray" onClick={onExport}>
              <Download className="size-4" />
              Export
            </Button>
            {savedFlash && <Badge color="green" variant="soft">Saved</Badge>}
            <Button onClick={onSave}>
              <Save className="size-4" />
              Save
            </Button>
          </Flex>
        </Flex>

        <Card size="2" style={{ background: "var(--amber-2)" }}>
          <Flex align="start" gap="2">
            <Box mt="1"><AlertTriangle className="size-4 text-[var(--amber-11)]" /></Box>
            <Text size="1" color="gray" className="leading-relaxed">
              Profile data lives in your browser's local storage. When we wire authentication and
              server-side persistence (planned), it will move to an encrypted database and become
              available across devices.
            </Text>
          </Flex>
        </Card>
      </Flex>
    </Box>
  );
}

function RoleCard({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <Card
      asChild
      size="2"
      variant={active ? "classic" : "surface"}
      style={active ? { background: "var(--accent-2)", borderColor: "var(--accent-7)" } : undefined}
    >
      <button type="button" onClick={onClick} className="text-left w-full cursor-pointer">
        <Flex align="center" gap="2" mb="1">
          {icon}
          <Text size="2" weight="medium">{label}</Text>
          {active && (
            <Badge color="amber" variant="soft" ml="auto" className="uppercase tracking-wider">Current</Badge>
          )}
        </Flex>
        <Text size="1" color="gray" as="p">{hint}</Text>
      </button>
    </Card>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box className={full ? "sm:col-span-2" : ""}>
      <Text as="label" size="1" color="gray" weight="medium" mb="1" className="block">
        {label}
      </Text>
      {children}
    </Box>
  );
}
