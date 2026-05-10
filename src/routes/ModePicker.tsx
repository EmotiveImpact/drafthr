import { useNavigate } from "react-router-dom";
import { Box, Button, Card, Flex, Grid, Heading, Inset, Text } from "@radix-ui/themes";
import { ArrowUpRight, Briefcase, UserRound } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";

export function ModePicker() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const setRole = useProfileStore((s) => s.setRole);
  const draftList = Object.values(drafts).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = draftList.slice(0, 3);

  const choose = (role: "employer" | "employee") => {
    setRole(role);
    nav(role === "employer" ? "/hr" : "/me");
  };

  return (
    <Box className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <Box mb="8" maxWidth="640px">
        <Text size="1" color="gray" weight="medium" className="uppercase tracking-[0.18em]">
          DRAFTHR
        </Text>
        <Heading size="8" mt="2" mb="3" weight="medium">
          Who are you writing as?
        </Heading>
        <Text size="3" color="gray">
          Pick one. We'll save your role and adapt the platform around it. You can change it any
          time in{" "}
          <Text
            asChild
            color="gold"
            weight="medium"
            className="cursor-pointer hover:underline"
          >
            <button onClick={() => nav("/settings")}>Settings</button>
          </Text>
          .
        </Text>
      </Box>

      <Grid columns={{ initial: "1", md: "2" }} gap="4" mb="6">
        <RoleCard
          icon={<Briefcase className="size-5" />}
          title="I'm in HR or management"
          description="Drafting letters TO an employee — offers, terminations, warnings, redundancies, references. The platform helps you comply with ACAS, s.98 ERA, WARN, OWBPA, COBRA, and state-specific final-pay rules."
          meta="14 letter types · UK + US · Counsel-review gate on high-risk letters"
          onClick={() => choose("employer")}
        />
        <RoleCard
          icon={<UserRound className="size-5" />}
          title="I'm an employee"
          description="Drafting letters TO HR or your employer — grievances, resignations, flexible-working requests, SARs, appeals, whistleblowing, accommodation requests. The platform helps you preserve your rights and not prejudice future claims."
          meta="21 letter types · UK + US · Tribunal-deadline tracking · Register-safety check"
          onClick={() => choose("employee")}
        />
      </Grid>

      {recent.length > 0 && (
        <Box>
          <Heading size="2" mb="3" color="gray" weight="medium">
            Or jump back into a recent draft
          </Heading>
          <Grid columns={{ initial: "1", sm: "3" }} gap="2">
            {recent.map((d) => (
              <Button
                key={d.id}
                variant="outline"
                size="3"
                color="gray"
                onClick={() => nav(`/editor/${d.id}`)}
                className="!h-auto !py-3 !justify-start"
              >
                <Flex direction="column" align="start" gap="1" className="min-w-0">
                  <Text
                    size="1"
                    color="gray"
                    weight="medium"
                    className="uppercase tracking-[0.18em]"
                  >
                    {d.mode === "employer" ? "HR" : "Employee"} · {d.context.jurisdiction}
                  </Text>
                  <Text size="2" weight="medium" className="truncate">
                    {d.letterType.replace(/_/g, " ")}
                  </Text>
                </Flex>
              </Button>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}

function RoleCard({
  icon,
  title,
  description,
  meta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <Card asChild size="3" className="cursor-pointer group transition-colors hover:bg-[var(--accent-2)]">
      <button type="button" onClick={onClick} className="text-left w-full">
        <Inset clip="padding-box" side="top" pb="current">
          <Flex direction="column" gap="3" p="2">
            <Flex justify="between" align="center" mb="2">
              <Box
                className="size-10 rounded-md grid place-items-center"
                style={{ background: "var(--accent-3)", color: "var(--accent-11)" }}
              >
                {icon}
              </Box>
              <ArrowUpRight className="size-4 text-[var(--gray-9)] opacity-0 group-hover:opacity-100 transition" />
            </Flex>
            <Heading size="4" weight="medium">{title}</Heading>
            <Text size="2" color="gray" className="leading-relaxed">{description}</Text>
            <Text size="1" color="gray" mt="2">{meta}</Text>
          </Flex>
        </Inset>
      </button>
    </Card>
  );
}
