import { Box, Card, Heading, Text } from "@radix-ui/themes";
import { todayDateOnly } from "@/lib/date-only";

/**
 * Public privacy policy page. Required for GDPR/UK GDPR compliance. The text
 * below is a starting template — the operator must fill in the data-controller
 * details, retention specifics, and sub-processor list, and have it reviewed
 * by counsel before going live.
 */
export function Privacy() {
  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Heading size="7" mb="2">Privacy Policy</Heading>
      <Text size="2" color="gray" mb="6" as="p">
        Effective date: <Text weight="medium" highContrast>{todayDateOnly()}</Text>. This policy
        explains how the DRAFTHR platform collects, processes, and stores
        personal data in connection with drafting HR correspondence.
      </Text>

      <Card size="3">
        <Box className="prose prose-sm max-w-none [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:leading-relaxed [&_p]:my-2">
          <h2>1. Data controller</h2>
          <p>
            <strong>[Operator legal name]</strong>, with registered office at{" "}
            <strong>[registered address]</strong>, is the data controller in respect
            of this platform. Contact for data protection enquiries:{" "}
            <strong>[dpo@example.com]</strong>.
          </p>

          <h2>2. What we collect</h2>
          <p>
            To draft HR letters, we process the following categories of personal
            data: employee full legal name, preferred name, job title,
            department, employer, work and home address, email address,
            length of service, salary and benefits information, and any other
            content the user enters into the wizard or editor.
          </p>
          <p>
            We may also process special category data (e.g. health information
            in sickness or accommodations letters) where the user enters it.
            Such data is processed only on the basis of the user's explicit
            authority to do so under UK GDPR Art. 9(2)(b) (employment-law
            obligations) or as otherwise lawfully directed.
          </p>

          <h2>3. Lawful basis</h2>
          <p>
            For business users (HR mode): processing is carried out on the
            instruction of the employer (the "controller") under
            UK GDPR Art. 6(1)(b) (contract) and Art. 6(1)(f) (legitimate
            interests in operating an internal HR function).
          </p>
          <p>
            For individual users (employee mode, planned): processing is on the
            basis of the user's consent (Art. 6(1)(a)) and contract performance
            (Art. 6(1)(b)).
          </p>

          <h2>4. Sub-processors</h2>
          <p>
            We use the following sub-processors to deliver the service. A Data
            Processing Addendum (DPA) is in place with each:
          </p>
          <ul>
            <li><strong>Alibaba Cloud (DashScope International)</strong> — language model inference (Singapore region).</li>
            <li><strong>Anthropic PBC</strong> — language model inference (planned).</li>
            <li><strong>Vercel Inc.</strong> — application hosting and serverless compute.</li>
            <li><strong>Neon (Databricks)</strong> — managed Postgres database.</li>
            <li><strong>Clerk Inc.</strong> — authentication and identity.</li>
            <li><strong>Sentry / Functional Software Inc.</strong> — error tracking and observability.</li>
          </ul>

          <h2>5. International transfers</h2>
          <p>
            Data may be transferred outside the United Kingdom or European
            Economic Area to the providers above. Where this occurs, we rely on
            UK Standard Contractual Clauses or the UK International Data
            Transfer Addendum.
          </p>

          <h2>6. Retention</h2>
          <p>
            By default, drafts are retained for <strong>90 days</strong> after
            the draft was last updated, after which they are automatically
            purged from our active storage. Audit metadata (who exported what,
            when) is retained for <strong>24 months</strong> for compliance
            purposes.
          </p>

          <h2>7. Your rights</h2>
          <p>
            Under UK GDPR you have the right to access, rectify, erase, restrict
            processing of, and port your personal data. To exercise any of these
            rights, contact <strong>[dpo@example.com]</strong>.
          </p>
          <p>
            You also have the right to lodge a complaint with the UK Information
            Commissioner's Office (<a href="https://ico.org.uk/">ico.org.uk</a>).
          </p>

          <h2>8. Security</h2>
          <p>
            We implement appropriate technical and organisational measures
            including encryption in transit (TLS 1.2+), encryption at rest,
            principle of least privilege, and audit logging.
          </p>

          <h2>9. Changes to this policy</h2>
          <p>
            We will post any material changes to this policy on this page and,
            where appropriate, notify users by email.
          </p>
        </Box>
      </Card>
    </Box>
  );
}
