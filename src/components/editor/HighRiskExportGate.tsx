import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Grid,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { ShieldAlert } from "lucide-react";

type Props = {
  draft: Draft;
  open: boolean;
  onClose: () => void;
  onConfirm: (review: { reviewedBy: string; reviewedOn: string }) => void;
};

/**
 * Item 15 — High-risk export gate. Forces an explicit "qualified reviewer
 * confirmed this" attestation before high-risk letters (termination,
 * redundancy, settlement, immigration) can be exported.
 */
export function HighRiskExportGate({ draft, open, onClose, onConfirm }: Props) {
  const meta = getLetterMeta(draft.letterType);
  const [reviewedBy, setReviewedBy] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [reviewedOn, setReviewedOn] = useState(today);
  const [confirmed, setConfirmed] = useState(false);

  const canProceed = reviewedBy.trim().length >= 2 && reviewedOn && confirmed;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="540px">
        <Dialog.Title>
          <Flex align="center" gap="2">
            <ShieldAlert className="size-4" style={{ color: "var(--red-11)" }} />
            Counsel review required
          </Flex>
        </Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          <strong>{meta.title}</strong> is classified as a high-risk
          communication. Before exporting, please confirm a qualified employment-law
          reviewer has approved the content.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Box
            p="3"
            style={{
              background: "var(--red-2)",
              border: "1px solid var(--red-6)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Text size="1" style={{ color: "var(--red-12)" }} className="leading-relaxed">
              {draft.context.jurisdiction === "UK" ? (
                <>
                  The ACAS Code of Practice and Employment Rights Act 1996
                  governing this letter type carry compensation uplifts of up to
                  25% for procedural failures (s.207A TULRCA 1992). Settlement
                  agreements specifically require independent legal advice (s.203
                  ERA) to be valid.
                </>
              ) : (
                <>
                  US employment law (WARN Act, OWBPA, Title VII, ADA, ADEA, plus
                  state-specific final-pay and notice rules) imposes statutory
                  penalties for non-compliant separations. CA and NY in particular
                  impose strict same-day or next-day final-pay rules.
                </>
              )}
            </Text>
          </Box>

          <Grid columns="2" gap="3">
            <Box>
              <Text as="label" htmlFor="reviewedBy" size="1" color="gray" weight="medium" mb="1" className="block">
                Reviewed by (name & role)
              </Text>
              <TextField.Root
                id="reviewedBy"
                placeholder="e.g. J. Smith, Employment Counsel"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
              />
            </Box>
            <Box>
              <Text as="label" htmlFor="reviewedOn" size="1" color="gray" weight="medium" mb="1" className="block">
                Review date
              </Text>
              <TextField.Root
                id="reviewedOn"
                type="date"
                value={reviewedOn}
                onChange={(e) => setReviewedOn(e.target.value)}
              />
            </Box>
          </Grid>

          <Flex
            asChild
            align="start"
            gap="2"
            p="3"
            className="cursor-pointer hover:bg-[var(--gray-2)]"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <label>
              <Checkbox
                checked={confirmed}
                onCheckedChange={(c) => setConfirmed(c === true)}
                mt="1"
              />
              <Text size="1" className="leading-relaxed">
                I confirm a qualified employment-law professional has reviewed
                this letter and approved its content for issuance. I understand
                this attestation will be embedded in the export metadata for audit.
              </Text>
            </label>
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" onClick={onClose}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            disabled={!canProceed}
            onClick={() => onConfirm({ reviewedBy: reviewedBy.trim(), reviewedOn })}
          >
            Confirm and export
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
