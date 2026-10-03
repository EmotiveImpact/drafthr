import { Card, Box, Text } from "@radix-ui/themes";
import { PublicLegalShell } from "@/components/PublicLegalShell";

/**
 * STARTER TEMPLATE — must be reviewed by counsel before going live to
 * paying or enterprise customers. The clauses below are written in
 * good faith but DraftHR is not a law firm; do NOT treat this file
 * as legal advice. Update [VERIFY WITH COUNSEL] flags as needed.
 *
 * Public Terms of Service. Linked from the sign-up consent checkbox and
 * the footer. Rendered chromeless via PublicLegalShell.
 *
 * Governing law: England & Wales by default, with explicit US-specific
 * carve-outs (WARN Act, OWBPA, COBRA, FAA arbitration where mandatory).
 */
export function Terms() {
  return (
    <PublicLegalShell
      title="Terms of Service"
      subtitle={
        <>
          Pre-launch draft · Last reviewed in code:{" "}
          <Text weight="medium" highContrast>
            3 October 2026
          </Text>
          . Not approved for production. Business details, operational
          commitments and legal terms require owner and professional review.
        </>
      }
    >
      <Card size="3">
        <Box className="prose prose-sm max-w-none [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_li]:my-1 [&_strong]:font-semibold">
          <h2>1. Acceptance</h2>
          <p>
            By creating an account or otherwise accessing the DraftHR service
            ("DraftHR", "Service", "we", "us"), you agree to be bound by these
            Terms of Service ("Terms"). If you do not agree to these Terms, do
            not access or use the Service. If you are entering into these Terms
            on behalf of an organisation, you represent that you have authority
            to bind that organisation, and "you" refers to that organisation.
          </p>

          <h2>2. Service description</h2>
          <p>
            DraftHR is an AI-assisted HR letter drafting platform for
            employment matters in the United Kingdom and the United States. The
            Service operates in two modes:
          </p>
          <ul>
            <li>
              <strong>HR / Management mode</strong> — drafting letters from an
              employer or manager to an employee (e.g. probation outcomes,
              disciplinary outcomes, capability decisions, restructure
              communications, dismissal letters).
            </li>
            <li>
              <strong>Employee mode</strong> — drafting letters from an
              employee to HR or an employer (e.g. grievances, flexible-working
              requests, resignations, appeals).
            </li>
          </ul>

          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years old to use the Service. You confirm
            that you are using the Service in a professional capacity and that
            you have authority to enter and process the information you submit
            on behalf of yourself or the organisation you represent.
          </p>

          <h2>4. Accounts</h2>
          <p>
            You sign up to the Service via our WorkOS-backed authentication
            flow, using Google, Microsoft, LinkedIn, or an email-and-password
            combination. You are responsible for keeping your credentials
            secure and for all activity that occurs under your account. Notify
            us immediately at <a href="mailto:legal@drafthr.io">legal@drafthr.io</a>{" "}
            if you suspect unauthorised access. One workspace corresponds to
            one team or organisation; do not share a single account across
            individuals.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              automate access to, scrape, or otherwise crawl the Service
              outside of any documented public API;
            </li>
            <li>
              reverse-engineer, decompile, or attempt to derive the source code
              of the Service except to the extent expressly permitted by law;
            </li>
            <li>
              use the Service to draft letters in bad faith, to harass any
              individual, to commit unlawful acts, or to retaliate against any
              person for a protected activity;
            </li>
            <li>
              impersonate any person or misrepresent your affiliation with any
              entity;
            </li>
            <li>
              attempt to access, exfiltrate, or interfere with the data of any
              other tenant or user;
            </li>
            <li>
              upload malicious code, attempt to disrupt the Service, or
              circumvent rate-limiting, authentication, or other security
              controls.
            </li>
          </ul>

          <h2>6. Your content</h2>
          <p>
            You retain all rights to the letters, employee details, employer
            details, evidence, and other content you submit to the Service
            ("Your Content"). You grant DraftHR a worldwide, non-exclusive,
            royalty-free licence to host, store, transmit, display, and process
            Your Content solely for the purpose of providing and improving the
            Service, including by transmitting it to the AI sub-processors
            named in our Privacy Policy. We do not claim ownership of Your
            Content and we do not use Your Content to train AI models. See the
            Privacy Policy for details on data handling and retention.
          </p>

          <h2>7. AI-assisted drafting — not legal advice</h2>
          <p>
            <strong>
              Every letter generated by DraftHR is produced, in whole or in
              part, by an AI model. AI output can be inaccurate, incomplete,
              misleading, or unsuitable for the specific facts of your matter.
              You must review every draft, edit it as required, and exercise
              your own professional judgement before sending or relying on any
              letter produced by the Service.
            </strong>
          </p>
          <p>
            <strong>
              DraftHR is not a law firm and does not provide legal advice. No
              solicitor-client, attorney-client, or other professional
              relationship is created by your use of the Service.
            </strong>{" "}
            For high-risk letter types (including tribunal-bound matters,
            dismissals, settlement agreements, and protected conversations),
            the Service surfaces an in-app counsel-review attestation gate;
            clearing that gate does <strong>not</strong> substitute for actual
            legal advice from a qualified solicitor (England & Wales) or
            attorney (United States) licensed in the relevant jurisdiction.
          </p>

          <h2>8. UK-specific provisions</h2>
          <p>
            For UK users, the Service may surface references to the ACAS Code
            of Practice on Disciplinary and Grievance Procedures, sections of
            the Employment Rights Act 1996 (including s.95(1)(c) for
            constructive dismissal), the Equality Act 2010, and other UK
            employment legislation as relevant prompts. These references are
            provided to assist the drafter and are not a representation that
            any specific letter complies with the cited legislation in your
            circumstances. The Service is not a substitute for advice from a
            qualified solicitor.
          </p>

          <h2>9. US-specific provisions</h2>
          <p>
            For US users, the Service may surface references to federal
            employment statutes including the Worker Adjustment and Retraining
            Notification (WARN) Act, the Older Workers Benefit Protection Act
            (OWBPA), the Consolidated Omnibus Budget Reconciliation Act
            (COBRA), Title VII of the Civil Rights Act, the Americans with
            Disabilities Act (ADA), the Age Discrimination in Employment Act
            (ADEA), and state-specific rules (including final-pay timing rules,
            state mini-WARN statutes, and state-level discrimination law).
            State-by-state variations apply and are not exhaustively covered.
            The Service is not a substitute for advice from a qualified
            attorney licensed in your jurisdiction.
          </p>

          <h2>10. Subscriptions, fees, and billing</h2>
          <p>
            DraftHR is currently free during evaluation. Paid plans (Pro,
            Business, and Enterprise) will be introduced; existing users will
            receive reasonable advance notice before any change to fees affects
            their account. When paid plans are available, fees will be invoiced
            in advance on the subscription term you select, are non-refundable
            except as required by law, and exclude taxes (which you are
            responsible for). Refer to the Privacy Policy for data-handling
            specifics that apply regardless of plan.
          </p>

          <h2>11. Export integrity</h2>
          <p>
            ZIP export packs include a manifest with file sizes and SHA-256
            checksums. When signing is configured, the pack also includes an
            Ed25519 CMS signature over the manifest. Otherwise it is explicitly
            marked unsigned; checksums alone do not establish its origin.
            Verification of a signed pack requires an independently trusted
            public key and the included verification instructions. Standalone
            PDF and DOCX exports do not carry this pack signature. The current
            pack format provides no independently trusted timestamp, embedded
            PDF signature, legal validation or immutable-storage guarantee.
            Do not represent a modified or unsigned pack as a verified signed
            export.
          </p>

          <h2>12. Termination</h2>
          <p>
            The account-closure process and retention schedule must be
            approved and verified before production. Clearing browser data
            does not delete server records or close your account. We may
            suspend or terminate your access for material
            breach of these Terms, suspected unlawful use, non-payment (once
            paid plans launch), or as required by law, in each case with
            reasonable notice where practicable. Any sections of these Terms that by their
            nature should survive termination will do so (including sections
            on Your Content licence-to-process, disclaimers, limitation of
            liability, indemnification, and governing law).
          </p>

          <h2>13. Disclaimers</h2>
          <p>
            <strong>
              The Service is provided on an "AS IS" and "AS AVAILABLE" basis.
              To the maximum extent permitted by law, DraftHR disclaims all
              warranties of any kind, whether express, implied, or statutory,
              including without limitation warranties of merchantability,
              fitness for a particular purpose, non-infringement, accuracy,
              completeness, and the legal correctness or sufficiency of any
              AI-generated content.
            </strong>{" "}
            AI outputs may contain errors, omissions, or hallucinated facts;
            you are solely responsible for reviewing and verifying every
            letter before use.
          </p>

          <h2>14. Limitation of liability</h2>
          <p>
            <strong>
              To the maximum extent permitted by law, DraftHR's aggregate
              liability arising out of or in connection with the Service is
              capped at the greater of (a) the fees you paid to DraftHR in
              the 12 months preceding the event giving rise to the claim or
              (b) £100 for free-tier users. DraftHR is not liable for any
              indirect, incidental, special, consequential, exemplary, or
              punitive damages, or for loss of profits, revenue, goodwill,
              data, or business opportunities, however arising, whether in
              contract, tort, or otherwise, even if advised of the possibility
              of such damages.
            </strong>
          </p>
          <p>
            Nothing in these Terms limits or excludes liability that cannot
            lawfully be limited or excluded, including liability for death or
            personal injury caused by negligence, fraud or fraudulent
            misrepresentation, or any other liability that applicable law
            does not permit to be limited.
          </p>

          <h2>15. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless DraftHR and its
            officers, directors, employees, and agents from and against any
            claims, damages, liabilities, losses, costs, and expenses
            (including reasonable legal fees) arising out of or in connection
            with: (a) your use of the Service in breach of these Terms; (b)
            Your Content; (c) your violation of any law or third-party right;
            or (d) any claim that an employee, contractor, or other third
            party suffered loss as a result of a letter you sent that was
            drafted using the Service.
          </p>

          <h2>16. Governing law and disputes</h2>
          <p>
            These Terms and any non-contractual obligations arising out of or
            in connection with them are governed by the laws of{" "}
            <strong>England and Wales</strong>. Subject to the paragraph
            below, the courts of England and Wales have exclusive jurisdiction
            to settle any dispute or claim arising out of or in connection
            with these Terms or the Service.
          </p>
          <p>
            <strong>US users:</strong> where mandatory state consumer
            protection law or the United States Federal Arbitration Act (FAA)
            requires a different forum or procedure, that mandatory law
            governs to the extent of the conflict. Nothing in this section
            prevents either party from seeking injunctive or equitable relief
            in any court of competent jurisdiction to protect its
            intellectual-property or confidentiality rights.
          </p>

          <h2>17. Changes to these Terms</h2>
          <p>
            We may revise these Terms from time to time. We will post any
            material changes on this page and, for paid users, send email
            notification a reasonable period before the changes take effect.
            Your continued use of the Service after the effective date
            constitutes acceptance of the revised Terms.
          </p>

          <h2>18. Contact</h2>
          <p>
            Questions about these Terms? Write to{" "}
            <a href="mailto:legal@drafthr.io">legal@drafthr.io</a>. For
            privacy-specific enquiries, see the Privacy Policy.
          </p>
        </Box>
      </Card>
    </PublicLegalShell>
  );
}
