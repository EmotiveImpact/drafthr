import { Card, Box, Text } from "@radix-ui/themes";
import { todayDateOnly } from "@/lib/date-only";
import { PublicLegalShell } from "@/components/PublicLegalShell";

/**
 * STARTER TEMPLATE — must be reviewed by counsel before going live to
 * paying or enterprise customers. The clauses below are written in
 * good faith but DraftHR is not a law firm; do NOT treat this file
 * as legal advice. Update [VERIFY WITH COUNSEL] flags as needed.
 *
 * Public privacy policy. Linked from /sign-in, /sign-in/signup, and the
 * footer. Rendered chromeless via PublicLegalShell.
 *
 * Coverage: UK GDPR (default jurisdiction: England & Wales) with explicit
 * CCPA/CPRA disclosures for US users.
 */
export function Privacy() {
  return (
    <PublicLegalShell
      title="Privacy Policy"
      subtitle={
        <>
          Effective date:{" "}
          <Text weight="medium" highContrast>
            {todayDateOnly()}
          </Text>
          . This policy explains how DraftHR collects, processes, and stores
          personal data in connection with drafting HR correspondence.
        </>
      }
    >
      <Card size="3">
        <Box className="prose prose-sm max-w-none [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_li]:my-1">
          <h2>1. Who we are</h2>
          <p>
            <strong>DraftHR</strong> ("we", "us", "our") provides an AI-assisted
            HR letter drafting platform at app.drafthr.io for HR professionals,
            managers, and employees in the United Kingdom and the United States.
            DraftHR acts as the data controller in respect of personal data we
            process to deliver the service to you. For data-protection enquiries,
            contact{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a>. Registered
            address: <em>Address available on request — contact privacy@drafthr.io</em>.
          </p>
          <p>
            This policy is effective from the date shown above and replaces any
            prior version. It applies to all visitors to the site, signed-up
            users, and trial users.
          </p>

          <h2>2. What we collect</h2>
          <h3>Account data</h3>
          <p>
            Email address, first and last name, and identity-provider metadata
            (subject identifier, email-verified flag, display name, and where
            available, profile image URL) returned by Google, Microsoft, or
            LinkedIn when you sign in via single sign-on. Workspace name and your
            role within that workspace.
          </p>
          <h3>HR letter content</h3>
          <p>
            Anything you enter into a draft, including employee personal data
            (full legal name, preferred name, job title, department, employer,
            work and home address, work email, length of service, salary and
            benefits), employer details (entity name, registered address,
            letterhead, signatory), and matter details (allegations, evidence
            references, dates of events). Some letter types invite the user to
            enter special category data (e.g. health information in sickness,
            disability accommodation, or capability letters).
          </p>
          <h3>Telemetry</h3>
          <p>
            Audit-chain entries (which draft was created, edited, exported,
            shared, by whom and when), IP address, user-agent string, error
            traces, and minimal performance metrics. We do not run third-party
            advertising trackers or analytics tags.
          </p>

          <h2>3. Why we collect it</h2>
          <ul>
            <li>
              <strong>To deliver the service</strong> (contract performance) —
              we cannot draft your letter without the content you put in it.
            </li>
            <li>
              <strong>To operate and improve the platform</strong> (legitimate
              interest) — error tracking, fraud and abuse prevention,
              capacity planning, and product analytics on aggregated usage.
            </li>
            <li>
              <strong>To meet our legal obligations</strong> — retention of
              audit metadata, response to lawful requests, and tax / accounting
              record-keeping where applicable.
            </li>
          </ul>

          <h2>4. Lawful basis</h2>
          <p>
            For UK / EU users, our lawful bases under UK GDPR / EU GDPR are:
          </p>
          <ul>
            <li>
              Art. 6(1)(b) — performance of a contract to which you are a
              party (delivering the drafting service you signed up for).
            </li>
            <li>
              Art. 6(1)(f) — our legitimate interests in securing, operating,
              and improving the platform, balanced against your rights.
            </li>
            <li>
              Art. 6(1)(c) — compliance with legal obligations (audit trails,
              tax records).
            </li>
            <li>
              Art. 9(2)(b) — processing of special category data for purposes
              of carrying out obligations in employment, social security, and
              social protection law, where you (or the employer you act for)
              enter such data into a draft.
            </li>
          </ul>
          <p>
            <strong>US users:</strong> we honour CCPA / CPRA requests and the
            analogous rights granted under Virginia (VCDPA), Colorado (CPA),
            Connecticut (CTDPA), and other state privacy laws as they come into
            force. Submit a verifiable consumer request to{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a>.
          </p>

          <h2>5. AI processing</h2>
          <p>
            DraftHR is AI-assisted. Letter content you enter is sent to{" "}
            <strong>Anthropic Claude</strong> for drafting and critique. We use
            Sonnet 4.6 by default; Opus 4.7 and Haiku 4.5 are selectable in
            Settings → Generation model. Anthropic operates a zero-retention
            policy for API traffic — your prompts and completions are not used
            to train Anthropic models. Prompt caching is enabled with a 5-minute
            time-to-live to reduce cost and latency; cached content lives on
            Anthropic's infrastructure only for that window.
          </p>
          <p>
            You can opt out of AI features for your account by selecting "None"
            under Settings → Generation model. AI-only features (draft generation,
            critique, evidence extraction) will be disabled for your user; manual
            authoring remains available.
          </p>

          <h2>6. Sub-processors</h2>
          <p>
            We use the following sub-processors to deliver the service. A Data
            Processing Addendum (DPA) is in place with each provider that
            processes personal data on our behalf:
          </p>
          <ul>
            <li>
              <strong>Anthropic PBC</strong> (United States) — large-language-
              model inference for drafting and critique.
            </li>
            <li>
              <strong>WorkOS Inc.</strong> (United States) — authentication,
              single sign-on, and identity management.
            </li>
            <li>
              <strong>Neon</strong> (a Databricks company, United States) —
              managed Postgres database hosting.
            </li>
            <li>
              <strong>Vercel Inc.</strong> (United States) — application hosting
              and serverless compute.
            </li>
            <li>
              <strong>Resend</strong> (United States) — transactional email
              delivery (verification codes, password resets, notifications).
            </li>
            <li>
              <strong>AWS KMS</strong> (Amazon Web Services, eu-west-2 region) —
              cryptographic signing keys backing PAdES-B-T style export-pack
              manifests.
            </li>
            <li>
              <strong>FreeTSA</strong> — RFC 3161 timestamp authority for
              export-pack timestamps.
            </li>
            <li>
              <strong>Sentry / Functional Software Inc.</strong> (United States)
              — error tracking and observability.
            </li>
          </ul>
          <p>
            We will post material changes to this list on this page in advance
            of bringing on a new sub-processor that materially affects how your
            data is processed.
          </p>

          <h2>7. International transfers</h2>
          <p>
            Data may be transferred outside the United Kingdom and the European
            Economic Area to the providers above (most of which are
            United-States-based). Where this occurs, we rely on the UK
            International Data Transfer Addendum and the UK Standard Contractual
            Clauses for UK-originated data, and on the EU Standard Contractual
            Clauses (2021/914) for EU-originated data. Where available, we
            select vendors who maintain SOC 2 Type II and / or ISO 27001
            certification.
          </p>

          <h2>8. Retention</h2>
          <ul>
            <li>
              <strong>Drafts</strong> — 90 days after the draft was last edited,
              then auto-purged from active storage.
            </li>
            <li>
              <strong>Audit metadata</strong> — 24 months from the relevant
              event (export, share, signature).
            </li>
            <li>
              <strong>Account data</strong> — for as long as you have an active
              account, then deleted on request or within 90 days of account
              closure.
            </li>
            <li>
              <strong>Support tickets and correspondence</strong> — 24 months.
            </li>
            <li>
              <strong>Billing and tax records</strong> (when paid plans launch)
              — retained for the period required by UK / US tax law (typically
              6 / 7 years).
            </li>
          </ul>

          <h2>9. Your rights (UK and EU)</h2>
          <p>
            Under UK GDPR and EU GDPR you have the right to:
          </p>
          <ul>
            <li>access the personal data we hold about you;</li>
            <li>have inaccurate data corrected;</li>
            <li>have your data erased ("right to be forgotten");</li>
            <li>restrict processing in certain circumstances;</li>
            <li>port your data to another service in a structured format;</li>
            <li>object to processing carried out under legitimate interests;</li>
            <li>
              withdraw consent at any time where processing is based on consent.
            </li>
          </ul>
          <p>
            Exercise any of these rights by emailing{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a>. You also
            have the right to lodge a complaint with the UK Information
            Commissioner's Office (<a href="https://ico.org.uk/">ico.org.uk</a>)
            or your local EU supervisory authority.
          </p>

          <h2>10. Your rights (US)</h2>
          <p>
            <strong>California residents (CCPA / CPRA):</strong> you have the
            right to know what personal information we collect and how we use
            it, to request deletion, to request correction, to opt out of "sale"
            or "sharing" of personal information, and to limit use of sensitive
            personal information. <strong>We do not sell or share personal
            information as those terms are defined under the CCPA / CPRA.</strong>{" "}
            You may submit a verifiable consumer request to{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a>; we will
            verify your identity before acting on the request.
          </p>
          <p>
            <strong>Residents of other US states</strong> with comprehensive
            privacy statutes (Virginia, Colorado, Connecticut, Utah, Texas, and
            others) have similar rights and may exercise them through the same
            contact. We do not engage in targeted advertising or profiling that
            produces legal or similarly significant effects.
          </p>

          <h2>11. Cookies and storage</h2>
          <p>
            We use a single first-party session cookie (iron-session, HttpOnly,
            Secure, SameSite=Lax) to keep you signed in. We use browser
            <code>localStorage</code> to persist drafts in progress, UI
            preferences, and onboarding state. <strong>We do not run marketing
            cookies, advertising pixels, or third-party trackers.</strong>
          </p>

          <h2>12. Security</h2>
          <p>
            We implement appropriate technical and organisational measures,
            including:
          </p>
          <ul>
            <li>TLS 1.2+ in transit;</li>
            <li>encryption at rest (AWS RDS / Neon-managed encryption);</li>
            <li>
              hash-chained audit log per tenant, serialised with{" "}
              <code>pg_advisory_xact_lock</code> to prevent reordering;
            </li>
            <li>
              KMS-backed signing keys for export-pack manifests (the private
              key never leaves AWS KMS);
            </li>
            <li>least-privilege access controls and audited admin actions;</li>
            <li>mandatory MFA for staff with production-data access.</li>
          </ul>

          <h2>13. Children</h2>
          <p>
            The DraftHR service is intended for use by HR professionals,
            managers, and employees in their professional capacity. It is not
            directed at children under 18, and we do not knowingly collect
            personal data from children. If you believe a child has provided
            personal data to DraftHR, contact{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a> and we
            will delete the relevant records.
          </p>

          <h2>14. Changes to this policy</h2>
          <p>
            We will post any material changes to this policy on this page and,
            where appropriate, notify registered users by email. The effective
            date at the top of this page reflects the most recent revision.
          </p>

          <h2>15. Contact</h2>
          <p>
            For any privacy or data-protection enquiry, write to{" "}
            <a href="mailto:privacy@drafthr.io">privacy@drafthr.io</a>. We aim
            to acknowledge requests within 5 working days and resolve them
            within the statutory timeframe (one month under UK / EU GDPR, 45
            days under CCPA / CPRA, extendable where permitted).
          </p>
        </Box>
      </Card>
    </PublicLegalShell>
  );
}
